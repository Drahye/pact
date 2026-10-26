/** The headers that keep tokens in URLs from leaking and the app out of other people's frames, pinned. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { setup } from './helpers.js';

describe('security headers', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const cwd = process.cwd();
  before(async () => {
    const root = mkdtempSync(join(tmpdir(), 'pact-hdr-'));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><html><head><title>g</title></head><body><div id="root"></div></body></html>');
    process.chdir(root);
    t = await setup({ env: { SERVE_STATIC: 'true' } });
  });
  after(async () => {
    process.chdir(cwd);
    await t.close();
  });

  for (const url of ['/', '/s/' + 'a'.repeat(43), '/api/health']) {
    it(`${url.slice(0, 12)} cannot be framed, sniffed or leaked by Referer`, async () => {
      const r = await t.app.inject({ method: 'GET', url });
      const csp = String(r.headers['content-security-policy']);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /script-src 'self'/);
      assert.equal(r.headers['referrer-policy'], 'no-referrer');
      assert.equal(r.headers['x-content-type-options'], 'nosniff');
    });
  }
});

/** The policy is script-src 'self', so a script written into the page would be blocked and its job silently not done. */
describe('index.html and the content security policy', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  it('has no inline script: every script is a file on this origin', () => {
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(([, attrs, body]) => !/\bsrc=/.test(attrs) || body.trim());
    assert.deepEqual(inline.map((m) => m[0].slice(0, 80)), []);
  });
  it('loads the theme script from public/, before anything paints', () => {
    assert.match(html, /<script src="\/theme-init\.js"><\/script>/);
    assert.ok(existsSync(new URL('../../public/theme-init.js', import.meta.url)));
  });
});
