import { CheckCheck, Clock, Hourglass, ShieldCheck, Store, Wallet } from 'lucide-react';
import { useState } from 'react';
import { newIdempotencyKey, type ApiError } from '../../../api/client';
import { usePactMoney } from '../../../api/hooks';
import { useAuth } from '../../../api/auth';
import { PinSheet } from '../../../components/app/PinSheet';
import { Notice } from '../../../components/app/States';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { useToast } from '../../../components/ui/Toast';
import type { BudgetLine, Pact } from '../../../data/types';
import { getUser } from '../../../data/users';
import { isExecuting, lineLeftToPay, lineState, lineStateLabel, moneyOf, nextLineToPay, paymentsInFlight, phaseOf, progressOf, type LineState } from '../../../lib/execution';
import { formatNaira, formatNairaCompact } from '../../../lib/format';
import { canPayVendors, coOrganizerOf, isOrganizerOf, type PayPreset } from './Money';
import './execution.css';

/** What to open the payment sheet with for a line: its name, and what is still to pay on it (the organiser can change it). */
export const presetFor = (line: BudgetLine | null): PayPreset | null => (line ? { lineId: line.id, purpose: line.name, amount: lineLeftToPay(line) } : null);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const fitChars = (text: string) => ({ ['--chars' as string]: text.length });

/* Make it happen -------------------------------------------------------------- */

interface SectionProps {
  pact: Pact;
  meId: string;
  /** Opens the payment sheet, with a budget line when there is one to pay. */
  onPay: (line: BudgetLine | null) => void;
  onComplete: () => void;
  /** What the Next step block below already offers, so the same button isn't shown twice. */
  nextKind?: 'pay' | 'complete' | null;
}

/**
 * Funded is not finished. Once the target is reached this is the heart of the Pact: how much is
 * available, what has been used, what is left, and what is still to do. Outcome language, not a wallet.
 */
export function ExecutionSection({ pact, meId, onPay, onComplete, nextKind = null }: SectionProps) {
  const m = moneyOf(pact);
  const prog = progressOf(pact);
  const phase = phaseOf(pact);
  const organizer = pact.organizerId === meId;
  const runsMoney = isOrganizerOf(pact, meId);
  const flight = paymentsInFlight(pact);
  const waiting = flight.filter((p) => p.status === 'awaiting_approval');
  const next = nextLineToPay(pact);
  const hasLines = (pact.budget ?? []).length > 0;
  const usedPct = m.raised > 0 ? Math.min(100, (m.used / m.raised) * 100) : 0;
  const lead = phase === 'ready' ? 'The money is ready. Now use the Pact to make the plan happen.' : 'Pay for the plan, finish the tasks, then complete the Pact.';

  return (
    <section className="screen-section exec" aria-labelledby="make-it-happen">
      <SectionHeading id="make-it-happen" title="Make it happen" />
      <p className="exec__lead">{lead}</p>

      <div className="exec__card">
        <dl className="exec__money">
          <div style={fitChars(formatNaira(m.raised))}>
            <dt>Raised</dt>
            <dd className="num">{formatNaira(m.raised)}</dd>
          </div>
          <div style={fitChars(formatNaira(m.used))}>
            <dt>Used</dt>
            <dd className="num">{formatNaira(m.used)}</dd>
          </div>
          <div className="is-left" style={fitChars(formatNaira(m.left))}>
            <dt>Left</dt>
            <dd className="num">{formatNaira(m.left)}</dd>
          </div>
        </dl>

        <ul className="exec__progress">
          <li>
            <span className="exec__row">
              <span>Money used</span>
              <strong className="num">
                {formatNairaCompact(m.used)} of {formatNairaCompact(m.raised)}
              </strong>
            </span>
            <span className="exec__bar" role="progressbar" aria-label="Money used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)}>
              <span style={{ width: `${usedPct}%` }} />
            </span>
          </li>
          {prog.lines.total > 0 && (
            <li>
              <span className="exec__row">
                <span>Plan items paid</span>
                <strong className="num">
                  {prog.lines.done} of {prog.lines.total}
                </strong>
              </span>
              <Segments done={prog.lines.done} total={prog.lines.total} label="Plan items paid" />
            </li>
          )}
          {prog.tasks.total > 0 && (
            <li>
              <span className="exec__row">
                <span>Tasks done</span>
                <strong className="num">
                  {prog.tasks.done} of {prog.tasks.total}
                </strong>
              </span>
              <Segments done={prog.tasks.done} total={prog.tasks.total} label="Tasks done" />
            </li>
          )}
        </ul>

        {waiting.length > 0 && (
          <Notice tone="sun" icon={<Hourglass />}>
            {plural(waiting.length, 'payment is', 'payments are')} waiting for approval. The money is set aside until then.
          </Notice>
        )}
        {flight.length > waiting.length && (
          <Notice tone="accent" icon={<Clock />}>
            {plural(flight.length - waiting.length, 'payment is', 'payments are')} on the way to the bank.
          </Notice>
        )}

        {runsMoney && canPayVendors(pact) && (
          <div className="exec__actions">
            {nextKind !== 'pay' && (
              <Button fullWidth iconLeft={<Store />} onClick={() => onPay(next)}>
                {hasLines ? (next ? `Pay ${next.name}` : 'Pay for the plan') : 'Use Pact funds'}
              </Button>
            )}
            {(nextKind === 'pay' || (hasLines && next)) && (
              <button type="button" className="exec__link" onClick={() => onPay(null)}>
                Pay someone else
              </button>
            )}
          </div>
        )}
        {organizer && isExecuting(pact) && nextKind !== 'complete' && (
          <Button variant="secondary" fullWidth iconLeft={<CheckCheck />} onClick={onComplete} disabled={flight.length > 0}>
            Complete this Pact
          </Button>
        )}
        {!organizer && (
          <p className="exec__member">
            {getUser(pact.organizerId).name} pays for the plan from the Pact. Every payment shows up below.
          </p>
        )}
      </div>
    </section>
  );
}

