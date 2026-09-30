// Load test: many people using PACT at once, against a staging API.
// Usage: node scripts/loadtest.mjs [--base URL] [--users 20] [--vus 40] [--duration 60] [--p95 500]
//
// The target must be staging, not production: setup signs people in with the code the
// API returns when SMS_PROVIDER=log, and funds wallets through the sandbox checkout.
// Per-IP HTTP limits would throttle a single load generator, so run the target with
// RATE_LIMIT_ENABLED=false (business limits such as OTP per number still apply, which is
// why setup signs in a small pool of people and the virtual users share their sessions).
//
// Exits non-zero on any 5xx or unexpected 4xx, a failed request, or a p95 above the budget.

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = `${arg('base', 'http://localhost:8787').replace(/\/$/, '')}/api`;
const USERS = Number(arg('users', 20));
const VUS = Number(arg('vus', 40));
const DURATION = Number(arg('duration', 60)) * 1000;
const P95_BUDGET = Number(arg('p95', 500));
const PIN = '2468';

let keyN = 0;
async function call(method, path, token, body) {
  const t0 = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'X-Pact-Client': 'loadtest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'Idempotency-Key': `lt-${process.pid}-${Date.now()}-${keyN++}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    status = 0; // network error or bad JSON
  }
  return { status, body: json, ms: performance.now() - t0 };
}

const must = (r, what) => {
  if (r.status !== 200) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
  return r.body;
};

/* ---------------- setup: a pool of people, each with a funded wallet and a Pact ---------------- */

async function person(i) {
  const phone = `0809${String(Date.now() + i).slice(-7)}`;
  const otp = must(await call('POST', '/auth/otp/request', null, { phone }), 'otp request');
  if (!otp.devCode) throw new Error('The target does not return sign-in codes. Point this at staging with SMS_PROVIDER=log.');
  const v = must(await call('POST', '/auth/otp/verify', null, { phone, code: otp.devCode }), 'otp verify');
  const s = v.status === 'signed_in' ? v : must(await call('POST', '/auth/signup', null, { signupToken: v.signupToken, firstName: 'Load', lastName: `Tester ${String.fromCharCode(65 + (i % 26))}`, pin: PIN }), 'signup');
  const token = s.accessToken;
  const top = must(await call('POST', '/wallet/topups', token, { amount: 50_000 * 100, channel: 'bank_transfer' }), 'top up');
  must(await call('POST', `/sandbox/checkout/${top.reference}/complete`, token, { outcome: 'success' }), 'sandbox checkout');
  const deadline = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const pact = must(await call('POST', '/pacts', token, { title: `Load test ${i}`, category: 'dinner', target: 200_000 * 100, deadline, tasks: [{ title: 'Book a table' }] }), 'create pact');
  const pactId = pact.data?.pact?.id;
  if (!pactId) throw new Error(`create pact: no id in ${JSON.stringify(pact).slice(0, 200)}`);
  return { token, pactId };
}

/* ---------------- the mix: mostly reads, some money moving ---------------- */

const actions = [
  [30, 'GET /pacts', (p) => call('GET', '/pacts', p.token)],
  [25, 'GET /pacts/:id', (p) => call('GET', `/pacts/${p.pactId}`, p.token)],
  [15, 'GET /wallet', (p) => call('GET', '/wallet', p.token)],
  [10, 'GET /activity', (p) => call('GET', '/activity', p.token)],
  [10, 'GET /notifications', (p) => call('GET', '/notifications', p.token)],
  [10, 'POST contribution', (p) => call('POST', `/pacts/${p.pactId}/contributions`, p.token, { amount: 100 * 100, pin: PIN })],
];
const totalWeight = actions.reduce((s, a) => s + a[0], 0);
const pick = () => {
  let r = Math.random() * totalWeight;
  for (const a of actions) if ((r -= a[0]) < 0) return a;
  return actions[0];
};

const stats = new Map();
const record = (name, r) => {
  const s = stats.get(name) ?? { ms: [], s2: 0, s4: 0, s429: 0, s5: 0, net: 0 };
  s.ms.push(r.ms);
  if (r.status === 0) s.net++;
  else if (r.status >= 500) s.s5++;
  else if (r.status === 429) s.s429++;
  else if (r.status >= 400) s.s4++;
  else s.s2++;
  stats.set(name, s);
};
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

console.log(`Setting up ${USERS} people against ${BASE} ...`);
const pool = [];
for (let i = 0; i < USERS; i += 5) pool.push(...(await Promise.all(Array.from({ length: Math.min(5, USERS - i) }, (_, j) => person(i + j)))));

console.log(`Running ${VUS} virtual users for ${DURATION / 1000}s ...`);
const end = Date.now() + DURATION;
await Promise.all(
  Array.from({ length: VUS }, async (_, v) => {
    const p = pool[v % pool.length];
    while (Date.now() < end) {
      const [, name, run] = pick();
      record(name, await run(p));
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 250)); // think time
    }
  }),
);

/* ---------------- report ---------------- */

const all = [...stats.values()].flatMap((s) => s.ms).sort((a, b) => a - b);
const rows = [...stats.entries()].map(([name, s]) => {
  const ms = s.ms.sort((a, b) => a - b);
  return { route: name, requests: ms.length, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), p99: Math.round(pct(ms, 99)), ok: s.s2, '4xx': s.s4, '429': s.s429, '5xx': s.s5, failed: s.net };
});
console.table(rows);
const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
const p95 = Math.round(pct(all, 95));
console.log(`Total ${all.length} requests, ${(all.length / (DURATION / 1000)).toFixed(1)}/s · p50 ${Math.round(pct(all, 50))} ms · p95 ${p95} ms · p99 ${Math.round(pct(all, 99))} ms · 5xx ${sum('5xx')} · failed ${sum('failed')}`);

const problems = [];
if (sum('5xx')) problems.push(`${sum('5xx')} server errors`);
if (sum('failed')) problems.push(`${sum('failed')} failed requests`);
// Every request in the mix is valid, so a 4xx means the script or the API is wrong.
if (sum('4xx')) problems.push(`${sum('4xx')} unexpected 4xx responses`);
if (p95 > P95_BUDGET) problems.push(`p95 ${p95} ms is over the ${P95_BUDGET} ms budget`);
if (problems.length) {
  console.log(`FAIL: ${problems.join('; ')}`);
  process.exit(1);
}
console.log('PASS');
