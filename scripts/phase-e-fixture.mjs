// Share tokens for the signed-out pages: an Ask, a Plan, a Split, a Circle invite, a recap and a Pact invite code.
// Writes /tmp/phase-e-tokens.json. Usage: node scripts/phase-e-fixture.mjs [base]   (demo stack + home-fixture first)
import { writeFileSync } from 'node:fs';
const BASE = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
let n = 0;
const call = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'idempotency-key': `pe-${Date.now()}-${n++}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
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
const boys = (await call('GET', '/circles', T.abraham)).data.find((c) => c.name === 'The Boys');
const users = {};
for (const k of ['sarah', 'david', 'maya', 'tolu']) users[k] = (await call('GET', '/me', T[k])).id;
const tokens = {};

const ask = (await call('POST', `/circles/${boys.id}/asks`, T.david, { type: 'choice', title: 'Which weekend works for Lagos?', options: ['Nov 14', 'Nov 21', 'Nov 28'] })).data;
await call('PUT', `/asks/${ask.id}/response`, T.maya, { optionId: ask.options[1].id });
await call('PUT', `/asks/${ask.id}/response`, T.tolu, { optionId: ask.options[1].id });
await call('PUT', `/asks/${ask.id}/response`, T.sarah, { optionId: ask.options[0].id });
tokens.ask = (await call('GET', `/asks/${ask.id}`, T.david)).data.shareToken;

const plan = (await call('POST', `/circles/${boys.id}/plans`, T.sarah, { title: 'Beach weekend in Lekki', category: 'trip', date: day(21), endDate: day(23), location: 'Lekki, Lagos' })).data;
for (const k of ['david', 'maya', 'tolu']) await call('PUT', `/plans/${plan.id}/rsvp`, T[k], { status: 'in' });
tokens.plan = (await call('GET', `/plans/${plan.id}`, T.sarah)).data.shareToken;

const split = (await call('POST', `/circles/${boys.id}/splits`, T.sarah, { title: 'Suya and drinks', total: 32_000_00, participants: [{ userId: users.sarah }, { userId: me.id }, { userId: users.david }, { userId: users.maya }] })).data;
await call('PUT', `/splits/${split.id}/shares/${users.david}`, T.sarah, { settled: true });
tokens.split = (await call('GET', `/splits/${split.id}`, T.sarah)).data.shareToken;

tokens.circle = (await call('POST', `/circles/${boys.id}/invites`, T.abraham, {})).data.invite.token;

const bday = (await call('POST', `/circles/${boys.id}/plans`, T.abraham, { title: 'Mum’s 60th', category: 'birthday', date: day(0) })).data;
for (const k of ['sarah', 'david', 'maya']) await call('PUT', `/plans/${bday.id}/rsvp`, T[k], { status: 'in' });
await call('POST', `/plans/${bday.id}/status`, T.abraham, { status: 'confirmed' });
await call('POST', `/plans/${bday.id}/status`, T.abraham, { status: 'done' });
const rc = await call('POST', `/recaps/plan/${bday.id}/share`, T.abraham, {});
tokens.recap = rc.data?.share?.token ?? rc.share?.token ?? null;

const pacts = (await call('GET', '/pacts', T.abraham));
const list = Array.isArray(pacts) ? pacts : pacts.data;
const target = list.find((p) => /Birthday/.test(p.title)) ?? list[0];
tokens.pactCode = (await call('GET', `/pacts/${target.id}`, T.abraham)).data.pact?.inviteCode ?? target.inviteCode;
writeFileSync('/tmp/phase-e-tokens.json', JSON.stringify(tokens, null, 1));
console.log('phase E fixture ready', JSON.stringify(tokens).slice(0, 200));
