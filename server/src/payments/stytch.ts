import type { Config } from '../config.js';

/**
 * Stytch Consumer API, server to server only: the project secret never leaves this process and no Stytch token or session is handed to
 * the browser. Only the two calls PACT needs: send an email one-time code, and check one. Everything else (accounts, sessions,
 * permissions) stays PACT's.
 */
export type StytchFailure = 'invalid_code' | 'rate_limited' | 'bad_request' | 'unavailable';

/** Carries only a coarse reason: never Stytch's message, a code, a method id or a token. */
export class StytchError extends Error {
  constructor(public readonly kind: StytchFailure) {
    super(`stytch: ${kind}`);
  }
}

export interface StytchClient {
  enabled: boolean;
  /** Emails a code to the address, creating the Stytch user if there is none. The answer never says which happened. */
  sendEmailCode(email: string): Promise<{ methodId: string; userId: string }>;
  /** Checks the code against the send. Returns the stable Stytch user id. Throws StytchError on anything else. */
  verifyEmailCode(methodId: string, code: string): Promise<{ userId: string }>;
  /** The URL that sends the browser to Google through Stytch. Built locally from the public token; nothing is called. */
  oauthStartUrl(input: { redirectUrl: string; codeChallenge: string }): string;
  /** Validates the token Stytch put on the redirect (single use, bound to our PKCE verifier). Throws StytchError on anything else. */
  authenticateOAuth(token: string, codeVerifier: string): Promise<StytchOAuthResult>;
}

/** What a validated OAuth token proves: the stable Stytch user and the addresses Stytch itself has verified for them. */
export interface StytchOAuthResult {
  userId: string;
  verifiedEmails: string[];
  firstName: string | null;
  lastName: string | null;
}

const CODE_MINUTES = 10;
export const STYTCH_CODE_TTL_MS = CODE_MINUTES * 60_000;

const baseUrl = (config: Config) => config.STYTCH_BASE_URL || (config.STYTCH_PROJECT_ID.startsWith('project-live-') ? 'https://api.stytch.com' : 'https://test.stytch.com');

export function createStytch(config: Config): StytchClient {
  const enabled = config.EMAIL_AUTH_PROVIDER === 'stytch';
  const call = async (path: string, body: Record<string, unknown>) => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl(config)}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${config.STYTCH_PROJECT_ID}:${config.STYTCH_SECRET}`).toString('base64')}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new StytchError('unavailable');
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return json ?? {};
    const type = typeof json?.error_type === 'string' ? json.error_type : '';
    if (res.status === 429 || type === 'too_many_requests') throw new StytchError('rate_limited');
    if (res.status >= 500) throw new StytchError('unavailable');
    if (['otp_code_not_found', 'invalid_otp', 'otp_expired', 'unable_to_auth_otp_code'].includes(type)) throw new StytchError('invalid_code');
    throw new StytchError('bad_request');
  };
  return {
    enabled,
    async sendEmailCode(email) {
      const r = await call('/v1/otps/email/login_or_create', { email, expiration_minutes: CODE_MINUTES });
      if (typeof r.email_id !== 'string' || typeof r.user_id !== 'string') throw new StytchError('unavailable');
      return { methodId: r.email_id, userId: r.user_id };
    },
    oauthStartUrl({ redirectUrl, codeChallenge }) {
      const q = new URLSearchParams({ public_token: config.STYTCH_PUBLIC_TOKEN, login_redirect_url: redirectUrl, signup_redirect_url: redirectUrl, code_challenge: codeChallenge });
      return `${baseUrl(config)}/v1/public/oauth/google/start?${q}`;
    },
    async authenticateOAuth(token, codeVerifier) {
      // No Stytch session is requested: Stytch only proves who this is, PACT issues its own session.
      let r;
      try {
        r = await call('/v1/oauth/authenticate', { token, code_verifier: codeVerifier });
      } catch (err) {
        // Any 4xx here (bad, spent or expired token, wrong verifier) means the same thing to the caller.
        if (err instanceof StytchError && err.kind === 'bad_request') throw new StytchError('invalid_code');
        throw err;
      }
      const user = (r.user ?? {}) as { emails?: { email?: unknown; verified?: unknown }[]; name?: { first_name?: unknown; last_name?: unknown } };
      if (typeof r.user_id !== 'string' || !r.user_id) throw new StytchError('invalid_code');
      const verifiedEmails = (user.emails ?? []).filter((e) => e.verified === true && typeof e.email === 'string').map((e) => String(e.email));
      const nm = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      return { userId: r.user_id, verifiedEmails, firstName: nm(user.name?.first_name), lastName: nm(user.name?.last_name) };
    },
    async verifyEmailCode(methodId, code) {
      // No session is requested: Stytch only proves the address, PACT issues its own session.
      const r = await call('/v1/otps/authenticate', { method_id: methodId, code });
      if (typeof r.user_id !== 'string' || !r.user_id) throw new StytchError('invalid_code');
      return { userId: r.user_id };
    },
  };
}
