import type { Ctx, ReqMeta } from '../context.js';
import type { Queryable } from '../db/index.js';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { formatNgn } from '../lib/money.js';
import { lagosToday } from '../lib/time.js';
import { getPact, joinTx, loadVisible, type MemberRow, type PactRow } from './pacts.js';
import { audit, notify, recordActivity } from './platform.js';

/*
 * Order Pacts: the organiser lists items (a price, optional sizes or colours, optional
 * stock); people order now and pay by the Pact's date. The target is the sum of the
 * orders. Each person's payments cover their own orders oldest first, whichever way
 * they paid, and what they still owe is a pledge PACT chases on the day.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isAdmin = (m: MemberRow | null) => !!m && m.status === 'joined' && (m.role === 'organizer' || m.role === 'co_organizer');
const takingOrders = (p: PactRow, today: string) => (p.status === 'open' || p.status === 'funded') && p.deadline >= today;

interface ItemRow {
  id: string;
  pact_id: string;
  name: string;
  price: number;
  options: string[];
  stock: number | null;
  active: boolean;
}

interface OrderRow {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: Date;
}

/** Which of one person's orders their payments cover: oldest first. */
export function paidOrders<T extends { id: string; amount: number; created_at: Date | string }>(orders: T[], contributed: number): Set<string> {
  const paid = new Set<string>();
  let left = contributed;
  for (const o of [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())) {
    if (left < o.amount) break;
    left -= o.amount;
    paid.add(o.id);
  }
  return paid;
}

/** What a person still owes on their orders in this Pact. */
export async function orderOutstanding(q: Queryable, pactId: string, userId: string) {
  const r = await q.query<{ owed: number; paid: number }>(
    `SELECT COALESCE((SELECT SUM(amount) FROM pact_orders WHERE pact_id = $1 AND user_id = $2 AND status = 'active'), 0)::bigint AS owed,
            COALESCE((SELECT contributed FROM pact_members WHERE pact_id = $1 AND user_id = $2), 0)::bigint AS paid`,
    [pactId, userId],
  );
  return Math.max(0, r.rows[0].owed - r.rows[0].paid);
}

/** The target follows the orders; the Pact is funded while every order is paid for. */
export async function recomputeOrders(q: Queryable, pactId: string) {
  const p = (await q.query<PactRow>(
    `UPDATE pacts SET target_amount = (SELECT COALESCE(SUM(amount), 0) FROM pact_orders WHERE pact_id = $1 AND status = 'active')
      WHERE id = $1 RETURNING *`,
    [pactId],
  )).rows[0];
  if (p.status === 'open' && p.target_amount > 0 && p.raised_amount >= p.target_amount) {
    await q.query(`UPDATE pacts SET status = 'funded', funded_at = now() WHERE id = $1`, [pactId]);
    await recordActivity(q, { pactId, actorId: null, type: 'completed' });
    const members = await q.query<{ user_id: string }>(`SELECT user_id FROM pact_members WHERE pact_id = $1 AND status = 'joined'`, [pactId]);
    await notify(q, members.rows.map((m) => m.user_id), { type: 'funded', title: 'Every order is paid for', body: `${p.title}: ${formatNgn(p.target_amount)} in orders, all paid.`, pactId });
  } else if (p.status === 'funded' && p.raised_amount < p.target_amount) {
    // A new order after everything was paid: open again until it's paid for too.
    await q.query(`UPDATE pacts SET status = 'open', funded_at = NULL WHERE id = $1`, [pactId]);
  }
}

