import { CalendarCheck, CalendarClock, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../../api/client';
import { usePactMoney } from '../../../api/hooks';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import type { Pact, PactPledge } from '../../../data/types';
import { addDaysIso, isoDay } from '../../../lib/dates';
import { formatDate, formatNaira, toKobo } from '../../../lib/format';
import { summarize } from '../../../lib/pact';
import '../create.css';
import './money.css';

const today = () => isoDay(new Date());
export const pledgeOf = (pact: Pact, userId: string) => (pact.pledges ?? []).find((p) => p.userId === userId && p.status === 'open') ?? null;
export const isLate = (p: PactPledge) => p.status === 'open' && p.remaining > 0 && p.dueOn < today();
const day = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });

/** Under a person in the group: when they said they'd pay, and whether it's late. */
export function pledgeLabel(pact: Pact, userId: string): { text: string; late: boolean } | null {
  const p = pledgeOf(pact, userId);
  if (!p || p.remaining <= 0) return null;
  return isLate(p) ? { text: 'Late', late: true } : { text: `By ${formatDate(p.dueOn, { weekday: 'short' })}`, late: false };
}

/** Your pledge on this Pact, or the way to make one. */
export function MyPledge({ pact, meId, onPay }: { pact: Pact; meId: string; onPay: (amount: number) => void }) {
  const [open, setOpen] = useState(false);
  const mine = pledgeOf(pact, meId);
  const s = summarize(pact);
  if (pact.status !== 'open' || s.remaining <= 0) return null;
  const orders = mine?.source === 'orders';
  return (
    <>
      {mine && mine.remaining > 0 ? (
        <div className={`pledge-card ${isLate(mine) ? 'is-late' : ''}`}>
          <span className="pay-transfer__icon tint--sky" aria-hidden>
            <CalendarClock />
          </span>
          <span className="pledge-card__text">
            <strong>
              {orders ? 'Your order' : 'Your pledge'}: <span className="num">{formatNaira(mine.remaining)}</span> {isLate(mine) ? `was due ${day(mine.dueOn)}` : `by ${day(mine.dueOn)}`}
            </strong>
            <span>{isLate(mine) ? 'The group is counting on it.' : 'PACT reminds you on the day. No one has to chase you.'}</span>
          </span>
          <span className="pledge-card__actions">
            {!orders && (
              <Button size="md" variant="ghost" onClick={() => setOpen(true)}>
                Change
              </Button>
            )}
            <Button size="md" onClick={() => onPay(mine.remaining)}>
              Pay now
            </Button>
          </span>
        </div>
      ) : (
        !mine && (
          <button type="button" className="pay-transfer-cta" onClick={() => setOpen(true)}>
            <span className="pay-transfer__icon tint--sky" aria-hidden>
              <CalendarCheck />
            </span>
            <span className="pay-transfer-cta__text">
              <strong>Can’t pay yet? Pledge a date</strong>
              <span>Say how much and when. PACT reminds you, so nobody has to chase.</span>
            </span>
            <ChevronRight aria-hidden />
          </button>
        )
      )}
      <PledgeSheet pact={pact} current={mine} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function nextWeekday(target: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7 || 7));
  return isoDay(d);
}

export function PledgeSheet({ pact, current, open, onClose }: { pact: Pact; current: PactPledge | null; open: boolean; onClose: () => void }) {
  const money = usePactMoney(pact.id);
  const toast = useToast();
  const share = Math.min(summarize(pact).remaining, pact.viewer?.suggestedShare || summarize(pact).remaining);
  const [amount, setAmount] = useState(current?.amount ?? share);
  const [dueOn, setDueOn] = useState(current?.dueOn ?? '');
  useEffect(() => {
    if (!open) return;
    setAmount(current?.amount ?? share);
    setDueOn(current?.dueOn ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const quick = [
    { label: 'In 3 days', value: addDaysIso(today(), 3) },
    { label: 'This Friday', value: nextWeekday(5) },
    { label: 'Payday (28th)', value: (() => { const d = new Date(); if (d.getDate() >= 28) d.setMonth(d.getMonth() + 1); d.setDate(28); return isoDay(d); })() },
  ].filter((q) => q.value <= pact.deadline);

  const save = async () => {
    try {
      await money.setPledge.mutateAsync({ amount: toKobo(amount), dueOn });
      toast(`Pledged. PACT will remind you on ${day(dueOn)}.`);
      onClose();
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={current ? 'Change your pledge' : 'Pledge a date'}
      description="The group sees what you pledged and when. PACT reminds you on the day, and once more the day after if it’s still short."
      footer={
        <div className="pledge-sheet__footer">
          {current && (
            <Button variant="secondary" fullWidth loading={money.cancelPledge.isPending} onClick={() => money.cancelPledge.mutateAsync(undefined).then(() => (toast('Pledge removed'), onClose()), (e: ApiError) => toast(e.message, 'neutral'))}>
              Remove
            </Button>
          )}
          <Button fullWidth disabled={amount < 100 || !dueOn} loading={money.setPledge.isPending} onClick={save}>
            {amount >= 100 && dueOn ? `Pledge ${formatNaira(amount)}` : 'Pledge'}
          </Button>
        </div>
      }
    >
      <div className="bank-form">
        <AmountInput label="How much" value={amount} onChange={setAmount} max={summarize(pact).remaining} />
        <div className="field">
          <span className="field__label">By when</span>
          <div className="suggest" role="radiogroup" aria-label="Quick dates">
            {quick.map((q) => (
              <button key={q.label} type="button" role="radio" aria-checked={dueOn === q.value} className={`suggest__chip ${dueOn === q.value ? 'is-on' : ''}`} onClick={() => setDueOn(q.value)}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <Input label="Or pick a date" type="date" min={today()} max={pact.deadline} value={dueOn} onChange={(e) => setDueOn(e.target.value)} hint={dueOn ? day(dueOn) : `By ${day(pact.deadline)}, the Pact’s deadline`} />
      </div>
    </Modal>
  );
}
