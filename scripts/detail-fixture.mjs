// Phase C: the extra objects the detail screens need to be seen in every state, on top of home-fixture + phase-c-fixture:
// a quiet Circle, a half-settled Split, a Pact in progress (tasks, partly done, partly funded) and a completed Pact.
// Writes /tmp/detail-ids.json. Usage: node scripts/detail-fixture.mjs [base]
import { writeFileSync } from 'node:fs';
const BASE = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
let n = 0;
const call = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'idempotency-key': `df-${Date.now()}-${n++}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(json)}`);
  return json;
};
const phones = { abraham: '08010000001', sarah: '08010000002', david: '08010000003', maya: '08010000004', tolu: '08010000005' };
const T = {};
const U = {};
for (const k of Object.keys(phones)) {
  const otp = await call('POST', '/auth/otp/request', null, { phone: phones[k] });
  T[k] = (await call('POST', '/auth/otp/verify', null, { phone: phones[k], code: otp.devCode })).accessToken;
  U[k] = (await call('GET', '/me', T[k])).id;
}
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const circles = (await call('GET', '/circles', T.abraham)).data;
const boys = circles.find((c) => c.name === 'The Boys');
const ids = {};

// A Circle with nothing in it yet.
const cousins = (await call('POST', '/circles', T.abraham, { name: 'Cousins', emoji: '🌴', tint: 'coral' })).data;
const inv = (await call('POST', `/circles/${cousins.id}/invites`, T.abraham, {})).data.invite.token;
await call('POST', `/circle-invites/${inv}/join`, T.sarah, {});
ids.circleQuiet = cousins.id;

// Half settled: Abraham paid, two of four have settled.
const brunch = (await call('POST', `/circles/${boys.id}/splits`, T.abraham, { title: 'Sunday brunch', total: 36_000_00, participants: [U.abraham, U.sarah, U.david, U.maya, U.tolu].map((userId) => ({ userId })) })).data;
for (const k of ['sarah', 'david']) await call('PUT', `/splits/${brunch.id}/shares/${U[k]}`, T.abraham, { settled: true });
ids.splitPartial = brunch.id;

const PIN = '1357';
const make = async (title, budget, tasks) => {
  const made = await call('POST', '/pacts', T.abraham, { title, category: 'trip', circleId: boys.id, deadline: day(24), missedGoalPolicy: 'refund', budget, tasks });
  const pact = made.data.pact;
  for (const k of ['sarah', 'david', 'maya']) await call('POST', `/invites/${pact.inviteCode}/join`, T[k], {});
  return pact;
};
// A Pact in progress.
const lagos = await make('Lagos Beach Weekend', [{ name: 'Villa', amount: 260_000_00 }, { name: 'Boat', amount: 140_000_00 }, { name: 'Food', amount: 100_000_00 }], [{ title: 'Book the villa', assigneeId: U.abraham }, { title: 'Sort the boat', assigneeId: U.sarah }, { title: 'Plan the food', assigneeId: U.david }]);
const acct = await call('POST', `/pacts/${lagos.id}/bank-account`, T.abraham, {});
await call('POST', `/sandbox/pact-accounts/${acct.data.pact.bankAccount.accountNumber}/transfers`, T.abraham, { amount: 180_000_00, senderName: 'OKAFOR ABRAHAM' });
const full = (await call('GET', `/pacts/${lagos.id}`, T.abraham)).data.pact;
const first = full.tasks.find((t) => t.title === 'Sort the boat');
await call('PATCH', `/pacts/${lagos.id}/tasks/${first.id}`, T.sarah, { status: 'done' });
ids.pactProgress = lagos.id;

