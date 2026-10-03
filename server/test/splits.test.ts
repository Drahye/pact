/**
 * Split an expense: the arithmetic, who may mark a share settled, how the status follows the shares, edit and cancel rules,
 * share links (a safe summary, your own share only), Home / Circle signals, and what analytics may see. No money moves.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { splitPseudo } from '../src/lib/events.js';
import { equalShares } from '../src/modules/splits.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type U = Awaited<ReturnType<T['signIn']>>;

describe('equal split arithmetic', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`);
  it('divides exactly when it can', () => {
    assert.deepEqual(equalShares(6_250_000, ids(5)).map((s) => s.amount), [1_250_000, 1_250_000, 1_250_000, 1_250_000, 1_250_000]);
  });
  it('gives the leftover kobo one each to the first people, deterministically: ₦10,000 / 3', () => {
    assert.deepEqual(equalShares(1_000_000, ids(3)).map((s) => s.amount), [333_334, 333_333, 333_333]);
    assert.deepEqual(equalShares(1_000_000, ids(3)), equalShares(1_000_000, ids(3)));
  });
  it('always adds up to the total, for many totals and sizes', () => {
    for (let n = 1; n <= 30; n++) for (const total of [n, n + 1, 100, 99_999, 1_000_001, 12_345_678_9]) {
      if (total < n) continue;
      const shares = equalShares(total, ids(n));
      assert.equal(shares.reduce((t, s) => t + s.amount, 0), total);
      assert.ok(Math.max(...shares.map((s) => s.amount)) - Math.min(...shares.map((s) => s.amount)) <= 1, 'nobody pays more than a kobo extra');
    }
  });
});

describe('Splits', () => {
  let t: T;
  let ana: U, ben: U, cleo: U, dan: U, eve: U, zed: U, yan: U;
  let circleId: string;
  let otherCircle: string;
  const tok = (u: U) => u.accessToken;
  const code = (r: { body: { error?: { code?: string }; code?: string } }) => r.body.error?.code ?? r.body.code;
  const peopleOf = (...us: U[]) => us.map((u) => ({ userId: u.user.id }));

  before(async () => {
    t = await setup();
    ana = await t.signIn('08035550001', { firstName: 'Ana', lastName: 'Payer', pin: '2468' });
    ben = await t.signIn('08035550002', { firstName: 'Ben', lastName: 'Owes', pin: '2468' });
    cleo = await t.signIn('08035550003', { firstName: 'Cleo', lastName: 'Owes', pin: '2468' });
    dan = await t.signIn('08035550004', { firstName: 'Dan', lastName: 'Owes', pin: '2468' });
    eve = await t.signIn('08035550005', { firstName: 'Eve', lastName: 'Member', pin: '2468' });
    zed = await t.signIn('08035550006', { firstName: 'Zed', lastName: 'Outsider', pin: '2468' });
    circleId = (await t.call('POST', '/circles', tok(ana), { name: 'The Boys', emoji: '🍻' })).body.data.id;
    const link = (await t.call('POST', `/circles/${circleId}/invites`, tok(ana), {})).body.data.invite.token;
    for (const u of [ben, cleo, dan, eve]) await t.call('POST', `/circle-invites/${link}/join`, tok(u), {});
    yan = await t.signIn('08035550007', { firstName: 'Yan', lastName: 'Stranger', pin: '2468' });
    otherCircle = (await t.call('POST', '/circles', tok(zed), { name: 'Elsewhere', emoji: '🌍' })).body.data.id;
  });
  after(async () => t.close());

  const create = (u: U, body: Record<string, unknown>, cid = circleId) => t.call('POST', `/circles/${cid}/splits`, tok(u), body);
  const dinner = async (extra: Record<string, unknown> = {}) =>
    (await create(ana, { title: 'Dinner at Yellow Chilli', total: 62_500_00, mode: 'equal', participants: peopleOf(ana, ben, cleo, dan, eve), ...extra })).body.data;

  it('creates an equal split: the payer\'s own share is accounted for and the others owe', async () => {
    const r = await create(ana, { title: 'Dinner at Yellow Chilli', total: 62_500_00, mode: 'equal', participants: peopleOf(ana, ben, cleo, dan, eve) });
    assert.equal(r.status, 200);
    const d = r.body.data;
    assert.deepEqual([d.status, d.paidBy === ana.user.id, d.owedCount, d.settledCount, d.unsettled], ['open', true, 4, 0, 50_000_00]);
    assert.deepEqual(d.shares.map((s: { amount: number }) => s.amount), [12_500_00, 12_500_00, 12_500_00, 12_500_00, 12_500_00]);
    const mine = d.shares.find((s: { userId: string }) => s.userId === ana.user.id);
    assert.deepEqual([mine.isPayer, mine.status, mine.canChange], [true, 'settled', false], 'Ana does not owe herself');
    assert.equal(d.shareToken.length, 43);
  });

  it('payer excluded, or someone else paid', async () => {
    const out = (await create(ana, { title: 'Uber', total: 9_000_00, participants: peopleOf(ben, cleo, dan) })).body.data;
    assert.deepEqual([out.owedCount, out.unsettled, out.shares.some((s: { userId: string }) => s.userId === ana.user.id)], [3, 9_000_00, false], 'she paid and is not sharing: the three owe her all of it');
    const other = (await create(ana, { title: 'Pitch', total: 30_000_00, paidBy: ben.user.id, participants: peopleOf(ana, ben, cleo) })).body.data;
    assert.equal(other.paidBy, ben.user.id);
    assert.deepEqual([other.owedCount, other.unsettled], [2, 20_000_00]);
    assert.equal(other.shares.find((s: { userId: string }) => s.userId === ben.user.id).status, 'settled');
  });

  it('custom split: must add up exactly', async () => {
    const ok = await create(ana, { title: 'Airbnb', total: 60_000_00, mode: 'custom', participants: [{ userId: ben.user.id, amount: 20_000_00 }, { userId: cleo.user.id, amount: 15_000_00 }, { userId: dan.user.id, amount: 10_000_00 }, { userId: ana.user.id, amount: 15_000_00 }] });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.data.shares.map((s: { amount: number }) => s.amount).sort((a: number, b: number) => a - b), [10_000_00, 15_000_00, 15_000_00, 20_000_00]);
    const short = await create(ana, { title: 'Bad', total: 60_000_00, mode: 'custom', participants: [{ userId: ben.user.id, amount: 20_000_00 }, { userId: cleo.user.id, amount: 15_000_00 }] });
    assert.equal(code(short), 'split_sum_mismatch');
    assert.equal(code(await create(ana, { title: 'Bad', total: 60_000_00, mode: 'custom', participants: [{ userId: ben.user.id, amount: 61_000_00 }] })), 'split_sum_mismatch');
    assert.equal(code(await create(ana, { title: 'Bad', total: 60_000_00, mode: 'custom', participants: peopleOf(ben, cleo) })), 'missing_amount');
  });

  it('refuses bad input and ignores amounts the client sends for an equal split', async () => {
    assert.equal((await create(ana, { title: 'x', total: 0, participants: peopleOf(ben) })).status, 400);
    assert.equal((await create(ana, { title: 'x', total: -5, participants: peopleOf(ben) })).status, 400);
    assert.equal((await create(ana, { title: '', total: 5_000_00, participants: peopleOf(ben) })).status, 400);
    assert.equal((await create(ana, { title: 'x', total: 5_000_00, participants: [] })).status, 400);
    assert.equal(code(await create(ana, { title: 'x', total: 5_000_00, participants: peopleOf(ana) })), 'nobody_owes', 'splitting with nobody');
    assert.equal(code(await create(ana, { title: 'x', total: 5_000_00, participants: peopleOf(ben, ben) })), 'duplicate_person');
    assert.equal(code(await create(ana, { title: 'x', total: 5_000_00, participants: peopleOf(ben, zed) })), 'unknown_person', 'only Circle members');
    assert.equal(code(await create(ana, { title: 'x', total: 5_000_00, paidBy: zed.user.id, participants: peopleOf(ben) })), 'unknown_person');
    assert.equal((await create(ana, { title: 'x', total: 2, participants: peopleOf(ben, cleo, dan) })).status, 400, 'less than ₦1');
    const tamper = await create(ana, { title: 'Tamper', total: 9_000_00, mode: 'equal', participants: [{ userId: ben.user.id, amount: 1 }, { userId: cleo.user.id, amount: 1 }] });
    assert.deepEqual(tamper.body.data.shares.map((s: { amount: number }) => s.amount), [4_500_00, 4_500_00], 'the server does the arithmetic');
    assert.equal((await create(zed, { title: 'x', total: 5_000_00, participants: peopleOf(ben) })).status, 404, 'not your Circle');
  });

  it('settlement: own share, the creator, the payer; nobody else; undo; idempotent; status follows', async () => {
    const s = (await create(ana, { title: 'Groceries', total: 12_000_00, paidBy: eve.user.id, participants: peopleOf(ben, cleo, dan, eve) })).body.data;
    const set = (u: U, who: U, settled: boolean) => t.call('PUT', `/splits/${s.id}/shares/${who.user.id}`, tok(u), { settled });
    assert.equal((await set(cleo, ben, true)).status, 403, 'another member cannot touch Ben\'s share');
    assert.equal((await set(zed, ben, true)).status, 404, 'an outsider cannot see it at all');
    const own = await set(ben, ben, true);
    assert.deepEqual([own.status, own.body.data.settledCount, own.body.data.status], [200, 1, 'open']);
    const again = await set(ben, ben, true);
    assert.equal(again.body.data.activity.filter((a: { kind: string }) => a.kind === 'settled').length, 1, 'repeating it records nothing new');
    assert.equal((await set(ana, cleo, true)).body.data.settledCount, 2, 'the creator marks someone else\'s');
    assert.equal((await set(eve, eve, true)).status, 400, 'the payer\'s own share is not a debt');
    const last = await set(eve, dan, true);
    assert.deepEqual([last.body.data.status, last.body.data.settledCount, last.body.data.unsettled], ['settled', 3, 0], 'the payer can mark too; all settled closes it');
    assert.ok(last.body.data.activity.some((a: { kind: string }) => a.kind === 'completed'));
    assert.ok((await t.call('GET', '/notifications', tok(ana))).body.items.some((n: { type: string }) => n.type === 'split_done'));
    const undo = await set(ben, ben, false);
    assert.deepEqual([undo.body.data.status, undo.body.data.settledCount, undo.body.data.unsettled], ['open', 2, 3_000_00], 'undoing reopens it');
    assert.deepEqual(undo.body.data.activity.slice(0, 2).map((a: { kind: string }) => a.kind), ['reopened', 'unsettled']);
    // The list: open ones first; settled leave the Needs You.
    assert.ok((await t.call('GET', '/splits/needs-you', tok(ben))).body.data.some((n: { splitId: string; text: string }) => n.splitId === s.id && n.text === 'You still owe ₦3,000'));
    await set(ben, ben, true);
    const needs = await t.call('GET', '/splits/needs-you', tok(ben));
    assert.ok(!needs.body.data.some((n: { splitId: string }) => n.splitId === s.id), 'a settled split is not asking for anything');
  });

  it('Home and the Circle: who owes, who is owed, and a live line', async () => {
    const s = await dinner();
    const ben1 = (await t.call('GET', '/splits/needs-you', tok(ben))).body.data.find((n: { splitId: string }) => n.splitId === s.id);
    assert.deepEqual([ben1.kind, ben1.text], ['owe', 'You still owe ₦12,500']);
    const ana1 = (await t.call('GET', '/splits/needs-you', tok(ana))).body.data.find((n: { splitId: string }) => n.splitId === s.id);
    assert.deepEqual([ana1.kind, ana1.text], ['collect', '4 people still need to settle']);
    assert.ok(!(await t.call('GET', '/splits/needs-you', tok(zed))).body.data.length);
    const list = (await t.call('GET', `/circles/${circleId}/splits`, tok(eve))).body.data;
    assert.ok(list.some((x: { id: string; unsettled: number; settledCount: number; owedCount: number }) => x.id === s.id && x.unsettled === 50_000_00 && x.settledCount === 0 && x.owedCount === 4));
    assert.equal((await t.call('GET', `/circles/${circleId}/splits`, tok(zed))).status, 404);
    const circles = (await t.call('GET', '/circles', tok(ben))).body.data;
    assert.match(circles.find((c: { id: string }) => c.id === circleId).live.text, /you owe ₦/);
  });

  it('edits: the title any time; money only before anyone settles; creator only', async () => {
    const s = await dinner({ title: 'Brunch' });
    assert.equal((await t.call('PATCH', `/splits/${s.id}`, tok(ben), { title: 'Mine' })).status, 403);
    const re = await t.call('PATCH', `/splits/${s.id}`, tok(ana), { total: 50_000_00, participants: peopleOf(ana, ben, cleo, dan) });
    assert.deepEqual([re.status, re.body.data.shares.length, re.body.data.unsettled], [200, 4, 37_500_00], 'recalculated before anyone settled');
    const sw = await t.call('PATCH', `/splits/${s.id}`, tok(ana), { mode: 'custom', participants: [{ userId: ben.user.id, amount: 30_000_00 }, { userId: cleo.user.id, amount: 20_000_00 }] });
    assert.equal(sw.status, 200);
    assert.equal(sw.body.data.mode, 'custom');
    assert.equal(code(await t.call('PATCH', `/splits/${s.id}`, tok(ana), { total: 49_000_00 })), 'missing_amount', 'a new total needs new amounts');
    await t.call('PUT', `/splits/${s.id}/shares/${ben.user.id}`, tok(ben), { settled: true });
    const blocked = await t.call('PATCH', `/splits/${s.id}`, tok(ana), { total: 55_000_00, mode: 'equal' });
    assert.equal(blocked.status, 409);
    assert.equal(code(blocked), 'split_settling');
    assert.equal((await t.call('PATCH', `/splits/${s.id}`, tok(ana), { paidBy: ben.user.id })).status, 409);
    const title = await t.call('PATCH', `/splits/${s.id}`, tok(ana), { title: 'Sunday brunch' });
    assert.deepEqual([title.status, title.body.data.title, title.body.data.settledCount], [200, 'Sunday brunch', 1], 'a title change does not reset anything');
    assert.equal((await t.call('PATCH', `/splits/${s.id}`, tok(ana), {})).status, 400);
  });

  it('cancel: creator only, not once settled, read-only afterwards, out of the way', async () => {
    const s = await dinner({ title: 'Cancel me' });
    assert.equal((await t.call('POST', `/splits/${s.id}/cancel`, tok(ben), {})).status, 403);
    await t.call('PUT', `/splits/${s.id}/shares/${ben.user.id}`, tok(ben), { settled: true });
    const c = await t.call('POST', `/splits/${s.id}/cancel`, tok(ana), {});
    assert.deepEqual([c.status, c.body.data.status, c.body.data.canEdit, c.body.data.shares.some((x: { canChange: boolean }) => x.canChange)], [200, 'cancelled', false, false]);
    assert.equal((await t.call('POST', `/splits/${s.id}/cancel`, tok(ana), {})).status, 200, 'cancelling twice is fine');
    assert.equal(code(await t.call('PUT', `/splits/${s.id}/shares/${cleo.user.id}`, tok(ana), { settled: true })), 'split_cancelled');
    assert.equal(code(await t.call('PATCH', `/splits/${s.id}`, tok(ana), { title: 'Nope' })), 'split_cancelled');
    assert.ok(!(await t.call('GET', `/circles/${circleId}/splits`, tok(ana))).body.data.some((x: { id: string }) => x.id === s.id));
    assert.ok(!(await t.call('GET', '/splits/needs-you', tok(cleo))).body.data.some((x: { splitId: string }) => x.splitId === s.id));
    const done = await create(ana, { title: 'Quick', total: 2_000_00, participants: peopleOf(ben) });
    await t.call('PUT', `/splits/${done.body.data.id}/shares/${ben.user.id}`, tok(ben), { settled: true });
    assert.equal(code(await t.call('POST', `/splits/${done.body.data.id}/cancel`, tok(ana), {})), 'split_settled');
  });

  it('a share link: a safe summary for anyone, your own share once signed in, nobody else\'s', async () => {
    const s = await dinner({ title: 'Shared dinner', participants: peopleOf(ana, ben, cleo) });
    const token = s.shareToken as string;
    assert.equal((await t.call('GET', '/split-links/short')).status, 404);
    assert.equal((await t.call('GET', `/split-links/${'A'.repeat(43)}`)).status, 404, 'a guess reveals nothing');
    const pub = await t.call('GET', `/split-links/${token}`);
    assert.equal(pub.status, 200);
    const d = pub.body.data;
    assert.deepEqual([d.title, d.total, d.mine, d.signedIn, d.splitId, d.owedCount, d.settledCount], ['Shared dinner', 62_500_00, null, false, null, 2, 0]);
    assert.deepEqual(pub.body.people.map((p: { firstName: string; lastName: string }) => [p.firstName, p.lastName]), [['Ana', '']]);
    assert.ok(!JSON.stringify(pub.body).match(/Ben|Cleo|0803555|shares|20833/), 'no other person\'s name, number or amount');
    assert.equal((await t.call('GET', `/split-links/${token}/mine`)).status, 401);
    const mine = await t.call('GET', `/split-links/${token}/mine`, tok(ben));
    assert.deepEqual([mine.body.data.mine.amount, mine.body.data.mine.status, mine.body.data.isMember], [20_833_33, 'owed', true]);
    const settle = (u: U, body: Record<string, unknown> = { settled: true }) => t.call('PUT', `/split-links/${token}/settle`, tok(u), body);
    assert.equal((await settle(zed)).status, 403, 'a stranger has no share to claim');
    assert.equal((await settle(eve)).status, 403, 'a Circle member who is not in this split neither');
    const own = await settle(ben, { settled: true, afterAuth: true });
    assert.deepEqual([own.status, own.body.data.mine.status, own.body.data.settledCount], [200, 'settled', 1]);
    assert.equal((await settle(ben)).status, 200, 'idempotent');
    // Even naming someone else changes nothing: the body takes no person.
    const sneaky = await t.call('PUT', `/split-links/${token}/settle`, tok(ben), { settled: true, userId: cleo.user.id });
    assert.equal(sneaky.status, 200);
    assert.equal((await t.call('GET', `/splits/${s.id}`, tok(ana))).body.data.shares.find((x: { userId: string }) => x.userId === cleo.user.id).status, 'owed');
    assert.equal((await settle(ben, { settled: false })).body.data.mine.status, 'owed', 'and undo');
    await t.call('POST', `/splits/${s.id}/cancel`, tok(ana), {});
    assert.equal(code(await settle(ben)), 'split_cancelled');
    assert.equal((await t.call('GET', `/split-links/${token}`)).body.data.status, 'cancelled');
  });

  it('a link visitor outside the Circle sees the summary, can join only through the Circle\'s own invite, and is never made a member by looking', async () => {
    const s = await dinner({ title: 'Outsider view' });
    const mine = await t.call('GET', `/split-links/${s.shareToken}/mine`, tok(zed));
    assert.deepEqual([mine.body.data.mine, mine.body.data.isMember, mine.body.data.splitId, mine.body.data.canJoinCircle], [null, false, null, true]);
    assert.equal((await t.call('GET', `/splits/${s.id}`, tok(zed))).status, 404);
    assert.equal((await t.call('GET', `/circles/${circleId}`, tok(zed))).status, 404, 'still not a member');
    const j = await t.call('POST', `/split-links/${s.shareToken}/join-circle`, tok(zed), {});
    assert.equal(j.status, 200);
    assert.equal((await t.call('GET', `/splits/${s.id}`, tok(zed))).status, 200, 'joined on purpose');
  });

  it('Circle isolation: a split in another Circle is invisible and cannot be touched', async () => {
    const other = (await create(zed, { title: 'Secret', total: 8_000_00, participants: peopleOf(zed) }, otherCircle));
    assert.equal(code(other), 'nobody_owes');
    const s = await dinner({ title: 'Mine only' });
    assert.equal((await t.call('GET', `/splits/${s.id}`, tok(yan))).status, 404);
    assert.equal((await t.call('PUT', `/splits/${s.id}/shares/${ben.user.id}`, tok(yan), { settled: true })).status, 404);
    assert.equal((await t.call('GET', `/splits/${'0'.repeat(8)}-0000-0000-0000-000000000000`, tok(ana))).status, 404);
    assert.equal((await t.call('GET', '/splits/not-an-id', tok(ana))).status, 404);
  });

  it('records the Split\'s path as one funnel and nothing private', async () => {
    const s = await dinner({ title: 'Funnel Dinner', participants: peopleOf(ana, ben) });
    await t.call('GET', `/splits/${s.id}?from=home`, tok(ana));
    await t.call('POST', `/splits/${s.id}/shared`, tok(ana), { via: 'native' });
    await t.call('GET', `/split-links/${s.shareToken}`);
    await t.call('GET', `/split-links/${s.shareToken}/mine`, tok(ben));
    await t.call('PUT', `/split-links/${s.shareToken}/settle`, tok(ben), { settled: true, afterAuth: true });
    const key = splitPseudo(t.ctx.config, s.id);
    const rows = await t.db.query<{ name: string; props: Record<string, unknown> }>(`SELECT name, props FROM product_events WHERE split = $1 ORDER BY id`, [key]);
    const names = rows.rows.map((r) => r.name);
    for (const n of ['split_created', 'split_opened', 'split_shared', 'split_share_opened', 'split_settlement_marked', 'split_completed']) assert.ok(names.includes(n), `${n} is on the path`);
    assert.deepEqual(rows.rows.find((r) => r.name === 'split_created')!.props, { split_mode: 'equal', participant_count_band: '2', from: 'circle' });
    assert.deepEqual(rows.rows.find((r) => r.name === 'split_settlement_marked')!.props, { by: 'self', after_auth: true });
    const dump = JSON.stringify(rows.rows);
    assert.ok(!/Funnel|Dinner|Ana|Ben|625000|31250|4000/.test(dump) && !dump.includes(s.id) && !dump.includes(s.shareToken), 'no title, name, amount, id or token');
  });
});
