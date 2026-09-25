import { jwtVerify, SignJWT } from 'jose';
import type { AuthTokensDTO, MeDTO, OtpVerifyDTO } from '../../../shared/contracts.js';
import { PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS } from '../../../shared/policy.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { hashSecret, keyedHash, randomCode, randomDigits, randomToken, safeEqual, verifySecret } from '../lib/crypto.js';
import { AppError, badRequest, tooMany, unauthorized } from '../lib/errors.js';
import { normalizeNgPhone } from '../lib/phone.js';
import { createAccount } from './ledger.js';
import { audit, notify } from './platform.js';

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_PER_PHONE_WINDOW = { minutes: 15, max: 4 };
const OTP_PER_IP_WINDOW = { minutes: 60, max: 30 };

const PALETTE = ['#3dd68c', '#ff7a5c', '#4da3ff', '#9b7bff', '#ffc53d', '#ff6fb5', '#22b8a6', '#ff9f43'];
const TINTS = ['mint', 'peach', 'sky', 'lilac', 'sand'] as const;

export interface UserRow {
  id: string;
  phone: string;
  first_name: string;
  last_name: string;
  color: string;
  tint: MeDTO['tint'];
  photo_url: string | null;
  pin_hash: string | null;
  pin_failed_attempts: number;
  pin_locked_until: Date | null;
  kyc_tier: 1 | 2 | 3;
  bvn_last4: string | null;
  status: 'active' | 'frozen' | 'closed';
  referral_code: string;
  created_at: Date;
}

export const toMe = (u: UserRow): MeDTO => ({
  id: u.id,
  phone: u.phone,
  firstName: u.first_name,
  lastName: u.last_name,
  color: u.color,
  tint: u.tint,
  photoUrl: u.photo_url,
  kycTier: u.kyc_tier,
  bvnLast4: u.bvn_last4,
  hasPin: !!u.pin_hash,
  referralCode: u.referral_code,
  createdAt: u.created_at.toISOString(),
});

export async function getUser(q: Queryable, id: string): Promise<UserRow> {
  const r = await q.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  if (!r.rows[0]) throw unauthorized();
  return r.rows[0];
}

const secretKey = (ctx: Ctx) => new TextEncoder().encode(ctx.config.JWT_SECRET);

/* --------------------------------------------------------------------------
   Access tokens: short-lived JWTs bound to a session id
   -------------------------------------------------------------------------- */

export async function signAccessToken(ctx: Ctx, userId: string, sessionId: string) {
  const exp = Math.floor(ctx.now().getTime() / 1000) + ctx.config.ACCESS_TOKEN_TTL_SEC;
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(exp)
    .setIssuer('pact-api')
    .setAudience('pact-app')
    .sign(secretKey(ctx));
  return { token, expiresAt: new Date(exp * 1000) };
}

/** Verifies the JWT and that its session is still live, so revoking a session takes effect immediately. */
export async function authenticate(ctx: Ctx, token: string): Promise<{ userId: string; sessionId: string }> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey(ctx), { issuer: 'pact-api', audience: 'pact-app', algorithms: ['HS256'] }));
  } catch {
    throw unauthorized('Your session has expired. Sign in again.');
  }
  const userId = payload.sub;
  const sessionId = payload.sid;
  if (typeof userId !== 'string' || typeof sessionId !== 'string') throw unauthorized();
  const r = await ctx.db.query<{ status: string }>(
    `SELECT u.status FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sessionId, userId],
  );
  if (!r.rows[0]) throw unauthorized('Your session has ended. Sign in again.');
  if (r.rows[0].status !== 'active') throw new AppError(403, 'account_restricted', 'This account is restricted. Contact support.');
  return { userId, sessionId };
}

/* --------------------------------------------------------------------------
   Sessions and refresh tokens (opaque, hashed at rest, rotated on use)
   -------------------------------------------------------------------------- */

async function createSession(ctx: Ctx, q: Queryable, userId: string, device: string | undefined, meta: ReqMeta): Promise<AuthTokensDTO> {
  const refreshToken = randomToken(32);
  const expires = new Date(ctx.now().getTime() + ctx.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const s = await q.query<{ id: string }>(
    `INSERT INTO sessions (user_id, refresh_hash, device, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, keyedHash(ctx.config.HASH_SECRET, refreshToken), device?.slice(0, 80) || deviceFromUA(meta.userAgent), meta.ip, meta.userAgent?.slice(0, 300) ?? null, expires],
  );
  const access = await signAccessToken(ctx, userId, s.rows[0].id);
  const user = await getUser(q, userId);
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken, user: toMe(user) };
}

