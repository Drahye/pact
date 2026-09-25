import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { seedDemo } from './db/seed.js';
import { startWorker } from './jobs/worker.js';

async function main() {
  const config = loadConfig();
  const db = await createDb(config);
  const { app, ctx } = await buildApp({ config, db });
  if (config.MIGRATION_DATABASE_URL) {
    // Schema changes run as the owner; the API itself connects without DDL rights.
    const owner = await createDb({ ...config, DATABASE_URL: config.MIGRATION_DATABASE_URL, DB_POOL_MAX: 1 });
    await migrate(owner, (m) => app.log.info(m));
    await owner.close();
  } else {
    await migrate(db, (m) => app.log.info(m));
  }
  if (config.SEED_DEMO && !config.isProd) await seedDemo(ctx);

  const stopWorker = config.RUN_WORKER ? startWorker(ctx) : () => {};
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`PACT API on :${config.PORT} · payments: ${ctx.provider.name} · db: ${db.driver}`);

  // Graceful shutdown: stop taking work, finish in-flight requests, then close the pool.
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal}: shutting down`);
    stopWorker();
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
