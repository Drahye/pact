/**
 * Order Pacts (aso-ebi): items with sizes and stock, orders that set the total, payments
 * that cover a person's own orders oldest first, privacy of sizes, and the pay-by date.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sweepDeadlines } from '../src/modules/pacts.js';
import { reconcile } from '../src/modules/ledger.js';
import { setup, lagosDay } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
type Session = { accessToken: string; user: { id: string } };
type Order = { id: string; userId: string; itemId: string; option: string | null; quantity: number; amount: number; paid: boolean; status: string };

const day = (days: number) => lagosDay(days);
const PIN = '1357';

describe('order Pacts', () => {
  let t: T;
  let abraham: Session;
  let sarah: Session;
  let david: Session;
  let outsider: Session;
  let pactId: string;
  let asoOke: string;
  let fan: string;
  const pact = async (who = abraham) => (await t.call('GET', `/pacts/${pactId}`, who.accessToken)).body.data.pact;
  const order = (who: Session, body: Record<string, unknown>) => t.call('POST', `/pacts/${pactId}/orders`, who.accessToken, body);

  before(async () => {
    t = await setup({ seed: true });
    abraham = await t.signIn('08010000001');
    sarah = await t.signIn('08010000002');
    david = await t.signIn('08010000003');
    outsider = await t.signIn('08035550303', { firstName: 'Olu', lastName: 'Outsider', pin: '2468' });
    await t.topUp(sarah.accessToken, 100_000);
    await t.topUp(david.accessToken, 100_000);
    await t.topUp(abraham.accessToken, 100_000);
  });
  after(async () => {
    await t.close();
  });

  it('creates an order Pact from items, with no guessed target', async () => {
    const empty = await t.call('POST', '/pacts', abraham.accessToken, { title: 'Nothing to buy', category: 'wedding', deadline: day(10), mode: 'orders' });
    assert.equal(empty.status, 400);
    const r = await t.call('POST', '/pacts', abraham.accessToken, {
      title: 'Tobi & Kemi aso-ebi',
      category: 'wedding',
      deadline: day(10),
      mode: 'orders',
      target: 999_999_00, // ignored: orders set the total
      items: [
        { name: 'Aso-oke + gele', price: 45_000_00, options: ['S', 'M', 'L'], stock: 3 },
        { name: 'Souvenir fan', price: 2_500_00 },
      ],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = r.body.data.pact;
    pactId = p.id;
    assert.deepEqual([p.mode, p.target, p.status], ['orders', 0, 'open']);
    asoOke = p.items[0].id;
    fan = p.items[1].id;
    for (const s of [sarah, david]) await t.call('POST', `/invites/${p.inviteCode}/join`, s.accessToken, {});
  });

  it('takes orders with a valid size, within stock, and makes each one a pledge', async () => {
    assert.equal((await order(outsider, { itemId: asoOke, option: 'M', quantity: 1 })).status, 404);
    assert.equal((await order(sarah, { itemId: asoOke, option: 'XL', quantity: 1 })).status, 400);
    assert.equal((await order(sarah, { itemId: asoOke, quantity: 1 })).status, 400, 'a size is required');
    assert.equal((await order(sarah, { itemId: fan, option: 'M', quantity: 1 })).status, 400, 'fans have no sizes');

    const s = await order(sarah, { itemId: asoOke, option: 'M', quantity: 1 });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.data.pact.target, 45_000_00);
    const pledge = s.body.data.pact.pledges.find((x: { userId: string }) => x.userId === sarah.user.id);
    assert.deepEqual([pledge.source, pledge.remaining, pledge.dueOn], ['orders', 45_000_00, day(10)]);

    assert.equal((await order(david, { itemId: asoOke, option: 'L', quantity: 2 })).status, 200);
    const sold = await order(abraham, { itemId: asoOke, option: 'S', quantity: 1 });
    assert.equal(sold.status, 422);
    assert.equal(sold.body.error.code, 'out_of_stock');
    assert.equal((await order(david, { itemId: fan, quantity: 3 })).status, 200);
    assert.equal((await pact()).target, 45_000_00 + 90_000_00 + 7_500_00);
  });

  it('shows sizes only to the person and the organisers, even from raw SQL', async () => {
    const asDavid = await pact(david);
    assert.ok(asDavid.orders.every((o: Order) => o.userId === david.user.id));
    assert.equal(asDavid.items.find((i: { id: string }) => i.id === asoOke).ordered, 3, 'counts are shared, names are not');
    assert.equal((await pact(abraham)).orders.length, 3);
    const raw = await t.db.asUser(david.user.id, (q) => q.query<{ user_id: string }>('SELECT user_id FROM pact_orders'));
    assert.ok(raw.rows.every((r) => r.user_id === david.user.id));
    await assert.rejects(t.db.asUser(david.user.id, (q) => q.query(`UPDATE pact_orders SET status = 'cancelled'`)), (e: { code?: string }) => e.code === '42501');
    await assert.rejects(t.db.asUser(abraham.user.id, (q) => q.query(`INSERT INTO pact_items (pact_id, name, price, created_by) VALUES ($1, 'x', 100000, $2)`, [pactId, abraham.user.id])), (e: { code?: string }) => e.code === '42501');
  });

  it('lets people pay only for their own orders, and marks them paid oldest first', async () => {
    const over = await t.call('POST', `/pacts/${pactId}/contributions`, sarah.accessToken, { amount: 50_000_00, pin: PIN });
    assert.equal(over.status, 422);
    assert.equal(over.body.error.code, 'exceeds_owed');
    assert.equal((await t.call('POST', `/pacts/${pactId}/contributions`, abraham.accessToken, { amount: 1_000_00, pin: PIN })).body.error.code, 'nothing_owed');

    assert.equal((await t.call('POST', `/pacts/${pactId}/contributions`, sarah.accessToken, { amount: 45_000_00, pin: PIN })).status, 200);
    const mine = await pact(sarah);
    assert.equal(mine.orders[0].paid, true);
    assert.equal(mine.pledges.find((x: { userId: string }) => x.userId === sarah.user.id)?.status ?? 'kept', 'kept');

    // David pays ₦90,000: his older aso-oke order is covered, the fans aren't yet.
    await t.call('POST', `/pacts/${pactId}/contributions`, david.accessToken, { amount: 90_000_00, pin: PIN });
    const his = (await pact(david)).orders as Order[];
    assert.deepEqual(his.map((o) => o.paid), [true, false]);
  });

  it('cancels only unpaid orders, by their owner or an organiser', async () => {
    const all = (await pact(abraham)).orders as Order[];
    const sarahs = all.find((o) => o.userId === sarah.user.id)!;
    const fans = all.find((o) => o.itemId === fan)!;
    assert.equal((await t.call('DELETE', `/pacts/${pactId}/orders/${sarahs.id}`, sarah.accessToken)).body.error.code, 'order_paid');
    assert.equal((await t.call('DELETE', `/pacts/${pactId}/orders/${fans.id}`, sarah.accessToken)).status, 404, 'not hers, and she can’t see it');
    assert.equal((await t.call('DELETE', `/pacts/${pactId}/orders/${fans.id}`, abraham.accessToken)).status, 200);
    const p = await pact();
    assert.equal(p.target, 135_000_00);
    assert.equal(p.status, 'funded', 'every remaining order is paid for');

    // A new order opens it again until that one is paid too.
    assert.equal((await order(abraham, { itemId: fan, quantity: 2 })).status, 200);
    assert.equal((await pact()).status, 'open');
  });

  it('only organisers manage items; goal Pacts have none', async () => {
    assert.equal((await t.call('POST', `/pacts/${pactId}/items`, david.accessToken, { name: 'Cap', price: 5_000_00 })).status, 403);
    assert.equal((await t.call('POST', `/pacts/${pactId}/items`, abraham.accessToken, { name: 'Cap', price: 5_000_00, stock: 10 })).status, 200);
    assert.equal((await t.call('PATCH', `/pacts/${pactId}/items/${asoOke}`, abraham.accessToken, { stock: 1 })).body.error.code, 'stock_below_orders');
    const goal = await t.call('POST', '/pacts', abraham.accessToken, { title: 'Plain goal', category: 'dinner', target: 50_000_00, deadline: day(5) });
    assert.equal((await t.call('POST', `/pacts/${goal.body.data.pact.id}/items`, abraham.accessToken, { name: 'Cap', price: 5_000_00 })).status, 400);
  });

  it('releases unpaid orders after the pay-by date and keeps what was bought', async () => {
    t.setClock(() => new Date(Date.now() + 15 * 86_400_000));
    await sweepDeadlines(t.ctx);
    t.setClock(() => new Date());
    const p = await pact();
    const orders = p.orders as Order[];
    assert.ok(orders.filter((o) => o.userId === abraham.user.id).every((o) => o.status === 'lapsed'));
    assert.equal(p.target, 135_000_00);
    assert.equal(p.status, 'funded');
    assert.ok((await reconcile(t.db)).ok);
  });
});