const deviceFromUA = (ua: string | null) => {
  if (!ua) return 'Unknown device';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'App';
  return `${browser} on ${os}`;
};

export async function refresh(ctx: Ctx, refreshToken: string, meta: ReqMeta): Promise<AuthTokensDTO> {
  const hash = keyedHash(ctx.config.HASH_SECRET, refreshToken);
  const out = await ctx.db.tx(async (q) => {
    const current = await q.query<{ id: string; user_id: string; expires_at: Date; revoked_at: Date | null }>(
      'SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE refresh_hash = $1 FOR UPDATE',
      [hash],
    );
    const s = current.rows[0];
    if (!s) {
      // A rotated-out token being replayed means it leaked: end that session everywhere.
      // Returned rather than thrown so the revocation commits.
      const reused = await q.query<{ id: string; user_id: string }>(
        'UPDATE sessions SET revoked_at = now() WHERE prev_refresh_hash = $1 AND revoked_at IS NULL RETURNING id, user_id',
        [hash],
      );
      if (reused.rows[0]) {
        await audit(q, { actorId: reused.rows[0].user_id, action: 'session.refresh_reuse_detected', targetType: 'session', targetId: reused.rows[0].id, ip: meta.ip });
      }
      return null;
    }
    if (s.revoked_at || s.expires_at <= ctx.now()) return null;
    const user = await getUser(q, s.user_id);
    if (user.status !== 'active') throw new AppError(403, 'account_restricted', 'This account is restricted. Contact support.');
    const next = randomToken(32);
    await q.query(
      `UPDATE sessions SET prev_refresh_hash = refresh_hash, refresh_hash = $2, last_used_at = now(), ip = $3 WHERE id = $1`,
      [s.id, keyedHash(ctx.config.HASH_SECRET, next), meta.ip],
    );
    const access = await signAccessToken(ctx, s.user_id, s.id);
    return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken: next, user: toMe(user) };
  });
  if (!out) throw unauthorized('Your session has ended. Sign in again.');
  return out;
}

export async function revokeSession(ctx: Ctx, userId: string, sessionId: string) {
  await ctx.db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [sessionId, userId]);
}

export async function revokeAllSessions(ctx: Ctx, userId: string, exceptSessionId?: string) {
  await ctx.db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND id <> COALESCE($2::uuid, gen_random_uuid())', [
    userId,
    exceptSessionId ?? null,
  ]);
}

/* --------------------------------------------------------------------------
   Phone OTP
   -------------------------------------------------------------------------- */

const otpHash = (ctx: Ctx, phone: string, code: string) => keyedHash(ctx.config.HASH_SECRET, `otp:${phone}:${code}`);

