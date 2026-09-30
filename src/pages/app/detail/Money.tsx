import { AlertTriangle, Check, CheckCircle2, ChevronRight, Copy, FlaskConical, ImagePlus, Landmark, Receipt, Share2, ShieldCheck, Store } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError, newIdempotencyKey } from '../../../api/client';
import { resolveVendor, useBanks, usePactMoney, useReceipt } from '../../../api/hooks';
import { useAuth } from '../../../api/auth';
import { PinSheet } from '../../../components/app/PinSheet';
import { Notice } from '../../../components/app/States';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import type { Pact, PactPayout, PactTransfer, PayoutStatus } from '../../../data/types';
import { getUser } from '../../../data/users';
import { clearDraft, pushRecent, readDraft, readRecents, useSaveDraft } from '../../../lib/drafts';
import { formatNaira, formatRelative, toKobo } from '../../../lib/format';
import { colorOf } from '../../../lib/pact';
import { NGN, PACT_PAYOUT_FEE, VENDOR_APPROVAL_THRESHOLD } from '../../../../shared/policy';
import '../../../components/app/app-ui.css';
import '../create.css';
import '../wallet/wallet.css';
import './money.css';

const FEE = PACT_PAYOUT_FEE / NGN;
const APPROVAL_OVER = VENDOR_APPROVAL_THRESHOLD / NGN;

/* Who may do what. Mirrors the API, which decides. */
export const roleIn = (pact: Pact, userId: string) => pact.members.find((m) => m.userId === userId && m.status === 'joined')?.role ?? null;
export const isOrganizerOf = (pact: Pact, userId: string) => ['organizer', 'co_organizer'].includes(roleIn(pact, userId) ?? '');
export const coOrganizerOf = (pact: Pact) => pact.members.find((m) => m.role === 'co_organizer' && m.status === 'joined')?.userId ?? null;
const takingMoney = (pact: Pact) => pact.status === 'open' || pact.status === 'funded';
/** Refund-if-missed Pacts pay vendors only once funded, so the refund promise always holds. */
export const canPayVendors = (pact: Pact) => pact.status === 'funded' || (pact.status === 'open' && pact.missedGoalPolicy === 'release');

/** Bank names arrive in capitals ("ADEBAYO KEMI"); shown as "Adebayo Kemi". */
export const displayName = (bankName: string) => bankName.toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());
const spaced = (n: string) => n.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');

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

/* The Pact's account number ------------------------------------------------ */

