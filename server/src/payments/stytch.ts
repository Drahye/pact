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
    async verifyEmailCode(methodId, code) {
      // No session is requested: Stytch only proves the address, PACT issues its own session.
      const r = await call('/v1/otps/authenticate', { method_id: methodId, code });
      if (typeof r.user_id !== 'string' || !r.user_id) throw new StytchError('invalid_code');
      return { userId: r.user_id };
    },
  };
}
