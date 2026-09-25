import type { ActivityDTO, CreatePactInput, PactDTO, PactPreviewDTO, PersonDTO, WithPeople } from '../../../shared/contracts.js';
import { MAX_PACT_DAYS, MAX_PACT_MEMBERS, MISSED_GOAL_GRACE_DAYS, NUDGE_COOLDOWN_HOURS, TIER_LIMITS, type KycTier } from '../../../shared/policy.js';
import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { randomCode } from '../lib/crypto.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { formatNgn } from '../lib/money.js';
import { normalizeNgPhone } from '../lib/phone.js';
import { addDays, lagosToday } from '../lib/time.js';
import { getUser, verifyPin } from './auth.js';
import { createAccount, post, walletAccountId } from './ledger.js';
import { audit, enqueue, notify, recordActivity } from './platform.js';

interface PactRow {
  id: string;
  slug: string;
  invite_code: string;
  title: string;
  note: string | null;
  category: PactDTO['category'];
  target_amount: number;
  raised_amount: number;
  deadline: string;
  organizer_id: string;
  account_id: string;
  status: PactDTO['status'];
  missed_goal_policy: 'refund' | 'release';
  split_mode: 'flexible' | 'equal';
  created_at: Date;
  funded_at: Date | null;
  closed_at: Date | null;
}

interface MemberRow {
  pact_id: string;
  user_id: string;
  role: 'organizer' | 'member';
  status: 'invited' | 'joined' | 'left';
  contributed: number;
  joined_at: Date | null;
}

const personCols = `id, first_name, last_name, color, tint, photo_url`;
const toPerson = (u: { id: string; first_name: string; last_name: string; color: string; tint: PersonDTO['tint']; photo_url: string | null }): PersonDTO => ({
  id: u.id,
  firstName: u.first_name,
  lastName: u.last_name,
  color: u.color,
  tint: u.tint,
  photoUrl: u.photo_url,
});

export async function peopleByIds(q: Queryable, ids: string[]): Promise<PersonDTO[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const r = await q.query<Parameters<typeof toPerson>[0]>(`SELECT ${personCols} FROM users WHERE id = ANY($1::uuid[])`, [unique]);
  return r.rows.map(toPerson);
}

/** Builds DTOs for many Pacts with two queries, whatever the count. */
async function hydrate(q: Queryable, rows: PactRow[], viewerId: string): Promise<PactDTO[]> {
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const [members, pools, invites] = await Promise.all([
    q.query<MemberRow>(
      `SELECT pact_id, user_id, role, status, contributed, joined_at FROM pact_members
        WHERE pact_id = ANY($1::uuid[]) AND status <> 'left' ORDER BY joined_at NULLS LAST, created_at`,
      [ids],
    ),
    q.query<{ id: string; balance: number }>('SELECT id, balance FROM accounts WHERE id = ANY($1::uuid[])', [rows.map((p) => p.account_id)]),
    q.query<{ pact_id: string; n: number }>(
      `SELECT pact_id, COUNT(*)::int AS n FROM pact_phone_invites WHERE pact_id = ANY($1::uuid[]) AND claimed_at IS NULL GROUP BY pact_id`,
      [ids],
    ),
  ]);
  const byPact = new Map<string, MemberRow[]>();
  for (const m of members.rows) byPact.set(m.pact_id, [...(byPact.get(m.pact_id) ?? []), m]);
  const pool = new Map(pools.rows.map((a) => [a.id, a.balance]));
  const pending = new Map(invites.rows.map((i) => [i.pact_id, i.n]));

  return rows.map((p) => {
    const ms = byPact.get(p.id) ?? [];
    const me = ms.find((m) => m.user_id === viewerId);
    const joined = ms.filter((m) => m.status === 'joined').length;
    const remaining = Math.max(0, p.target_amount - p.raised_amount);
    // Equal split across everyone in or invited (rounded up to the naira).
    const heads = ms.length + (pending.get(p.id) ?? 0);
    const share = Math.ceil(p.target_amount / Math.max(1, heads, joined) / 100) * 100;
    const suggested = me ? Math.min(remaining, Math.max(0, share - me.contributed)) : 0;
    return {
      id: p.id,
      slug: p.slug,
      inviteCode: p.invite_code,
      title: p.title,
      note: p.note,
      category: p.category,
      target: p.target_amount,
      raised: p.raised_amount,
      poolBalance: pool.get(p.account_id) ?? 0,
      deadline: p.deadline,
      createdAt: p.created_at.toISOString(),
      organizerId: p.organizer_id,
      status: p.status,
      missedGoalPolicy: p.missed_goal_policy,
      splitMode: p.split_mode,
      fundedAt: p.funded_at?.toISOString() ?? null,
      closedAt: p.closed_at?.toISOString() ?? null,
      members: ms.map((m) => ({ userId: m.user_id, role: m.role, status: m.status, contributed: m.contributed, joinedAt: m.joined_at?.toISOString() ?? null })),
      pendingPhoneInvites: pending.get(p.id) ?? 0,
      viewer: { role: me?.role ?? null, status: me?.status ?? null, suggestedShare: suggested },
    };
  });
}

