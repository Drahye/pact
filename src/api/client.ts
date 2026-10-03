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

/**
 * One key per intent, reused while the same body is retried (a double tap, a flaky connection) and renewed when the body changes.
 * Call `keyFor(body)` when sending; the server replays the first answer instead of creating a second object.
 */
export function intentKeys() {
  let last: { fp: string; key: string } | null = null;
  return (body: unknown) => {
    const fp = JSON.stringify(body);
    if (!last || last.fp !== fp) last = { fp, key: newIdempotencyKey() };
    return last.key;
  };
}

/** Uploads raw image bytes (the server checks the actual content, not the name or type). */
export async function uploadPhoto<T>(path: string, file: File): Promise<T> {
  const send = () =>
    fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Pact-Client': 'web', 'Content-Type': file.type || 'application/octet-stream', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: file,
    });
  let res = await send().catch(() => null);
  if (res?.status === 401 && (await refreshSession()) && accessToken) res = await send().catch(() => null);
  if (!res) throw new ApiError(0, 'network', 'The upload didn’t go through. Check your connection and try again.');
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'upload_failed', data?.error?.message ?? 'That photo couldn’t be added.');
  return data as T;
}

/** Fetches a private image with the session. */
export async function fetchPhoto(path: string): Promise<Blob> {
  const get = () => fetch(`${BASE}${path}`, { credentials: 'include', headers: { 'X-Pact-Client': 'web', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } });
  let res = await get();
  if (res.status === 401 && (await refreshSession()) && accessToken) res = await get();
  if (!res.ok) throw new ApiError(res.status, 'photo_unavailable', 'This photo isn’t available.');
  return res.blob();
}
