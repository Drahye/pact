import { ChevronRight, Landmark, ReceiptText, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WalletTxnDTO } from '../../../../shared/contracts';
import { TIER_LIMITS } from '../../../../shared/policy';
import { useTransactions, useWallet } from '../../../api/hooks';
import { Empty, ErrorState } from '../../../components/app/States';
import { RowListSkeleton } from '../../../components/app/Skeleton';
import { TxnRow, txnLabel } from '../../../components/app/TxnRow';
import { WalletCard } from '../../../components/app/WalletCard';
import { BottomNav } from '../../../components/ui/BottomNav';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Segmented } from '../../../components/ui/Segmented';
import { formatDateTime, formatNairaKobo } from '../../../lib/format';
import { Screen } from '../Screen';
import './wallet.css';

type Filter = 'all' | 'in' | 'out';

export function WalletScreen() {
  const wallet = useWallet();
  const txns = useTransactions();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<WalletTxnDTO | null>(null);
  const tier = wallet.data?.tier ?? 1;
  const limits = TIER_LIMITS[tier];

  const items = useMemo(() => {
    const all = txns.data?.pages.flatMap((p) => p.items) ?? [];
    return filter === 'all' ? all : all.filter((t) => (filter === 'in' ? t.amount > 0 : t.amount < 0));
  }, [txns.data, filter]);

  return (
    <Screen tabBar={<BottomNav />} className="wallet">
      <h1 className="large-title screen-title">Wallet</h1>
      <WalletCard balance={wallet.data?.balance} tier={tier} />

      {wallet.data && (
        <div className="wallet__limits">
          <div className="wallet__limit">
            <p>
              Topped up today <span className="num">{formatNairaKobo(wallet.data.usage.topupToday)} / {formatNairaKobo(limits.dailyTopup)}</span>
            </p>
            <ProgressBar value={(wallet.data.usage.topupToday / limits.dailyTopup) * 100} size="sm" label="Daily top-up used" />
          </div>
          {tier < 2 && (
            <Link to="/app/profile/verify" className="wallet__upgrade">
              <ShieldCheck aria-hidden />
              <span>
                <strong>Raise your limits</strong>
                <span>Verify your BVN to hold up to {formatNairaKobo(TIER_LIMITS[2].maxBalance)}</span>
              </span>
              <ChevronRight aria-hidden />
            </Link>
          )}
          <Link to="/app/profile/banks" className="wallet__upgrade wallet__upgrade--plain">
            <Landmark aria-hidden />
            <span>
              <strong>Bank accounts</strong>
              <span>Where withdrawals go</span>
            </span>
            <ChevronRight aria-hidden />
          </Link>
        </div>
      )}

      <section className="screen-section" aria-labelledby="history">
        <div className="wallet__history-head">
          <h2 id="history" className="section-heading__title">
            History
          </h2>
          <Segmented<Filter>
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'in', label: 'In' },
              { value: 'out', label: 'Out' },
            ]}
          />
        </div>
        {txns.isLoading ? (
          <RowListSkeleton label="Loading transactions" />
        ) : txns.error ? (
          <ErrorState onRetry={() => txns.refetch()} />
        ) : !items.length ? (
          <Empty icon={<ReceiptText />} title="No transactions yet" body="Top-ups, contributions, refunds and withdrawals will show up here." />
        ) : (
          <>
            <div className="txn-list">
              {items.map((t) => (
                <TxnRow key={`${t.id}-${t.amount}`} txn={t} onClick={() => setOpen(t)} />
              ))}
            </div>
            {txns.hasNextPage && (
              <Button variant="ghost" fullWidth onClick={() => txns.fetchNextPage()} loading={txns.isFetchingNextPage}>
                Show more
              </Button>
            )}
          </>
        )}
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? txnLabel(open.kind) : ''} description={open ? formatDateTime(open.createdAt) : undefined}>
        {open && (
          <div className="receipt">
            <p className={`receipt__amount num ${open.amount > 0 ? 'is-in' : ''}`}>
              {open.amount > 0 ? '+' : '−'}
              {formatNairaKobo(Math.abs(open.amount))}
            </p>
            <div className="summary">
              <div className="summary__row">
                <span>Description</span>
                <strong>{open.description}</strong>
              </div>
              {open.pactTitle && (
                <div className="summary__row">
                  <span>Pact</span>
                  <strong>
                    <Link to={`/app/pact/${open.pactId}`}>{open.pactTitle}</Link>
                  </strong>
                </div>
              )}
              <div className="summary__row">
                <span>Balance after</span>
                <strong className="num">{formatNairaKobo(open.balanceAfter)}</strong>
              </div>
              <div className="summary__row">
                <span>Reference</span>
                <strong className="receipt__ref">{open.reference}</strong>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Screen>
  );
}
