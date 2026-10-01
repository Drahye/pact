// A throwaway Postgres-compatible server (PGlite over the wire protocol) for rehearsing a staging deploy on one machine.
// Not a production database: one process, no real roles (every connection is a superuser), so least-privilege roles
// are checked by `npm run test:roles` instead. Usage: node scripts/pg-local.mjs [port=5433] [dir=.data/pg-local]
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.argv[2] ?? 5433);
const dir = process.argv[3] ?? '.data/pg-local';
const db = await PGlite.create(dir);
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`postgres://postgres@127.0.0.1:${port}/postgres  (data: ${dir})`);
process.on('SIGINT', async () => {
  await server.stop();
  await db.close();
  process.exit(0);
});
