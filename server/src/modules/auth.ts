import { jwtVerify, SignJWT } from 'jose';
import type { AuthTokensDTO, MeDTO, OtpVerifyDTO } from '../../../shared/contracts.js';
import { PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS } from '../../../shared/policy.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { hashSecret, keyedHash, randomCode, randomDigits, randomToken, safeEqual, verifySecret } from '../lib/crypto.js';
import { AppError, badRequest, tooMany, unauthorized } from '../lib/errors.js';
import { maskPhone, normalizeNgPhone } from '../lib/phone.js';
import { consumeEmailOtp, EMAIL_OTP_TTL_MS, issueEmailOtp } from './emailAuth.js';
import { STYTCH_CODE_TTL_MS } from '../payments/stytch.js';
import { sendStytchCode, verifyStytchCode } from './stytchAuth.js';
import { track } from '../lib/events.js';
import { addIdentity, findEmailOwner, findIdentity, maskEmail, normalizeEmail, userIdentities } from './identities.js';
import { createAccount } from './ledger.js';
import { audit, notify } from './platform.js';

const OTP_TTL_MS = 5 * 60_000;
const SESSION_IDLE_DAYS = 14;
const REFRESH_GRACE_SEC = 60;
const OTP_MAX_ATTEMPTS = 5;
// A number's budget is per requester (same IP), so a stranger spending it cannot lock the owner out; the ceiling bounds SMS cost.
const OTP_PER_PHONE_WINDOW = { minutes: 15, max: 4, ceiling: 12 };
const OTP_PER_IP_WINDOW = { minutes: 60, max: 30 };

const PALETTE = ['#3dd68c', '#ff7a5c', '#4da3ff', '#9b7bff', '#ffc53d', '#ff6fb5', '#22b8a6', '#ff9f43'];
const TINTS = ['mint', 'peach', 'sky', 'lilac', 'sand'] as const;

