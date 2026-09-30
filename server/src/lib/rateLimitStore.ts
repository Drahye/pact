import type { Db } from '../db/index.js';

type Result = { current: number; ttl: number };
type Callback = (err: Error | null, res?: Result) => void;

/**
 * A @fastify/rate-limit store backed by Postgres, so every API instance counts against
 * the same limit. Fixed windows: one upsert per request, keyed by route and IP.
 */
export function postgresRateLimitStore(db: Db) {
  return class PostgresStore {
    private prefix: string;
    // The plugin constructs the root store with its options object; route stores come from child().
    constructor(prefix?: unknown) {
      this.prefix = typeof prefix === 'string' ? prefix : '';
    }

    incr(key: string, cb: Callback, timeWindow: number) {
      const now = Date.now();
      const start = Math.floor(now / timeWindow) * timeWindow;
      db.query<{ hits: number }>(
        `INSERT INTO http_rate_limits (key, window_start, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))
         ON CONFLICT (key, window_start) DO UPDATE SET hits = http_rate_limits.hits + 1
         RETURNING hits`,
        [this.prefix + key, start, start + timeWindow],
      ).then(
        (r) => cb(null, { current: r.rows[0].hits, ttl: start + timeWindow - now }),
        (err: Error) => cb(err),
      );
    }

    read(key: string, cb: Callback, timeWindow: number) {
      const now = Date.now();
      const start = Math.floor(now / timeWindow) * timeWindow;
      db.query<{ hits: number }>('SELECT hits FROM http_rate_limits WHERE key = $1 AND window_start = $2', [this.prefix + key, start]).then(
        (r) => cb(null, r.rows[0] ? { current: r.rows[0].hits, ttl: start + timeWindow - now } : { current: 0, ttl: 0 }),
        (err: Error) => cb(err),
      );
    }

    // Typed as RouteOptions by the plugin; at runtime it's the route's merged limit options.
    child(options: object) {
      const route = (options as { routeInfo?: { method?: string; url?: string } }).routeInfo;
      return new PostgresStore(`${route?.method ?? ''}${route?.url ?? ''}:`);
    }
  };
}

/**
 * The key per-IP limits count against. IPv6 counts per /64, the block one household or
 * phone is given, so rotating addresses inside it can't skip the limit or flood the
 * counters table. IPv4 (including IPv4-mapped IPv6) counts per address.
 */
export function rateLimitKey(ip: string): string {
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4) return v4[1];
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('%')[0].split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${full.slice(0, 4).map((h) => parseInt(h || '0', 16).toString(16)).join(':')}::/64`;
}
