// Release QA: a signed-in stranger (not in any fixture Circle) calls every object endpoint directly with real ids.
// Nothing may answer 2xx and no body may carry the fixture people's data. Usage: node scripts/qa-idor.mjs (after scripts/detail-up.sh)
import { readFileSync } from 'node:fs';
const B = 'http://localhost:5174/api';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
let n = 0;
const call = async (method, path, token, body) => {
  const r = await fetch(`${B}${path}`, { method, headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'idempotency-key': `idor-${Date.now()}-${n++}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, text: await r.text() };
};
const j = (r) => { try { return JSON.parse(r.text); } catch { return null; } };

// A brand-new account with no memberships.
const phone = '0809' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
const o = j(await call('POST', '/auth/otp/request', null, { phone }));
const v = j(await call('POST', '/auth/otp/verify', null, { phone, code: o.devCode }));
const s = j(await call('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: 'Stranger', lastName: 'Probe', pin: '2468' }));
const T = s.accessToken;
if (!T) throw new Error('could not create the stranger: ' + JSON.stringify(s).slice(0, 200));
const me = j(await call('GET', '/me', T));
console.log('stranger', me?.id ? 'created' : 'no id');

const uid = '00000000-0000-4000-8000-000000000001';
const probes = [];
const add = (kind, id) => {
  if (!id) return;
  const P = { ask: 'asks', plan: 'plans', split: 'splits', circle: 'circles', pact: 'pacts' }[kind];
  probes.push(['GET', `/${P}/${id}`]);
  if (kind === 'ask') probes.push(['PUT', `/asks/${id}/response`, { optionId: uid }], ['POST', `/asks/${id}/close`, {}], ['POST', `/asks/${id}/share/reset`, {}], ['POST', `/asks/${id}/shared`, {}]);
  if (kind === 'plan') probes.push(['PUT', `/plans/${id}/rsvp`, { response: 'yes' }], ['PATCH', `/plans/${id}`, { title: 'pwned' }], ['POST', `/plans/${id}/status`, { status: 'cancelled' }], ['POST', `/plans/${id}/tasks`, { title: 'x' }], ['GET', `/plans/${id}/pact-draft`], ['POST', `/plans/${id}/share/reset`, {}], ['POST', `/plans/${id}/organiser`, { userId: me.id }]);
  if (kind === 'split') probes.push(['PATCH', `/splits/${id}`, { title: 'pwned' }], ['POST', `/splits/${id}/cancel`, {}], ['PUT', `/splits/${id}/shares/${me.id}`, { settled: true }], ['POST', `/splits/${id}/share/reset`, {}], ['POST', `/splits/${id}/organiser`, { userId: me.id }]);
  if (kind === 'circle') probes.push(['PATCH', `/circles/${id}`, { name: 'pwned' }], ['POST', `/circles/${id}/invites`, {}], ['POST', `/circles/${id}/invites/reset`, {}], ['GET', `/circles/${id}/asks`], ['GET', `/circles/${id}/plans`], ['GET', `/circles/${id}/splits`], ['POST', `/circles/${id}/asks`, { question: 'x', options: ['a', 'b'] }], ['POST', `/circles/${id}/plans`, { title: 'x' }], ['POST', `/circles/${id}/splits`, { title: 'x', totalKobo: 100000 }], ['DELETE', `/circles/${id}/members/${me.id}`]);
  if (kind === 'pact') probes.push(['POST', `/pacts/${id}/accept`, {}], ['POST', `/pacts/${id}/tasks`, { title: 'x' }], ['POST', `/pacts/${id}/complete`, {}], ['POST', `/pacts/${id}/cancel`, {}], ['POST', `/pacts/${id}/invites`, {}], ['POST', `/pacts/${id}/updates`, { body: 'x' }], ['PUT', `/pacts/${id}/pin`, {}], ['POST', `/pacts/${id}/contributions`, { amount: 100000 }], ['PUT', `/pacts/${id}/memory`, { note: 'x' }]);
  probes.push(['GET', `/recaps/${kind}/${id}`], ['POST', `/recaps/${kind}/${id}/share`, {}]);
};
for (const [k, val] of Object.entries(ids)) {
  if (typeof val !== 'string' || !/^[0-9a-f-]{36}$/i.test(val)) continue;
  const kind = /ask/i.test(k) ? 'ask' : /plan/i.test(k) ? 'plan' : /split/i.test(k) ? 'split' : /pact/i.test(k) ? 'pact' : /circle|boys|family|work/i.test(k) ? 'circle' : null;
  if (kind) add(kind, val);
}
const bad = [];
let total = 0;
for (const [method, path, body] of probes) {
  const r = await call(method, path, T, body);
  total++;
  if (r.status < 400) bad.push(`${method} ${path} -> ${r.status} ${r.text.slice(0, 120)}`);
  if (/stack|at .*\.ts:\d+|node_modules/.test(r.text)) bad.push(`${method} ${path} leaks a stack trace`);
}
// Cross-user identity surfaces and the other person's sessions/identities.
for (const p of ['/me/sessions', '/me/identities', '/me/export']) {
  const r = await call('GET', p, T);
  if (/08010000001|\+234801000/.test(r.text)) bad.push(`${p} shows another person's number`);
}
console.log(`${total} probes against ${Object.keys(ids).length} fixture ids`);
console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'OK: every cross-user call was refused');
process.exit(bad.length ? 1 : 0);