export interface UserRow {
  id: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  color: string;
  tint: MeDTO['tint'];
  photo_url: string | null;
  pin_hash: string | null;
  pin_failed_attempts: number;
  pin_locked_until: Date | null;
  kyc_tier: 1 | 2 | 3;
  pin_reset_at: Date | null;
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
  await q.query('INSERT INTO refresh_tokens (hash, session_id) VALUES ($1, $2)', [keyedHash(ctx.config.HASH_SECRET, refreshToken), s.rows[0].id]);
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

/**
 * Refresh tokens rotate on every use. A token replaced less than REFRESH_GRACE_SEC ago is
 * still accepted, so a refresh response lost to a page reload or a dropped connection can be
 * retried. Presenting any replaced token after that window is treated as theft: the whole
 * session is revoked.
 */
export async function refresh(ctx: Ctx, refreshToken: string, meta: ReqMeta): Promise<AuthTokensDTO> {
  const hash = keyedHash(ctx.config.HASH_SECRET, refreshToken);
  const out = await ctx.db.tx(async (q) => {
    const found = await q.query<{ session_id: string; superseded_at: Date | null; user_id: string; expires_at: Date; revoked_at: Date | null; last_used_at: Date }>(
      `SELECT t.session_id, t.superseded_at, s.user_id, s.expires_at, s.revoked_at, s.last_used_at
         FROM refresh_tokens t JOIN sessions s ON s.id = t.session_id WHERE t.hash = $1 FOR UPDATE OF s`,
      [hash],
    );
    const s = found.rows[0];
    if (!s) return null;
    if (s.revoked_at || s.expires_at <= ctx.now()) return null;
    if (s.superseded_at && ctx.now().getTime() - s.superseded_at.getTime() > REFRESH_GRACE_SEC * 1000) {
      // Returned rather than thrown so the revocation commits.
      await q.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [s.session_id]);
      await audit(q, { actorId: s.user_id, action: 'session.refresh_reuse_detected', targetType: 'session', targetId: s.session_id, ip: meta.ip });
      return null;
    }
    // Idle sessions end too, not just old ones.
    if (ctx.now().getTime() - s.last_used_at.getTime() > SESSION_IDLE_DAYS * 86_400_000) {
      await q.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [s.session_id]);
      return null;
    }
    const user = await getUser(q, s.user_id);
    if (user.status !== 'active') throw new AppError(403, 'account_restricted', 'This account is restricted. Contact support.');
    const next = randomToken(32);
    const nextHash = keyedHash(ctx.config.HASH_SECRET, next);
    await q.query('UPDATE refresh_tokens SET superseded_at = $2 WHERE session_id = $1 AND superseded_at IS NULL', [s.session_id, ctx.now()]);
    await q.query('INSERT INTO refresh_tokens (hash, session_id) VALUES ($1, $2)', [nextHash, s.session_id]);
    await q.query('UPDATE sessions SET prev_refresh_hash = refresh_hash, refresh_hash = $2, last_used_at = $4, ip = $3 WHERE id = $1', [s.session_id, nextHash, meta.ip, ctx.now()]);
    const access = await signAccessToken(ctx, s.user_id, s.session_id);
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

type OtpPurpose = 'login' | 'pin_reset' | 'link';

/** Phone sign-in and verification are switched off (SMS_PROVIDER=disabled): a clean "unavailable", never a crash or a half-sent code. */
export function assertPhoneAuth(ctx: Ctx) {
  if (!ctx.config.phoneAuthEnabled) throw new AppError(503, 'feature_unavailable', 'Phone sign-in isn’t available yet. Use your email or Google instead.');
}

/** Sends a code bound to one purpose, so a sign-in code can never reset a PIN and vice versa. */
export async function issueOtp(ctx: Ctx, phone: string, purpose: OtpPurpose, meta: ReqMeta) {
  assertPhoneAuth(ctx);
  const recent = await ctx.db.query<{ by_phone: number; by_phone_ip: number; by_ip: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE phone = $1 AND created_at > now() - make_interval(mins => $3))::int AS by_phone,
       COUNT(*) FILTER (WHERE phone = $1 AND ip IS NOT DISTINCT FROM $2 AND created_at > now() - make_interval(mins => $3))::int AS by_phone_ip,
       COUNT(*) FILTER (WHERE ip = $2 AND created_at > now() - make_interval(mins => $4))::int AS by_ip
     FROM otp_challenges WHERE created_at > now() - make_interval(mins => GREATEST($3, $4))`,
    [phone, meta.ip, OTP_PER_PHONE_WINDOW.minutes, OTP_PER_IP_WINDOW.minutes],
  );
  if (recent.rows[0].by_phone_ip >= OTP_PER_PHONE_WINDOW.max || recent.rows[0].by_phone >= OTP_PER_PHONE_WINDOW.ceiling || (meta.ip && recent.rows[0].by_ip >= OTP_PER_IP_WINDOW.max)) {
    await audit(ctx.db, { action: 'auth.otp_rate_limited', ip: meta.ip, metadata: { phone: maskPhone(phone), purpose } });
    throw tooMany('Too many codes requested. Try again in 15 minutes.');
  }
  const code = randomDigits(6);
  await ctx.db.query('INSERT INTO otp_challenges (phone, code_hash, expires_at, ip, purpose) VALUES ($1, $2, $3, $4, $5)', [
    phone,
    otpHash(ctx, phone, code),
    new Date(ctx.now().getTime() + OTP_TTL_MS),
    meta.ip,
    purpose,
  ]);
  const what = purpose === 'pin_reset' ? 'code to reset your PACT PIN' : 'PACT code';
  await ctx.sms.send(phone, `Your ${what} is ${code}. It expires in 5 minutes. Never share it, not even with PACT staff.`);
  return code;
}

/** Checks a code. Failures are counted and audited; returns normally only on success. */
export async function consumeOtp(ctx: Ctx, phone: string, code: string, purpose: OtpPurpose, meta: ReqMeta) {
  assertPhoneAuth(ctx);
  const verified = await ctx.db.tx(async (q) => {
    const r = await q.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM otp_challenges
        WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone, purpose],
    );
    const c = r.rows[0];
    if (!c) return 'expired' as const;
    if (c.attempts >= OTP_MAX_ATTEMPTS) return 'locked' as const;
    const ok = safeEqual(c.code_hash, otpHash(ctx, phone, code));
    await q.query(`UPDATE otp_challenges SET attempts = attempts + 1, consumed_at = CASE WHEN $2 THEN now() END WHERE id = $1`, [c.id, ok]);
    return ok ? ('ok' as const) : ('wrong' as const);
  });
  if (verified !== 'ok') await audit(ctx.db, { action: 'auth.otp_failed', ip: meta.ip, metadata: { phone: maskPhone(phone), purpose, reason: verified } });
  if (verified === 'expired') throw badRequest('otp_expired', 'That code has expired. Request a new one.');
  if (verified === 'locked') throw tooMany('Too many wrong codes. Request a new one.');
  if (verified === 'wrong') throw badRequest('otp_incorrect', 'That code isn’t right. Check the SMS and try again.');
}

/**
 * The response is identical whether or not the number has an account, so this
 * endpoint can't be used to find out who is on PACT.
 */
export async function requestOtp(ctx: Ctx, rawPhone: string, meta: ReqMeta) {
  const phone = normalizeNgPhone(rawPhone);
  if (!phone) throw badRequest('invalid_phone', 'Enter a valid Nigerian mobile number.');
  const code = await issueOtp(ctx, phone, 'login', meta);
  return { phone, expiresInSec: OTP_TTL_MS / 1000, ...(ctx.config.exposeDevCodes ? { devCode: code } : {}) };
}

export async function verifyOtp(ctx: Ctx, rawPhone: string, code: string, device: string | undefined, meta: ReqMeta): Promise<OtpVerifyDTO> {
  const phone = normalizeNgPhone(rawPhone);
  if (!phone) throw badRequest('invalid_phone', 'Enter a valid Nigerian mobile number.');
  await consumeOtp(ctx, phone, code, 'login', meta);

  const known = await findIdentity(ctx.db, 'phone', phone);
  if (known) return signInUser(ctx, known.user_id, 'phone', device, meta);
  return { status: 'needs_profile', signupToken: await mintSignupToken(ctx, { provider: 'phone', subject: phone, phone }), phone };
}

/**
 * What a verified sign-in proved, carried (signed, 20 minutes, in an httpOnly cookie on the web) between "verified" and "account created".
 * It is never stored in page storage and never logged.
 */
export interface SignupClaim {
  provider: 'phone' | 'email' | 'google' | 'stytch';
  subject: string;
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export async function mintSignupToken(ctx: Ctx, claim: SignupClaim) {
  return new SignJWT({ purpose: 'signup', ...claim })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('20m')
    .setIssuer('pact-api')
    .setAudience('pact-signup')
    .sign(secretKey(ctx));
}

async function readSignupToken(ctx: Ctx, token: string): Promise<SignupClaim> {
  try {
    const { payload } = await jwtVerify(token, secretKey(ctx), { issuer: 'pact-api', audience: 'pact-signup', algorithms: ['HS256'] });
    if (payload.purpose !== 'signup') throw new Error('bad token');
    // Tokens minted before identities carried only a phone.
    if (typeof payload.provider !== 'string' && typeof payload.phone === 'string') return { provider: 'phone', subject: payload.phone, phone: payload.phone };
    if (!['phone', 'email', 'google', 'stytch'].includes(String(payload.provider)) || typeof payload.subject !== 'string') throw new Error('bad token');
    return payload as unknown as SignupClaim;
  } catch {
    throw badRequest('signup_expired', 'Your sign-in expired. Start again.');
  }
}

export async function describeSignup(ctx: Ctx, token: string) {
  const c = await readSignupToken(ctx, token);
  return { provider: c.provider, ...(c.email ? { email: maskEmail(c.email) } : {}), suggested: { firstName: c.firstName ?? '', lastName: c.lastName ?? '' } };
}

/** Anyone who invited this number before the person had an account: turn it into a real invite. Only ever called once the number is verified. */
export async function claimPhoneInvites(q: Queryable, userId: string, phone: string) {
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
  return invites.rowCount ?? 0;
}

export async function signup(
  ctx: Ctx,
  input: { signupToken: string; firstName: string; lastName: string; pin?: string; referralCode?: string; device?: string },
  meta: ReqMeta,
): Promise<AuthTokensDTO> {
  const claim = await readSignupToken(ctx, input.signupToken);
  if (input.pin !== undefined) assertStrongPin(input.pin);
  const pinHash = input.pin !== undefined ? await hashSecret(input.pin) : null;

  return ctx.db.tx(async (q) => {
    // The identity may have been used since the code was verified (a second tab, a retry): the continuation is then spent.
    if (await findIdentity(q, claim.provider, claim.subject)) throw badRequest('already_registered', 'This sign-in already has an account. Sign in instead.');
    if (claim.phone && (await q.query('SELECT 1 FROM users WHERE phone = $1', [claim.phone])).rowCount) throw badRequest('already_registered', 'This number already has an account. Sign in instead.');
    // The address may have been taken since the code was checked (another tab, another door): one address, one account.
    if (claim.email && (await findEmailOwner(q, claim.email))) throw badRequest('already_registered', 'This email already has an account. Sign in instead.');

    const referrer = input.referralCode
      ? (await q.query<{ id: string }>('SELECT id FROM users WHERE referral_code = $1', [input.referralCode.toUpperCase()])).rows[0]
      : undefined;
    const seed = Number.parseInt(keyedHash(ctx.config.HASH_SECRET, claim.subject).replace(/[^0-9]/g, '').slice(0, 6) || '0', 10);
    const u = await q.query<{ id: string }>(
      `INSERT INTO users (phone, first_name, last_name, color, tint, pin_hash, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [claim.phone ?? null, cap(input.firstName), cap(input.lastName), PALETTE[seed % PALETTE.length], TINTS[seed % TINTS.length], pinHash, randomCode(7), referrer?.id ?? null],
    );
    const userId = u.rows[0].id;
    await addIdentity(q, userId, claim.provider, claim.subject, { ...(claim.email ? { email: claim.email } : {}), ...(claim.phone ? { phone: claim.phone } : {}) });
    await createAccount(q, 'user_wallet', userId);

    // Phone invites are claimed only by someone who has verified that exact number, which a phone sign-up just did.
    if (claim.provider === 'phone' && claim.phone) await claimPhoneInvites(q, userId, claim.phone);
    await audit(q, { actorId: userId, action: 'auth.sign_up', ip: meta.ip, metadata: { referred: !!referrer, provider: claim.provider } });
    await track(q, ctx.config, 'auth_completed', { userId, props: { provider: claim.provider === 'stytch' ? 'email' : claim.provider, is_new: true } }, true);
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

/** Changing the PIN signs out every other device, so an old stolen session can't keep going. */
export async function changePin(ctx: Ctx, userId: string, sessionId: string, currentPin: string, newPin: string, meta: ReqMeta) {
  await verifyPin(ctx, userId, currentPin, meta);
  assertStrongPin(newPin);
  if (currentPin === newPin) throw badRequest('same_pin', 'Choose a different PIN.');
  await ctx.db.tx(async (q) => {
    await q.query('UPDATE users SET pin_hash = $2, updated_at = now() WHERE id = $1', [userId, await hashSecret(newPin)]);
    await q.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [userId, sessionId]);
    await audit(q, { actorId: userId, action: 'pin.changed', ip: meta.ip });
    await notify(q, [userId], { type: 'security', title: 'PIN changed', body: 'Your transaction PIN was changed and other devices were signed out. If this wasn’t you, contact support now.' });
  });
}

/* Forgotten PIN: proven by a fresh SMS code to the account's own number. */

export const PIN_RESET_HOLD_HOURS = 24;

/** The verified ways to reach a person: a phone identity, and any identity that carries a verified email (email, or Google). */
async function recoveryChannels(ctx: Ctx, userId: string) {
  const ids = await userIdentities(ctx.db, userId);
  // With phone auth off the number stays on the account but is not a way to prove who you are.
  return { phone: ctx.config.phoneAuthEnabled ? (ids.find((i) => i.provider === 'phone')?.phone ?? null) : null, email: ids.find((i) => i.email)?.email ?? null };
}

export type RecoveryChannel = 'phone' | 'email';

async function pickChannel(ctx: Ctx, userId: string, via?: RecoveryChannel) {
  const ch = await recoveryChannels(ctx, userId);
  const chosen: RecoveryChannel | null = via ? (ch[via] ? via : null) : ch.phone ? 'phone' : ch.email ? 'email' : null;
  if (!chosen) throw badRequest('no_recovery_method', 'Add a verified email or phone number to your account first. Then you can reset your PIN.');
  return { channel: chosen, address: ch[chosen]! };
}

export async function requestPinReset(ctx: Ctx, userId: string, meta: ReqMeta, via?: RecoveryChannel) {
  const { channel, address } = await pickChannel(ctx, userId, via);
  const viaStytch = channel === 'email' && ctx.config.EMAIL_AUTH_PROVIDER === 'stytch';
  if (viaStytch) await sendStytchCode(ctx, address, 'pin_reset', meta, userId);
  const code = viaStytch ? '' : channel === 'phone' ? await issueOtp(ctx, address, 'pin_reset', meta) : await issueEmailOtp(ctx, address, 'pin_reset', meta, userId);
  await audit(ctx.db, { actorId: userId, action: 'pin.reset_requested', ip: meta.ip, metadata: { via: channel } });
  const expose = channel === 'phone' ? ctx.config.exposeDevCodes : ctx.config.exposeEmailCodes;
  return { via: channel, sentTo: channel === 'phone' ? maskPhone(address) : maskEmail(address), expiresInSec: (channel === 'phone' ? OTP_TTL_MS : viaStytch ? STYTCH_CODE_TTL_MS : EMAIL_OTP_TTL_MS) / 1000, ...(expose && code ? { devCode: code } : {}) };
}

export async function resetPin(ctx: Ctx, userId: string, sessionId: string, code: string, newPin: string, meta: ReqMeta, via?: RecoveryChannel) {
  assertStrongPin(newPin);
  const { channel, address } = await pickChannel(ctx, userId, via);
  if (channel === 'phone') await consumeOtp(ctx, address, code, 'pin_reset', meta);
  else if (ctx.config.EMAIL_AUTH_PROVIDER === 'stytch') await verifyStytchCode(ctx, address, code, 'pin_reset', meta, userId);
  else await consumeEmailOtp(ctx, address, code, 'pin_reset', meta, userId);
  await ctx.db.tx(async (q) => {
    await q.query(
      'UPDATE users SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL, pin_reset_at = now(), updated_at = now() WHERE id = $1',
      [userId, await hashSecret(newPin)],
    );
    await q.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [userId, sessionId]);
    await audit(q, { actorId: userId, action: 'pin.reset_completed', ip: meta.ip });
    await notify(q, [userId], {
      type: 'security',
      title: 'PIN reset',
      body: `Your PIN was reset and other devices were signed out. Withdrawals pause for ${PIN_RESET_HOLD_HOURS} hours as a precaution. If this wasn’t you, contact support now.`,
    });
  });
}

/** Withdrawals and bank changes wait out the hold after a PIN reset. */
export function assertNoResetHold(ctx: Ctx, user: UserRow) {
  if (!user.pin_reset_at) return;
  const until = new Date(user.pin_reset_at.getTime() + PIN_RESET_HOLD_HOURS * 3_600_000);
  if (until > ctx.now()) {
    throw new AppError(423, 'reset_hold', `For your safety, withdrawals and bank changes are paused until ${until.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })} after your PIN reset.`, { until: until.toISOString() });
  }
}

/** First PIN. Never at sign-up: asked for the first time a sensitive action needs one. Changing an existing PIN needs the old one. */
export async function setupPin(ctx: Ctx, userId: string, pin: string, meta: ReqMeta) {
  assertStrongPin(pin);
  const hash = await hashSecret(pin);
  const r = await ctx.db.query('UPDATE users SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $1 AND pin_hash IS NULL', [userId, hash]);
  if (!r.rowCount) throw new AppError(409, 'pin_already_set', 'You already have a PIN. Change it from Security.');
  await audit(ctx.db, { actorId: userId, action: 'pin_created', ip: meta.ip });
}

/* --------------------------------------------------------------------------
   Email sign-in
   -------------------------------------------------------------------------- */

export async function requestEmailLogin(ctx: Ctx, rawEmail: string, meta: ReqMeta) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badRequest('invalid_email', 'Enter a valid email address.');
  // The same answer and the same email whether or not this address has an account.
  if (ctx.config.EMAIL_AUTH_PROVIDER === 'stytch') {
    await sendStytchCode(ctx, email, 'login', meta);
    return { email: maskEmail(email), expiresInSec: STYTCH_CODE_TTL_MS / 1000 };
  }
  const code = await issueEmailOtp(ctx, email, 'login', meta);
  return { email: maskEmail(email), expiresInSec: EMAIL_OTP_TTL_MS / 1000, ...(ctx.config.exposeEmailCodes ? { devCode: code } : {}) };
}

