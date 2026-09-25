import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { PaymentProvider } from './payments/provider.js';
import type { SmsSender } from './payments/sms.js';

/** Everything a service needs, passed explicitly so tests can swap any part. */
export interface Ctx {
  config: Config;
  db: Db;
  provider: PaymentProvider;
  sms: SmsSender;
  log: FastifyBaseLogger;
  /** Injectable clock for deadline logic and tests. */
  now: () => Date;
}

/** Request metadata recorded on sessions and the audit log. */
export interface ReqMeta {
  ip: string | null;
  userAgent: string | null;
}
