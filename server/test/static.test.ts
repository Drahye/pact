import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';

/** A deploy must reach people at once: HTML always revalidates, hashed assets cache for a year. */
describe('static serving cache headers', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  const cwd = process.cwd();

  before(async () => {
    const root = mkdtempSync(join(tmpdir(), 'pact-static-'));
    mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><title>shell</title>');
    writeFileSync(join(root, 'dist', 'manifest.webmanifest'), '{}');
    writeFileSync(join(root, 'dist', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(join(root, 'dist', 'assets', 'index-AbCd1234.js'), 'console.log(1)');
    writeFileSync(join(root, 'dist', 'assets', 'index-XyZ98765.css'), 'a{}');
    process.chdir(root);
    const config = loadConfig({ NODE_ENV: 'test', SEED_DEMO: 'false', RATE_LIMIT_ENABLED: 'false', SERVE_STATIC: 'true' });
    const db = await createDb(config);
    await migrate(db);
    ({ app } = await buildApp({ config, db, now: () => new Date() }));
    await app.ready();
  });

  after(async () => {
    process.chdir(cwd);
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });
  const noStore = 'no-cache, no-store, must-revalidate';

  it('a build file that no longer exists is a real 404, never the HTML shell', async () => {
    const res = await get('/assets/missing-AbCd1234.js');
    assert.equal(res.statusCode, 404);
    assert.doesNotMatch(res.body, /shell/);
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  for (const url of ['/', '/index.html', '/app', '/app/pact/abc']) {
    it(`${url} serves the HTML shell and always revalidates`, async () => {
      const res = await get(url);
      assert.equal(res.statusCode, 200);
      assert.match(res.body, /shell/);
      assert.equal(res.headers['cache-control'], noStore);
    });
  }

  it('hashed assets cache for a year', async () => {
    for (const url of ['/assets/index-AbCd1234.js', '/assets/index-XyZ98765.css']) {
      const res = await get(url);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
    }
  });

  it('release metadata revalidates instead of caching', async () => {
    for (const url of ['/manifest.webmanifest', '/favicon.svg']) {
      assert.equal((await get(url)).headers['cache-control'], 'no-cache');
    }
  });

  it('unknown API paths stay JSON 404s, never the shell', async () => {
    const res = await get('/api/nope');
    assert.equal(res.statusCode, 404);
    assert.match(String(res.headers['content-type']), /json/);
  });
});