async function withPeople<T>(q: Queryable, data: T, pacts: PactDTO[], extraIds: (string | null)[] = []): Promise<WithPeople<T>> {
  const ids = [...pacts.flatMap((p) => p.members.map((m) => m.userId)), ...pacts.map((p) => p.organizerId), ...(extraIds.filter(Boolean) as string[])];
  return { data, people: await peopleByIds(q, ids) };
}

/** Loads a Pact the viewer may see. Non-members get a 404, not a 403, so ids can't be probed. */
async function loadVisible(q: Queryable, pactId: string, viewerId: string, lock = false): Promise<{ pact: PactRow; member: MemberRow | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(pactId)) throw notFound('Pact');
  const p = await q.query<PactRow>(`SELECT * FROM pacts WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [pactId]);
  if (!p.rows[0]) throw notFound('Pact');
  const m = await q.query<MemberRow>('SELECT * FROM pact_members WHERE pact_id = $1 AND user_id = $2', [pactId, viewerId]);
  const member = m.rows[0] ?? null;
  if (!member || member.status === 'left') throw notFound('Pact');
  return { pact: p.rows[0], member };
}

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'pact';

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

export async function listPacts(ctx: Ctx, userId: string) {
  const r = await ctx.db.query<PactRow>(
    `SELECT p.* FROM pacts p JOIN pact_members m ON m.pact_id = p.id
      WHERE m.user_id = $1 AND m.status IN ('joined', 'invited')
      ORDER BY (p.status = 'open') DESC, p.deadline ASC LIMIT 200`,
    [userId],
  );
  const pacts = await hydrate(ctx.db, r.rows, userId);
  return withPeople(ctx.db, pacts, pacts);
}

export async function getPact(ctx: Ctx, userId: string, pactId: string) {
  const { pact } = await loadVisible(ctx.db, pactId, userId);
  const [dto] = await hydrate(ctx.db, [pact], userId);
  const acts = await activitiesFor(ctx.db, [pactId], 50);
  return withPeople(ctx.db, { pact: dto, activities: acts }, [dto], acts.map((a) => a.actorId));
}

async function activitiesFor(q: Queryable, pactIds: string[], limit: number): Promise<ActivityDTO[]> {
  if (!pactIds.length) return [];
  const r = await q.query<{ id: string; pact_id: string; type: ActivityDTO['type']; actor_id: string | null; amount: number | null; created_at: Date }>(
    `SELECT id, pact_id, type, actor_id, amount, created_at FROM activities
      WHERE pact_id = ANY($1::uuid[]) AND type <> 'nudge' ORDER BY created_at DESC, id LIMIT $2`,
    [pactIds, limit],
  );
  return r.rows.map((a) => ({ id: a.id, pactId: a.pact_id, type: a.type, actorId: a.actor_id, amount: a.amount, at: a.created_at.toISOString() }));
}

export async function feed(ctx: Ctx, userId: string) {
  const mine = await ctx.db.query<{ pact_id: string }>(`SELECT pact_id FROM pact_members WHERE user_id = $1 AND status = 'joined'`, [userId]);
  const acts = await activitiesFor(ctx.db, mine.rows.map((r) => r.pact_id), 80);
  return { data: acts, people: await peopleByIds(ctx.db, acts.map((a) => a.actorId ?? '')) };
}

/** People you've shared a Pact with: the invite picker's suggestions. */
export async function recentPeople(ctx: Ctx, userId: string): Promise<PersonDTO[]> {
  const r = await ctx.db.query<Parameters<typeof toPerson>[0] & { last: Date }>(
    `SELECT u.id, u.first_name, u.last_name, u.color, u.tint, u.photo_url, MAX(p.created_at) AS last
       FROM pact_members mine
       JOIN pact_members other ON other.pact_id = mine.pact_id AND other.user_id <> mine.user_id AND other.status = 'joined'
       JOIN users u ON u.id = other.user_id
       JOIN pacts p ON p.id = mine.pact_id
      WHERE mine.user_id = $1 AND mine.status = 'joined'
      GROUP BY u.id ORDER BY last DESC LIMIT 30`,
    [userId],
  );
  return r.rows.map(toPerson);
}

export async function preview(ctx: Ctx, code: string): Promise<PactPreviewDTO & { id: string }> {
  const r = await ctx.db.query<PactRow & { first_name: string; color: string; photo_url: string | null; member_count: number }>(
    `SELECT p.*, u.first_name, u.color, u.photo_url,
            (SELECT COUNT(*)::int FROM pact_members m WHERE m.pact_id = p.id AND m.status = 'joined') AS member_count
       FROM pacts p JOIN users u ON u.id = p.organizer_id WHERE p.invite_code = $1`,
    [code.toUpperCase()],
  );
  const p = r.rows[0];
  if (!p) throw notFound('Invite');
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    target: p.target_amount,
    raised: p.raised_amount,
    deadline: p.deadline,
    status: p.status,
    memberCount: p.member_count,
    organizer: { firstName: p.first_name, color: p.color, photoUrl: p.photo_url },
  };
}

/* --------------------------------------------------------------------------
   Commands
   -------------------------------------------------------------------------- */

export async function createPact(ctx: Ctx, userId: string, input: Required<Omit<CreatePactInput, 'note'>> & { note?: string }, meta: ReqMeta) {
  const today = lagosToday(ctx.now());
  if (input.deadline <= today) throw badRequest('invalid_deadline', 'Choose a date after today.');
  if (input.deadline > addDays(today, MAX_PACT_DAYS)) throw badRequest('invalid_deadline', 'Pacts can run for up to a year.');
  if (input.target % 100 !== 0) throw badRequest('invalid_target', 'Use whole naira for the goal.');
  const phones = [...new Set(input.invitePhones.map((p) => normalizeNgPhone(p)))];
  if (phones.includes(null)) throw badRequest('invalid_phone', 'One of the phone numbers isn’t a valid Nigerian mobile number.');

  const id = await ctx.db.tx(async (q) => {
    const open = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pacts WHERE organizer_id = $1 AND status = 'open'`, [userId]);
    if (open.rows[0].n >= 20) throw badRequest('too_many_pacts', 'You can organise up to 20 open Pacts at once.');

    const base = slugify(input.title);
    let slug = `${base}-${randomCode(4).toLowerCase()}`;
    for (let i = 0; (await q.query('SELECT 1 FROM pacts WHERE slug = $1', [slug])).rowCount && i < 5; i++) slug = `${base}-${randomCode(6).toLowerCase()}`;

    const pactId = (await q.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0].id;
    const accountId = await createAccount(q, 'pact_pool', pactId);
    await q.query(
      `INSERT INTO pacts (id, slug, invite_code, title, note, category, target_amount, deadline, organizer_id, account_id, missed_goal_policy, split_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [pactId, slug, randomCode(8), input.title.trim(), input.note?.trim() || null, input.category, input.target, input.deadline, userId, accountId, input.missedGoalPolicy, input.splitMode],
    );
    await q.query(`INSERT INTO pact_members (pact_id, user_id, role, status, joined_at) VALUES ($1, $2, 'organizer', 'joined', now())`, [pactId, userId]);
    await recordActivity(q, { pactId, actorId: userId, type: 'created' });
    await invite(ctx, q, pactId, userId, input.title.trim(), input.inviteUserIds, phones as string[]);
    await audit(q, { actorId: userId, action: 'pact.created', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { target: input.target } });
    // Reminders and the missed-goal rule run from the deadline sweep.
    return pactId;
  });
  return getPact(ctx, userId, id);
}

async function invite(ctx: Ctx, q: Queryable, pactId: string, inviterId: string, title: string, userIds: string[], phones: string[]) {
  const inviter = await getUser(q, inviterId);
  const count = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pact_members WHERE pact_id = $1 AND status <> 'left'`, [pactId]);
  if (count.rows[0].n + userIds.length + phones.length > MAX_PACT_MEMBERS) throw badRequest('too_many_members', `A Pact can have up to ${MAX_PACT_MEMBERS} people.`);

  // Phone numbers that already belong to someone become direct invites.
  const known = phones.length ? await q.query<{ id: string; phone: string }>('SELECT id, phone FROM users WHERE phone = ANY($1::text[])', [phones]) : { rows: [] };
  const direct = [...new Set([...userIds, ...known.rows.map((u) => u.id)])].filter((id) => id !== inviterId);
  const invited: string[] = [];
  for (const uid of direct) {
    const r = await q.query(
      `INSERT INTO pact_members (pact_id, user_id, role, status, invited_by) VALUES ($1, $2, 'member', 'invited', $3)
       ON CONFLICT (pact_id, user_id) DO UPDATE SET status = 'invited', invited_by = EXCLUDED.invited_by WHERE pact_members.status = 'left'
       RETURNING user_id`,
      [pactId, uid, inviterId],
    );
    if (r.rowCount) invited.push(uid);
  }
  await notify(q, invited, { type: 'invite', title: 'You’re invited', body: `${inviter.first_name} invited you to ${title}.`, pactId });

  const knownPhones = new Set(known.rows.map((u) => u.phone));
  for (const phone of phones.filter((p) => !knownPhones.has(p) && p !== inviter.phone)) {
    const r = await q.query(`INSERT INTO pact_phone_invites (pact_id, phone, invited_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`, [pactId, phone, inviterId]);
    if (r.rowCount) await enqueue(q, 'sms.invite', { pactId, phone, inviter: inviter.first_name });
  }
  return invited.length;
}

