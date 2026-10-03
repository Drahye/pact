/**
 * The shared-link page as WhatsApp sees it: /a/:token returns the same app HTML with a real preview card, noindex, and
 * nothing about any Circle when the link is wrong, closed off or gone. Everything else keeps behaving like the app.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { setup } from './helpers.js';

const SHELL = `<!doctype html><html><head>
<meta name="description" content="generic" />
<meta property="og:type" content="website" />
<meta property="og:title" content="PACT · generic" />
<meta property="og:description" content="generic description" />
<meta property="og:image" content="/brand/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<title>PACT generic</title></head><body><div id="root"></div></body></html>`;

describe('shared Ask link metadata', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const cwd = process.cwd();
  let token: string;
  let askId: string;
  let ana: { accessToken: string };

  before(async () => {
    const root = mkdtempSync(join(tmpdir(), 'pact-og-'));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'index.html'), SHELL);
    process.chdir(root);
    t = await setup({ env: { SERVE_STATIC: 'true', APP_ORIGIN: 'https://pact.example' } });
    ana = await t.signIn('08037770001', { firstName: 'Ana', lastName: 'Asker', pin: '2468' });
    const circle = (await t.call('POST', '/circles', ana.accessToken, { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const a = (await t.call('POST', `/circles/${circle}/asks`, ana.accessToken, { type: 'choice', title: 'Where should we stay?', options: ['Labadi', 'Osu'] })).body.data;
    token = a.shareToken;
    askId = a.id;
  });
  after(async () => {
    process.chdir(cwd);
    await t.close();
  });

  const page = (url: string) => t.app.inject({ method: 'GET', url });

  it('gives crawlers a real card, no search indexing, and the app shell for everyone', async () => {
    const r = await page(`/a/${token}`);
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['content-type'] as string, /text\/html/);
    assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(r.headers['cache-control'] as string, /no-store/);
    const html = r.body;
    assert.match(html, /og:title" content="The Boys 🍻 · Where should we stay\?"/);
    assert.match(html, /og:description" content="Be the first to vote\."/);
    assert.match(html, /og:image" content="https:\/\/pact\.example\/brand\/og-ask\.png"/);
    assert.match(html, /og:url" content="https:\/\/pact\.example\/a\/[A-Za-z0-9_-]{43}"/);
    assert.match(html, /rel="canonical"/);
    assert.match(html, /name="twitter:image"/);
    assert.match(html, /name="robots" content="noindex,nofollow"/);
    assert.match(html, /<div id="root">/, 'the same page: the app still boots');
    assert.ok(!/Labadi|Osu|Ana|Asker|0803777/.test(html), 'no options, names or numbers in the metadata');
  });

  it('counts answers in the description without naming anyone', async () => {
    await t.call('PUT', `/asks/${askId}/response`, ana.accessToken, { optionId: (await t.call('GET', `/asks/${askId}`, ana.accessToken)).body.data.options[0].id });
    const html = (await page(`/a/${token}`)).body;
    assert.match(html, /1 person is deciding\. Add your vote\./);
  });

  it('says nothing about any Circle for a wrong, malformed or turned-off link', async () => {
    const wrong = (await page(`/a/${'z'.repeat(43)}`)).body;
    assert.match(wrong, /This Ask is no longer available\./);
    assert.match(wrong, /name="robots" content="noindex,nofollow"/);
    assert.ok(!/Boys|Where should/.test(wrong));
    const short = await page('/a/abc');
    assert.equal(short.statusCode, 200, 'still the app shell: the page itself explains');
    assert.ok(!/Boys/.test(short.body));
    await t.call('POST', `/asks/${askId}/share/reset`, ana.accessToken, {});
    const old = (await page(`/a/${token}`)).body;
    assert.match(old, /This Ask is no longer available\./);
    assert.ok(!/Boys|Where should/.test(old), 'an old link reveals nothing');
  });

  it('closed Asks keep a sensible preview and ordinary app routes are untouched', async () => {
    const fresh = (await t.call('GET', `/asks/${askId}`, ana.accessToken)).body.data.shareToken;
    await t.call('POST', `/asks/${askId}/close`, ana.accessToken, {});
    assert.match((await page(`/a/${fresh}`)).body, /Decision made\. Responses are closed\./);
    const app = await page('/app/pact/abc');
    assert.equal(app.statusCode, 200);
    assert.match(app.body, /PACT generic/, 'the SPA fallback is unchanged');
    assert.equal((await page('/api/nope')).statusCode, 404);
  });
});