export async function verifyEmailLogin(ctx: Ctx, rawEmail: string, code: string, device: string | undefined, meta: ReqMeta): Promise<OtpVerifyDTO> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badRequest('invalid_email', 'Enter a valid email address.');
  if (ctx.config.EMAIL_AUTH_PROVIDER === 'stytch') return resolveStytchLogin(ctx, email, code, device, meta);
  await consumeEmailOtp(ctx, email, code, 'login', meta);
  const known = await findIdentity(ctx.db, 'email', email);
  if (known) return signInUser(ctx, known.user_id, 'email', device, meta);
  // The same mailbox already signs in through Google: the code just proved this person owns it, so attach the address to that account
  // rather than starting a second one.
  const viaGoogle = (await ctx.db.query<{ user_id: string }>(`SELECT user_id FROM user_identities WHERE provider = 'google' AND email = $1 LIMIT 1`, [email])).rows[0];
  if (viaGoogle) {
    await addIdentity(ctx.db, viaGoogle.user_id, 'email', email, { email });
    await audit(ctx.db, { actorId: viaGoogle.user_id, action: 'email_identity_linked', ip: meta.ip, metadata: { via: 'google_email' } });
    return signInUser(ctx, viaGoogle.user_id, 'email', device, meta);
  }
  return { status: 'needs_profile', signupToken: await mintSignupToken(ctx, { provider: 'email', subject: email, email }), email };
}