export async function inviteMore(ctx: Ctx, userId: string, pactId: string, userIds: string[], rawPhones: string[]) {
  const phones = rawPhones.map((p) => normalizeNgPhone(p));
  if (phones.includes(null)) throw badRequest('invalid_phone', 'One of the phone numbers isn’t a valid Nigerian mobile number.');
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member?.status !== 'joined') throw forbidden('Join the Pact before inviting people.');
    if (pact.status !== 'open') throw badRequest('pact_closed', 'This Pact isn’t taking new people.');
    await invite(ctx, q, pactId, userId, pact.title, userIds, phones as string[]);
  });
  return getPact(ctx, userId, pactId);
}

async function joinTx(q: Queryable, pact: PactRow, userId: string) {
  if (pact.status !== 'open') throw badRequest('pact_closed', 'This Pact isn’t taking new people.');
  const count = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [pact.id]);
  if (count.rows[0].n >= MAX_PACT_MEMBERS) throw badRequest('pact_full', 'This Pact is full.');
  const r = await q.query(
    `INSERT INTO pact_members (pact_id, user_id, role, status, joined_at) VALUES ($1, $2, 'member', 'joined', now())
     ON CONFLICT (pact_id, user_id) DO UPDATE SET status = 'joined', joined_at = now() WHERE pact_members.status <> 'joined'
     RETURNING user_id`,
    [pact.id, userId],
  );
  if (!r.rowCount) return false;
  const user = await getUser(q, userId);
  await recordActivity(q, { pactId: pact.id, actorId: userId, type: 'join' });
  await notify(q, [pact.organizer_id], { type: 'join', title: `${user.first_name} joined`, body: `${user.first_name} joined ${pact.title}.`, pactId: pact.id });
  return true;
}

