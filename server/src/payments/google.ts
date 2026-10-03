import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Config } from '../config.js';

/** What PACT keeps from a verified Google sign-in. No access or refresh token is ever requested to be kept. */
export interface GoogleClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
}

/** Provider-agnostic seam so tests never call Google. */
export interface GoogleClient {
  enabled: boolean;
  authorizeUrl(p: { state: string; nonce: string; codeChallenge: string }): string;
  /** Swaps the code for an ID token and verifies it. Throws on anything wrong: callers show one generic message. */
  exchange(p: { code: string; codeVerifier: string; nonce: string }): Promise<GoogleClaims>;
}

const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

/** Standard OIDC checks on a Google ID token: signature, issuer, audience, expiry, nonce. */
export async function verifyGoogleIdToken(idToken: string, opts: { jwks: JWTVerifyGetKey; clientId: string; nonce: string; now?: Date }): Promise<GoogleClaims> {
  const { payload } = await jwtVerify(idToken, opts.jwks, { issuer: ISSUERS, audience: opts.clientId, algorithms: ['RS256'], ...(opts.now ? { currentDate: opts.now } : {}) });
  if (typeof payload.nonce !== 'string' || payload.nonce !== opts.nonce) throw new Error('nonce mismatch');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('no subject');
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { sub: payload.sub, email: str(payload.email), emailVerified: verified, firstName: str(payload.given_name), lastName: str(payload.family_name) };
}

export const googleRedirectUri = (config: Pick<Config, 'GOOGLE_REDIRECT_URI' | 'APP_ORIGIN'>) => config.GOOGLE_REDIRECT_URI || `${config.APP_ORIGIN}/api/auth/google/callback`;

export function createGoogle(config: Config): GoogleClient {
  const enabled = !!config.GOOGLE_CLIENT_ID;
  const redirectUri = googleRedirectUri(config);
  const jwks = createRemoteJWKSet(JWKS_URL);
  return {
    enabled,
    authorizeUrl({ state, nonce, codeChallenge }) {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.search = new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return u.toString();
    },
    async exchange({ code, codeVerifier, nonce }) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
      const body = (await res.json()) as { id_token?: string };
      if (!body.id_token) throw new Error('no id_token');
      // Only the ID token is used, and only here. The access token is never read, stored or logged.
      return verifyGoogleIdToken(body.id_token, { jwks, clientId: config.GOOGLE_CLIENT_ID, nonce });
    },
  };
}
