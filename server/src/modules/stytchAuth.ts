import { createHash } from 'node:crypto';
import type { OtpVerifyDTO } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import { decrypt, encrypt, keyedHash, randomToken } from '../lib/crypto.js';
import { badRequest, AppError, tooMany } from '../lib/errors.js';
import { safeReturnPath } from '../lib/returnPath.js';
import { STYTCH_CODE_TTL_MS, StytchError } from '../payments/stytch.js';
import type { EmailOtpPurpose } from './emailAuth.js';
import { mintSignupToken, signInUser } from './auth.js';
import { addIdentity, findEmailOwner, findIdentity, maskEmail, normalizeEmail } from './identities.js';
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

/* --------------------------------------------------------------------------
   Google through Stytch OAuth
   -------------------------------------------------------------------------- */

/**
 * The browser leaves for Google through Stytch and comes back to PACT's own /authenticate page with a one-time token. Three things keep that
 * return honest: the token is checked server to server, it is bound to a PKCE verifier only this browser's cookie can unlock, and where the
 * person goes next comes from state PACT stored before leaving, never from the return URL.
 */
export const STYTCH_OAUTH_COOKIE = 'pact_so';
const OAUTH_TTL_MIN = 10;
const stateHash = (ctx: Ctx, state: string) => keyedHash(ctx.config.HASH_SECRET, `stytch-oauth:${state}`);

export const stytchRedirectUrl = (ctx: Ctx) => `${ctx.config.APP_ORIGIN}/authenticate`;

export async function startStytchOAuth(ctx: Ctx, returnTo: string | null | undefined) {
  if (!ctx.config.stytchGoogleEnabled || !ctx.stytch.enabled) throw new AppError(503, 'google_unavailable', 'Google sign-in isn’t available right now.');
  const state = randomToken(24);
  const verifier = randomToken(32);
  await ctx.db.query(
    `INSERT INTO oauth_states (state_hash, nonce, verifier_enc, mode, return_to, expires_at) VALUES ($1, 'stytch', $2, 'signin', $3, now() + make_interval(mins => $4))`,
    [stateHash(ctx, state), encrypt(ctx.config.DATA_ENCRYPTION_KEY, verifier), safeReturnPath(returnTo), OAUTH_TTL_MIN],
  );
  const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
  return { state, url: ctx.stytch.oauthStartUrl({ redirectUrl: stytchRedirectUrl(ctx), codeChallenge }) };
}

export type StytchOAuthOutcome =
  | { kind: 'signed_in'; out: Extract<OtpVerifyDTO, { status: 'signed_in' }>; returnTo: string | null }
  | { kind: 'needs_profile'; signupToken: string; email: string; returnTo: string | null };

/** Validates the returned token and resolves the person. Anything wrong is one generic error: no provider detail, never the token. */
export async function finishStytchOAuth(ctx: Ctx, input: { token: string; cookieState: string | undefined }, meta: ReqMeta): Promise<StytchOAuthOutcome> {
  const failed = () => new AppError(400, 'oauth_failed', 'We couldn’t sign you in with Google. Try again.');
  if (!ctx.config.stytchGoogleEnabled || !input.cookieState) throw failed();
  const row = await ctx.db.tx(async (q) => {
    const r = await q.query<{ verifier_enc: string; return_to: string | null }>(
      `UPDATE oauth_states SET consumed_at = now() WHERE state_hash = $1 AND nonce = 'stytch' AND consumed_at IS NULL AND expires_at > now() RETURNING verifier_enc, return_to`,
      [stateHash(ctx, input.cookieState!)],
    );
    return r.rows[0] ?? null;
  });
  if (!row) throw failed(); // not started by this browser, expired, or already used
  let proof;
  try {
    proof = await ctx.stytch.authenticateOAuth(input.token, decrypt(ctx.config.DATA_ENCRYPTION_KEY, row.verifier_enc));
  } catch (err) {
    const kind = err instanceof StytchError ? err.kind : 'error';
    ctx.log.warn({ kind }, 'stytch oauth failed');
    await audit(ctx.db, { action: 'auth.google_failed', ip: meta.ip, metadata: { via: 'stytch', kind } });
    if (kind === 'unavailable') throw unavailable();
    throw failed();
  }
  const returnTo = row.return_to;
  // 1. The Stytch user is the identity (the same one an email code resolves to). 2. A verified address someone already holds. 3. A new person.
  const known = await findIdentity(ctx.db, 'stytch', proof.userId);
  const email = proof.verifiedEmails.map(normalizeEmail).find((e): e is string => !!e) ?? null;
  const signedIn = async (userId: string) => {
    const out = await signInUser(ctx, userId, 'google', undefined, meta);
    if (out.status !== 'signed_in') throw failed();
    return { kind: 'signed_in' as const, out, returnTo };
  };
  if (known) {
    if (email && known.email !== email) await ctx.db.query('UPDATE user_identities SET email = $2, updated_at = now() WHERE id = $1', [known.id, email]);
    return signedIn(known.user_id);
  }
  if (!email) throw failed(); // nothing verified to match or create on
  const owner = await findEmailOwner(ctx.db, email);
  if (owner) {
    await addIdentity(ctx.db, owner.user_id, 'stytch', proof.userId, { email });
    await audit(ctx.db, { actorId: owner.user_id, action: 'email_identity_linked', ip: meta.ip, metadata: { via: 'stytch_oauth_verified_email' } });
    return signedIn(owner.user_id);
  }
  const signupToken = await mintSignupToken(ctx, { provider: 'stytch', subject: proof.userId, email, ...(proof.firstName ? { firstName: proof.firstName } : {}), ...(proof.lastName ? { lastName: proof.lastName } : {}) });
  return { kind: 'needs_profile', signupToken, email, returnTo };
}
