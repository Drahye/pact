/**
 * First-time onboarding: the invite parser, the sample Pacts (their story must add up, and they must say they are samples),
 * and the rule for who sees the intro. The screens are checked in a browser (scripts/onboarding-check.mjs).
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEMOS, DEMO_ORDER, isDemoId } from '../../src/features/demo/fixtures.js';
import { parseInvite } from '../../src/features/onboarding/invite.js';
import { CURRENT_VERSION, introSeen, markIntro, readIntro } from '../../src/features/onboarding/store.js';

describe('invite links and codes', () => {
  it('finds the code in a full link, a bare link, a short link and a plain code', () => {
    assert.equal(parseInvite('https://staging.pact.example/app/join/54RUQTJN'), '54RUQTJN');
    assert.equal(parseInvite('  http://localhost:5173/app/join/ABC123?ref=x  '), 'ABC123');
    assert.equal(parseInvite('pact.app/join/SARAH123'), 'SARAH123');
    assert.equal(parseInvite('pact.app/sarahs-bday'), 'sarahs-bday');
    assert.equal(parseInvite('54RUQTJN'), '54RUQTJN');
    assert.equal(parseInvite('Join my Pact: https://x.example/app/join/ZZ99AA11 thanks!'), 'ZZ99AA11');
  });
  it('says no to things that are not an invite', () => {
    for (const bad of ['', '   ', 'hi', 'not an invite!!', '<script>', 'https://', '12', 'a'.repeat(80)]) assert.equal(parseInvite(bad), null, JSON.stringify(bad));
  });
});

describe('the sample Pacts', () => {
  it('there are three, they are completed, and their numbers add up', () => {
    assert.deepEqual(DEMO_ORDER, ['sarahs_birthday', 'december_trip', 'graduation_gift']);
    for (const id of DEMO_ORDER) {
      const d = DEMOS[id];
      const raised = d.pact.members.reduce((s, m) => s + m.contributed, 0);
      const spent = d.spent.reduce((s, x) => s + x.amount, 0);
      assert.equal(raised, d.pact.target, `${id}: what people gave is the goal`);
      assert.equal(raised, d.pact.raised);
      assert.equal(spent + d.remaining, raised, `${id}: spent plus left over is what was raised`);
      assert.ok(d.pact.completedAt && d.pact.status === 'released', `${id} is completed`);
      assert.ok((d.pact.tasks ?? []).every((t) => t.status === 'done'));
      assert.ok(d.milestones.length >= 3 && d.milestones.at(-1) === 'Pact completed');
    }
  });
  it('tell the story the product describes: Sarah’s Birthday, 8 people, ₦500,000, ₦482,000 spent, ₦18,000 left', () => {
    const d = DEMOS.sarahs_birthday;
    assert.equal(d.pact.members.length, 8);
    assert.equal(d.pact.target, 500_000);
    assert.deepEqual(d.spent.map((s) => s.amount), [250_000, 80_000, 90_000, 62_000]);
    assert.equal(d.remaining, 18_000);
    assert.equal(d.pact.tasks?.length, 4);
    assert.equal(DEMOS.december_trip.pact.members.length, 6);
    assert.equal(DEMOS.december_trip.pact.target, 780_000);
    assert.equal(DEMOS.graduation_gift.pact.members.length, 11);
    assert.equal(DEMOS.graduation_gift.pact.target, 220_000);
  });
  it('are only ever fixed data: no network, no ids that could point at a real Pact', () => {
    for (const id of DEMO_ORDER) {
      assert.match(DEMOS[id].pact.id, /^demo-/);
      assert.ok(DEMOS[id].activities.every((a) => a.pactId === DEMOS[id].pact.id && a.id.startsWith('demo-')));
    }
    assert.ok(isDemoId('sarahs_birthday') && !isDemoId('nope') && !isDemoId(undefined));
  });
});

describe('who sees the intro', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  });
  afterEach(() => delete (globalThis as Record<string, unknown>).localStorage);

  it('a new account has not seen it; finishing or skipping both count; each account is separate', () => {
    assert.equal(introSeen('u1'), false);
    markIntro('u1', 'skipped');
    assert.equal(introSeen('u1'), true, 'skipping is never punished with a second showing');
    assert.equal(introSeen('u2'), false, 'another account on the same device starts fresh');
    markIntro('u2', 'finished');
    assert.equal(readIntro('u2')?.how, 'finished');
  });
  it('an older version of the intro is shown again once, a deliberate migration', () => {
    store.set('pact.onboarding.u3', JSON.stringify({ version: CURRENT_VERSION - 1, how: 'finished', at: 'x' }));
    assert.equal(introSeen('u3'), false);
    markIntro('u3', 'finished');
    assert.equal(introSeen('u3'), true);
  });
  it('broken or missing storage never blocks anyone', () => {
    store.set('pact.onboarding.u4', '{not json');
    assert.equal(introSeen('u4'), false);
    (globalThis as Record<string, unknown>).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    assert.equal(introSeen('u5'), false);
    assert.doesNotThrow(() => markIntro('u5', 'skipped'));
  });
});