export async function requestOtp(ctx: Ctx, rawPhone: string, meta: ReqMeta) {
  const phone = normalizeNgPhone(rawPhone);
  if (!phone) throw badRequest('invalid_phone', 'Enter a valid Nigerian mobile number.');

  const recent = await ctx.db.query<{ by_phone: number; by_ip: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE phone = $1 AND created_at > now() - make_interval(mins => $3))::int AS by_phone,
       COUNT(*) FILTER (WHERE ip = $2 AND created_at > now() - make_interval(mins => $4))::int AS by_ip
     FROM otp_challenges WHERE created_at > now() - make_interval(mins => GREATEST($3, $4))`,
    [phone, meta.ip, OTP_PER_PHONE_WINDOW.minutes, OTP_PER_IP_WINDOW.minutes],
  );
  if (recent.rows[0].by_phone >= OTP_PER_PHONE_WINDOW.max) throw tooMany('Too many codes requested for this number. Try again in 15 minutes.');
  if (meta.ip && recent.rows[0].by_ip >= OTP_PER_IP_WINDOW.max) throw tooMany();

  const code = randomDigits(6);
  await ctx.db.query('INSERT INTO otp_challenges (phone, code_hash, expires_at, ip) VALUES ($1, $2, $3, $4)', [
    phone,
    otpHash(ctx, phone, code),
    new Date(ctx.now().getTime() + OTP_TTL_MS),
    meta.ip,
  ]);
  await ctx.sms.send(phone, `Your PACT code is ${code}. It expires in 5 minutes. Never share it, not even with PACT staff.`);
  const exists = await ctx.db.query('SELECT 1 FROM users WHERE phone = $1', [phone]);
  return {
    phone,
    expiresInSec: OTP_TTL_MS / 1000,
    isNewUser: exists.rowCount === 0,
    ...(ctx.config.exposeDevCodes ? { devCode: code } : {}),
  };
}

export async function verifyOtp(ctx: Ctx, rawPhone: string, code: string, device: string | undefined, meta: ReqMeta): Promise<OtpVerifyDTO> {
  const phone = normalizeNgPhone(rawPhone);
  if (!phone) throw badRequest('invalid_phone', 'Enter a valid Nigerian mobile number.');

  const verified = await ctx.db.tx(async (q) => {
    const r = await q.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM otp_challenges
        WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone],
    );
    const c = r.rows[0];
    if (!c) return 'expired' as const;
    if (c.attempts >= OTP_MAX_ATTEMPTS) return 'locked' as const;
    const ok = safeEqual(c.code_hash, otpHash(ctx, phone, code));
    await q.query(`UPDATE otp_challenges SET attempts = attempts + 1, consumed_at = CASE WHEN $2 THEN now() END WHERE id = $1`, [c.id, ok]);
    return ok ? ('ok' as const) : ('wrong' as const);
  });
  if (verified === 'expired') throw badRequest('otp_expired', 'That code has expired. Request a new one.');
  if (verified === 'locked') throw tooMany('Too many wrong codes. Request a new one.');
  if (verified === 'wrong') throw badRequest('otp_incorrect', 'That code isn’t right. Check the SMS and try again.');

  const user = await ctx.db.query<{ id: string; status: string }>('SELECT id, status FROM users WHERE phone = $1', [phone]);
  if (user.rows[0]) {
    if (user.rows[0].status !== 'active') throw new AppError(403, 'account_restricted', 'This account is restricted. Contact support.');
    const tokens = await ctx.db.tx(async (q) => {
      const t = await createSession(ctx, q, user.rows[0].id, device, meta);
      await audit(q, { actorId: user.rows[0].id, action: 'auth.sign_in', ip: meta.ip, metadata: { device: device ?? null } });
      return t;
    });
    return { status: 'signed_in', ...tokens };
  }

  const signupToken = await new SignJWT({ phone, purpose: 'signup' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('20m')
    .setIssuer('pact-api')
    .setAudience('pact-signup')
    .sign(secretKey(ctx));
  return { status: 'needs_profile', signupToken, phone };
}

export async function signup(
  ctx: Ctx,
  input: { signupToken: string; firstName: string; lastName: string; pin: string; referralCode?: string; device?: string },
  meta: ReqMeta,
): Promise<AuthTokensDTO> {
  let phone: string;
  try {
    const { payload } = await jwtVerify(input.signupToken, secretKey(ctx), { issuer: 'pact-api', audience: 'pact-signup', algorithms: ['HS256'] });
    if (payload.purpose !== 'signup' || typeof payload.phone !== 'string') throw new Error('bad token');
    phone = payload.phone;
  } catch {
    throw badRequest('signup_expired', 'Your verification expired. Start again with your phone number.');
  }
  assertStrongPin(input.pin);
  const pinHash = await hashSecret(input.pin);

  return ctx.db.tx(async (q) => {
    const taken = await q.query('SELECT 1 FROM users WHERE phone = $1', [phone]);
    if (taken.rowCount) throw badRequest('already_registered', 'This number already has an account. Sign in instead.');

    const referrer = input.referralCode
      ? (await q.query<{ id: string }>('SELECT id FROM users WHERE referral_code = $1', [input.referralCode.toUpperCase()])).rows[0]
      : undefined;
    const seed = Number.parseInt(phone.slice(-4), 10);
    const u = await q.query<{ id: string }>(
      `INSERT INTO users (phone, first_name, last_name, color, tint, pin_hash, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [phone, cap(input.firstName), cap(input.lastName), PALETTE[seed % PALETTE.length], TINTS[seed % TINTS.length], pinHash, randomCode(7), referrer?.id ?? null],
    );
    const userId = u.rows[0].id;
    await createAccount(q, 'user_wallet', userId);

    // Anyone who invited this number before they had an account: turn it into a real invite.
    const invites = await q.query<{ pact_id: string; invited_by: string; title: string }>(
      `UPDATE pact_phone_invites i SET claimed_at = now() FROM pacts p
        WHERE i.phone = $1 AND i.claimed_at IS NULL AND p.id = i.pact_id AND p.status = 'open'
        RETURNING i.pact_id, i.invited_by, p.title`,
      [phone],
    );
    for (const inv of invites.rows) {
      await q.query(
        `INSERT INTO pact_members (pact_id, user_id, role, status, invited_by) VALUES ($1, $2, 'member', 'invited', $3) ON CONFLICT DO NOTHING`,
        [inv.pact_id, userId, inv.invited_by],
      );
      await notify(q, [userId], { type: 'invite', title: 'You’re invited', body: `You’ve been invited to ${inv.title}.`, pactId: inv.pact_id });
    }
    await audit(q, { actorId: userId, action: 'auth.sign_up', ip: meta.ip, metadata: { referred: !!referrer } });
    return createSession(ctx, q, userId, input.device, meta);
  });
}

