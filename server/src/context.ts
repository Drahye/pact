import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { PaymentProvider } from './payments/provider.js';
import type { EmailSender } from './payments/email.js';
import type { GoogleClient } from './payments/google.js';
import type { SmsSender } from './payments/sms.js';
import type { PushSender } from './modules/push.js';

/** Everything a service needs, passed explicitly so tests can swap any part. */
export interface Ctx {
  config: Config;
  db: Db;
  provider: PaymentProvider;
  sms: SmsSender;
  email: EmailSender;
  google: GoogleClient;
  /** Browser Web Push. Null when VAPID keys are not configured: push is then simply unavailable. */
  push: PushSender | null;
  log: FastifyBaseLogger;
  /** Injectable clock for deadline logic and tests. */
  now: () => Date;
}

/** Request metadata recorded on sessions and the audit log. */
export interface ReqMeta {
  ip: string | null;
  userAgent: string | null;
}
