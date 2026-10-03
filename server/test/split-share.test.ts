/** A shared Split link as WhatsApp sees it: generic, noindex, never an amount or a name. */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { setup } from './helpers.js';

const SHELL = `<!doctype html><html><head><meta name="description" content="g" /><meta property="og:type" content="website" /><meta property="og:title" content="g" /><meta property="og:description" content="g" /><meta property="og:image" content="/brand/og.png" /><meta name="twitter:card" content="summary_large_image" /><title>g</title></head><body><div id="root"></div></body></html>`;

describe('shared Split link metadata', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const cwd = process.cwd();
  let token: string;

  before(async () => {
    const root = mkdtempSync(join(tmpdir(), 'pact-ogs-'));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'index.html'), SHELL);
    process.chdir(root);
    t = await setup({ env: { SERVE_STATIC: 'true', APP_ORIGIN: 'https://pact.example' } });
    const ana = await t.signIn('08035540001', { firstName: 'Ana', lastName: 'Payer', pin: '2468' });
    const ben = await t.signIn('08035540002', { firstName: 'Ben', lastName: 'Owes', pin: '2468' });
    const circle = (await t.call('POST', '/circles', ana.accessToken, { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const inv = (await t.call('POST', `/circles/${circle}/invites`, ana.accessToken, {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${inv}/join`, ben.accessToken, {});
    token = (await t.call('POST', `/circles/${circle}/splits`, ana.accessToken, { title: 'Dinner at Yellow Chilli', total: 62_500_00, participants: [{ userId: ben.user.id }] })).body.data.shareToken;
  });
  after(async () => {
    process.chdir(cwd);
    await t.close();
  });

  it('gives crawlers a generic card, noindex, with the app shell for everyone', async () => {
    const r = await t.app.inject({ method: 'GET', url: `/s/${token}` });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(r.body, /og:title" content="Dinner at Yellow Chilli"/);
    assert.match(r.body, /og:description" content="A shared expense on PACT\."/);
    assert.match(r.body, /name="robots" content="noindex,nofollow"/);
    assert.match(r.body, /<div id="root">/);
    assert.ok(!/62,?500|Ana|Ben|owes|0803554/i.test(r.body.replace(/Owes/g, '')), 'no amount, name, number or debt');
  });

  it('says nothing for a wrong token', async () => {
    const wrong = (await t.app.inject({ method: 'GET', url: `/s/${'z'.repeat(43)}` })).body;
    assert.match(wrong, /no longer available/);
    assert.ok(!/Yellow|Boys/.test(wrong));
  });
});
