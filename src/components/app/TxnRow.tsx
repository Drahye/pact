import { ArrowDownLeft, ArrowUpRight, RotateCcw, Undo2, Wallet } from 'lucide-react';
import type { WalletTxnDTO } from '../../../shared/contracts';
import { formatDateTime, formatNairaKobo } from '../../lib/format';
import '../pact/category.css';
import './app-ui.css';

const meta: Record<WalletTxnDTO['kind'], { icon: JSX.Element; tint: string; label: string }> = {
  topup: { icon: <ArrowDownLeft />, tint: 'mint', label: 'Top up' },
  contribution: { icon: <ArrowUpRight />, tint: 'sky', label: 'Contribution' },
  pact_release: { icon: <Wallet />, tint: 'sun', label: 'Pact funds' },
  withdrawal: { icon: <ArrowUpRight />, tint: 'lilac', label: 'Withdrawal' },
  withdrawal_reversal: { icon: <Undo2 />, tint: 'coral', label: 'Returned' },
  refund: { icon: <RotateCcw />, tint: 'pink', label: 'Refund' },
};

export function TxnRow({ txn, onClick }: { txn: WalletTxnDTO; onClick?: () => void }) {
  const m = meta[txn.kind] ?? meta.topup;
  const title = txn.pactTitle && txn.kind === 'contribution' ? txn.pactTitle : txn.description;
  return (
    <button type="button" className="txn" onClick={onClick}>
      <span className={`txn__icon tint--${m.tint}`} aria-hidden>
        {m.icon}
      </span>
      <span className="txn__text">
        <span className="txn__title">{title}</span>
        <span className="txn__meta">
          {m.label} · {formatDateTime(txn.createdAt)}
        </span>
      </span>
      <span className={`txn__amount num ${txn.amount > 0 ? 'is-in' : ''}`}>
        {txn.amount > 0 ? '+' : '−'}
        {formatNairaKobo(Math.abs(txn.amount))}
      </span>
    </button>
  );
}

export const txnLabel = (kind: WalletTxnDTO['kind']) => meta[kind]?.label ?? 'Transaction';