const cap = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());

/* --------------------------------------------------------------------------
   Transaction PIN: required for every movement of money out of a wallet
   -------------------------------------------------------------------------- */

const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '9876']);

export function assertStrongPin(pin: string) {
  if (WEAK_PINS.has(pin)) throw badRequest('weak_pin', 'Choose a PIN that’s harder to guess.');
}

/**
 * Runs outside the money transaction on purpose: a failed attempt must be counted
 * even though the payment it was guarding never happens.
 */
export async function verifyPin(ctx: Ctx, userId: string, pin: string, meta?: ReqMeta) {
  const u = await getUser(ctx.db, userId);
  if (!u.pin_hash) throw badRequest('pin_not_set', 'Set a transaction PIN first.');
  if (u.pin_locked_until && u.pin_locked_until > ctx.now()) {
    throw new AppError(423, 'pin_locked', 'Too many wrong PINs. Try again later or reset your PIN.', { lockedUntil: u.pin_locked_until.toISOString() });
  }
  if (await verifySecret(pin, u.pin_hash)) {
    if (u.pin_failed_attempts) await ctx.db.query('UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1', [userId]);
    return;
  }
  const r = await ctx.db.query<{ pin_failed_attempts: number }>(
    `UPDATE users SET pin_failed_attempts = pin_failed_attempts + 1,
       pin_locked_until = CASE WHEN pin_failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) END
     WHERE id = $1 RETURNING pin_failed_attempts`,
    [userId, PIN_MAX_ATTEMPTS, PIN_LOCK_MINUTES],
  );
  const attempts = r.rows[0].pin_failed_attempts;
  await audit(ctx.db, { actorId: userId, action: 'pin.failed', ip: meta?.ip, metadata: { attempts } });
  if (attempts >= PIN_MAX_ATTEMPTS) {
    await notify(ctx.db, [userId], { type: 'security', title: 'PIN locked', body: `Your PIN was entered wrongly ${PIN_MAX_ATTEMPTS} times, so payments are paused for ${PIN_LOCK_MINUTES} minutes.` });
    throw new AppError(423, 'pin_locked', `Too many wrong PINs. Payments are paused for ${PIN_LOCK_MINUTES} minutes.`);
  }
  throw new AppError(403, 'incorrect_pin', 'That PIN isn’t right.', { attemptsLeft: PIN_MAX_ATTEMPTS - attempts });
}

export async function changePin(ctx: Ctx, userId: string, currentPin: string, newPin: string, meta: ReqMeta) {
  await verifyPin(ctx, userId, currentPin, meta);
  assertStrongPin(newPin);
  if (currentPin === newPin) throw badRequest('same_pin', 'Choose a different PIN.');
  await ctx.db.tx(async (q) => {
    await q.query('UPDATE users SET pin_hash = $2, updated_at = now() WHERE id = $1', [userId, await hashSecret(newPin)]);
    await audit(q, { actorId: userId, action: 'pin.changed', ip: meta.ip });
    await notify(q, [userId], { type: 'security', title: 'PIN changed', body: 'Your transaction PIN was changed. If this wasn’t you, contact support now.' });
  });
}