// A completed Pact.
const done = await make('Maya’s Surprise Dinner', [{ name: 'Dinner', amount: 200_000_00 }], [{ title: 'Book the table', assigneeId: U.sarah }]);
const acct2 = await call('POST', `/pacts/${done.id}/bank-account`, T.abraham, {});
await call('POST', `/sandbox/pact-accounts/${acct2.data.pact.bankAccount.accountNumber}/transfers`, T.abraham, { amount: 200_000_00, senderName: 'OKAFOR ABRAHAM' });
const dfull = (await call('GET', `/pacts/${done.id}`, T.abraham)).data.pact;
await call('PATCH', `/pacts/${done.id}/tasks/${dfull.tasks[0].id}`, T.sarah, { status: 'done' });
await call('POST', `/pacts/${done.id}/complete`, T.abraham, { releaseRemaining: true, pin: PIN });
ids.pactCompleted = done.id;

// ---- Phase E: a share token for every state the shared pages show.
const tok = {};
const closedAsk = (await call('POST', `/circles/${boys.id}/asks`, T.david, { type: 'choice', title: 'Which snack for the road?', options: ['Chin chin', 'Plantain chips'] })).data;
await call('PUT', `/asks/${closedAsk.id}/response`, T.maya, { optionId: closedAsk.options[0].id });
await call('PUT', `/asks/${closedAsk.id}/response`, T.sarah, { optionId: closedAsk.options[0].id });
await call('PUT', `/asks/${closedAsk.id}/response`, T.tolu, { optionId: closedAsk.options[1].id });
await call('POST', `/asks/${closedAsk.id}/close`, T.david, {});
const att = (await call('POST', `/circles/${boys.id}/asks`, T.maya, { type: 'attendance', title: 'Who is free on Saturday?' })).data;
await call('PUT', `/asks/${att.id}/response`, T.david, { attendance: 'in' });
const donePlan = (await call('POST', `/circles/${boys.id}/plans`, T.abraham, { title: 'Jollof cook-off', category: 'dinner', date: day(0), location: 'Maya’s place' })).data;
for (const k of ['sarah', 'david', 'maya']) await call('PUT', `/plans/${donePlan.id}/rsvp`, T[k], { status: 'in' });
await call('POST', `/plans/${donePlan.id}/status`, T.abraham, { status: 'confirmed' });
await call('POST', `/plans/${donePlan.id}/status`, T.abraham, { status: 'done' });
const gone = (await call('POST', '/circles', T.abraham, { name: 'Old gang', emoji: '🎲', tint: 'sun' })).data;
tok.circleRevoked = (await call('POST', `/circles/${gone.id}/invites`, T.abraham, {})).data.invite.token;
await call('POST', `/circles/${gone.id}/invites/reset`, T.abraham, {});
const ph = JSON.parse((await import('node:fs')).readFileSync('/tmp/phase-c-ids.json', 'utf8'));
tok.ask = (await call('GET', `/asks/${ph.askOpen}`, T.abraham)).data.shareToken;
tok.askAttendance = (await call('GET', `/asks/${att.id}`, T.abraham)).data.shareToken;
tok.askClosed = (await call('GET', `/asks/${closedAsk.id}`, T.abraham)).data.shareToken;
tok.plan = (await call('GET', `/plans/${ph.planOpen}`, T.abraham)).data.shareToken;
tok.planDone = (await call('GET', `/plans/${donePlan.id}`, T.abraham)).data.shareToken;
tok.planPact = (await call('GET', `/plans/${ph.planConverted}`, T.abraham)).data.shareToken;
tok.split = (await call('GET', `/splits/${ph.splitOpen}`, T.abraham)).data.shareToken;
tok.splitSettled = (await call('GET', `/splits/${ph.splitSettled}`, T.abraham)).data.shareToken;
tok.circle = (await call('POST', `/circles/${boys.id}/invites`, T.abraham, {})).data.invite.token;
for (const [k, kind, id] of [['recapPact', 'pact', done.id], ['recapSplit', 'split', ph.splitSettled]]) {
  await call("POST", `/recaps/${kind}/${id}/share`, T.abraham, {});
  tok[k] = (await call('GET', `/recaps/${kind}/${id}`, T.abraham)).data.share?.token;
}
ids.tokens = tok;
writeFileSync('/tmp/detail-ids.json', JSON.stringify(ids, null, 1));
console.log('detail fixture ready', JSON.stringify(ids));
