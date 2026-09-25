import { motion, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { keys, useTopup } from '../../../api/hooks';
import { ErrorState, Loading } from '../../../components/app/States';
import { Button } from '../../../components/ui/Button';
import { formatNairaKobo } from '../../../lib/format';
import { spring } from '../../../tokens/tokens';
import { Screen } from '../Screen';
import { TOPUP_RETURN_KEY } from './TopupScreen';
import './wallet.css';

const readReturn = () => {
  try {
    return sessionStorage.getItem(TOPUP_RETURN_KEY);
  } catch {
    return null;
  }
};

/** Where people land after checkout. Polls until the server has the processor's answer. */
export function TopupStatusScreen() {
  const { ref = '' } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const q = useTopup(ref, true);
  const t = q.data;

  useEffect(() => {
    if (t?.status === 'succeeded') {
      qc.invalidateQueries({ queryKey: keys.wallet });
      qc.invalidateQueries({ queryKey: keys.txns });
      qc.invalidateQueries({ queryKey: keys.notifications });
    }
  }, [t?.status, qc]);

  if (q.error) return <Screen><ErrorState onRetry={() => q.refetch()} /></Screen>;
  if (!t) return <Screen><Loading /></Screen>;

  const back = readReturn();
  const done = () => {
    try {
      sessionStorage.removeItem(TOPUP_RETURN_KEY);
    } catch {
      /* ignore */
    }
    navigate(back ?? '/app/wallet', { replace: true });
  };

  if (t.status === 'pending') {
    return (
      <Screen className="topup-status">
        <div className="topup-status__body">
          <span className="state__spinner topup-status__spinner" aria-hidden />
          <h1 className="large-title">Confirming your payment</h1>
          <p className="screen-lede">This usually takes a few seconds. You can leave this screen; we’ll notify you.</p>
        </div>
      </Screen>
    );
  }

  const ok = t.status === 'succeeded';
  return (
    <Screen
      tone={ok ? 'mint' : 'bg'}
      className="topup-status"
      footer={
        ok ? (
          <Button fullWidth onClick={done}>
            {back?.includes('/contribute') ? 'Continue to contribute' : 'Done'}
          </Button>
        ) : (
          <>
            <Button fullWidth to="/app/wallet/topup">
              Try again
            </Button>
            <Button variant="secondary" fullWidth onClick={done}>
              Back
            </Button>
          </>
        )
      }
    >
      <div className="topup-status__body">
        <motion.span
          className={`topup-status__icon ${ok ? 'is-ok' : 'is-bad'}`}
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.pop}
          aria-hidden
        >
          {ok ? <Check strokeWidth={3} /> : <X strokeWidth={3} />}
        </motion.span>
        <h1 className="large-title">{ok ? 'Money added' : 'Payment didn’t go through'}</h1>
        <p className="screen-lede">
          {ok ? (
            <>
              <strong className="num">{formatNairaKobo(t.amount)}</strong> is in your wallet.
            </>
          ) : (
            (t.failureReason === 'amount_mismatch' ? 'The amount paid didn’t match. Any money taken will be returned.' : t.failureReason) ?? 'Nothing was charged.'
          )}
        </p>
      </div>
    </Screen>
  );
}
