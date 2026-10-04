// Seeds a realistic, populated Home for Abraham (the demo account) through the public API: Circles with live signals,
// things that need him (RSVP, a vote, a split share), a plan coming up, recent activity from friends, and a finished plan.
// Usage: node scripts/home-fixture.mjs [base]   (default http://localhost:5174, the demo stack)
const BASE = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
let n = 0;
const call = async (method, path, token, body) => {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'idempotency-key': `fx-${Date.now()}-${n++}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(json)}`);
  return json;
};
const phones = { abraham: '08010000001', sarah: '08010000002', david: '08010000003', maya: '08010000004', tolu: '08010000005' };
const login = async (key) => {
  const otp = await call('POST', '/auth/otp/request', null, { phone: phones[key] });
  const v = await call('POST', '/auth/otp/verify', null, { phone: phones[key], code: otp.devCode });
  return v.accessToken;
};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const T = {};
for (const k of Object.keys(phones)) T[k] = await login(k);
const me = await call('GET', '/me', T.abraham);
const david = await call('GET', '/me', T.david);

const join = async (circleId, owner, members) => {
  const inv = (await call('POST', `/circles/${circleId}/invites`, T[owner], {})).data.invite.token;
  for (const m of members) await call('POST', `/circle-invites/${inv}/join`, T[m], {});
};

const boys = (await call('POST', '/circles', T.abraham, { name: 'The Boys', emoji: '✈️', tint: 'sky' })).data;
await join(boys.id, 'abraham', ['sarah', 'david', 'maya', 'tolu']);
const family = (await call('POST', '/circles', T.sarah, { name: 'Family', emoji: '🏡', tint: 'coral' })).data;
await join(family.id, 'sarah', ['abraham', 'david']);
const work = (await call('POST', '/circles', T.abraham, { name: 'Work crew', emoji: '🍻', tint: 'mint' })).data;
await join(work.id, 'abraham', ['maya', 'tolu']);

// Needs Abraham: an RSVP, a vote, a share he owes.
const ghana = (await call('POST', `/circles/${boys.id}/plans`, T.sarah, { title: 'Ghana in December', category: 'trip', date: day(70), endDate: day(76), location: 'Accra' })).data;
await call('PUT', `/plans/${ghana.id}/rsvp`, T.david, { status: 'in' });
await call('PUT', `/plans/${ghana.id}/rsvp`, T.maya, { status: 'in' });
const ask = (await call('POST', `/circles/${boys.id}/asks`, T.david, { type: 'choice', title: 'Which date works?', options: ['Dec 18', 'Dec 20', 'Dec 22'] })).data;
await call('PUT', `/asks/${ask.id}/response`, T.maya, { optionId: ask.options[1].id });
await call('PUT', `/asks/${ask.id}/response`, T.tolu, { optionId: ask.options[1].id });
await call('POST', `/circles/${family.id}/splits`, T.sarah, { title: 'Dinner at Yellow Chilli', total: 62_500_00, participants: [{ userId: me.id }, { userId: david.id }] });

// Stress: very long names must wrap or truncate without breaking the layout.
const long = (await call('POST', '/circles', T.sarah, { name: 'The Extended Okonkwo-Bartholomew Family', emoji: '🎊', tint: 'pink' })).data;
await join(long.id, 'sarah', ['abraham', 'david']);
await call('POST', `/circles/${long.id}/plans`, T.sarah, { title: 'Annual reunion weekend at the lakeside lodge with the whole extended family', category: 'event', date: day(40), location: 'Lake Volta' });

// Coming up: Abraham's own plan, with answers coming in.
const beach = (await call('POST', `/circles/${family.id}/plans`, T.abraham, { title: 'Beach day', category: 'trip', date: day(6), location: 'Landmark' })).data;
await call('PUT', `/plans/${beach.id}/rsvp`, T.sarah, { status: 'in' });
await call('PUT', `/plans/${beach.id}/rsvp`, T.david, { status: 'maybe' });
const lunch = (await call('POST', `/circles/${work.id}/plans`, T.maya, { title: 'Team lunch', category: 'dinner', date: day(1) })).data;
await call('PUT', `/plans/${lunch.id}/rsvp`, T.abraham, { status: 'in' });
await call('PUT', `/plans/${lunch.id}/rsvp`, T.tolu, { status: 'in' });

// A finished plan.
const bday = (await call('POST', `/circles/${family.id}/plans`, T.abraham, { title: 'Mum’s 60th', category: 'birthday', date: day(0) })).data;
await call('PUT', `/plans/${bday.id}/rsvp`, T.sarah, { status: 'in' });
await call('PUT', `/plans/${bday.id}/rsvp`, T.david, { status: 'in' });
await call('POST', `/plans/${bday.id}/status`, T.abraham, { status: 'confirmed' });
await call('POST', `/plans/${bday.id}/status`, T.abraham, { status: 'done' });
console.log('home fixture ready for Abraham (0801 000 0001)');