export async function joinByCode(ctx: Ctx, userId: string, code: string) {
  const pactId = await ctx.db.tx(async (q) => {
    const p = await q.query<PactRow>('SELECT * FROM pacts WHERE invite_code = $1 FOR UPDATE', [code.toUpperCase()]);
    if (!p.rows[0]) throw notFound('Invite');
    await joinTx(q, p.rows[0], userId);
    return p.rows[0].id;
  });
  return getPact(ctx, userId, pactId);
}

export async function acceptInvite(ctx: Ctx, userId: string, pactId: string) {
  await ctx.db.tx(async (q) => {
    const { pact } = await loadVisible(q, pactId, userId, true);
    await joinTx(q, pact, userId);
  });
  return getPact(ctx, userId, pactId);
}

export async function leave(ctx: Ctx, userId: string, pactId: string) {
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.role === 'organizer') throw badRequest('organizer_cannot_leave', 'Organisers can close the Pact instead of leaving it.');
    if (member!.contributed > 0 && pact.status === 'open') throw badRequest('has_contributed', 'You’ve contributed, so you stay in until the Pact closes.');
    await q.query(`UPDATE pact_members SET status = 'left' WHERE pact_id = $1 AND user_id = $2`, [pactId, userId]);
    if (member!.status === 'joined') await recordActivity(q, { pactId, actorId: userId, type: 'left' });
  });
}