export function PayByTransfer({ pact, meId }: { pact: Pact; meId: string }) {
  const money = usePactMoney(pact.id);
  const { config } = useAuth();
  const toast = useToast();
  const run = useRun();
  const [testOpen, setTestOpen] = useState(false);
  const acct = pact.bankAccount;
  const organizer = isOrganizerOf(pact, meId);

  if (!acct || acct.status !== 'active') {
    if (!organizer || !takingMoney(pact)) return null;
    return (
      <button type="button" className="pay-transfer-cta" onClick={() => run(() => money.openAccount.mutateAsync(undefined), 'The Pact has its own account number')} disabled={money.openAccount.isPending}>
        <span className="pay-transfer__icon tint--mint" aria-hidden>
          <Landmark />
        </span>
        <span className="pay-transfer-cta__text">
          <strong>Get an account number for this Pact</strong>
          <span>Friends pay from any bank app. No download needed.</span>
        </span>
        <ChevronRight aria-hidden />
      </button>
    );
  }

  const shareText = `Pay into ${pact.title} from any bank app:\n${acct.bankName}\n${acct.accountNumber}\n${acct.accountName}\nUse your own name so it counts for you. Everyone in the Pact sees what came in and where it went.`;
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: pact.title, text: shareText });
        return;
      } catch {
        /* dismissed: fall back to WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener');
  };

  return (
    <section className="pay-transfer" aria-labelledby="pay-transfer-title">
      <div className="pay-transfer__head">
        <span className="pay-transfer__icon tint--mint" aria-hidden>
          <Landmark />
        </span>
        <div>
          <h2 id="pay-transfer-title" className="pay-transfer__title">
            Pay by bank transfer
          </h2>
          <p className="pay-transfer__sub">From any bank app. No PACT account needed.</p>
        </div>
      </div>
      <button type="button" className="pay-transfer__number" onClick={() => navigator.clipboard?.writeText(acct.accountNumber).then(() => toast('Account number copied'))} aria-label={`Copy account number ${acct.accountNumber}`}>
        <span className="num">{spaced(acct.accountNumber)}</span>
        <Copy aria-hidden />
      </button>
      <p className="pay-transfer__meta">
        {acct.bankName} · {acct.accountName}
      </p>
      <div className="pay-transfer__actions">
        <Button size="md" variant="secondary" iconLeft={<Share2 />} onClick={share}>
          Share
        </Button>
        {config?.sandbox && (
          <Button size="md" variant="ghost" iconLeft={<FlaskConical />} onClick={() => setTestOpen(true)}>
            Test a transfer
          </Button>
        )}
      </div>
      <p className="pay-transfer__hint">Transfers in your own name count for you. Anyone else shows up as a guest.</p>
      {config?.sandbox && <TestTransferSheet pact={pact} accountNumber={acct.accountNumber} open={testOpen} onClose={() => setTestOpen(false)} />}
    </section>
  );
}

/** Sandbox only: stands in for someone paying the Pact's number from their bank app. */
function TestTransferSheet({ pact, accountNumber, open, onClose }: { pact: Pact; accountNumber: string; open: boolean; onClose: () => void }) {
  const money = usePactMoney(pact.id);
  const run = useRun();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test a transfer"
      description={
        <span className="sandbox-tag">
          <FlaskConical aria-hidden /> Sandbox · no real money
        </span>
      }
      footer={
        <Button
          fullWidth
          disabled={name.trim().length < 2 || amount < 100}
          loading={money.testTransfer.isPending}
          onClick={async () => (await run(() => money.testTransfer.mutateAsync({ accountNumber, amount: toKobo(amount), senderName: name }), 'Transfer received')) && (setName(''), setAmount(0), onClose())}
        >
          Send {amount ? formatNaira(amount) : ''}
        </Button>
      }
    >
      <div className="bank-form">
        <Input label="Name on the sender’s bank account" placeholder="e.g. Adeyemi Sarah" value={name} onChange={(e) => setName(e.target.value)} hint="Use a member’s name to see it matched, or any other name for a guest." />
        <AmountInput label="Amount" value={amount} onChange={setAmount} />
      </div>
    </Modal>
  );
}

/* Guests ------------------------------------------------------------------ */

export interface GuestGroup {
  name: string;
  amount: number;
  transfers: PactTransfer[];
}

/** Guest transfers, one entry per sender name. */
export function guestsOf(pact: Pact): GuestGroup[] {
  const by = new Map<string, GuestGroup>();
  for (const t of pact.transfers ?? []) {
    if (t.userId || t.status !== 'credited') continue;
    const key = t.senderName.toUpperCase();
    const g = by.get(key) ?? { name: displayName(t.senderName), amount: 0, transfers: [] };
    g.amount += t.amount;
    g.transfers.push(t);
    by.set(key, g);
  }
  return [...by.values()];
}

export function GuestAvatar({ name }: { name: string }) {
  return (
    <span className="avatar avatar--md avatar--sand guest-avatar" aria-hidden>
      <span className="avatar__initials">{name.charAt(0)}</span>
    </span>
  );
}

