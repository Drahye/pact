import pino from 'pino';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { startWorker } from './jobs/worker.js';
import { createPaystackProvider } from './payments/paystack.js';
import { createSandboxProvider } from './payments/sandbox.js';
import { createSms } from './payments/sms.js';

/** Standalone worker: run as many of these as the queue needs, alongside RUN_WORKER=false API instances. */
async function main() {
  const config = loadConfig();
  const log = pino({ level: config.LOG_LEVEL });
  const db = await createDb(config);
  // The API applies migrations; the worker only needs the runtime credential.
  if (!config.MIGRATION_DATABASE_URL) await migrate(db);
  const provider = config.PAYMENTS_PROVIDER === 'paystack' ? createPaystackProvider(config) : createSandboxProvider(config);
  const stop = startWorker({ config, db, provider, sms: createSms(config, log), log, now: () => new Date() }, 500);
  log.info('PACT worker running');
  const shutdown = async () => {
    stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
