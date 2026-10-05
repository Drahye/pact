import { Check } from 'lucide-react';
import '../ask/ask.css';
import './split.css';

/** Owes / Settled, always as words with a mark, never colour alone. */
export function ShareStatus({ status, payer }: { status: 'not_applicable' | 'owed' | 'settled'; payer?: boolean }) {
  if (payer || status === 'not_applicable') return <span className="split-status split-status--paid">Paid originally</span>;
  return status === 'settled' ? (
    <span className="split-status split-status--settled">
      Settled <Check aria-hidden strokeWidth={3} />
    </span>
  ) : (
    <span className="split-status split-status--owed">Owes</span>
  );
}
