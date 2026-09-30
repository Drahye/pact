import { Check, ClipboardCopy, Minus, Plus, Share2, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, newIdempotencyKey } from '../../../api/client';
import { usePactMoney } from '../../../api/hooks';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import type { Pact, PactItem, PactOrder } from '../../../data/types';
import { getUser } from '../../../data/users';
import { isoDay } from '../../../lib/dates';
import { clearDraft, readDraft, useSaveDraft } from '../../../lib/drafts';
import { formatDate, formatNaira, toKobo } from '../../../lib/format';
import { isOrganizerOf } from './Money';
import '../create.css';
import './money.css';

const useRun = () => {
  const toast = useToast();
  return async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      return true;
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
      return false;
    }
  };
};

export const isOrderPact = (pact: Pact) => pact.mode === 'orders';
const takingOrders = (pact: Pact) => (pact.status === 'open' || pact.status === 'funded') && pact.deadline >= isoDay(new Date());
const left = (i: PactItem) => (i.stock === null ? null : Math.max(0, i.stock - i.ordered));
const payBy = (pact: Pact) => formatDate(pact.deadline, { weekday: 'short', day: 'numeric', month: 'short' });

/** What you still owe on your own orders. */
export function owedOnOrders(pact: Pact, meId: string) {
  return (pact.orders ?? []).filter((o) => o.userId === meId && o.status === 'active' && !o.paid).reduce((s, o) => s + o.amount, 0);
}

const describe = (pact: Pact, o: PactOrder) => {
  const item = pact.items?.find((i) => i.id === o.itemId);
  return `${o.quantity > 1 ? `${o.quantity} × ` : ''}${item?.name ?? 'Item'}${o.option ? ` · ${o.option}` : ''}`;
};

/* What you can order --------------------------------------------------------- */

