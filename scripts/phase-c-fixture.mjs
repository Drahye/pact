// Adds the objects the phase C screens need on top of scripts/home-fixture.mjs: an answered Ask, an open Plan with a linked Ask and tasks,
// a Plan that became a Pact, a fully settled Split. Writes the ids it made to /tmp/phase-c-ids.json.
// Usage: node scripts/phase-c-fixture.mjs [base]   (demo stack + home-fixture first)
import { writeFileSync } from 'node:fs';
const BASE = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
let n = 0;
const call = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'idempotency-key': `pc-${Date.now()}-${n++}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(json)}`);
  return json;
};
const phones = { abraham: '08010000001', sarah: '08010000002', david: '08010000003', maya: '08010000004', tolu: '08010000005' };
const T = {};
for (const k of Object.keys(phones)) {
  const otp = await call('POST', '/auth/otp/request', null, { phone: phones[k] });
  T[k] = (await call('POST', '/auth/otp/verify', null, { phone: phones[k], code: otp.devCode })).accessToken;
}
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const me = await call('GET', '/me', T.abraham);
const circles = (await call('GET', '/circles', T.abraham)).data;
const boys = circles.find((c) => c.name === 'The Boys');
const ids = { boys: boys.id };
const users = {};
for (const k of ['sarah', 'david', 'maya', 'tolu']) users[k] = (await call('GET', '/me', T[k])).id;

// An Ask Abraham has already answered
const eat = (await call('POST', `/circles/${boys.id}/asks`, T.tolu, { type: 'choice', title: 'Where should we eat?', options: ['Suya spot', 'Yellow Chilli', 'Cook at home'] })).data;
await call('PUT', `/asks/${eat.id}/response`, T.abraham, { optionId: eat.options[1].id });
await call('PUT', `/asks/${eat.id}/response`, T.sarah, { optionId: eat.options[1].id });
await call('PUT', `/asks/${eat.id}/response`, T.david, { optionId: eat.options[0].id });
ids.askAnswered = eat.id;
const asks = (await call('GET', `/circles/${boys.id}/asks`, T.abraham)).data;
ids.askOpen = asks.find((a) => a.title === 'Which date works?').id;

// An open Plan: date, place, people in, tasks, a linked Ask
const bali = (await call('POST', `/circles/${boys.id}/plans`, T.abraham, { title: 'Bali Trip', category: 'trip', date: day(48), endDate: day(55), location: 'Ubud, Bali', description: 'A week away. Villa, scooters, no laptops.' })).data;
for (const k of ['sarah', 'david', 'maya']) await call('PUT', `/plans/${bali.id}/rsvp`, T[k], { status: 'in' });
await call('PUT', `/plans/${bali.id}/rsvp`, T.tolu, { status: 'maybe' });
await call('POST', `/plans/${bali.id}/tasks`, T.abraham, { title: 'Book the villa', assigneeId: me.id });
await call('POST', `/plans/${bali.id}/tasks`, T.abraham, { title: 'Sort scooters', assigneeId: users.david });
const stay = (await call('POST', `/circles/${boys.id}/asks`, T.abraham, { type: 'choice', title: 'Villa or hotel?', options: ['Villa', 'Hotel'], planId: bali.id })).data;
await call('PUT', `/asks/${stay.id}/response`, T.maya, { optionId: stay.options[0].id });
ids.planOpen = bali.id;

// A Plan that became a Pact
const detty = (await call('POST', `/circles/${boys.id}/plans`, T.abraham, { title: 'Detty December', category: 'event', date: day(60), location: 'Lagos' })).data;
for (const k of ['sarah', 'david', 'maya']) await call('PUT', `/plans/${detty.id}/rsvp`, T[k], { status: 'in' });
await call('POST', `/plans/${detty.id}/tasks`, T.abraham, { title: 'Book the table', assigneeId: me.id });
const pact = (await call('POST', '/pacts', T.abraham, { title: 'Detty December', category: 'event', target: 40_000_000, deadline: day(58), circleId: boys.id, planId: detty.id, tasks: [{ title: 'Book the table' }], inviteUserIds: [users.sarah, users.david] })).data;
ids.planConverted = detty.id;
ids.pactFromPlan = pact.pact?.id ?? pact.id;

// A fully settled Split: Abraham paid, everyone settled
const split = (await call('POST', `/circles/${boys.id}/splits`, T.abraham, { title: 'Suya night', total: 24_000_00, participants: [{ userId: me.id }, { userId: users.sarah }, { userId: users.david }, { userId: users.maya }] })).data;
for (const k of ['sarah', 'david', 'maya']) await call('PUT', `/splits/${split.id}/shares/${users[k]}`, T.abraham, { settled: true });
ids.splitSettled = split.id;
// An unsettled one where Abraham is owed
const taxi = (await call('POST', `/circles/${boys.id}/splits`, T.abraham, { title: 'Airport taxi', total: 18_000_00, participants: [{ userId: me.id }, { userId: users.sarah }, { userId: users.david }, { userId: users.tolu }] })).data;
await call('PUT', `/splits/${taxi.id}/shares/${users.sarah}`, T.abraham, { settled: true });
ids.splitOpen = taxi.id;
const owe = (await call('GET', '/splits/needs-you', T.abraham)).data?.[0];
ids.splitOwe = owe?.splitId ?? null;

// Seeded Pact
const pacts = (await call('GET', '/pacts', T.abraham)).data ?? (await call('GET', '/pacts', T.abraham));
const list = Array.isArray(pacts) ? pacts : pacts.data;
ids.pactActive = (list.find((p) => p.title === 'Sarah’s Birthday' || p.title === "Sarah's Birthday") ?? list[0]).id;
writeFileSync('/tmp/phase-c-ids.json', JSON.stringify(ids, null, 1));
console.log('phase C fixture ready', JSON.stringify(ids));
