import { createHash } from 'node:crypto';
import type { OtpVerifyDTO } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import { decrypt, encrypt, keyedHash, randomToken, safeEqual } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { safeReturnPath } from '../lib/returnPath.js';
import { track } from '../lib/events.js';
import { mintSignupToken, signInUser } from './auth.js';
import { addIdentity, findIdentity, normalizeEmail } from './identities.js';
import { audit } from './platform.js';

/**
 * Google sign-in: OAuth 2.0 authorization code flow with PKCE, a bound `state`, and an ID-token `nonce`.
 * The trusted return destination, the PKCE verifier and the nonce live server-side against the state; nothing but the state travels,
 * and the callback's own query string never decides where a person lands.
 */
const STATE_TTL_MIN = 10;
export const GOOGLE_STATE_COOKIE = 'pact_oa';

const stateHash = (ctx: Ctx, state: string) => keyedHash(ctx.config.HASH_SECRET, `oauth:${state}`);
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export async function startGoogle(ctx: Ctx, input: { mode: 'signin' | 'link'; userId?: string; returnTo?: string | null }) {
  if (!ctx.config.googleEnabled || !ctx.google.enabled) throw new AppError(503, 'google_unavailable', 'Google sign-in isn’t available right now.');
  const state = randomToken(24);
  const nonce = randomToken(16);
  const verifier = randomToken(32);
  await ctx.db.query(
    `INSERT INTO oauth_states (state_hash, nonce, verifier_enc, mode, user_id, return_to, expires_at) VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(mins => $7))`,
    [stateHash(ctx, state), nonce, encrypt(ctx.config.DATA_ENCRYPTION_KEY, verifier), input.mode, input.userId ?? null, safeReturnPath(input.returnTo), STATE_TTL_MIN],
  );
  return { state, url: ctx.google.authorizeUrl({ state, nonce, codeChallenge: challengeOf(verifier) }) };
}

export type GoogleOutcome =
  | { kind: 'signed_in'; out: Extract<OtpVerifyDTO, { status: 'signed_in' }>; returnTo: string | null }
  | { kind: 'needs_profile'; signupToken: string; returnTo: string | null }
  | { kind: 'linked'; returnTo: string | null }
  | { kind: 'error'; reason: 'failed' | 'conflict'; returnTo: string | null };

/** Resolves a Google callback to what the browser should do next. One generic failure; the reason never carries provider detail. */
export async function finishGoogle(ctx: Ctx, input: { state: string | undefined; cookieState: string | undefined; code: string | undefined; providerError: boolean }, meta: ReqMeta): Promise<GoogleOutcome> {
  const fail = (returnTo: string | null = null, reason: 'failed' | 'conflict' = 'failed'): GoogleOutcome => ({ kind: 'error', reason, returnTo });
  if (!ctx.config.googleEnabled) return fail();
  // The state must be the one this browser was given: a callback someone else started cannot log this browser in.
  if (!input.state || !input.cookieState || !safeEqual(input.state, input.cookieState)) return fail();

  const row = await ctx.db.tx(async (q) => {
    const r = await q.query<{ nonce: string; verifier_enc: string; mode: 'signin' | 'link'; user_id: string | null; return_to: string | null }>(
      `UPDATE oauth_states SET consumed_at = now() WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING nonce, verifier_enc, mode, user_id, return_to`,
      [stateHash(ctx, input.state!)],
    );
    return r.rows[0] ?? null;
  });
  if (!row) return fail(); // unknown, expired or already used (replay)
  if (input.providerError || !input.code) return fail(row.return_to);

  let claims;
  try {
    claims = await ctx.google.exchange({ code: input.code, codeVerifier: decrypt(ctx.config.DATA_ENCRYPTION_KEY, row.verifier_enc), nonce: row.nonce });
  } catch (err) {
    ctx.log.warn({ reason: err instanceof Error ? err.message.slice(0, 80) : 'error' }, 'google sign-in failed');
    await audit(ctx.db, { action: 'auth.google_failed', ip: meta.ip });
    return fail(row.return_to);
  }
  const email = claims.emailVerified && claims.email ? normalizeEmail(claims.email) : null;
  const extra = email ? { email } : {};

  if (row.mode === 'link') {
    if (!row.user_id) return fail(row.return_to);
    try {
      await addIdentity(ctx.db, row.user_id, 'google', claims.sub, extra);
    } catch (err) {
      if (err instanceof AppError && err.code === 'identity_taken') {
        await audit(ctx.db, { actorId: row.user_id, action: 'auth_provider_conflict', ip: meta.ip, metadata: { provider: 'google' } });
        return fail(row.return_to, 'conflict');
      }
      throw err;
    }
    await audit(ctx.db, { actorId: row.user_id, action: 'google_identity_linked', ip: meta.ip });
    await track(ctx.db, ctx.config, 'identity_linked', { userId: row.user_id, key: `idl:${row.user_id}:google`, props: { provider: 'google' } }, true);
    return { kind: 'linked', returnTo: row.return_to };
  }

  // 1. The Google subject is the identity. Its email may change over time; keep the displayed one fresh.
  const known = await findIdentity(ctx.db, 'google', claims.sub);
  if (known) {
    if (email && known.email !== email) await ctx.db.query('UPDATE user_identities SET email = $2, updated_at = now() WHERE id = $1', [known.id, email]);
    return signedIn(ctx, known.user_id, row.return_to, meta);
  }
  // 2. A verified email that already belongs to an account's verified email identity: the same person, so link rather than duplicate.
  if (email) {
    const byEmail = await findIdentity(ctx.db, 'email', email);
    if (byEmail) {
      await addIdentity(ctx.db, byEmail.user_id, 'google', claims.sub, extra);
      await audit(ctx.db, { actorId: byEmail.user_id, action: 'google_identity_linked', ip: meta.ip, metadata: { via: 'verified_email' } });
      return signedIn(ctx, byEmail.user_id, row.return_to, meta);
    }
  }
  // 3. Nothing matches: a new account, after a name. A same-named or same-looking phone account is never merged by guesswork.
  const signupToken = await mintSignupToken(ctx, { provider: 'google', subject: claims.sub, ...extra, ...(claims.firstName ? { firstName: claims.firstName } : {}), ...(claims.lastName ? { lastName: claims.lastName } : {}) });
  return { kind: 'needs_profile', signupToken, returnTo: row.return_to };
}

async function signedIn(ctx: Ctx, userId: string, returnTo: string | null, meta: ReqMeta): Promise<GoogleOutcome> {
  const out = await signInUser(ctx, userId, 'google', undefined, meta);
  if (out.status !== 'signed_in') return { kind: 'error', reason: 'failed', returnTo };
  return { kind: 'signed_in', out, returnTo };
}