/** "Who sent this?" Organisers can count a guest's transfer for someone in the Pact. */
export function AssignGuestSheet({ pact, guest, onClose }: { pact: Pact; guest: GuestGroup | null; onClose: () => void }) {
  const money = usePactMoney(pact.id);
  const run = useRun();
  if (!guest) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const people = pact.members.filter((m) => m.status === 'joined' || m.status === 'invited');
  const assign = (userId: string) =>
    run(async () => {
      for (const t of guest.transfers) await money.assignTransfer.mutateAsync({ id: t.id, userId });
    }, `Counted for ${getUser(userId).name}`).then((ok) => ok && onClose());
  return (
    <Modal open onClose={onClose} title="Who sent this?" description={<>{guest.name} sent <span className="num">{formatNaira(guest.amount)}</span> by bank transfer. If it’s someone in the Pact, it counts for them.</>}>
      <ul className="contact-list">
        {people.map((m) => (
          <li key={m.userId}>
            <button type="button" className="contact" disabled={money.assignTransfer.isPending} onClick={() => assign(m.userId)}>
              <Avatar userId={m.userId} size="md" accent accentColor={colorOf(pact, m.userId)} label={false} />
              <span className="contact__name">{getUser(m.userId).fullName}</span>
              <span className="contact__check" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Button fullWidth variant="secondary" onClick={onClose}>
        Keep as a guest
      </Button>
    </Modal>
  );
}

/* Paid from the Pact -------------------------------------------------------- */

const statusLabel: Record<PayoutStatus, { text: string; tone: 'neutral' | 'accent' | 'danger' | 'outline' }> = {
  awaiting_approval: { text: 'Needs approval', tone: 'outline' },
  pending: { text: 'Sending', tone: 'neutral' },
  processing: { text: 'Sending', tone: 'neutral' },
  succeeded: { text: 'Paid', tone: 'accent' },
  failed: { text: 'Didn’t go through', tone: 'danger' },
  rejected: { text: 'Turned down', tone: 'neutral' },
  cancelled: { text: 'Cancelled', tone: 'neutral' },
};

export const vendorPayouts = (pact: Pact) => (pact.payouts ?? []).filter((p) => p.kind === 'vendor' && p.status !== 'cancelled');

/** Payments waiting on this person's approval. */
export const awaitingMe = (pact: Pact, meId: string) =>
  isOrganizerOf(pact, meId) ? vendorPayouts(pact).filter((p) => p.status === 'awaiting_approval' && p.requestedBy !== meId) : [];

export function PaidFromPact({ pact, meId, onPay, onOpen }: { pact: Pact; meId: string; onPay: () => void; onOpen: (p: PactPayout) => void }) {
  const list = vendorPayouts(pact);
  const organizer = isOrganizerOf(pact, meId);
  const paid = list.filter((p) => p.status === 'succeeded').reduce((s, p) => s + p.amount, 0);
  if (!list.length && !(organizer && takingMoney(pact))) return null;
  return (
    <section className="screen-section" aria-labelledby="paid-from-pact">
      <div className="paid__heading">
        <h2 id="paid-from-pact" className="section-heading__title">
          Paid from the Pact
        </h2>
        {paid > 0 && <span className="paid__total num">{formatNaira(paid)}</span>}
      </div>
      {list.length > 0 && (
        <ul className="paid__list">
          {list.map((p) => {
            const s = statusLabel[p.status];
            return (
              <li key={p.id}>
                <button type="button" className="paid__row" onClick={() => onOpen(p)}>
                  <span className="paid__icon tint--sun" aria-hidden>
                    <Receipt />
                  </span>
                  <span className="paid__text">
                    <span className="paid__title">{p.purpose ?? 'Payment'}</span>
                    <span className="paid__sub">
                      {p.accountName} · {p.bankName} ••{p.last4}
                    </span>
                  </span>
                  <span className="paid__side">
                    <strong className="num">{formatNaira(p.amount)}</strong>
                    <Badge tone={s.tone}>{s.text}</Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {organizer && takingMoney(pact) &&
        (canPayVendors(pact) ? (
          <button type="button" className="pay-transfer-cta paid__cta" onClick={onPay}>
            <span className="pay-transfer__icon tint--sun" aria-hidden>
              <Store />
            </span>
            <span className="pay-transfer-cta__text">
              <strong>Pay a vendor from the Pact</strong>
              <span>Straight to their bank. Everyone sees it.</span>
            </span>
            <ChevronRight aria-hidden />
          </button>
        ) : (
          <p className="paid__note">Vendors can be paid once the goal is reached, because everyone was promised a refund if it isn’t.</p>
        ))}
    </section>
  );
}

/** One payment: where it went, who asked, who approved, the receipt. */
export function PayoutSheet({ pact, payout, meId, onClose }: { pact: Pact; payout: PactPayout | null; meId: string; onClose: () => void }) {
  const money = usePactMoney(pact.id);
  const run = useRun();
  const toast = useToast();
  const [pinOpen, setPinOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const live = payout ? (pact.payouts ?? []).find((p) => p.id === payout.id) ?? payout : null;
  const receipt = useReceipt(pact.id, live?.id ?? null, !!live?.hasReceipt);
  if (!live) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const organizer = isOrganizerOf(pact, meId);
  const waiting = live.status === 'awaiting_approval';
  const canDecide = waiting && organizer && live.requestedBy !== meId;
  const mine = waiting && live.requestedBy === meId;
  const budgetName = pact.budget?.find((b) => b.id === live.budgetItemId)?.name;
  const who = (id: string | null) => (id ? (id === meId ? 'You' : getUser(id).name) : null);
  const s = statusLabel[live.status];

  return (
    <>
      <Modal
        open={!pinOpen}
        onClose={onClose}
        title={live.purpose ?? 'Payment'}
        description={
          <>
            <span className="num">{formatNaira(live.amount)}</span> to {live.accountName}
          </>
        }
        footer={
          canDecide ? (
            <div className="payout__decide">
              <Button variant="secondary" fullWidth loading={money.reject.isPending} onClick={() => run(() => money.reject.mutateAsync(live.id), 'Turned down. The money is back in the Pact.').then((ok) => ok && onClose())}>
                Turn down
              </Button>
              <Button fullWidth onClick={() => setPinOpen(true)}>
                Approve
              </Button>
            </div>
          ) : mine ? (
            <Button variant="secondary" fullWidth loading={money.cancelPayout.isPending} onClick={() => run(() => money.cancelPayout.mutateAsync(live.id), 'Cancelled. The money is back in the Pact.').then((ok) => ok && onClose())}>
              Cancel this payment
            </Button>
          ) : undefined
        }
      >
        <div className="summary">
          <div className="summary__row">
            <span>Status</span>
            <Badge tone={s.tone}>{s.text}</Badge>
          </div>
          <div className="summary__row">
            <span>To</span>
            <strong>
              {live.accountName}
              <br />
              <span className="payout__bank">
                {live.bankName} ••{live.last4}
              </span>
            </strong>
          </div>
          {budgetName && (
            <div className="summary__row">
              <span>Budget line</span>
              <strong>{budgetName}</strong>
            </div>
          )}
          {live.requestedBy && (
            <div className="summary__row">
              <span>Asked by</span>
              <strong>
                {who(live.requestedBy)} · {formatRelative(live.createdAt)}
              </strong>
            </div>
          )}
          {live.decidedBy && (
            <div className="summary__row">
              <span>{live.status === 'rejected' ? 'Turned down by' : 'Approved by'}</span>
              <strong>{who(live.decidedBy)}</strong>
            </div>
          )}
          <div className="summary__row">
            <span>Transfer fee</span>
            <strong className="num">{formatNaira(live.fee)}</strong>
          </div>
        </div>
        {live.status === 'failed' && live.failureReason && (
          <Notice tone="danger" icon={<AlertTriangle />}>
            {live.failureReason}. The money went back to the Pact.
          </Notice>
        )}
        {waiting && !canDecide && !mine && (
          <Notice tone="sun" icon={<ShieldCheck />}>
            Waiting for {who(live.requestedBy === pact.organizerId ? coOrganizerOf(pact) : pact.organizerId) ?? 'a co-organiser'} to approve.
          </Notice>
        )}

        {live.hasReceipt ? (
          <figure className="payout__receipt">{receipt.data ? <img src={receipt.data} alt={`Receipt for ${live.purpose ?? 'this payment'}`} /> : <span className="payout__receipt-loading" />}</figure>
        ) : (
          organizer &&
          !['rejected', 'cancelled'].includes(live.status) && (
            <>
              <input
                ref={file}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void run(() => money.addReceipt.mutateAsync({ id: live.id, file: f }), 'Receipt added. Everyone can see it.');
                }}
              />
              <button type="button" className="plan-add payout__add-receipt" onClick={() => file.current?.click()} disabled={money.addReceipt.isPending}>
                <ImagePlus aria-hidden /> {money.addReceipt.isPending ? 'Adding…' : 'Add a receipt photo'}
              </button>
            </>
          )
        )}
      </Modal>
      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Approve this payment?"
        description={
          <>
            <span className="num">{formatNaira(live.amount)}</span> goes from {pact.title} to {live.accountName}.
          </>
        }
        onSubmit={async (pin) => {
          await money.approve.mutateAsync({ id: live.id, pin });
          setPinOpen(false);
          toast('Approved. It’s on its way.');
          onClose();
        }}
      />
    </>
  );
}

/* Paying a vendor --------------------------------------------------------- */

interface RecentVendor {
  bankCode: string;
  number: string;
  name: string;
  bank: string;
}

export function PayVendorSheet({ pact, open, onClose, onChooseCoOrganizer }: { pact: Pact; open: boolean; onClose: () => void; onChooseCoOrganizer: () => void }) {
  const money = usePactMoney(pact.id);
  const banks = useBanks();
  const toast = useToast();
  const [purpose, setPurpose] = useState('');
  const [lineId, setLineId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [bankCode, setBankCode] = useState('');
  const [number, setNumber] = useState('');
  const [resolved, setResolved] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string>();
  const [pinOpen, setPinOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);

  // A vendor payment half-filled (waiting on a quote, say) is still here when you come back.
  const draftKey = `vendor.${pact.id}`;
  useEffect(() => {
    if (!open) return;
    const d = readDraft<{ purpose: string; lineId: string | null; amount: number; bankCode: string; number: string }>(draftKey);
    if (!d) return;
    setPurpose(d.purpose);
    setLineId(d.lineId);
    setAmount(d.amount);
    setBankCode(d.bankCode);
    setNumber(d.number);
  }, [open, draftKey]);
  useSaveDraft(draftKey, { purpose, lineId, amount, bankCode, number }, !purpose.trim() && !amount && !bankCode && !number, open);

  useEffect(() => {
    setResolved(null);
    setError(undefined);
    if (!bankCode || number.length !== 10) return;
    let live = true;
    setResolving(true);
    resolveVendor(pact.id, bankCode, number)
      .then((r) => live && setResolved(r.accountName))
      .catch((e: ApiError) => live && setError(e.message))
      .finally(() => live && setResolving(false));
    return () => {
      live = false;
    };
  }, [pact.id, bankCode, number]);

  const available = Math.max(0, (pact.poolBalance ?? 0) - FEE);
  // Same rule as the API: what went out without approval in the last day counts too.
  const dayAgo = Date.now() - 86_400_000;
  const recent = (pact.payouts ?? [])
    .filter((p) => p.kind === 'vendor' && !p.decidedBy && ['pending', 'processing', 'succeeded'].includes(p.status) && Date.parse(p.createdAt) > dayAgo)
    .reduce((s, p) => s + p.amount, 0);
  const over = amount > 0 && recent + amount > APPROVAL_OVER;
  const co = coOrganizerOf(pact);
  const blocked = over && !co;
  const ready = purpose.trim().length > 0 && amount >= 500 && amount <= available && !!resolved && !blocked;
  const lines = pact.budget ?? [];
  // Vendors you've paid before, so the bank and number don't get typed twice.
  const [recents, setRecents] = useState(() => readRecents<RecentVendor>('vendors'));
  useEffect(() => {
    if (open) setRecents(readRecents<RecentVendor>('vendors'));
  }, [open]);

  const reset = () => {
    clearDraft(draftKey);
    setPurpose('');
    setLineId(null);
    setAmount(0);
    setBankCode('');
    setNumber('');
    setResolved(null);
    setKey(newIdempotencyKey());
  };

  return (
    <>
      <Modal
        open={open && !pinOpen}
        onClose={onClose}
        title="Pay a vendor"
        description="Straight from the Pact to their bank. Everyone in the Pact sees it."
        footer={
          <Button fullWidth disabled={!ready} loading={resolving} onClick={() => setPinOpen(true)}>
            {amount ? `Pay ${formatNaira(amount)}` : 'Continue'}
          </Button>
        }
      >
        <div className="bank-form">
          {lines.length > 0 && (
            <div className="field">
              <span className="field__label">For</span>
              <div className="suggest" role="radiogroup" aria-label="Budget line">
                {lines.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={lineId === l.id}
                    className={`suggest__chip ${lineId === l.id ? 'is-on' : ''}`}
                    onClick={() => {
                      const on = lineId !== l.id;
                      setLineId(on ? l.id : null);
                      if (on && !purpose.trim()) setPurpose(l.name);
                    }}
                  >
                    {lineId === l.id && <Check aria-hidden />} {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Input label="What it’s for" placeholder="e.g. Hall deposit" maxLength={80} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          <AmountInput label="Amount" value={amount} onChange={setAmount} max={available} />
          <p className="vendor__available num">
            {formatNaira(available)} available · {formatNaira(FEE)} transfer fee from the Pact
          </p>
          {recents.length > 0 && !number && (
            <div className="field">
              <span className="field__label">Paid before</span>
              <div className="suggest">
                {recents.map((v) => (
                  <button
                    key={`${v.bankCode}:${v.number}`}
                    type="button"
                    className="suggest__chip"
                    onClick={() => {
                      setBankCode(v.bankCode);
                      setNumber(v.number);
                    }}
                  >
                    <Landmark aria-hidden /> {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <label className="field__label" htmlFor="vendor-bank">
              Their bank
            </label>
            <div className="field__control">
              <select id="vendor-bank" className="field__input bank-form__select" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                <option value="">Choose a bank</option>
                {banks.data?.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Input
            label="Their account number"
            inputMode="numeric"
            placeholder="0123456789"
            maxLength={10}
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="num"
            hint={number.length && number.length < 10 ? `${10 - number.length} more digits` : undefined}
          />
          {resolved && (
            <Notice tone="accent" icon={<CheckCircle2 />}>
              The bank says this account belongs to <strong>{resolved}</strong>. Members will see this name.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          {over &&
            (co ? (
              <Notice tone="sun" icon={<ShieldCheck />}>
                More than {formatNaira(APPROVAL_OVER)} in a day, so {getUser(co).name} approves this before it’s sent. The money is set aside now.
              </Notice>
            ) : (
              <Notice tone="danger" icon={<ShieldCheck />}>
                More than {formatNaira(APPROVAL_OVER)} in a day needs a co-organiser to approve.{' '}
                <button type="button" className="link-button" onClick={onChooseCoOrganizer}>
                  Choose one
                </button>
              </Notice>
            ))}
        </div>
      </Modal>
      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title={over ? 'Ask for approval?' : `Pay ${resolved ?? ''}?`}
        description={
          <>
            <span className="num">{formatNaira(amount)}</span> for {purpose.trim()}, from {pact.title}.
          </>
        }
        onSubmit={async (pin) => {
          await money.payVendor.mutateAsync({ key, amount: toKobo(amount), bankCode, accountNumber: number, purpose: purpose.trim(), budgetItemId: lineId, pin });
          if (resolved) pushRecent<RecentVendor>('vendors', { bankCode, number, name: resolved, bank: banks.data?.find((b) => b.code === bankCode)?.name ?? '' }, (v) => `${v.bankCode}:${v.number}`);
          setPinOpen(false);
          toast(over && co ? `Sent to ${getUser(co).name} to approve` : 'Payment on its way. Everyone can see it.');
          reset();
          onClose();
        }}
      />
    </>
  );
}

/* Co-organiser ------------------------------------------------------------ */

export function CoOrganizerSheet({ pact, open, onClose }: { pact: Pact; open: boolean; onClose: () => void }) {
  const money = usePactMoney(pact.id);
  const run = useRun();
  const current = coOrganizerOf(pact);
  const people = pact.members.filter((m) => m.status === 'joined' && m.userId !== pact.organizerId);
  const set = (userId: string | null) =>
    run(() => money.setCoOrganizer.mutateAsync(userId), userId ? `${getUser(userId).name} is your co-organiser` : 'No co-organiser now').then((ok) => ok && onClose());
  return (
    <Modal open={open} onClose={onClose} title="Co-organiser" description={`They approve vendor payments once more than ${formatNaira(APPROVAL_OVER)} goes out in a day, so no large payment leaves on one person’s word. They need a verified BVN.`}>
      {people.length ? (
        <ul className="contact-list">
          {people.map((m) => (
            <li key={m.userId}>
              <button type="button" className={`contact ${current === m.userId ? 'is-on' : ''}`} disabled={money.setCoOrganizer.isPending} onClick={() => set(m.userId)}>
                <Avatar userId={m.userId} size="md" accent accentColor={colorOf(pact, m.userId)} label={false} />
                <span className="contact__name">{getUser(m.userId).fullName}</span>
                <span className="contact__check" aria-hidden>
                  {current === m.userId && <Check strokeWidth={3} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="detail__empty">Once someone joins, you can choose them here.</p>
      )}
      {current && (
        <Button fullWidth variant="secondary" onClick={() => set(null)}>
          Remove {getUser(current).name}
        </Button>
      )}
    </Modal>
  );
}

/* Waiting on you ----------------------------------------------------------- */

/** The co-organiser's side of a release request: approve with PIN, or keep the money in the Pact. */
function ReleaseApproval({ pact, requestedBy }: { pact: Pact; requestedBy: string }) {
  const money = usePactMoney(pact.id);
  const run = useRun();
  const toast = useToast();
  const [pinOpen, setPinOpen] = useState(false);
  const amount = pact.poolBalance ?? 0;
  return (
    <div className="approval approval--release">
      <span className="pay-transfer__icon tint--sun" aria-hidden>
        <ShieldCheck />
      </span>
      <span className="approval__text">
        <strong>Your approval, please</strong>
        <span>
          {getUser(requestedBy).name} wants to release <span className="num">{formatNaira(amount)}</span> from the Pact to their wallet.
        </span>
        <span className="approval__actions">
          <Button size="md" variant="secondary" loading={money.declineRelease.isPending} onClick={() => run(() => money.declineRelease.mutateAsync(undefined), 'Declined. The money stays in the Pact.')}>
            Keep it in the Pact
          </Button>
          <Button size="md" onClick={() => setPinOpen(true)}>
            Approve
          </Button>
        </span>
      </span>
      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Approve the release?"
        description={
          <>
            <span className="num">{formatNaira(amount)}</span> goes from {pact.title} to {getUser(requestedBy).name}’s wallet. Everyone in the Pact is told.
          </>
        }
        onSubmit={async (pin) => {
          await money.approveRelease.mutateAsync(pin);
          setPinOpen(false);
          toast('Approved. The funds were released.');
        }}
      />
    </div>
  );
}

export function ApprovalCards({ pact, meId, onOpen }: { pact: Pact; meId: string; onOpen: (p: PactPayout) => void }) {
  const waiting = awaitingMe(pact, meId);
  const release = pact.releaseRequest && roleIn(pact, meId) === 'co_organizer' ? pact.releaseRequest : null;
  if (!waiting.length && !release) return null;
  return (
    <div className="approval-list">
      {release && <ReleaseApproval pact={pact} requestedBy={release.requestedBy} />}
      {waiting.map((p) => (
        <button key={p.id} type="button" className="approval" onClick={() => onOpen(p)}>
          <span className="pay-transfer__icon tint--sun" aria-hidden>
            <ShieldCheck />
          </span>
          <span className="approval__text">
            <strong>Your approval, please</strong>
            <span>
              {p.requestedBy ? getUser(p.requestedBy).name : 'An organiser'} wants to pay <span className="num">{formatNaira(p.amount)}</span> to {p.accountName} for {p.purpose ?? 'the plan'}.
            </span>
          </span>
          <ChevronRight aria-hidden />
        </button>
      ))}
    </div>
  );
}
