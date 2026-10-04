import type { Ctx, ReqMeta } from '../context.js';
import { badRequest, AppError, tooMany } from '../lib/errors.js';
import { STYTCH_CODE_TTL_MS, StytchError } from '../payments/stytch.js';
import type { EmailOtpPurpose } from './emailAuth.js';
import { maskEmail } from './identities.js';
import { audit } from './platform.js';

/**
 * Email codes through Stytch. PACT keeps the same guard rails it has always had around a code (limits per address and IP, a cap on
 * wrong tries, single use) and adds the one thing Stytch gives: the proof that this person holds the mailbox, as a stable Stytch user id.
 * The method id that ties a code to a send lives only in `stytch_email_challenges`.
 */
const MAX_ATTEMPTS = 5;
const PER_EMAIL = { minutes: 15, max: 4, ceiling: 12 };
const PER_IP = { minutes: 60, max: 30 };

const unavailable = () => new AppError(503, 'email_unavailable', 'We couldn’t send a code just now. Try again in a moment.');

/** Sends a code. The answer is the same whether or not the address already has a Stytch user or a PACT account. */
export async function sendStytchCode(ctx: Ctx, email: string, purpose: EmailOtpPurpose, meta: ReqMeta, userId: string | null = null) {
  const recent = await ctx.db.query<{ by_email: number; by_email_ip: number; by_ip: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE email = $1 AND created_at > now() - make_interval(mins => $3))::int AS by_email,
       COUNT(*) FILTER (WHERE email = $1 AND ip IS NOT DISTINCT FROM $2 AND created_at > now() - make_interval(mins => $3))::int AS by_email_ip,
       COUNT(*) FILTER (WHERE ip = $2 AND created_at > now() - make_interval(mins => $4))::int AS by_ip
     FROM stytch_email_challenges WHERE created_at > now() - make_interval(mins => GREATEST($3, $4))`,
    [email, meta.ip, PER_EMAIL.minutes, PER_IP.minutes],
  );
  const r = recent.rows[0];
  if (r.by_email_ip >= PER_EMAIL.max || r.by_email >= PER_EMAIL.ceiling || (meta.ip && r.by_ip >= PER_IP.max)) {
    await audit(ctx.db, { action: 'auth.email_otp_rate_limited', ip: meta.ip, metadata: { email: maskEmail(email), purpose, via: 'stytch' } });
    throw tooMany('Too many codes requested. Try again in 15 minutes.');
  }
  let sent;
  try {
    sent = await ctx.stytch.sendEmailCode(email);
  } catch (err) {
    if (err instanceof StytchError && err.kind === 'rate_limited') throw tooMany('Too many codes requested. Try again in a few minutes.');
    if (err instanceof StytchError && err.kind === 'bad_request') throw badRequest('invalid_email', 'Enter a valid email address.');
    ctx.log.warn({ kind: err instanceof StytchError ? err.kind : 'error' }, 'stytch send failed');
    throw unavailable();
  }
  await ctx.db.query('INSERT INTO stytch_email_challenges (email, purpose, user_id, method_id, expires_at, ip) VALUES ($1, $2, $3, $4, $5, $6)', [
    email,
    purpose,
    userId,
    sent.methodId,
    new Date(ctx.now().getTime() + STYTCH_CODE_TTL_MS),
    meta.ip,
  ]);
}

/**
 * Checks a code with Stytch and returns the stable Stytch user id: the only thing a caller may trust. The address and code come from the
 * browser, but whether they prove anything is decided by Stytch against the send we recorded.
 */
export async function verifyStytchCode(ctx: Ctx, email: string, code: string, purpose: EmailOtpPurpose, meta: ReqMeta, userId: string | null = null): Promise<{ stytchUserId: string }> {
  const row = (
    await ctx.db.query<{ id: string; method_id: string; attempts: number }>(
      `SELECT id, method_id, attempts FROM stytch_email_challenges
        WHERE email = $1 AND purpose = $2 AND user_id IS NOT DISTINCT FROM $3 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [email, purpose, userId],
    )
  ).rows[0];
  const fail = async (reason: string) => audit(ctx.db, { actorId: userId, action: 'auth.email_otp_failed', ip: meta.ip, metadata: { email: maskEmail(email), purpose, reason, via: 'stytch' } });
  if (!row) {
    await fail('expired');
    throw badRequest('otp_expired', 'That code has expired. Request a new one.');
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await fail('locked');
    throw tooMany('Too many wrong codes. Request a new one.');
  }
  // Count the try before asking, so concurrent guesses cannot all slip under the cap.
  const counted = await ctx.db.query('UPDATE stytch_email_challenges SET attempts = attempts + 1 WHERE id = $1 AND consumed_at IS NULL AND attempts < $2', [row.id, MAX_ATTEMPTS]);
  if (!counted.rowCount) throw tooMany('Too many wrong codes. Request a new one.');
  let verified;
  try {
    verified = await ctx.stytch.verifyEmailCode(row.method_id, code);
  } catch (err) {
    const kind = err instanceof StytchError ? err.kind : 'unavailable';
    if (kind === 'invalid_code' || kind === 'bad_request') {
      await fail('wrong');
      throw badRequest('otp_incorrect', 'That code isn’t right, or it has expired. Check your email and try again.');
    }
    if (kind === 'rate_limited') throw tooMany('Too many tries. Wait a few minutes and try again.');
    ctx.log.warn({ kind }, 'stytch verify failed');
    throw unavailable();
  }
  // Single use on our side too: a replay of a good code finds the challenge already spent.
  const spent = await ctx.db.query('UPDATE stytch_email_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL', [row.id]);
  if (!spent.rowCount) throw badRequest('otp_expired', 'That code has already been used. Request a new one.');
  return { stytchUserId: verified.userId };
}