/**
 * Wallet → Pact pool. The Pact row is locked first, then the ledger locks both
 * accounts, so concurrent contributions can't push a Pact past its target or a
 * wallet below zero.
 */
export async function contribute(ctx: Ctx, userId: string, pactId: string, amount: number, pin: string, meta: ReqMeta) {
  if (amount % 100 !== 0) throw badRequest('invalid_amount', 'Contribute whole naira amounts.');
  await verifyPin(ctx, userId, pin, meta);
  const today = lagosToday(ctx.now());

  const result = await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (pact.status !== 'open') throw badRequest('pact_closed', pact.status === 'funded' ? 'This Pact is already fully funded.' : 'This Pact is closed.');
    if (pact.deadline < today) throw badRequest('pact_past_deadline', 'This Pact’s deadline has passed.');
    const remaining = pact.target_amount - pact.raised_amount;
    if (amount > remaining) throw new AppError(422, 'exceeds_remaining', `Only ${formatNgn(remaining)} is left to reach the goal.`, { remaining });
    if (member!.status === 'invited') await joinTx(q, pact, userId);

    const wallet = await walletAccountId(q, userId);
    const user = await getUser(q, userId);
    await post(q, {
      kind: 'contribution',
      reference: `contribution:${pactId}:${randomCode(16)}`,
      description: `Contribution to ${pact.title}`,
      userId,
      pactId,
      postings: [
        { accountId: wallet, amount: -amount },
        { accountId: pact.account_id, amount },
      ],
    });
    await q.query('UPDATE pact_members SET contributed = contributed + $3 WHERE pact_id = $1 AND user_id = $2', [pactId, userId, amount]);
    const upd = await q.query<{ raised_amount: number }>('UPDATE pacts SET raised_amount = raised_amount + $2 WHERE id = $1 RETURNING raised_amount', [pactId, amount]);
    await recordActivity(q, { pactId, actorId: userId, type: 'contribution', amount });

    const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [pactId]);
    const everyone = members.rows.map((m) => m.user_id);
    const completed = upd.rows[0].raised_amount >= pact.target_amount;
    if (completed) {
      await q.query(`UPDATE pacts SET status = 'funded', funded_at = now() WHERE id = $1`, [pactId]);
      await recordActivity(q, { pactId, actorId: userId, type: 'completed' });
      await notify(q, everyone, { type: 'funded', title: 'Goal reached', body: `${pact.title} is fully funded. ${formatNgn(pact.target_amount)} raised together.`, pactId });
    } else if (userId !== pact.organizer_id) {
      await notify(q, [pact.organizer_id], { type: 'contribution', title: 'New contribution', body: `${user.first_name} added ${formatNgn(amount)} to ${pact.title}.`, pactId });
    }
    await audit(q, { actorId: userId, action: 'pact.contribution', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { amount } });
    return { completed };
  });

  const out = await getPact(ctx, userId, pactId);
  return { ...out, completed: result.completed };
}

/** Organiser moves the pool into their wallet: once funded, or after a missed deadline if the Pact's rule allows it. */
export async function release(ctx: Ctx, userId: string, pactId: string, pin: string, meta: ReqMeta) {
  await verifyPin(ctx, userId, pin, meta);
  const user = await getUser(ctx.db, userId);
  if (!TIER_LIMITS[user.kyc_tier as KycTier].canRelease) {
    throw new AppError(403, 'kyc_required', 'Verify your BVN to release funds. It takes about a minute.');
  }
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.role !== 'organizer') throw forbidden('Only the organiser can release the funds.');
    await releaseTx(ctx, q, pact, userId, 'organizer');
  });
  await audit(ctx.db, { actorId: userId, action: 'pact.released', targetType: 'pact', targetId: pactId, ip: meta.ip });
  return getPact(ctx, userId, pactId);
}

