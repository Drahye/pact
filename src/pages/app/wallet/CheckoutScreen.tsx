import { useQuery } from '@tanstack/react-query';
import { Copy, CreditCard, FlaskConical, Lock } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { TopupDTO } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { api, ApiError } from '../../../api/client';
import { ErrorState, Notice } from '../../../components/app/States';
import { FormSkeleton } from '../../../components/app/Skeleton';
import { Button } from '../../../components/ui/Button';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { formatNairaKobo } from '../../../lib/format';
import { Screen } from '../Screen';
import './wallet.css';

type Checkout = TopupDTO & { total: number; transferAccount: { bankName: string; accountNumber: string; accountName: string } };

/**
 * Sandbox stand-in for the payment processor's checkout page. In production this
 * screen is never reached: people pay on the processor's own hosted page.
 */
export function CheckoutScreen() {
  const { ref = '' } = useParams();
  const { config } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<'success' | 'failed' | null>(null);
  const q = useQuery({ queryKey: ['checkout', ref], queryFn: () => api<Checkout>('GET', `/sandbox/checkout/${ref}`), retry: false });

  if (config && !config.sandbox) return <Navigate to={`/app/wallet/topup/${ref}`} replace />;
  if (q.isLoading) return <Screen topBar={<TopBar leading="close" backTo="/app/wallet" />}><FormSkeleton fields={2} label="Loading checkout" /></Screen>;
  if (q.error || !q.data) return <Screen topBar={<TopBar leading="close" backTo="/app/wallet" />}><ErrorState message={(q.error as ApiError)?.message} /></Screen>;
  const c = q.data;
  if (c.status !== 'pending') return <Navigate to={`/app/wallet/topup/${ref}`} replace />;

  const complete = async (outcome: 'success' | 'failed') => {
    setBusy(outcome);
    try {
      await api('POST', `/sandbox/checkout/${ref}/complete`, { outcome });
      navigate(`/app/wallet/topup/${ref}`, { replace: true });
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
      setBusy(null);
    }
  };

  return (
    <Screen
      topBar={<TopBar leading="close" backTo="/app/wallet" title="Checkout" />}
      footer={
        <>
          <Button fullWidth onClick={() => complete('success')} loading={busy === 'success'} disabled={!!busy}>
            {c.channel === 'card' ? `Pay ${formatNairaKobo(c.total)}` : 'I’ve sent the money'}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => complete('failed')} loading={busy === 'failed'} disabled={!!busy}>
            Simulate a failed payment
          </Button>
        </>
      }
      className="checkout"
    >
      <span className="sandbox-tag">
        <FlaskConical aria-hidden /> Sandbox checkout · no real money
      </span>
      <p className="checkout__total num">{formatNairaKobo(c.total)}</p>
      <p className="checkout__ref">Ref {c.reference}</p>

      {c.channel === 'card' ? (
        <div className="checkout__card" aria-label="Test card">
          <div className="checkout__card-top">
            <CreditCard aria-hidden />
            <span>Test Verve card</span>
          </div>
          <p className="num checkout__pan">5060 6666 6666 6666 666</p>
          <div className="checkout__card-meta num">
            <span>12 / 30</span>
            <span>CVV 123</span>
          </div>
        </div>
      ) : (
        <div className="summary">
          <div className="summary__row">
            <span>Bank</span>
            <strong>{c.transferAccount.bankName}</strong>
          </div>
          <div className="summary__row">
            <span>Account number</span>
            <strong className="num">
              {c.transferAccount.accountNumber}{' '}
              <button type="button" className="checkout__copy" aria-label="Copy account number" onClick={() => navigator.clipboard?.writeText(c.transferAccount.accountNumber).then(() => toast('Copied'))}>
                <Copy />
              </button>
            </strong>
          </div>
          <div className="summary__row">
            <span>Account name</span>
            <strong>{c.transferAccount.accountName}</strong>
          </div>
          <div className="summary__row summary__row--total">
            <span>Send exactly</span>
            <strong className="num">{formatNairaKobo(c.total)}</strong>
          </div>
        </div>
      )}

      <Notice icon={<Lock />}>
        In production this is the payment partner’s secure page. Your wallet is credited only when the partner confirms the payment to our server, never on this screen’s word.
      </Notice>
    </Screen>
  );
}