function Segments({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <span className="exec__segments" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      {Array.from({ length: Math.min(total, 24) }, (_, i) => (
        <span key={i} className={i < done ? 'is-done' : ''} />
      ))}
    </span>
  );
}

/* The plan, with payment progress ---------------------------------------------- */

const stateTone: Record<LineState, 'accent' | 'outline' | 'neutral'> = { paid: 'accent', partly_paid: 'outline', not_paid: 'neutral', waiting: 'outline', sending: 'outline' };

/** Each planned cost with what has been paid against it. Organisers can pay a line straight from here. */
export function PlanPayments({ pact, onPay, canPay }: { pact: Pact; onPay?: (line: BudgetLine) => void; canPay?: boolean }) {
  const lines = pact.budget ?? [];
  return (
    <ul className="planpay">
      {lines.map((l) => {
        const state = lineState(l);
        const paid = l.paid ?? 0;
        const left = lineLeftToPay(l);
        const pct = l.amount > 0 ? Math.min(100, (paid / l.amount) * 100) : 0;
        const payable = canPay && left > 0 && state !== 'waiting' && state !== 'sending';
        return (
          <li key={l.id} className="planpay__row">
            <div className="planpay__head">
              <span className="planpay__name">{l.name}</span>
              <Badge tone={stateTone[state]}>
                {state === 'paid' && <CheckCheck aria-hidden />}
                {lineStateLabel[state]}
              </Badge>
            </div>
            <p className="planpay__sub num">
              {state === 'not_paid'
                ? `${formatNairaCompact(l.amount)} planned · not paid yet`
                : state === 'paid'
                  ? `${formatNairaCompact(l.amount)} planned · ${formatNairaCompact(paid)} paid`
                  : `${formatNairaCompact(l.amount)} planned · ${formatNairaCompact(paid)} paid${left > 0 ? ` · ${formatNairaCompact(left)} left` : ''}`}
            </p>
            <span className="planpay__bar" role="progressbar" aria-label={`${l.name} paid`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
              <span style={{ width: `${pct}%` }} />
            </span>
            {payable && (
              <Button size="sm" variant="secondary" className="planpay__pay" onClick={() => onPay?.(l)} aria-label={`Pay for ${l.name}`}>
                Pay
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* Complete this Pact ------------------------------------------------------------ */

/**
 * The review before the plan is called done. Completing records that it happened; it moves no money.
 * If money is left the organiser chooses: release it (through the normal checks), or keep paying from the Pact.
 */
export function CompleteSheet({ pact, open, onClose, onChooseCoOrganizer }: { pact: Pact; open: boolean; onClose: () => void; onChooseCoOrganizer: () => void }) {
  const { user } = useAuth();
  const money = usePactMoney(pact.id);
  const toast = useToast();
  const [pinOpen, setPinOpen] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const m = moneyOf(pact);
  const prog = progressOf(pact);
  const flight = paymentsInFlight(pact);
  const co = coOrganizerOf(pact);
  const coName = co ? getUser(co).name : null;
  const canRelease = (user?.kycTier ?? 1) >= 2;
  const unfinished = prog.tasks.total - prog.tasks.done;
  const unpaid = prog.lines.total - prog.lines.done;
  const releasePending = !!pact.releaseRequest;
  const blocked = flight.length > 0 || releasePending;

  const finish = async (release: boolean, pin?: string) => {
    try {
      await money.complete.mutateAsync({ key, releaseRemaining: release || undefined, pin });
      toast(release && coName ? `Completed. Sent to ${coName} to approve the release` : 'We made it happen');
      onClose();
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
      throw err;
    }
  };

  return (
    <>
      <Modal
        open={open && !pinOpen}
        onClose={onClose}
        title="Ready to complete this Pact?"
        description="Completing says the plan happened. It doesn’t move any money by itself."
        footer={
          blocked ? undefined : m.left > 0 ? (
            <div className="exec__choices">
              {canRelease ? (
                <Button fullWidth iconLeft={<Wallet />} onClick={() => setPinOpen(true)}>
                  {coName ? `Ask ${coName} to release ${formatNaira(m.left)}` : `Release ${formatNaira(m.left)} and complete`}
                </Button>
              ) : (
                <Button fullWidth iconLeft={<ShieldCheck />} to="/app/profile/verify">
                  Verify your identity to release what’s left
                </Button>
              )}
              <Button variant="secondary" fullWidth onClick={onClose}>
                Keep paying from the Pact
              </Button>
            </div>
          ) : (
            <Button fullWidth loading={money.complete.isPending} onClick={() => void finish(false).catch(() => undefined)}>
              Complete this Pact
            </Button>
          )
        }
      >
        <dl className="exec__review">
          <div>
            <dt>Raised</dt>
            <dd className="num">{formatNaira(m.raised)}</dd>
          </div>
          <div>
            <dt>Used for the plan</dt>
            <dd className="num">{formatNaira(m.used)}</dd>
          </div>
          <div>
            <dt>{m.left > 0 ? 'Still in the Pact' : 'Left'}</dt>
            <dd className="num">{formatNaira(m.left)}</dd>
          </div>
          {prog.tasks.total > 0 && (
            <div>
              <dt>Tasks</dt>
              <dd className="num">
                {prog.tasks.done} of {prog.tasks.total} completed
              </dd>
            </div>
          )}
        </dl>
        <div className="exec__notices">
        {unfinished > 0 && (
          <Notice tone="sun" icon={<Hourglass />}>
            {unfinished === 1 ? '1 task is still unfinished.' : `${unfinished} tasks are still unfinished.`} You can still complete the Pact.
          </Notice>
        )}
        {unpaid > 0 && (
          <Notice tone="sun" icon={<Hourglass />}>
            {unpaid === 1 ? '1 planned cost isn’t paid yet.' : `${unpaid} planned costs aren’t paid yet.`} You can still complete the Pact.
          </Notice>
        )}
        {flight.length > 0 && (
          <Notice tone="danger" icon={<Clock />}>
            {plural(flight.length, 'payment is', 'payments are')} still waiting for approval or on the way. Let {flight.length === 1 ? 'it' : 'them'} finish first, because they change what’s left.
          </Notice>
        )}
        {releasePending && (
          <Notice tone="danger" icon={<Clock />}>
            A release is waiting for {coName ?? 'your co-organiser'}. Hear back from them first.
          </Notice>
        )}
        </div>
        {m.left > 0 && !blocked && (
          <p className="exec__left">
            <strong className="num">{formatNaira(m.left)}</strong> is still in this Pact. Release it to your wallet{coName ? ` (${coName} approves)` : ''}, or go back and keep paying from the Pact. It never moves by itself.
          </p>
        )}
        {m.left > 0 && !co && !blocked && (
          <button type="button" className="exec__link" onClick={onChooseCoOrganizer}>
            Add a co-organiser to approve the release
          </button>
        )}
      </Modal>
      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title={coName ? 'Ask for the release' : `Release ${formatNaira(m.left)} and complete`}
        description={
          coName ? (
            <>The Pact is completed now. <span className="num">{formatNaira(m.left)}</span> moves to your wallet once {coName} approves. Everyone in the Pact is told.</>
          ) : (
            <>The Pact is completed and <span className="num">{formatNaira(m.left)}</span> moves from {pact.title} into your wallet. Everyone in the Pact is told.</>
          )
        }
        onSubmit={async (pin) => {
          await finish(true, pin);
          setPinOpen(false);
        }}
      />
    </>
  );
}
