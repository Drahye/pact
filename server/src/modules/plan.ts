import sharp from 'sharp';
import type { Participation } from '../../../shared/contracts.js';
import type { Ctx } from '../context.js';
import type { Queryable } from '../db/index.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { formatNgn } from '../lib/money.js';
import { getUser } from './auth.js';
import { getPact } from './pacts.js';
import { audit, notify, recordActivity } from './platform.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PHOTOS = 6;
const MAX_TASKS = 40;
const MAX_BUDGET_LINES = 12;

interface Me {
  role: 'organizer' | 'co_organizer' | 'member';
  status: 'invited' | 'joined' | 'left';
  pactStatus: string;
  deadline: string;
  organizerId: string;
  title: string;
}

/**
 * Runs `fn` under row-level security as the user, after confirming they're in the Pact.
 * Database permission errors (a policy said no) become a plain 404 or 403.
 */
async function inPact<T>(ctx: Ctx, userId: string, pactId: string, fn: (q: Queryable, me: Me) => Promise<T>, need: 'member' | 'organizer' = 'member') {
  if (!UUID.test(pactId)) throw notFound('Pact');
  try {
    return await ctx.db.asUser(userId, async (q) => {
      const r = await q.query<Me>(
        `SELECT m.role, m.status, p.status AS "pactStatus", p.deadline, p.organizer_id AS "organizerId", p.title
           FROM pact_members m JOIN pacts p ON p.id = m.pact_id WHERE m.pact_id = $1 AND m.user_id = $2`,
        [pactId, userId],
      );
      const me = r.rows[0];
      if (!me || me.status !== 'joined') throw notFound('Pact');
      if (need === 'organizer' && me.role !== 'organizer') throw forbidden('Only the organiser can do that.');
      return fn(q, me);
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42501') throw forbidden('You can’t change that.');
    if (code === 'P0001') throw mapPlanError((err as Error).message);
    throw err;
  }
}

const mapPlanError = (m: string) =>
  ({
    budget_below_raised: badRequest('budget_below_raised', 'The budget can’t be less than what’s already been raised.'),
    budget_too_small: badRequest('budget_too_small', 'The budget needs to add up to at least ₦1,000.'),
    pact_closed: badRequest('pact_closed', 'This Pact is closed.'),
    not_organizer: forbidden('Only the organiser can do that.'),
  })[m] ?? badRequest('invalid', 'That change isn’t possible.');

const assertOpen = (me: Me) => {
  if (!['open', 'funded'].includes(me.pactStatus)) throw badRequest('pact_closed', 'This Pact is closed.');
};

/* --------------------------------------------------------------------------
   How you're showing up
   -------------------------------------------------------------------------- */

const participationLabel: Record<Participation, string> = {
  money: 'is contributing money',
  task: 'is taking on a task',
  both: 'is contributing and taking a task',
  later: 'is in and will confirm later',
};

export async function setParticipation(ctx: Ctx, userId: string, pactId: string, participation: Participation) {
  await inPact(ctx, userId, pactId, async (q) => {
    await q.query('UPDATE pact_members SET participation = $3 WHERE pact_id = $1 AND user_id = $2', [pactId, userId, participation]);
    await q.query(`INSERT INTO activities (pact_id, actor_id, type, detail) VALUES ($1, $2, 'committed', $3)`, [pactId, userId, participationLabel[participation]]);
  });
  return getPact(ctx, userId, pactId);
}

/* --------------------------------------------------------------------------
   Budget: what the money covers. With a budget, the target is its total.
   -------------------------------------------------------------------------- */

/** Keeps the target in line with the budget. Returns the Pact title if that just completed the goal. */
async function syncTarget(q: Queryable, pactId: string, me: Me) {
  const r = await q.query<{ status: string }>('SELECT sync_target_to_budget($1) AS status', [pactId]);
  return r.rows[0].status === 'funded' ? me.title : null;
}

/** Notifications are written by the service after the user-scoped transaction commits. */
async function announceFunded(ctx: Ctx, pactId: string, title: string | null) {
  if (!title) return;
  const members = await ctx.db.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [pactId]);
  await notify(ctx.db, members.rows.map((m) => m.user_id), { type: 'funded', title: 'Goal reached', body: `${title} is fully funded.`, pactId });
}

export async function addBudgetItem(ctx: Ctx, userId: string, pactId: string, input: { name: string; amount: number }) {
  if (input.amount % 100 !== 0) throw badRequest('invalid_amount', 'Use whole naira amounts.');
  const funded = await inPact(ctx, userId, pactId, async (q, me) => {
    if (me.pactStatus !== 'open') throw badRequest('pact_closed', 'The budget can only change while the Pact is open.');
    const n = await q.query<{ n: number; next: number }>('SELECT COUNT(*)::int AS n, COALESCE(MAX(position) + 1, 0)::int AS next FROM budget_items WHERE pact_id = $1', [pactId]);
    if (n.rows[0].n >= MAX_BUDGET_LINES) throw badRequest('too_many_lines', `A budget can have up to ${MAX_BUDGET_LINES} lines.`);
    await q.query('INSERT INTO budget_items (pact_id, name, amount, position, created_by) VALUES ($1, $2, $3, $4, $5)', [pactId, input.name, input.amount, n.rows[0].next, userId]);
    return syncTarget(q, pactId, me);
  }, 'organizer');
  await announceFunded(ctx, pactId, funded);
  return getPact(ctx, userId, pactId);
}

export async function updateBudgetItem(ctx: Ctx, userId: string, pactId: string, itemId: string, input: { name?: string; amount?: number }) {
  if (!UUID.test(itemId)) throw notFound('Budget line');
  if (input.amount !== undefined && input.amount % 100 !== 0) throw badRequest('invalid_amount', 'Use whole naira amounts.');
  const funded = await inPact(ctx, userId, pactId, async (q, me) => {
    if (me.pactStatus !== 'open') throw badRequest('pact_closed', 'The budget can only change while the Pact is open.');
    const r = await q.query('UPDATE budget_items SET name = COALESCE($3, name), amount = COALESCE($4, amount) WHERE id = $1 AND pact_id = $2 RETURNING id', [
      itemId,
      pactId,
      input.name ?? null,
      input.amount ?? null,
    ]);
    if (!r.rowCount) throw notFound('Budget line');
    return syncTarget(q, pactId, me);
  }, 'organizer');
  await announceFunded(ctx, pactId, funded);
  return getPact(ctx, userId, pactId);
}

export async function removeBudgetItem(ctx: Ctx, userId: string, pactId: string, itemId: string) {
  if (!UUID.test(itemId)) throw notFound('Budget line');
  const funded = await inPact(ctx, userId, pactId, async (q, me) => {
    if (me.pactStatus !== 'open') throw badRequest('pact_closed', 'The budget can only change while the Pact is open.');
    const r = await q.query('DELETE FROM budget_items WHERE id = $1 AND pact_id = $2 RETURNING id', [itemId, pactId]);
    if (!r.rowCount) throw notFound('Budget line');
    return syncTarget(q, pactId, me);
  }, 'organizer');
  await announceFunded(ctx, pactId, funded);
  return getPact(ctx, userId, pactId);
}

/* --------------------------------------------------------------------------
   Tasks: a title, an owner, a status. Nothing more.
   -------------------------------------------------------------------------- */

async function assertJoined(q: Queryable, pactId: string, userId: string) {
  const r = await q.query(`SELECT 1 FROM pact_members WHERE pact_id = $1 AND user_id = $2 AND status = 'joined'`, [pactId, userId]);
  if (!r.rowCount) throw badRequest('not_a_member', 'You can only assign tasks to people in the Pact.');
}

export async function createTask(ctx: Ctx, userId: string, pactId: string, input: { title: string; budgetItemId?: string | null; assigneeId?: string | null }) {
  await inPact(ctx, userId, pactId, async (q, me) => {
    assertOpen(me);
    const n = await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM tasks WHERE pact_id = $1', [pactId]);
    if (n.rows[0].n >= MAX_TASKS) throw badRequest('too_many_tasks', `A Pact can have up to ${MAX_TASKS} tasks.`);
    if (input.budgetItemId) {
      // The budget line must belong to this Pact, whatever id the client sends.
      const b = await q.query('SELECT 1 FROM budget_items WHERE id = $1 AND pact_id = $2', [input.budgetItemId, pactId]);
      if (!b.rowCount) throw badRequest('invalid_budget_item', 'That budget line isn’t part of this Pact.');
    }
    if (input.assigneeId && input.assigneeId !== userId) {
      if (me.role !== 'organizer') throw forbidden('Only the organiser can give tasks to other people.');
      await assertJoined(q, pactId, input.assigneeId);
    }
    await q.query('INSERT INTO tasks (pact_id, title, budget_item_id, assignee_id, created_by) VALUES ($1, $2, $3, $4, $5)', [
      pactId,
      input.title,
      input.budgetItemId ?? null,
      input.assigneeId ?? null,
      userId,
    ]);
    await q.query(`INSERT INTO activities (pact_id, actor_id, type, detail) VALUES ($1, $2, 'task_added', $3)`, [pactId, userId, input.title.slice(0, 120)]);
  });
  return getPact(ctx, userId, pactId);
}

export async function updateTask(
  ctx: Ctx,
  userId: string,
  pactId: string,
  taskId: string,
  input: { title?: string; status?: 'open' | 'in_progress' | 'done'; assigneeId?: 'me' | string | null },
) {
  if (!UUID.test(taskId)) throw notFound('Task');
  const notifyAssignee = await inPact(ctx, userId, pactId, async (q, me) => {
    assertOpen(me);
    const r = await q.query<{ title: string; assignee_id: string | null; status: string; created_by: string }>(
      // No row lock: RLS would hide rows this person can't update, and we want a clear 403
      // below. The UPDATE is guarded on the assignee instead, so racing claims can't both win.
      'SELECT title, assignee_id, status, created_by FROM tasks WHERE id = $1 AND pact_id = $2',
      [taskId, pactId],
    );
    const t = r.rows[0];
    if (!t) throw notFound('Task');
    const isOrganizer = me.role === 'organizer';
    let assignee = t.assignee_id;
    let assignedOther: string | null = null;

    if (input.assigneeId !== undefined) {
      if (input.assigneeId === 'me') {
        if (t.assignee_id && t.assignee_id !== userId) throw conflict('task_taken', 'Someone is already doing this.');
        assignee = userId;
      } else if (input.assigneeId === null) {
        if (t.assignee_id !== userId && !isOrganizer) throw forbidden('Only the person doing it or the organiser can let it go.');
        assignee = null;
      } else {
        if (!isOrganizer) throw forbidden('Only the organiser can give tasks to other people.');
        await assertJoined(q, pactId, input.assigneeId);
        assignee = input.assigneeId;
        if (assignee !== userId) assignedOther = assignee;
      }
    }
    if (input.title !== undefined && !isOrganizer && t.created_by !== userId) throw forbidden('Only whoever added the task can rename it.');
    let status = t.status;
    if (input.status !== undefined) {
      // Starting or finishing an unowned task claims it.
      if (!assignee && input.status !== 'open') assignee = userId;
      if (assignee !== userId && !isOrganizer) throw forbidden('Only the person doing it can update it.');
      status = input.status;
    }
    const upd = await q.query(
      `UPDATE tasks SET title = COALESCE($3, title), assignee_id = $4, status = $5,
         completed_at = CASE WHEN $5 = 'done' AND status <> 'done' THEN now() WHEN $5 <> 'done' THEN NULL ELSE completed_at END,
         completed_by = CASE WHEN $5 = 'done' AND status <> 'done' THEN $6::uuid WHEN $5 <> 'done' THEN NULL ELSE completed_by END
       WHERE id = $1 AND pact_id = $2 AND assignee_id IS NOT DISTINCT FROM $7 RETURNING id`,
      [taskId, pactId, input.title ?? null, assignee, status, userId, t.assignee_id],
    );
    if (!upd.rowCount) throw conflict('task_changed', 'Someone just changed this task. Take another look.');
    if (assignee && assignee !== t.assignee_id && assignee === userId) {
      await q.query(`INSERT INTO activities (pact_id, actor_id, type, detail) VALUES ($1, $2, 'task_claimed', $3)`, [pactId, userId, t.title.slice(0, 120)]);
    }
    if (status === 'done' && t.status !== 'done') {
      await q.query(`INSERT INTO activities (pact_id, actor_id, type, detail) VALUES ($1, $2, 'task_done', $3)`, [pactId, userId, t.title.slice(0, 120)]);
    }
    return assignedOther ? { to: assignedOther, title: t.title, pact: me.title } : null;
  });
  if (notifyAssignee) {
    const by = await getUser(ctx.db, userId);
    await notify(ctx.db, [notifyAssignee.to], { type: 'task', title: 'You’ve got a task', body: `${by.first_name} asked you to handle “${notifyAssignee.title}” for ${notifyAssignee.pact}.`, pactId });
  }
  return getPact(ctx, userId, pactId);
}

export async function deleteTask(ctx: Ctx, userId: string, pactId: string, taskId: string) {
  if (!UUID.test(taskId)) throw notFound('Task');
  await inPact(ctx, userId, pactId, async (q, me) => {
    assertOpen(me);
    // The policy allows the organiser, or the creator while the task is still open.
    const r = await q.query('DELETE FROM tasks WHERE id = $1 AND pact_id = $2 RETURNING id', [taskId, pactId]);
    if (!r.rowCount) throw forbidden('You can’t remove this task.');
  });
  return getPact(ctx, userId, pactId);
}

/* --------------------------------------------------------------------------
   Split the rest: ask, never charge
   -------------------------------------------------------------------------- */

export async function splitRest(ctx: Ctx, userId: string, pactId: string) {
  if (!UUID.test(pactId)) throw notFound('Pact');
  const out = await ctx.db.tx(async (q) => {
    const p = await q.query<{ status: string; target_amount: number; raised_amount: number; title: string; organizer_id: string; last: Date | null }>(
      `SELECT p.status, p.target_amount, p.raised_amount, p.title, p.organizer_id,
              (SELECT MAX(requested_at) FROM pact_members WHERE pact_id = p.id) AS last
         FROM pacts p WHERE p.id = $1 FOR UPDATE`,
      [pactId],
    );
    const pact = p.rows[0];
    if (!pact || pact.organizer_id !== userId) {
      const m = await q.query(`SELECT 1 FROM pact_members WHERE pact_id = $1 AND user_id = $2 AND status = 'joined'`, [pactId, userId]);
      if (!pact || !m.rowCount) throw notFound('Pact');
      throw forbidden('Only the organiser can split what’s left.');
    }
    if (pact.status !== 'open') throw badRequest('pact_closed', 'This Pact isn’t open.');
    if (pact.last && ctx.now().getTime() - pact.last.getTime() < 24 * 3_600_000) throw conflict('split_recent', 'You split the rest in the last day. Give people a moment.');
    const remaining = pact.target_amount - pact.raised_amount;
    const people = await q.query<{ user_id: string }>(
      `SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined' AND COALESCE(participation, 'later') <> 'task' ORDER BY joined_at`,
      [pactId],
    );
    if (!people.rowCount) throw badRequest('nobody_to_ask', 'Nobody in this Pact is contributing money yet.');
    const share = Math.ceil(remaining / people.rowCount / 100) * 100;
    await q.query(`UPDATE pact_members SET requested_amount = $3, requested_at = now() WHERE pact_id = $1 AND user_id = ANY($2::uuid[])`, [
      pactId,
      people.rows.map((r) => r.user_id),
      share,
    ]);
    await recordActivity(q, { pactId, actorId: userId, type: 'split_requested', amount: remaining, detail: `${people.rowCount} people` });
    const organizer = await getUser(q, userId);
    await notify(q, people.rows.map((r) => r.user_id).filter((id) => id !== userId), {
      type: 'split',
      title: `${formatNgn(remaining)} to go on ${pact.title}`,
      body: `${organizer.first_name} split what’s left: your share is ${formatNgn(share)}. Nothing is taken until you contribute.`,
      pactId,
    });
    await audit(q, { actorId: userId, action: 'pact.split_rest', targetType: 'pact', targetId: pactId, metadata: { remaining, people: people.rowCount } });
    return { share, people: people.rowCount };
  });
  return { ...(await getPact(ctx, userId, pactId)), split: out };
}

/* --------------------------------------------------------------------------
   Memory: a note, the date, and up to six private photos
   -------------------------------------------------------------------------- */

const canRemember = (me: Me, today: string) => me.pactStatus === 'funded' || me.pactStatus === 'released' || me.deadline < today;

export async function saveMemory(ctx: Ctx, userId: string, pactId: string, input: { note?: string | null; happenedOn?: string | null }) {
  const today = ctx.now().toISOString().slice(0, 10);
  if (input.happenedOn && input.happenedOn > today) throw badRequest('future_date', 'Choose the day it happened.');
  await inPact(ctx, userId, pactId, async (q, me) => {
    if (!canRemember(me, today)) throw badRequest('too_early', 'You can add the memory once the goal is reached or the day has passed.');
    const r = await q.query<{ inserted: boolean }>(
      `INSERT INTO pact_memories (pact_id, note, happened_on, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (pact_id) DO UPDATE SET note = EXCLUDED.note, happened_on = EXCLUDED.happened_on, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [pactId, input.note?.trim() || null, input.happenedOn ?? null, userId],
    );
    if (r.rows[0]?.inserted) await q.query(`INSERT INTO activities (pact_id, actor_id, type) VALUES ($1, $2, 'memory_added')`, [pactId, userId]);
  }, 'organizer');
  return getPact(ctx, userId, pactId);
}

const ACCEPTED = new Set(['jpeg', 'png', 'webp']);

/**
 * Photos are checked by their actual content (not the file name or the declared type),
 * re-encoded to WebP at a bounded size, rotated upright, and stripped of all metadata
 * (including GPS location) before anything is stored.
 */
/**
 * Checks an upload really is a JPEG, PNG or WebP photo (by content, not by name or header),
 * then re-encodes it to WebP, which also drops EXIF and GPS metadata. Used for memory
 * photos and payment receipts.
 */
export async function reencodePhoto(body: Buffer) {
  if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('no_file', 'Choose a photo to upload.');
  let meta;
  try {
    meta = await sharp(body, { limitInputPixels: 40_000_000, failOn: 'error' }).metadata();
  } catch {
    throw new AppError(415, 'unsupported_file', 'That file isn’t a photo PACT can use. Use a JPEG, PNG or WebP image.');
  }
  if (!meta.format || !ACCEPTED.has(meta.format) || (meta.pages ?? 1) > 1) {
    throw new AppError(415, 'unsupported_file', 'Use a JPEG, PNG or WebP photo.');
  }
  const { data, info } = await sharp(body, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  if (data.length > 2_000_000) throw new AppError(413, 'too_large', 'That photo is too large even after compressing. Try a smaller one.');
  return { data, info };
}

export async function addPhoto(ctx: Ctx, userId: string, pactId: string, body: Buffer) {
  const { data, info } = await reencodePhoto(body);
  const today = ctx.now().toISOString().slice(0, 10);
  await inPact(ctx, userId, pactId, async (q, me) => {
    if (!canRemember(me, today)) throw badRequest('too_early', 'You can add photos once the goal is reached or the day has passed.');
    const n = await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM memory_photos WHERE pact_id = $1', [pactId]);
    if (n.rows[0].n >= MAX_PHOTOS) throw badRequest('too_many_photos', `A memory can have up to ${MAX_PHOTOS} photos.`);
    await q.query(
      `INSERT INTO memory_photos (pact_id, data, mime, bytes, width, height, uploaded_by) VALUES ($1, $2, 'image/webp', $3, $4, $5, $6)`,
      [pactId, data, data.length, info.width, info.height, userId],
    );
  }, 'organizer');
  await audit(ctx.db, { actorId: userId, action: 'memory.photo_added', targetType: 'pact', targetId: pactId, metadata: { bytes: data.length } });
  return getPact(ctx, userId, pactId);
}

/** Served only through the API to people in the Pact; never from a public URL. */
export async function getPhoto(ctx: Ctx, userId: string, pactId: string, photoId: string) {
  if (!UUID.test(photoId)) throw notFound('Photo');
  return inPact(ctx, userId, pactId, async (q) => {
    const r = await q.query<{ data: Uint8Array; mime: string }>('SELECT data, mime FROM memory_photos WHERE id = $1 AND pact_id = $2', [photoId, pactId]);
    if (!r.rows[0]) throw notFound('Photo');
    return { data: Buffer.from(r.rows[0].data), mime: r.rows[0].mime };
  });
}

export async function deletePhoto(ctx: Ctx, userId: string, pactId: string, photoId: string) {
  if (!UUID.test(photoId)) throw notFound('Photo');
  await inPact(ctx, userId, pactId, async (q) => {
    const r = await q.query('DELETE FROM memory_photos WHERE id = $1 AND pact_id = $2 RETURNING id', [photoId, pactId]);
    if (!r.rowCount) throw notFound('Photo');
  }, 'organizer');
  return getPact(ctx, userId, pactId);
}
