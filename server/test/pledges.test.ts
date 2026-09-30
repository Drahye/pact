/**
 * Pledges: "I'll add ₦X by this date". Reminders on the day and the day after, then
 * silence; kept automatically whichever way the money arrives. Plus attempts to misuse it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sweepPledges } from '../src/modules/pledges.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type Session = { accessToken: string; user: { id: string } };

const day = (days: number, from = Date.now()) => new Date(from + days * 86_400_000).toISOString().slice(0, 10);
const PIN = '1357';

describe('pledges', () => {
  let t: T;
  let abraham: Session;
  let sarah: Session;
  let david: Session;
  let outsider: Session;
  let pactId: string;
  const notes = async (who: Session) => (await t.call('GET', '/notifications', who.accessToken)).body.items as { type: string; title: string; body: string }[];
  const pact = async (who = abraham) => (await t.call('GET', `/pacts/${pactId}`, who.accessToken)).body.data.pact;

  before(async () => {
    t = await setup({ seed: true });
    abraham = await t.signIn('08010000001');
    sarah = await t.signIn('08010000002');
    david = await t.signIn('08010000003');
    outsider = await t.signIn('08035550202', { firstName: 'Olu', lastName: 'Outsider', pin: '2468' });
    const r = await t.call('POST', '/pacts', abraham.accessToken, { title: 'Aunty Bisi at 60', category: 'birthday', target: 200_000_00, deadline: day(20) });
    pactId = r.body.data.pact.id;
    for (const s of [sarah, david]) await t.call('POST', `/invites/${r.body.data.pact.inviteCode}/join`, s.accessToken, {});
  });
  after(async () => {
    await t.close();
  });

  it('takes a pledge from a member, within the deadline and what is left', async () => {
    assert.equal((await t.call('PUT', `/pacts/${pactId}/pledge`, outsider.accessToken, { amount: 20_000_00, dueOn: day(3) })).status, 404);
    assert.equal((await t.call('PUT', `/pacts/${pactId}/pledge`, sarah.accessToken, { amount: 20_000_00, dueOn: day(-1) })).status, 400);
    assert.equal((await t.call('PUT', `/pacts/${pactId}/pledge`, sarah.accessToken, { amount: 20_000_00, dueOn: day(40) })).status, 400);
    assert.equal((await t.call('PUT', `/pacts/${pactId}/pledge`, sarah.accessToken, { amount: 900_000_00, dueOn: day(3) })).status, 422);
    assert.equal((await t.call('PUT', `/pacts/${pactId}/pledge`, sarah.accessToken, { amount: 20_000_50, dueOn: day(3) })).status, 400);

    const r = await t.call('PUT', `/pacts/${pactId}/pledge`, sarah.accessToken, { amount: 20_000_00, dueOn: day(3) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pledge = r.body.data.pact.pledges.find((p: { userId: string }) => p.userId === sarah.user.id);
    assert.deepEqual({ amount: pledge.amount, remaining: pledge.remaining, status: pledge.status }, { amount: 20_000_00, remaining: 20_000_00, status: 'open' });
    // Changing it replaces it: one pledge per person.
    const again = await t.call('PUT', `/pacts/${pactId}/pledge`, sarah.accessToken, { amount: 30_000_00, dueOn: day(4) });
    assert.equal(again.body.data.pact.pledges.filter((p: { userId: string }) => p.userId === sarah.user.id).length, 1);
    assert.equal(again.body.data.pact.members.find((m: { userId: string }) => m.userId === sarah.user.id).participation, 'money');
  });

  it('reminds on the day and the day after, then stops, and tells the organiser once', async () => {
    const due = Date.now() + 4 * 86_400_000;
    const at = (d: number) => t.setClock(() => new Date(due + d * 86_400_000));

    at(-1);
    await sweepPledges(t.ctx);
    assert.equal((await notes(sarah)).filter((n) => n.type === 'pledge').length, 0, 'nothing before the day');

    at(0);
    await sweepPledges(t.ctx);
    await sweepPledges(t.ctx);
    const onDay = (await notes(sarah)).filter((n) => n.type === 'pledge');
    assert.equal(onDay.length, 1, 'once on the day, however often the sweep runs');
    assert.equal(onDay[0].title, 'Today’s the day');

    at(1);
    await sweepPledges(t.ctx);
    await sweepPledges(t.ctx);
    assert.equal((await notes(sarah)).filter((n) => n.type === 'pledge').length, 2);
    const late = (await notes(abraham)).filter((n) => n.type === 'pledge');
    assert.equal(late.length, 1);
    assert.match(late[0].title, /Sarah is running late/);

    at(5);
    await sweepPledges(t.ctx);
    assert.equal((await notes(sarah)).filter((n) => n.type === 'pledge').length, 2, 'then PACT stops');
    t.setClock(() => new Date());
    assert.equal((await pact()).pledges.find((p: { userId: string }) => p.userId === sarah.user.id).reminded, 2);
  });

  it('is kept once the money is in, whichever way it arrives', async () => {
    await t.topUp(sarah.accessToken, 50_000);
    await t.call('POST', `/pacts/${pactId}/contributions`, sarah.accessToken, { amount: 10_000_00, pin: PIN });
    let mine = (await pact()).pledges.find((p: { userId: string }) => p.userId === sarah.user.id);
    assert.equal(mine.remaining, 20_000_00);
    await t.call('POST', `/pacts/${pactId}/contributions`, sarah.accessToken, { amount: 20_000_00, pin: PIN });
    mine = (await pact()).pledges.find((p: { userId: string }) => p.userId === sarah.user.id);
    assert.equal(mine.status, 'kept');
    const feed = (await t.call('GET', '/activity', abraham.accessToken)).body.data;
    assert.ok(feed.some((a: { type: string; actorId: string }) => a.type === 'pledge_kept' && a.actorId === sarah.user.id));

    // A bank transfer in David's name keeps David's pledge.
    await t.call('PUT', `/pacts/${pactId}/pledge`, david.accessToken, { amount: 15_000_00, dueOn: day(2) });
    const acct = (await t.call('POST', `/pacts/${pactId}/bank-account`, abraham.accessToken, {})).body.data.pact.bankAccount;
    await t.call('POST', `/sandbox/pact-accounts/${acct.accountNumber}/transfers`, abraham.accessToken, { amount: 15_000_00, senderName: 'EZE DAVID' });
    assert.equal((await pact()).pledges.find((p: { userId: string }) => p.userId === david.user.id).status, 'kept');
  });

  it('lets only the person cancel their own pledge, and closes open pledges with the Pact', async () => {
    assert.equal((await t.call('DELETE', `/pacts/${pactId}/pledge`, outsider.accessToken)).status, 404);
    assert.equal((await t.call('DELETE', `/pacts/${pactId}/pledge`, abraham.accessToken)).status, 400, 'no pledge of his own to cancel');
    await t.call('PUT', `/pacts/${pactId}/pledge`, abraham.accessToken, { amount: 5_000_00, dueOn: day(2) });
    assert.equal((await t.call('DELETE', `/pacts/${pactId}/pledge`, abraham.accessToken)).status, 200);
    await t.call('PUT', `/pacts/${pactId}/pledge`, abraham.accessToken, { amount: 5_000_00, dueOn: day(2) });
    await t.call('POST', `/pacts/${pactId}/cancel`, abraham.accessToken, { pin: PIN });
    const left = await t.db.query(`SELECT 1 FROM pact_pledges WHERE pact_id = $1 AND status = 'open'`, [pactId]);
    assert.equal(left.rowCount, 0);
  });

  it('refuses contributions after the deadline (dates compare as dates in every driver)', async () => {
    const r = await t.call('POST', '/pacts', abraham.accessToken, { title: 'Short one', category: 'dinner', target: 50_000_00, deadline: day(2) });
    await t.topUp(abraham.accessToken, 10_000);
    t.setClock(() => new Date(Date.now() + 4 * 86_400_000));
    const late = await t.call('POST', `/pacts/${r.body.data.pact.id}/contributions`, abraham.accessToken, { amount: 1_000_00, pin: PIN });
    t.setClock(() => new Date());
    assert.equal(late.status, 400);
    assert.equal(late.body.error.code, 'pact_past_deadline');
  });

  it('keeps pledges private to the Pact, even from raw SQL', async () => {
    const seen = await t.db.asUser(outsider.user.id, (q) => q.query('SELECT id FROM pact_pledges'));
    assert.equal(seen.rowCount, 0);
    await assert.rejects(t.db.asUser(sarah.user.id, (q) => q.query(`UPDATE pact_pledges SET status = 'kept'`)), (e: { code?: string }) => e.code === '42501');
  });
});