export function OrderMenu({ pact, meId }: { pact: Pact; meId: string }) {
  const [ordering, setOrdering] = useState<PactItem | null>(null);
  const [editing, setEditing] = useState<PactItem | null>(null);
  const [adding, setAdding] = useState(false);
  const admin = isOrganizerOf(pact, meId);
  const open = takingOrders(pact);
  const items = (pact.items ?? []).filter((i) => i.active || admin);
  return (
    <section className="screen-section" aria-labelledby="order-menu-title" id="order-menu">
      <div className="paid__heading">
        <h2 id="order-menu-title" className="section-heading__title">
          {open ? 'Order' : 'What was on order'}
        </h2>
        {open && <span className="paid__total">Pay by {payBy(pact)}</span>}
      </div>
      <ul className="order-menu">
        {items.map((i) => {
          const n = left(i);
          const soldOut = n === 0 || !i.active;
          return (
            <li key={i.id} className={`order-item ${soldOut ? 'is-out' : ''}`}>
              {(() => {
                const inner = (
                  <>
                <span className="order-item__icon tint--pink" aria-hidden>
                  <ShoppingBag />
                </span>
                <span className="order-item__text">
                  <span className="order-item__name">{i.name}</span>
                  <span className="order-item__meta">
                    {i.options.length ? `${i.options.join(' · ')} · ` : ''}
                    {!i.active ? 'Not taking orders' : n === null ? `${i.ordered} ordered` : n === 0 ? 'Sold out' : `${n} left`}
                  </span>
                </span>
                <strong className="order-item__price num">{formatNaira(i.price)}</strong>
                  </>
                );
                // Organisers tap an item to edit it; for everyone else it's just the menu.
                return admin ? (
                  <button type="button" className="order-item__main" onClick={() => setEditing(i)} aria-label={`${i.name}, ${formatNaira(i.price)}. Edit`}>
                    {inner}
                  </button>
                ) : (
                  <div className="order-item__main">{inner}</div>
                );
              })()}
              {open && !soldOut && (
                <Button size="md" variant="secondary" onClick={() => setOrdering(i)}>
                  Order
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {admin && open && (
        <button type="button" className="plan-add" onClick={() => setAdding(true)}>
          <Plus aria-hidden /> Add an item
        </button>
      )}
      <PlaceOrderSheet pact={pact} item={ordering} onClose={() => setOrdering(null)} />
      <ItemSheet pact={pact} item={editing} open={adding || !!editing} onClose={() => (setAdding(false), setEditing(null))} />
    </section>
  );
}

function PlaceOrderSheet({ pact, item, onClose }: { pact: Pact; item: PactItem | null; onClose: () => void }) {
  const money = usePactMoney(pact.id);
  const run = useRun();
  const [option, setOption] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [key, setKey] = useState(newIdempotencyKey);
  useEffect(() => {
    setOption(null);
    setQuantity(1);
    setKey(newIdempotencyKey());
  }, [item?.id]);
  if (!item) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const n = left(item);
  const max = Math.min(50, n ?? 50);
  const ready = !item.options.length || !!option;
  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      description={
        <>
          <span className="num">{formatNaira(item.price)}</span> each. Order now, pay by {payBy(pact)}. PACT reminds you on the day.
        </>
      }
      footer={
        <Button
          fullWidth
          disabled={!ready}
          loading={money.placeOrder.isPending}
          onClick={() =>
            run(() => money.placeOrder.mutateAsync({ key, itemId: item.id, option, quantity }), `Ordered. Pay ${formatNaira(item.price * quantity)} by ${payBy(pact)}.`).then((ok) => ok && onClose())
          }
        >
          {ready ? `Order · ${formatNaira(item.price * quantity)}` : 'Choose a size'}
        </Button>
      }
    >
      <div className="bank-form">
        {item.options.length > 0 && (
          <div className="field">
            <span className="field__label">Size or colour</span>
            <div className="suggest" role="radiogroup" aria-label="Size or colour">
              {item.options.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={option === o} className={`suggest__chip ${option === o ? 'is-on' : ''}`} onClick={() => setOption(o)}>
                  {option === o && <Check aria-hidden />} {o}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <span className="field__label" id="qty-label">
            How many
          </span>
          <div className="stepper" role="group" aria-labelledby="qty-label">
            <button type="button" className="stepper__btn" aria-label="One fewer" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)}>
              <Minus />
            </button>
            <span className="stepper__value num" aria-live="polite">
              {quantity}
            </span>
            <button type="button" className="stepper__btn" aria-label="One more" disabled={quantity >= max} onClick={() => setQuantity((q) => q + 1)}>
              <Plus />
            </button>
            {n !== null && <span className="stepper__hint">{n} left</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Organisers add items, change them, or stop taking orders for one. */
function ItemSheet({ pact, item, open, onClose }: { pact: Pact; item: PactItem | null; open: boolean; onClose: () => void }) {
  const money = usePactMoney(pact.id);
  const run = useRun();
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [options, setOptions] = useState('');
  const [stock, setStock] = useState('');
  // A new item is remembered while you work out the details; editing one starts from what's saved.
  const draftKey = `item.${pact.id}`;
  useEffect(() => {
    if (!open) return;
    const d = item ? null : readDraft<{ name: string; price: number; options: string; stock: string }>(draftKey);
    setName(item?.name ?? d?.name ?? '');
    setPrice(item?.price ?? d?.price ?? 0);
    setOptions(item?.options.join(', ') ?? d?.options ?? '');
    setStock(item?.stock ? String(item.stock) : d?.stock ?? '');
  }, [open, item, draftKey]);
  useSaveDraft(draftKey, { name, price, options, stock }, !name.trim() && !price && !options && !stock, open && !item);
  const body = {
    name: name.trim(),
    price: toKobo(price),
    options: options.split(',').map((o) => o.trim()).filter(Boolean),
    stock: stock ? Number(stock) : null,
  };
  const ready = body.name && price >= 100;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Edit item' : 'Add an item'}
      description={item ? 'A new price applies to new orders only.' : 'People choose this when they order.'}
      footer={
        <div className="pledge-sheet__footer">
          {item && (
            <Button variant="secondary" fullWidth onClick={() => run(() => money.updateItem.mutateAsync({ id: item.id, active: !item.active }), item.active ? 'No more orders for this item' : 'Taking orders again').then((ok) => ok && onClose())}>
              {item.active ? 'Stop orders' : 'Take orders'}
            </Button>
          )}
          <Button
            fullWidth
            disabled={!ready}
            loading={money.addItem.isPending || money.updateItem.isPending}
            onClick={() => run(() => (item ? money.updateItem.mutateAsync({ id: item.id, ...body }) : money.addItem.mutateAsync(body)), item ? 'Saved' : 'Item added').then((ok) => ok && (clearDraft(draftKey), onClose()))}
          >
            {item ? 'Save' : 'Add item'}
          </Button>
        </div>
      }
    >
      <div className="bank-form">
        <Input label="Item" placeholder="e.g. Aso-oke + gele" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <AmountInput label="Price" value={price} onChange={setPrice} />
        <Input label="Sizes or colours (optional)" placeholder="S, M, L, XL" value={options} onChange={(e) => setOptions(e.target.value)} hint="Separate them with commas." />
        <Input label="How many available (optional)" inputMode="numeric" placeholder="No limit" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, '').slice(0, 5))} className="num" />
      </div>
    </Modal>
  );
}

/* Your orders ------------------------------------------------------------------ */

export function MyOrders({ pact, meId }: { pact: Pact; meId: string }) {
  const money = usePactMoney(pact.id);
  const run = useRun();
  const mine = (pact.orders ?? []).filter((o) => o.userId === meId);
  if (!mine.length) return null;
  const open = takingOrders(pact);
  return (
    <section className="screen-section" aria-labelledby="my-orders">
      <h2 id="my-orders" className="section-heading__title paid__heading">
        Your orders
      </h2>
      <ul className="paid__list">
        {mine.map((o) => (
          <li key={o.id} className="paid__row">
            <span className="paid__icon tint--pink" aria-hidden>
              <ShoppingBag />
            </span>
            <span className="paid__text">
              <span className="paid__title">{describe(pact, o)}</span>
              <span className="paid__sub num">{formatNaira(o.amount)}</span>
            </span>
            <span className="paid__side">
              <Badge tone={o.status === 'lapsed' ? 'neutral' : o.paid ? 'accent' : 'outline'}>{o.status === 'lapsed' ? 'Released' : o.paid ? 'Paid' : 'To pay'}</Badge>
              {open && o.status === 'active' && !o.paid && (
                <button type="button" className="link-button order__cancel" onClick={() => run(() => money.cancelOrder.mutateAsync(o.id), 'Order cancelled')}>
                  Cancel
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* The organiser's order sheet -------------------------------------------------- */

/** Everyone's orders, grouped the way a tailor or supplier needs them. */
export function OrderSheetSection({ pact, meId }: { pact: Pact; meId: string }) {
  const toast = useToast();
  if (!isOrganizerOf(pact, meId)) return null;
  const orders = (pact.orders ?? []).filter((o) => o.status === 'active');
  if (!orders.length) return null;
  const byItem = (pact.items ?? [])
    .map((item) => {
      const its = orders.filter((o) => o.itemId === item.id);
      const groups = new Map<string, PactOrder[]>();
      for (const o of its) groups.set(o.option ?? '', [...(groups.get(o.option ?? '') ?? []), o]);
      return { item, count: its.reduce((s, o) => s + o.quantity, 0), total: its.reduce((s, o) => s + o.amount, 0), groups: [...groups.entries()] };
    })
    .filter((x) => x.count > 0);
  const text = [
    `${pact.title}: order list`,
    ...byItem.flatMap(({ item, count, groups }) => [
      '',
      `${item.name} (${count})`,
      ...groups.map(([opt, os]) => `  ${opt ? `${opt}: ` : ''}${os.map((o) => `${getUser(o.userId).fullName}${o.quantity > 1 ? ` ×${o.quantity}` : ''}${o.paid ? ' ✓' : ''}`).join(', ')}`),
    ]),
    '',
    '✓ = paid',
  ].join('\n');
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${pact.title}: order list`, text });
        return;
      } catch {
        /* dismissed */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <section className="screen-section" aria-labelledby="order-sheet">
      <div className="paid__heading">
        <h2 id="order-sheet" className="section-heading__title">
          Order sheet
        </h2>
        <span className="paid__total num">{orders.filter((o) => o.paid).length}/{orders.length} paid</span>
      </div>
      <div className="order-sheet">
        {byItem.map(({ item, count, total, groups }) => (
          <div key={item.id} className="order-sheet__item">
            <p className="order-sheet__head">
              <strong>{item.name}</strong>
              <span className="num">
                {count} · {formatNaira(total)}
              </span>
            </p>
            <ul>
              {groups.map(([opt, os]) => (
                <li key={opt}>
                  {opt && <span className="order-sheet__opt">{opt}</span>}
                  <span className="order-sheet__names">
                    {os.map((o) => (
                      <span key={o.id} className={`order-sheet__name ${o.paid ? 'is-paid' : ''}`}>
                        {getUser(o.userId).name}
                        {o.quantity > 1 ? ` ×${o.quantity}` : ''}
                        {o.paid && <Check aria-label="paid" />}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="pay-transfer__actions">
        <Button size="md" variant="secondary" iconLeft={<ClipboardCopy />} onClick={() => navigator.clipboard?.writeText(text).then(() => toast('Order list copied'))}>
          Copy list
        </Button>
        <Button size="md" variant="ghost" iconLeft={<Share2 />} onClick={share}>
          Send to tailor
        </Button>
      </div>
    </section>
  );
}
