/** Phase E: what a stranger holding a share link can learn, and the Circle invite's card. */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { addDays, lagosToday } from '../src/lib/time.js';
import { setup } from './helpers.js';

const SHELL = `<!doctype html><html><head><meta name="description" content="g" /><meta property="og:type" content="website" /><meta property="og:title" content="g" /><meta property="og:description" content="g" /><meta property="og:image" content="/brand/og.png" /><meta name="twitter:card" content="summary_large_image" /><title>g</title></head><body><div id="root"></div></body></html>`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

describe('shared pages: nothing a stranger should not have', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const cwd = process.cwd();
  let ana: { accessToken: string; user?: { id: string } };
  let bo: { accessToken: string };
  let circleId: string;
  let invite: string;
  let askId: string;
  let askToken: string;
  let planId: string;
  let planToken: string;

  before(async () => {
    const root = mkdtempSync(join(tmpdir(), 'pact-shared-'));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'index.html'), SHELL);
    process.chdir(root);
    t = await setup({ env: { SERVE_STATIC: 'true', APP_ORIGIN: 'https://pact.example' } });
    ana = await t.signIn('08039990011', { firstName: 'Ana', lastName: 'Zebroski', pin: '2468' });
    bo = await t.signIn('08039990012', { firstName: 'Bo', lastName: 'Quillfeather', pin: '2468' });
    circleId = (await t.call('POST', '/circles', ana.accessToken, { name: 'The Boys', emoji: '🍻' })).body.data.id;
    invite = (await t.call('POST', `/circles/${circleId}/invites`, ana.accessToken, {})).body.data.invite.token;
    await t.call('POST', `/circle-invites/${invite}/join`, bo.accessToken, {});
    const ask = (await t.call('POST', `/circles/${circleId}/asks`, ana.accessToken, { type: 'choice', title: 'Where to eat?', options: ['Suya', 'Rice'] })).body.data;
    askId = ask.id;
    askToken = ask.shareToken;
    await t.call('PUT', `/asks/${askId}/response`, bo.accessToken, { optionId: ask.options[0].id });
    const start = addDays(lagosToday(new Date()), 30);
    const plan = (await t.call('POST', `/circles/${circleId}/plans`, ana.accessToken, { title: 'Beach', date: start, location: 'Lekki' })).body.data;
    planId = plan.id;
    planToken = plan.shareToken;
  });
  after(async () => {
    process.chdir(cwd);
    await t.close();
  });

  it('a public Ask carries no account, Circle or Ask id, and no last names', async () => {
    const r = await t.call('GET', `/ask-links/${askToken}`);
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes(askId), 'the Ask’s own id');
    assert.ok(!text.includes(circleId), 'the Circle’s id');
    assert.ok(!/Zebroski|Quillfeather/.test(text), 'last names');
    // Every id left is an alias that is different on another link.
    const ids = new Set(text.match(UUID) ?? []);
    const other = await t.call('GET', `/ask-links/${(await t.call('POST', `/circles/${circleId}/asks`, ana.accessToken, { type: 'attendance', title: 'Free?' })).body.data.shareToken}`);
    const otherIds = new Set(JSON.stringify(other.body).match(UUID) ?? []);
    const shared = [...ids].filter((x) => otherIds.has(x));
    assert.ok(shared.length <= 4, 'only the option ids are stable, never a person');
  });

  it('a public Ask shows how the group landed, never who voted for what', async () => {
    const r = await t.call('GET', `/ask-links/${askToken}`);
    assert.equal(r.body.data.responseCount, 1);
    assert.equal(r.body.data.options.find((o: { label: string }) => o.label === 'Suya').count, 1, 'the counts stay');
    assert.deepEqual(r.body.data.responders, []);
    assert.deepEqual(r.body.data.activity, []);
    assert.deepEqual(r.body.data.waiting, []);
    assert.ok(!/"Bo"/.test(JSON.stringify(r.body.people)), 'the voter is not named');
    // A signed-in person who is not in the Circle gets the same, plus their own answer.
    const stranger = await t.signIn('08039990014', { firstName: 'Di', lastName: 'Passerby', pin: '2468' });
    const mine = await t.call('GET', `/ask-links/${askToken}/mine`, stranger.accessToken);
    assert.deepEqual(mine.body.data.ask.responders, []);
    assert.deepEqual(mine.body.data.ask.activity, []);
    assert.ok(!/"Bo"/.test(JSON.stringify(mine.body.people)));
    // A member still sees who answered.
    const member = await t.call('GET', `/asks/${askId}`, ana.accessToken);
    assert.equal(member.body.data.responders.length, 1);
    assert.ok(member.body.people.some((p: { firstName: string }) => p.firstName === 'Bo'));
  });

  it('a public Plan carries no plan, Circle or account id', async () => {
    const r = await t.call('GET', `/plan-links/${planToken}`);
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes(planId), 'the plan’s id');
    assert.ok(!text.includes(circleId), 'the Circle’s id');
    assert.ok(!/Zebroski|Quillfeather/.test(text));
  });

  it('a Circle invite preview carries no Circle id: faces by first name, and counts only', async () => {
    const r = await t.call('GET', `/circle-invites/${invite}`);
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes(circleId), 'the Circle’s id');
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(text), 'no ids of any kind');
    assert.equal(r.body.members.length, 1, 'the member who is not the inviter');
    assert.equal(r.body.members[0].firstName, 'Bo');
    assert.deepEqual(r.body.now, { asks: 2, plans: 1, splits: 0 });
    assert.ok(!/Where to eat|Beach|Lekki/.test(text), 'no titles of what is going on');
  });

  it('the signed-in side of an invite names the Circle only to someone already in it', async () => {
    assert.equal((await t.call('GET', `/circle-invites/${invite}/mine`)).status, 401);
    assert.equal((await t.call('GET', `/circle-invites/${invite}/mine`, bo.accessToken)).body.memberOf, circleId);
    const stranger = await t.signIn('08039990013', { firstName: 'Cy', lastName: 'Nobody', pin: '2468' });
    assert.equal((await t.call('GET', `/circle-invites/${invite}/mine`, stranger.accessToken)).body.memberOf, null);
  });

  it('the Circle invite has its own card for crawlers, with nothing private in it', async () => {
    const r = await t.app.inject({ method: 'GET', url: `/app/c/${invite}` });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(r.body, /og:title" content="Join The Boys 🍻 on PACT"/);
    assert.match(r.body, /og:description" content="2 people are in\./);
    assert.match(r.body, /og:image" content="https:\/\/pact\.example\/brand\/og-circle\.png"/);
    assert.ok(!/Ana|Bo\b|Zebroski|Quillfeather|0803999/.test(r.body), 'no names or numbers');
    const gone = await t.app.inject({ method: 'GET', url: `/app/c/${'A'.repeat(43)}` });
    assert.match(gone.body, /no longer active/);
    assert.ok(!/The Boys/.test(gone.body));
  });
});
