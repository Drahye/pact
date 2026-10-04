import type { Ctx, ReqMeta } from '../context.js';
import { keyedHash, randomDigits, safeEqual } from '../lib/crypto.js';
import { badRequest, tooMany } from '../lib/errors.js';
import { maskEmail } from './identities.js';
import { audit } from './platform.js';

/**
 * Email one-time codes. Same philosophy as the SMS ones: hashed at rest, expiring, attempt-limited, single-use, rate-limited by
 * target address (per requester, with a ceiling) and by IP. The request response never says whether the address has an account.
 */
export type EmailOtpPurpose = 'login' | 'link' | 'pin_reset';

export const EMAIL_OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const PER_EMAIL = { minutes: 15, max: 4, ceiling: 12 };
const PER_IP = { minutes: 60, max: 30 };

const hash = (ctx: Ctx, email: string, purpose: EmailOtpPurpose, code: string) => keyedHash(ctx.config.HASH_SECRET, `emailotp:${email}:${purpose}:${code}`);

const subjects: Record<EmailOtpPurpose, string> = { login: 'Your PACT sign-in code', link: 'Confirm your email on PACT', pin_reset: 'Your PACT PIN reset code' };

export async function issueEmailOtp(ctx: Ctx, email: string, purpose: EmailOtpPurpose, meta: ReqMeta, userId: string | null = null) {
  const recent = await ctx.db.query<{ by_email: number; by_email_ip: number; by_ip: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE email = $1 AND created_at > now() - make_interval(mins => $3))::int AS by_email,
       COUNT(*) FILTER (WHERE email = $1 AND ip IS NOT DISTINCT FROM $2 AND created_at > now() - make_interval(mins => $3))::int AS by_email_ip,
       COUNT(*) FILTER (WHERE ip = $2 AND created_at > now() - make_interval(mins => $4))::int AS by_ip
     FROM email_otp_challenges WHERE created_at > now() - make_interval(mins => GREATEST($3, $4))`,
    [email, meta.ip, PER_EMAIL.minutes, PER_IP.minutes],
  );
  const r = recent.rows[0];
  if (r.by_email_ip >= PER_EMAIL.max || r.by_email >= PER_EMAIL.ceiling || (meta.ip && r.by_ip >= PER_IP.max)) {
    await audit(ctx.db, { action: 'auth.email_otp_rate_limited', ip: meta.ip, metadata: { email: maskEmail(email), purpose } });
    throw tooMany('Too many codes requested. Try again in 15 minutes.');
  }
  const code = randomDigits(6);
  await ctx.db.query('INSERT INTO email_otp_challenges (email, purpose, user_id, code_hash, expires_at, ip) VALUES ($1, $2, $3, $4, $5, $6)', [
    email,
    purpose,
    userId,
    hash(ctx, email, purpose, code),
    new Date(ctx.now().getTime() + EMAIL_OTP_TTL_MS),
    meta.ip,
  ]);
  await ctx.email.send({
    to: email,
    subject: subjects[purpose],
    text: `Your PACT code is ${code}. It expires in ${EMAIL_OTP_TTL_MS / 60_000} minutes. Never share it, not even with PACT staff. If you didn’t ask for it, ignore this email.`,
  });
  return code;
}

/** Checks a code. Failures are counted and audited; returns normally only on success. A user-bound code only works for that user. */
export async function consumeEmailOtp(ctx: Ctx, email: string, code: string, purpose: EmailOtpPurpose, meta: ReqMeta, userId: string | null = null) {
  const verdict = await ctx.db.tx(async (q) => {
    const r = await q.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM email_otp_challenges
        WHERE email = $1 AND purpose = $2 AND user_id IS NOT DISTINCT FROM $3 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [email, purpose, userId],
    );
    const c = r.rows[0];
    if (!c) return 'expired' as const;
    if (c.attempts >= MAX_ATTEMPTS) return 'locked' as const;
    const ok = safeEqual(c.code_hash, hash(ctx, email, purpose, code));
    await q.query(`UPDATE email_otp_challenges SET attempts = attempts + 1, consumed_at = CASE WHEN $2 THEN now() END WHERE id = $1`, [c.id, ok]);
    return ok ? ('ok' as const) : ('wrong' as const);
  });
  if (verdict !== 'ok') await audit(ctx.db, { actorId: userId, action: 'auth.email_otp_failed', ip: meta.ip, metadata: { email: maskEmail(email), purpose, reason: verdict } });
  if (verdict === 'expired') throw badRequest('otp_expired', 'That code has expired. Request a new one.');
  if (verdict === 'locked') throw tooMany('Too many wrong codes. Request a new one.');
  if (verdict === 'wrong') throw badRequest('otp_incorrect', 'That code isn’t right. Check your email and try again.');
}
