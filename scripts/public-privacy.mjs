// Phase E: attacks the public share endpoints signed out and reports what they reveal (ids, phones, emails, field names).
// Usage: node scripts/public-privacy.mjs   (after scripts/detail-up.sh)
import { readFileSync } from 'node:fs';
const B = 'http://localhost:5174/api';
const ids = { ...JSON.parse(readFileSync('/tmp/phase-c-ids.json', 'utf8')), ...JSON.parse(readFileSync('/tmp/detail-ids.json', 'utf8')) };
let n = 0;
const call = async (method, path, token, body) => {
  const r = await fetch(`${B}${path}`, { method, headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'idempotency-key': `pp-${Date.now()}-${n++}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const o = await call('POST', '/auth/otp/request', null, { phone: '08010000001' });
const T = (await call('POST', '/auth/otp/verify', null, { phone: '08010000001', code: o.json.devCode })).json.accessToken;
const me = (await call('GET', '/me', T)).json;
const tokens = {
  ask: (await call('GET', `/asks/${ids.askAnswered}`, T)).json.data.shareToken,
  plan: (await call('GET', `/plans/${ids.planOpen}`, T)).json.data.shareToken,
  split: (await call('GET', `/splits/${ids.splitOpen}`, T)).json.data.shareToken,
  circle: (await call('POST', `/circles/${ids.boys}/invites`, T, {})).json.data.invite.token,
};
const rec = await call('POST', `/recaps/pact/${ids.pactCompleted}/share`, T);
tokens.recap = rec.json?.data?.share?.token ?? rec.json?.data?.token;
const paths = { ask: `/ask-links/${tokens.ask}`, plan: `/plan-links/${tokens.plan}`, split: `/split-links/${tokens.split}`, circle: `/circle-invites/${tokens.circle}`, recap: `/recap-links/${tokens.recap}` };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const keys = (v, p = '', acc = new Set()) => { if (Array.isArray(v)) v.forEach((x) => keys(x, p + '[]', acc)); else if (v && typeof v === 'object') for (const k of Object.keys(v)) { acc.add(p + '.' + k); keys(v[k], p + '.' + k, acc); } return acc; };
for (const [k, p] of Object.entries(paths)) {
  const r = await call('GET', p);
  const text = JSON.stringify(r.json);
  console.log(`\n== ${k} ${r.status} (${text.length} bytes)`);
  console.log('uuids:', [...new Set(text.match(UUID) ?? [])].length, '| phone-like:', (text.match(/\b0?[789][01]\d{8}\b/g) ?? []).length, '| emails:', (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).length, '| contains my id:', text.includes(me.id));
  console.log('fields:', [...keys(r.json)].filter((x) => !x.includes('[]') || true).slice(0, 80).join(' '));
}
console.log('\ntokens', JSON.stringify({ ...tokens }));
