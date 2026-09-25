import { Building2, CreditCard, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MIN_TOPUP, topupFee } from '../../../../shared/policy';
import { useAuth } from '../../../api/auth';
import { ApiError, newIdempotencyKey } from '../../../api/client';
import { usePact, useStartTopup, useWallet } from '../../../api/hooks';
import { Notice } from '../../../components/app/States';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Button } from '../../../components/ui/Button';
import { Segmented } from '../../../components/ui/Segmented';
import { TopBar } from '../../../components/ui/TopBar';
import { formatNaira, formatNairaKobo, toKobo } from '../../../lib/format';
import { Screen } from '../Screen';
import './wallet.css';

const QUICK = [5_000, 10_000, 20_000, 50_000];
export const TOPUP_RETURN_KEY = 'pact.topupReturn';

export function TopupScreen() {
  const [params] = useSearchParams();
  const { config } = useAuth();
  const navigate = useNavigate();
  const wallet = useWallet();
  const start = useStartTopup();
  const [amount, setAmount] = useState(() => Math.max(0, Number(params.get('amount')) || 10_000));
  const [channel, setChannel] = useState<'bank_transfer' | 'card'>('bank_transfer');
  const [error, setError] = useState<{ message: string; remaining?: number }>();
  const [key, setKey] = useState(newIdempotencyKey);
  const pactId = params.get('pact') ?? undefined;
  const pactQ = usePact(pactId);
  const pactTitle = pactQ.data?.pact.title;
  const returnTo = params.get('return') ?? (pactId ? `/app/pact/${pactId}` : null);

  const kobo = toKobo(amount);
  const fee = topupFee(kobo, channel);
  const valid = kobo >= MIN_TOPUP;

  const change = (fn: () => void) => {
    fn();
    setError(undefined);
    setKey(newIdempotencyKey());
  };

  const submit = async () => {
    setError(undefined);
    try {
      const t = await start.mutateAsync({ amount: kobo, channel, key, pactId });
      try {
        if (returnTo?.startsWith('/app/')) sessionStorage.setItem(TOPUP_RETURN_KEY, returnTo);
        else sessionStorage.removeItem(TOPUP_RETURN_KEY);
      } catch {
        /* ignore */
      }
      const url = new URL(t.checkoutUrl!, window.location.origin);
      // The sandbox checkout lives inside the app; a real processor's page is on its own domain.
      if (url.origin === window.location.origin) navigate(url.pathname);
      else window.location.assign(url.toString());
    } catch (err) {
      const e = err as ApiError;
      setError({ message: e.message, remaining: typeof e.details.remaining === 'number' ? e.details.remaining : undefined });
    }
  };

  return (
    <Screen
      topBar={<TopBar leading="close" backTo={returnTo ?? '/app/wallet'} title={pactId ? 'Contribute' : 'Top up'} />}
      footer={
        <>
          <Button fullWidth onClick={submit} loading={start.isPending} disabled={!valid}>
            {valid ? `Pay ${formatNairaKobo(kobo + fee)}` : `Enter at least ${formatNairaKobo(MIN_TOPUP)}`}
          </Button>
          <p className="wallet__secure">
            <ShieldCheck aria-hidden /> {config?.sandbox ? 'Sandbox mode: no real money moves.' : 'Payments are processed by our payment partner.'}
          </p>
        </>
      }
      className="topup"
    >
      <h1 className="large-title">{pactId ? `Pay into ${pactTitle ?? 'your Pact'}` : 'Add money'}</h1>
      <p className="screen-lede">
        {pactId ? (
          'It goes straight into the Pact as your contribution once the payment is confirmed.'
        ) : (
          <>
            Balance <span className="num">{wallet.data ? formatNairaKobo(wallet.data.balance) : '…'}</span>
          </>
        )}
      </p>

      <div className="topup__amount">
        <AmountInput label="Amount" hideLabel value={amount} onChange={(v) => change(() => setAmount(v))} size="xl" align="center" max={10_000_000} />
      </div>
      <Segmented<string>
        label="Quick amounts"
        variant="chips"
        value={QUICK.includes(amount) ? String(amount) : null}
        onChange={(v) => change(() => setAmount(Number(v)))}
        options={QUICK.map((q) => ({ value: String(q), label: formatNaira(q).replace(',000', 'k') }))}
      />

      <p className="menu-label">Pay with</p>
      <div className="choices" role="radiogroup" aria-label="Payment method">
        <button type="button" role="radio" aria-checked={channel === 'bank_transfer'} className={`choice ${channel === 'bank_transfer' ? 'is-on' : ''}`} onClick={() => change(() => setChannel('bank_transfer'))}>
          <span className="choice__icon tint--mint"><Building2 /></span>
          <span className="choice__text">
            <span className="choice__title">Bank transfer</span>
            <span className="choice__sub">Free · arrives in seconds</span>
          </span>
          <span className="choice__radio" aria-hidden />
        </button>
        <button type="button" role="radio" aria-checked={channel === 'card'} className={`choice ${channel === 'card' ? 'is-on' : ''}`} onClick={() => change(() => setChannel('card'))}>
          <span className="choice__icon tint--sky"><CreditCard /></span>
          <span className="choice__text">
            <span className="choice__title">Debit card</span>
            <span className="choice__sub">1.5% card fee, capped at ₦2,000</span>
          </span>
          <span className="choice__radio" aria-hidden />
        </button>
      </div>

      {valid && (
        <div className="summary topup__summary">
          <div className="summary__row">
            <span>{pactId ? 'Your contribution' : 'Added to wallet'}</span>
            <strong className="num">{formatNairaKobo(kobo)}</strong>
          </div>
          <div className="summary__row">
            <span>Fee</span>
            <strong className="num">{fee ? formatNairaKobo(fee) : 'Free'}</strong>
          </div>
          <div className="summary__row summary__row--total">
            <span>You pay</span>
            <strong className="num">{formatNairaKobo(kobo + fee)}</strong>
          </div>
        </div>
      )}

      {error && (
        <Notice tone="danger">
          {error.message}
          {error.remaining !== undefined && error.remaining > 0 && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => change(() => setAmount(Math.floor(error.remaining! / 100)))}>
                Top up {formatNairaKobo(error.remaining)} instead
              </button>
            </>
          )}
        </Notice>
      )}
    </Screen>
  );
}