/** What someone owes on their orders is a pledge, due on the Pact's date, so PACT chases it. */
export async function syncOrderPledge(q: Queryable, pact: PactRow, userId: string) {
  const owedTotal = (await q.query<{ owed: number }>(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS owed FROM pact_orders WHERE pact_id = $1 AND user_id = $2 AND status = 'active'`,
    [pact.id, userId],
  )).rows[0].owed;
  const contributed = (await q.query<{ contributed: number }>('SELECT contributed FROM pact_members WHERE pact_id = $1 AND user_id = $2', [pact.id, userId])).rows[0]?.contributed ?? 0;
  const open = (await q.query<{ id: string; goal_total: number }>(`SELECT id, goal_total FROM pact_pledges WHERE pact_id = $1 AND user_id = $2 AND status = 'open' FOR UPDATE`, [pact.id, userId])).rows[0];
  if (owedTotal <= contributed) {
    if (open) await q.query(`UPDATE pact_pledges SET status = 'kept', kept_at = now(), updated_at = now() WHERE id = $1`, [open.id]);
    return;
  }
  if (open) {
    // More ordered: the reminders start over for the new total.
    const reset = owedTotal > open.goal_total;
    await q.query(`UPDATE pact_pledges SET goal_total = $2, amount = $3, due_on = $4, reminders = CASE WHEN $5 THEN 0 ELSE reminders END, updated_at = now() WHERE id = $1`, [
      open.id, owedTotal, owedTotal - contributed, pact.deadline, reset,
    ]);
  } else {
    await q.query(`INSERT INTO pact_pledges (pact_id, user_id, amount, goal_total, due_on, source) VALUES ($1, $2, $3, $4, $5, 'orders')`, [
      pact.id, userId, owedTotal - contributed, owedTotal, pact.deadline,
    ]);
  }
}

/* --------------------------------------------------------------------------
   Items
   -------------------------------------------------------------------------- */

type ItemInput = { name: string; price: number; options?: string[]; stock?: number | null };

const cleanOptions = (options: string[] = []) => [...new Set(options.map((o) => o.trim()).filter(Boolean))];

export async function insertItems(q: Queryable, pactId: string, userId: string, items: ItemInput[]) {
  const existing = (await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM pact_items WHERE pact_id = $1', [pactId])).rows[0].n;
  if (existing + items.length > 20) throw badRequest('too_many_items', 'An order Pact can have up to 20 items.');
  for (const [i, it] of items.entries()) {
    if (it.price % 100 !== 0) throw badRequest('invalid_amount', 'Use whole naira prices.');
    await q.query('INSERT INTO pact_items (pact_id, name, price, options, stock, position, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      pactId, it.name.trim(), it.price, cleanOptions(it.options), it.stock ?? null, existing + i, userId,
    ]);
  }
}

export async function addItem(ctx: Ctx, userId: string, pactId: string, input: ItemInput) {
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (!isAdmin(member)) throw forbidden('Only organisers can add items.');
    if (pact.mode !== 'orders') throw badRequest('not_orders', 'This Pact collects money towards a goal, not orders.');
    if (!takingOrders(pact, lagosToday(ctx.now()))) throw badRequest('pact_closed', 'This Pact isn’t taking orders.');
    await insertItems(q, pactId, userId, [input]);
  });
  return getPact(ctx, userId, pactId);
}

export async function updateItem(ctx: Ctx, userId: string, pactId: string, itemId: string, patch: Partial<ItemInput> & { active?: boolean }) {
  if (!UUID.test(itemId)) throw notFound('Item');
  if (patch.price !== undefined && patch.price % 100 !== 0) throw badRequest('invalid_amount', 'Use whole naira prices.');
  await ctx.db.tx(async (q) => {
    const { member } = await loadVisible(q, pactId, userId, true);
    if (!isAdmin(member)) throw forbidden('Only organisers can change items.');
    const item = (await q.query<ItemRow>('SELECT * FROM pact_items WHERE id = $1 AND pact_id = $2 FOR UPDATE', [itemId, pactId])).rows[0];
    if (!item) throw notFound('Item');
    if (patch.stock) {
      const taken = (await q.query<{ n: number }>(`SELECT COALESCE(SUM(quantity), 0)::int AS n FROM pact_orders WHERE item_id = $1 AND status = 'active'`, [itemId])).rows[0].n;
      if (patch.stock < taken) throw badRequest('stock_below_orders', `${taken} are already ordered.`);
    }
    // A new price applies to new orders; existing orders keep the price they were placed at.
    await q.query(
      `UPDATE pact_items SET name = COALESCE($3, name), price = COALESCE($4, price), options = COALESCE($5, options),
         stock = CASE WHEN $6::boolean THEN $7 ELSE stock END, active = COALESCE($8, active) WHERE id = $1 AND pact_id = $2`,
      [itemId, pactId, patch.name?.trim() ?? null, patch.price ?? null, patch.options ? cleanOptions(patch.options) : null, patch.stock !== undefined, patch.stock ?? null, patch.active ?? null],
    );
  });
  return getPact(ctx, userId, pactId);
}

/* --------------------------------------------------------------------------
   Orders
   -------------------------------------------------------------------------- */

export async function placeOrder(ctx: Ctx, userId: string, pactId: string, input: { itemId: string; option?: string | null; quantity: number }, meta: ReqMeta) {
  const today = lagosToday(ctx.now());
  let summary = '';
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    if (pact.mode !== 'orders') throw badRequest('not_orders', 'This Pact isn’t taking orders.');
    if (!takingOrders(pact, today)) throw badRequest('pact_closed', 'Orders for this Pact have closed.');
    // Ordering is joining, for someone who was invited.
    if (member!.status === 'invited') await joinTx(q, pact, userId, 'money');
    const item = (await q.query<ItemRow>('SELECT * FROM pact_items WHERE id = $1 AND pact_id = $2 FOR UPDATE', [input.itemId, pactId])).rows[0];
    if (!item || !item.active) throw notFound('Item');
    const option = input.option?.trim() || null;
    if (item.options.length && (!option || !item.options.includes(option))) throw badRequest('invalid_option', `Choose one of: ${item.options.join(', ')}.`);
    if (!item.options.length && option) throw badRequest('invalid_option', 'This item has no sizes or colours to choose.');
    if (item.stock !== null) {
      const taken = (await q.query<{ n: number }>(`SELECT COALESCE(SUM(quantity), 0)::int AS n FROM pact_orders WHERE item_id = $1 AND status = 'active'`, [item.id])).rows[0].n;
      if (taken + input.quantity > item.stock) {
        throw new AppError(422, 'out_of_stock', item.stock - taken > 0 ? `Only ${item.stock - taken} left.` : `${item.name} is sold out.`, { left: Math.max(0, item.stock - taken) });
      }
    }
    const perPerson = (await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pact_orders WHERE pact_id = $1 AND user_id = $2 AND status = 'active'`, [pactId, userId])).rows[0].n;
    if (perPerson >= 20) throw badRequest('too_many_orders', 'You can have up to 20 orders in one Pact.');
    const amount = item.price * input.quantity;
    await q.query(`INSERT INTO pact_orders (pact_id, item_id, user_id, option, quantity, unit_price, amount) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      pactId, item.id, userId, option, input.quantity, item.price, amount,
    ]);
    await q.query(
      `UPDATE pact_members SET participation = CASE WHEN participation IS NULL OR participation = 'later' THEN 'money' WHEN participation = 'task' THEN 'both' ELSE participation END
        WHERE pact_id = $1 AND user_id = $2`,
      [pactId, userId],
    );
    summary = `${input.quantity > 1 ? `${input.quantity} × ` : ''}${item.name}${option ? ` (${option})` : ''}`;
    await recordActivity(q, { pactId, actorId: userId, type: 'ordered', amount, detail: summary });
    await recomputeOrders(q, pactId);
    await syncOrderPledge(q, pact, userId);
    await audit(q, { actorId: userId, action: 'pact.order_placed', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { itemId: item.id, quantity: input.quantity, amount } });
  });
  return getPact(ctx, userId, pactId);
}

/** Unpaid orders can be cancelled by the person who placed them or by an organiser. */
export async function cancelOrder(ctx: Ctx, userId: string, pactId: string, orderId: string, meta: ReqMeta) {
  if (!UUID.test(orderId)) throw notFound('Order');
  await ctx.db.tx(async (q) => {
    const { pact, member } = await loadVisible(q, pactId, userId, true);
    const order = (await q.query<OrderRow>(`SELECT * FROM pact_orders WHERE id = $1 AND pact_id = $2 FOR UPDATE`, [orderId, pactId])).rows[0];
    // Someone else's order is invisible to a plain member, as in the app.
    if (!order || (order.user_id !== userId && !isAdmin(member))) throw notFound('Order');
    if (order.status !== 'active') throw badRequest('order_closed', 'This order is already closed.');
    const theirs = (await q.query<OrderRow>(`SELECT * FROM pact_orders WHERE pact_id = $1 AND user_id = $2 AND status = 'active'`, [pactId, order.user_id])).rows;
    const contributed = (await q.query<{ contributed: number }>('SELECT contributed FROM pact_members WHERE pact_id = $1 AND user_id = $2', [pactId, order.user_id])).rows[0]?.contributed ?? 0;
    if (paidOrders(theirs, contributed).has(order.id)) throw badRequest('order_paid', 'This order is paid for, so it can’t be cancelled.');
    await q.query(`UPDATE pact_orders SET status = 'cancelled', closed_at = now() WHERE id = $1`, [orderId]);
    await recomputeOrders(q, pactId);
    await syncOrderPledge(q, pact, order.user_id);
    if (order.user_id !== userId) {
      await notify(q, [order.user_id], { type: 'order', title: 'Order cancelled', body: `An organiser cancelled your unpaid order in ${pact.title}.`, pactId });
    }
    await audit(q, { actorId: userId, action: 'pact.order_cancelled', targetType: 'pact', targetId: pactId, ip: meta.ip, metadata: { orderId } });
  });
  return getPact(ctx, userId, pactId);
}

/**
 * The pay-by date has passed: orders nobody paid for lapse (their stock is free again),
 * and the target becomes what was actually bought. Runs inside the deadline sweep.
 */
export async function lapseUnpaidOrders(q: Queryable, pact: PactRow) {
  const orders = (await q.query<OrderRow>(`SELECT * FROM pact_orders WHERE pact_id = $1 AND status = 'active'`, [pact.id])).rows;
  const members = (await q.query<{ user_id: string; contributed: number }>('SELECT user_id, contributed FROM pact_members WHERE pact_id = $1', [pact.id])).rows;
  const lapsed: OrderRow[] = [];
  for (const m of members) {
    const theirs = orders.filter((o) => o.user_id === m.user_id);
    const paid = paidOrders(theirs, m.contributed);
    lapsed.push(...theirs.filter((o) => !paid.has(o.id)));
  }
  if (lapsed.length) {
    await q.query(`UPDATE pact_orders SET status = 'lapsed', closed_at = now() WHERE id = ANY($1::uuid[])`, [lapsed.map((o) => o.id)]);
    for (const userId of new Set(lapsed.map((o) => o.user_id))) {
      await notify(q, [userId], { type: 'order', title: 'Unpaid order released', body: `Your unpaid order in ${pact.title} was released after the pay-by date.`, pactId: pact.id });
    }
  }
  await q.query(`UPDATE pact_pledges SET status = 'closed', updated_at = now() WHERE pact_id = $1 AND status = 'open'`, [pact.id]);
  await q.query(`UPDATE pacts SET target_amount = (SELECT COALESCE(SUM(amount), 0) FROM pact_orders WHERE pact_id = $1 AND status = 'active') WHERE id = $1`, [pact.id]);
  await recordActivity(q, { pactId: pact.id, actorId: null, type: 'orders_closed', detail: `${lapsed.length} unpaid` });
  return (await q.query<PactRow>('SELECT * FROM pacts WHERE id = $1', [pact.id])).rows[0];
}
