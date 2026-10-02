import type { Ctx } from '../context.js';
import type { Queryable } from '../db/index.js';
import { AppError, badRequest } from '../lib/errors.js';
import { formatNgn } from '../lib/money.js';
import { addDays, lagosToday } from '../lib/time.js';
import { getPact, loadVisible } from './pacts.js';
import { audit, notify, recordActivity } from './platform.js';

/*
 * Pledges: a person says how much they'll add and by when. PACT does the chasing:
 * a reminder on the day, one more the day after if it's still short, then silence.
 * Kept automatically once their total in the Pact reaches the pledge.
 */

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export async function setPledge(ctx: Ctx, userId: string, pactId: string, input: { amount: number; dueOn: string }) {
  if (input.amount % 100 !== 0) throw badRequest('invalid_amount', 'Pledge whole naira amounts.');
  const today = lagosToday(ctx.now());
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (member!.status !== 'joined') throw badRequest('not_joined', 'Join the Pact to make a pledge.');
    if (pact.status !== 'open') throw badRequest('pact_closed', 'This Pact isn’t taking pledges.');
    if (pact.mode === 'orders') throw badRequest('orders_pact', 'Your orders set what you owe here, with the pay-by date.');
    if (input.dueOn < today) throw badRequest('invalid_date', 'Choose today or a later date.');
    if (input.dueOn > pact.deadline) throw badRequest('invalid_date', `Choose a date by the Pact’s deadline, ${fmtDay(pact.deadline)}.`);
    const left = pact.target_amount - pact.raised_amount;
    if (input.amount > left) throw new AppError(422, 'exceeds_remaining', `Only ${formatNgn(left)} is left to reach the goal.`, { remaining: left });
    const existing = await q.query<{ id: string }>(`SELECT id FROM pact_pledges WHERE pact_id = $1 AND user_id = $2 AND status = 'open' FOR UPDATE`, [pactId, userId]);
    const goal = member!.contributed + input.amount;
    if (existing.rows[0]) {
      await q.query(`UPDATE pact_pledges SET amount = $2, goal_total = $3, due_on = $4, reminders = 0, updated_at = now() WHERE id = $1`, [existing.rows[0].id, input.amount, goal, input.dueOn]);
    } else {
      await q.query(`INSERT INTO pact_pledges (pact_id, user_id, amount, goal_total, due_on) VALUES ($1, $2, $3, $4, $5)`, [pactId, userId, input.amount, goal, input.dueOn]);
      await recordActivity(q, { pactId, actorId: userId, type: 'pledged', amount: input.amount, detail: fmtDay(input.dueOn) });
    }
    // Pledging to pay counts as showing up with money.
    await q.query(
      `UPDATE pact_members SET participation = CASE WHEN participation IS NULL OR participation = 'later' THEN 'money' WHEN participation = 'task' THEN 'both' ELSE participation END
        WHERE pact_id = $1 AND user_id = $2`,
      [pactId, userId],
    );
    await audit(q, { actorId: userId, action: 'pact.pledged', targetType: 'pact', targetId: pactId, metadata: { amount: input.amount, dueOn: input.dueOn } });
  });
  return getPact(ctx, userId, pactId);
}

export async function cancelPledge(ctx: Ctx, userId: string, pactId: string) {
  await loadVisible(ctx.db, pactId, userId);
  const r = await ctx.db.query(`UPDATE pact_pledges SET status = 'cancelled', updated_at = now() WHERE pact_id = $1 AND user_id = $2 AND status = 'open' AND source = 'member'`, [pactId, userId]);
  if (!r.rowCount) throw badRequest('no_pledge', 'You don’t have a pledge here.');
  return getPact(ctx, userId, pactId);
}

/** After anyone's total in a Pact changes: mark their pledge kept if it now is. */
export async function checkPledgeKept(q: Queryable, pactId: string, userId: string) {
  const r = await q.query<{ amount: number }>(
    `UPDATE pact_pledges p SET status = 'kept', kept_at = now(), updated_at = now()
       FROM pact_members m
      WHERE p.pact_id = $1 AND p.user_id = $2 AND p.status = 'open' AND m.pact_id = p.pact_id AND m.user_id = p.user_id AND m.contributed >= p.goal_total
      RETURNING p.amount`,
    [pactId, userId],
  );
  if (r.rows[0]) await recordActivity(q, { pactId, actorId: userId, type: 'pledge_kept', amount: r.rows[0].amount });
}

/** When a Pact closes, its open pledges close with it. */
export async function closePledgesTx(q: Queryable, pactId: string) {
  await q.query(`UPDATE pact_pledges SET status = 'closed', updated_at = now() WHERE pact_id = $1 AND status = 'open'`, [pactId]);
}

/**
 * Worker, hourly: the reminder on the day, one more the day after (the organiser hears
 * about it then too), then nothing. Each step happens once, whatever the schedule.
 */
export async function sweepPledges(ctx: Ctx) {
  const today = lagosToday(ctx.now());
  const yesterday = addDays(today, -1);
  const due = await ctx.db.query<{ id: string; pact_id: string; user_id: string; due_on: string; reminders: number; short: number; title: string; organizer_id: string; first_name: string; source: string }>(
    `SELECT p.id, p.pact_id, p.user_id, p.due_on, p.reminders, (p.goal_total - m.contributed)::bigint AS short, x.title, x.organizer_id, u.first_name, p.source
       FROM pact_pledges p
       JOIN pact_members m ON m.pact_id = p.pact_id AND m.user_id = p.user_id
       JOIN pacts x ON x.id = p.pact_id
       JOIN users u ON u.id = p.user_id
      WHERE p.status = 'open' AND x.status = 'open'
        AND ((p.due_on = $1 AND p.reminders = 0) OR (p.due_on <= $2 AND p.reminders < 2))
      LIMIT 500`,
    [today, yesterday],
  );
  let sent = 0;
  for (const p of due.rows) {
    if (p.short <= 0) continue; // kept; picked up on the next payment check
    const onTheDay = p.due_on === today;
    // Claim the step first, so two workers never send the same reminder.
    const step = onTheDay ? 1 : 2;
    const claimed = await ctx.db.query(`UPDATE pact_pledges SET reminders = $2, updated_at = now() WHERE id = $1 AND reminders < $2 RETURNING id`, [p.id, step]);
    if (!claimed.rowCount) continue;
    const what = p.source === 'orders' ? 'your order' : 'your pledge';
    if (onTheDay) {
      await notify(ctx.db, [p.user_id], { type: 'pledge', title: 'Today’s the day', body: `${formatNgn(p.short)} for ${p.title}, as you planned. Tap to add it.`, pactId: p.pact_id, push: `Your contribution to ${p.title} is due today.` });
    } else {
      await notify(ctx.db, [p.user_id], { type: 'pledge', title: p.title, body: `${formatNgn(p.short)} still to go on ${what}. The group is counting on it.`, pactId: p.pact_id });
      if (p.organizer_id !== p.user_id) {
        await notify(ctx.db, [p.organizer_id], { type: 'pledge', title: `${p.first_name} is running late`, body: `${formatNgn(p.short)} of ${what.replace('your', 'their')} for ${p.title} was due ${fmtDay(p.due_on)}. PACT has reminded them twice.`, pactId: p.pact_id });
      }
    }
    sent++;
  }
  return { sent };
}
