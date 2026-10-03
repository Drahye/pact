/** A shared Plan link as WhatsApp sees it: when, where, how many are in, no search indexing, nothing private. */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { dateRange, planPreviewText } from '../src/lib/og.js';
import { addDays, lagosToday } from '../src/lib/time.js';
import { setup } from './helpers.js';

const SHELL = `<!doctype html><html><head><meta name="description" content="g" /><meta property="og:type" content="website" /><meta property="og:title" content="g" /><meta property="og:description" content="g" /><meta property="og:image" content="/brand/og.png" /><meta name="twitter:card" content="summary_large_image" /><title>g</title></head><body><div id="root"></div></body></html>`;

describe('shared Plan link metadata', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const cwd = process.cwd();
  let token: string;
  let planId: string;
  let ana: { accessToken: string };

  before(async () => {
    const root = mkdtempSync(join(tmpdir(), 'pact-ogp-'));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'index.html'), SHELL);
    process.chdir(root);
    t = await setup({ env: { SERVE_STATIC: 'true', APP_ORIGIN: 'https://pact.example' } });
    ana = await t.signIn('08039990001', { firstName: 'Ana', lastName: 'Planner', pin: '2468' });
    const circle = (await t.call('POST', '/circles', ana.accessToken, { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const start = addDays(lagosToday(new Date()), 40);
    const p = (await t.call('POST', `/circles/${circle}/plans`, ana.accessToken, { title: 'Ghana in December', date: start, endDate: addDays(start, 4), location: 'Accra', roughBudget: 650_000_00 })).body.data;
    token = p.shareToken;
    planId = p.id;
    await t.call('POST', `/plans/${planId}/tasks`, ana.accessToken, { title: 'Secret hotel task' });
  });
  after(async () => {
    process.chdir(cwd);
    await t.close();
  });

  it('formats date ranges and previews without anything private', () => {
    assert.equal(dateRange('2026-12-18', '2026-12-22'), 'Dec 18–22');
    assert.equal(dateRange('2026-12-28', '2027-01-02'), 'Dec 28 – Jan 2');
    assert.equal(dateRange('2026-12-18', null), 'Dec 18');
    assert.equal(dateRange(null, null), null);
    assert.equal(planPreviewText({ title: 'Beach', circleName: 'X', circleEmoji: '🌴', date: null, endDate: null, location: null, going: 0, status: 'planning' }).description, 'Are you coming?');
    assert.match(planPreviewText({ title: 'Beach', circleName: 'X', circleEmoji: '🌴', date: '2026-12-18', endDate: '2026-12-22', location: 'Accra', going: 6, status: 'planning' }).description, /^Dec 18–22 · Accra\. 6 people are in\. Are you coming\?$/);
    assert.match(planPreviewText({ title: 'Beach', circleName: 'X', circleEmoji: '🌴', date: null, endDate: null, location: null, going: 1, status: 'cancelled' }).description, /cancelled/);
  });

  it('gives crawlers a real card for /p/:token, noindex, and the app shell for everyone', async () => {
    const r = await t.app.inject({ method: 'GET', url: `/p/${token}` });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
    const html = r.body;
    assert.match(html, /og:title" content="Ghana in December · The Boys 🍻"/);
    assert.match(html, /og:description" content="[A-Z][a-z]{2} \d{1,2}[–-][^"]*· Accra\. 1 person is in\. Are you coming\?"/);
    assert.match(html, /og:image" content="https:\/\/pact\.example\/brand\/og-ask\.png"/);
    assert.match(html, /rel="canonical" href="https:\/\/pact\.example\/p\/[A-Za-z0-9_-]{43}"/);
    assert.match(html, /name="robots" content="noindex,nofollow"/);
    assert.match(html, /<div id="root">/);
    assert.ok(!/Secret hotel|650000|650,000|Ana|Planner|0803999/.test(html), 'no tasks, budget, names or numbers');
  });

  it('says nothing for a wrong or turned-off link', async () => {
    const wrong = (await t.app.inject({ method: 'GET', url: `/p/${'z'.repeat(43)}` })).body;
    assert.match(wrong, /This plan is no longer available\./);
    assert.ok(!/Ghana|Boys/.test(wrong));
    await t.call('POST', `/plans/${planId}/share/reset`, ana.accessToken, {});
    const old = (await t.app.inject({ method: 'GET', url: `/p/${token}` })).body;
    assert.match(old, /no longer available/);
    assert.ok(!/Ghana|Boys/.test(old), 'an old link reveals nothing');
  });
});