/**
 * Stytch proved the mailbox; now decide whose it is. In order: this Stytch user is already someone's; otherwise whoever already holds
 * this verified address gets the Stytch identity attached (no second account); otherwise a new person, after a name. Never by name or phone.
 */
async function resolveStytchLogin(ctx: Ctx, email: string, code: string, device: string | undefined, meta: ReqMeta): Promise<OtpVerifyDTO> {
  const { stytchUserId } = await verifyStytchCode(ctx, email, code, 'login', meta);
  const known = await findIdentity(ctx.db, 'stytch', stytchUserId);
  if (known) return signInUser(ctx, known.user_id, 'email', device, meta);
  const owner = await findEmailOwner(ctx.db, email);
  if (owner) {
    // Linking twice (two tabs) is harmless: the pair is unique, and the owner is the same either way.
    await addIdentity(ctx.db, owner.user_id, 'stytch', stytchUserId, { email });
    await audit(ctx.db, { actorId: owner.user_id, action: 'email_identity_linked', ip: meta.ip, metadata: { via: 'stytch_verified_email' } });
    return signInUser(ctx, owner.user_id, 'email', device, meta);
  }
  return { status: 'needs_profile', signupToken: await mintSignupToken(ctx, { provider: 'stytch', subject: stytchUserId, email }), email };
}

/** Starts a session for an existing account, whichever identity proved it. */
export async function signInUser(ctx: Ctx, userId: string, provider: 'phone' | 'email' | 'google', device: string | undefined, meta: ReqMeta): Promise<OtpVerifyDTO> {
  const u = (await ctx.db.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [userId])).rows[0];
  if (!u || u.status !== 'active') throw new AppError(403, 'account_restricted', 'This account is restricted. Contact support.');
  const tokens = await ctx.db.tx(async (q) => {
    const t = await createSession(ctx, q, userId, device, meta);
    await audit(q, { actorId: userId, action: 'auth.sign_in', ip: meta.ip, metadata: { device: device ?? null, provider } });
    await track(q, ctx.config, 'auth_completed', { userId, props: { provider, is_new: false } }, true);
    return t;
  });
  return { status: 'signed_in', ...tokens };
}
