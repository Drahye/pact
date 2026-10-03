/**
 * Capability links carry a secret in the path: whoever holds the address can use it. A request log is read by far more people than
 * the database is, so the secret segment is never written down. The route type, method, status and request id stay.
 */
const REDACTED = '[REDACTED]';

/** [prefix] followed by the secret segment. The segment is replaced; anything after it (/mine, /rsvp, a query) is kept. */
const CAPABILITY_PATHS = [
  /^(\/api\/(?:ask|plan|split|recap)-links\/)[^/?#]+/,
  /^(\/api\/circle-invites\/)[^/?#]+/,
  /^(\/api\/invites\/)[^/?#]+/,
  /^(\/(?:a|p|s|r)\/)[^/?#]+/,
  /^(\/app\/(?:c|ask|join)\/)[^/?#]+/,
  /^(\/join\/)[^/?#]+/,
];

export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  // The Google callback's query carries the authorization code and the OAuth state: neither is ever written down.
  if (/^\/api\/auth\/google\/callback\?/.test(url)) return url.replace(/\?.*$/, `?${REDACTED}`);
  for (const re of CAPABILITY_PATHS) if (re.test(url)) return url.replace(re, `$1${REDACTED}`);
  return url;
}

/** Fastify's request serializer with the URL sanitized. */
export const reqSerializer = (req: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined>; host?: string; hostname?: string; ip?: string; socket?: { remotePort?: number } }) => ({
  method: req.method,
  url: sanitizeUrl(req.url),
  host: (req.headers?.host as string | undefined) ?? req.host ?? req.hostname,
  remoteAddress: req.ip,
  remotePort: req.socket?.remotePort,
});
