import { motion, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { keys, usePact, useTopup } from '../../../api/hooks';
import { ErrorState } from '../../../components/app/States';
import { FormSkeleton } from '../../../components/app/Skeleton';
import { Button } from '../../../components/ui/Button';
import { formatNairaKobo } from '../../../lib/format';
import { spring } from '../../../tokens/tokens';
import { safeAppPath } from '../auth/flow';
import { Screen } from '../Screen';
import { TOPUP_RETURN_KEY } from './TopupScreen';
import './wallet.css';

const readReturn = () => {
  try {
    return safeAppPath(sessionStorage.getItem(TOPUP_RETURN_KEY));
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
  const pactQ = usePact(t?.pactId ?? undefined);

  useEffect(() => {
    if (t?.status === 'succeeded') {
      if (t.pactId) {
        qc.invalidateQueries({ queryKey: keys.pact(t.pactId) });
        qc.invalidateQueries({ queryKey: keys.pacts });
        qc.invalidateQueries({ queryKey: keys.activity });
      }
      qc.invalidateQueries({ queryKey: keys.wallet });
      qc.invalidateQueries({ queryKey: keys.txns });
      qc.invalidateQueries({ queryKey: keys.notifications });
    }
  }, [t?.status, qc]);

  if (q.error) return <Screen><ErrorState onRetry={() => q.refetch()} /></Screen>;
  if (!t) return <Screen><FormSkeleton fields={1} label="Checking your payment" /></Screen>;

  const back = t.pactId ? `/app/pact/${t.pactId}` : readReturn();
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
            {t.pactId ? 'Back to the Pact' : back?.includes('/contribute') ? 'Continue to contribute' : 'Done'}
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
        <h1 className="large-title">{ok ? (t.pactId ? 'You’re in.' : 'Money added') : 'Payment didn’t go through'}</h1>
        <p className="screen-lede">
          {ok ? (
            t.pactId ? (
              <>
                <strong className="num">{formatNairaKobo(t.amount)}</strong> added to {pactQ.data?.pact.title ?? 'your Pact'}.
              </>
            ) : (
              <>
                <strong className="num">{formatNairaKobo(t.amount)}</strong> is in your wallet.
              </>
            )
          ) : (
            (t.failureReason === 'amount_mismatch' ? 'The amount paid didn’t match. Any money taken will be returned.' : t.failureReason) ?? 'Nothing was charged.'
          )}
        </p>
      </div>
    </Screen>
  );
}