async function releaseTx(ctx: Ctx, q: Queryable, pact: PactRow, actorId: string | null, by: 'organizer' | 'rule') {
  const today = lagosToday(ctx.now());
  const missed = pact.status === 'open' && pact.deadline < today;
  if (pact.status !== 'funded' && !(missed && pact.missed_goal_policy === 'release')) {
    if (pact.status === 'open' && !missed) throw badRequest('not_funded', 'Funds can be released once the goal is reached.');
    if (missed) throw badRequest('refund_policy', 'Everyone agreed to refunds if the goal was missed, so this Pact will refund.');
    throw badRequest('pact_closed', 'This Pact is already closed.');
  }
  const pool = await q.query<{ balance: number }>('SELECT balance FROM accounts WHERE id = $1', [pact.account_id]);
  const amount = pool.rows[0].balance;
  if (amount > 0) {
    await post(q, {
      kind: 'pact_release',
      reference: `release:${pact.id}`,
      description: `${pact.title} funds released`,
      userId: actorId,
      pactId: pact.id,
      metadata: { by },
      postings: [
        { accountId: pact.account_id, amount: -amount },
        { accountId: await walletAccountId(q, pact.organizer_id), amount },
      ],
    });
  }
  await q.query(`UPDATE pacts SET status = 'released', closed_at = now() WHERE id = $1`, [pact.id]);
  await recordActivity(q, { pactId: pact.id, actorId: pact.organizer_id, type: 'released', amount });
  const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND user_id <> $2`, [pact.id, pact.organizer_id]);
  await notify(q, members.rows.map((m) => m.user_id), { type: 'released', title: 'Funds released', body: `${formatNgn(amount)} from ${pact.title} was released to the organiser.`, pactId: pact.id });
  await notify(q, [pact.organizer_id], { type: 'released', title: 'Funds in your wallet', body: `${formatNgn(amount)} from ${pact.title} is in your wallet.`, pactId: pact.id });
}

/** Returns every contribution to the wallet it came from, in one balanced ledger transaction. */
async function refundTx(q: Queryable, pact: PactRow, finalStatus: 'refunded' | 'cancelled', actorId: string | null) {
  if (!['open', 'funded'].includes(pact.status)) throw badRequest('pact_closed', 'This Pact is already closed.');
  const contributors = await q.query<{ user_id: string; contributed: number }>(
    'SELECT user_id, contributed FROM pact_members WHERE pact_id = $1 AND contributed > 0',
    [pact.id],
  );
  const total = contributors.rows.reduce((s, c) => s + c.contributed, 0);
  if (total > 0) {
    const postings = [{ accountId: pact.account_id, amount: -total }];
    for (const c of contributors.rows) postings.push({ accountId: await walletAccountId(q, c.user_id), amount: c.contributed });
    await post(q, { kind: 'refund', reference: `refund:${pact.id}`, description: `Refund from ${pact.title}`, userId: actorId, pactId: pact.id, postings });
  }
  await q.query(`UPDATE pacts SET status = $2, closed_at = now() WHERE id = $1`, [pact.id, finalStatus]);
  await recordActivity(q, { pactId: pact.id, actorId, type: finalStatus === 'cancelled' ? 'cancelled' : 'refunded', amount: total });
  const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [pact.id]);
  for (const c of contributors.rows) {
    await notify(q, [c.user_id], { type: 'refund', title: 'Refund in your wallet', body: `${formatNgn(c.contributed)} from ${pact.title} is back in your wallet.`, pactId: pact.id });
  }
  const others = members.rows.map((m) => m.user_id).filter((id) => !contributors.rows.some((c) => c.user_id === id));
  await notify(q, others, { type: 'closed', title: `${pact.title} closed`, body: finalStatus === 'cancelled' ? 'The organiser closed this Pact.' : 'The goal wasn’t reached, so everyone was refunded.', pactId: pact.id });
  return total;
}

export async function cancel(ctx: Ctx, userId: string, pactId: string, pin: string, meta: ReqMeta) {
  await verifyPin(ctx, userId, pin, meta);
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.role !== 'organizer') throw forbidden('Only the organiser can close the Pact.');
    await refundTx(q, pact, 'cancelled', userId);
    await audit(q, { actorId: userId, action: 'pact.cancelled', targetType: 'pact', targetId: pactId, ip: meta.ip });
  });
  return getPact(ctx, userId, pactId);
}

export async function nudge(ctx: Ctx, userId: string, pactId: string) {
  return ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.role !== 'organizer') throw forbidden('Only the organiser can send reminders.');
    if (pact.status !== 'open') throw badRequest('pact_closed', 'This Pact is closed.');
    const organizer = await getUser(q, userId);
    const targets = await q.query<{ user_id: string }>(
      `UPDATE pact_members SET last_nudged_at = now()
        WHERE pact_id = $1 AND user_id <> $2 AND status IN ('joined', 'invited') AND contributed = 0
          AND (last_nudged_at IS NULL OR last_nudged_at < now() - make_interval(hours => $3))
        RETURNING user_id`,
      [pactId, userId, NUDGE_COOLDOWN_HOURS],
    );
    if (!targets.rowCount) throw conflict('nothing_to_nudge', 'Everyone has contributed or was reminded in the last day.');
    await notify(q, targets.rows.map((t) => t.user_id), {
      type: 'nudge',
      title: `${organizer.first_name} sent a reminder`,
      body: `${pact.title} is ${Math.floor((pact.raised_amount / pact.target_amount) * 100)}% funded. Add your share when you can.`,
      pactId,
    });
    await recordActivity(q, { pactId, actorId: userId, type: 'nudge' });
    return { reminded: targets.rowCount };
  });
}

/* --------------------------------------------------------------------------
   Deadline sweep (worker, hourly): reminders and the missed-goal rule
   -------------------------------------------------------------------------- */

export async function sweepDeadlines(ctx: Ctx) {
  const today = lagosToday(ctx.now());

  // Three days out: remind people who haven't contributed. Deduped per Pact per day.
  const soon = await ctx.db.query<{ id: string; title: string }>(`SELECT id, title FROM pacts WHERE status = 'open' AND deadline = $1`, [addDays(today, 3)]);
  for (const p of soon.rows) {
    await ctx.db.tx(async (q) => {
      const done = await q.query(`INSERT INTO jobs (type, payload, dedupe_key, done_at) VALUES ('marker', '{}', $1, now()) ON CONFLICT DO NOTHING RETURNING id`, [`reminder3:${p.id}`]);
      if (!done.rowCount) return;
      const who = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND contributed = 0`, [p.id]);
      await notify(q, who.rows.map((w) => w.user_id), { type: 'reminder', title: '3 days left', body: `${p.title} closes in 3 days. Add your share before then.`, pactId: p.id });
    });
  }

  // Missed goals past the grace period: apply the rule everyone agreed to at the start.
  const cutoff = addDays(today, -MISSED_GOAL_GRACE_DAYS);
  const missed = await ctx.db.query<{ id: string }>(`SELECT id FROM pacts WHERE status = 'open' AND deadline < $1 LIMIT 100`, [cutoff]);
  let settled = 0;
  for (const { id } of missed.rows) {
    try {
      await ctx.db.tx(async (q) => {
        const p = (await q.query<PactRow>(`SELECT * FROM pacts WHERE id = $1 AND status = 'open' FOR UPDATE SKIP LOCKED`, [id])).rows[0];
        if (!p) return;
        const organizer = await getUser(q, p.organizer_id);
        const canRelease = TIER_LIMITS[organizer.kyc_tier as KycTier].canRelease;
        if (p.missed_goal_policy === 'release' && canRelease) await releaseTx(ctx, q, p, null, 'rule');
        else await refundTx(q, p, 'refunded', null);
        await audit(q, { action: 'pact.missed_goal_settled', targetType: 'pact', targetId: id, metadata: { policy: p.missed_goal_policy, canRelease } });
      });
      settled++;
    } catch (err) {
      ctx.log.error({ err, pactId: id }, 'failed to settle missed Pact');
    }
  }
  return { reminded: soon.rowCount, settled };
}
