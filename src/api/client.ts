import type { ApiErrorDTO, AuthTokensDTO } from '../../shared/contracts';

/** Error shape every screen can show: a human message plus a code for branching. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

/* Access token lives in memory only. The refresh token is an httpOnly cookie the
   page can't read, so an XSS bug can't walk away with a long-lived credential. */
let accessToken: string | null = null;
let refreshing: Promise<AuthTokensDTO | null | 'offline'> | null = null;
let onSignedOut: () => void = () => {};

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const onSessionEnded = (fn: () => void) => {
  onSignedOut = fn;
};

async function raw<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'X-Pact-Client': 'web',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'You seem to be offline. Check your connection and try again.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (data as ApiErrorDTO | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'unknown', err?.message ?? 'Something went wrong. Try again.', err?.details ?? {});
  }
  return data as T;
}

/**
 * One refresh at a time, however many requests hit a 401 together.
 * Resolves to the new tokens, `null` when the server says the session is over, or
 * `'offline'` when the request never got an answer (dropped connection, page unloading).
 * Only `null` ends the session: a flaky network must never sign anyone out.
 */
export function refreshSession(): Promise<AuthTokensDTO | null | 'offline'> {
  refreshing ??= raw<AuthTokensDTO>('POST', '/auth/refresh', {})
    .then((t) => {
      setAccessToken(t.accessToken);
      return t;
    })
    .catch((err: unknown) => {
      if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) return 'offline' as const;
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(method: string, path: string, body?: unknown, opts: { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {};
  try {
    return await raw<T>(method, path, body, headers);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || path.startsWith('/auth/')) throw err;
    const t = await refreshSession();
    if (t === null) {
      onSignedOut();
      throw err;
    }
    if (t === 'offline') throw new ApiError(0, 'network', 'You seem to be offline. Check your connection and try again.');
    return raw<T>(method, path, body, headers);
  }
}

/** New key per user intent; reuse it when retrying the same intent. */
export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
