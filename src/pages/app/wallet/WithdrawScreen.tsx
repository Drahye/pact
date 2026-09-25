import { motion, useReducedMotion } from 'framer-motion';
import { Check, Landmark, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MIN_WITHDRAWAL, TIER_LIMITS, WITHDRAWAL_FEE } from '../../../../shared/policy';
import { newIdempotencyKey } from '../../../api/client';
import { useBankAccounts, useWallet, useWithdraw, useWithdrawal } from '../../../api/hooks';
import { PinSheet } from '../../../components/app/PinSheet';
import { Loading, Notice } from '../../../components/app/States';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Button } from '../../../components/ui/Button';
import { TopBar } from '../../../components/ui/TopBar';
import { formatNairaKobo, fromKobo, toKobo } from '../../../lib/format';
import { spring } from '../../../tokens/tokens';
import { Screen } from '../Screen';
import { AddBankSheet } from './AddBankSheet';
import './wallet.css';

export function WithdrawScreen() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const wallet = useWallet();
  const accounts = useBankAccounts();
  const withdraw = useWithdraw();
  const [amount, setAmount] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const [reference, setReference] = useState<string>();
  const status = useWithdrawal(reference);

  const balance = wallet.data?.balance ?? 0;
  const tier = wallet.data?.tier ?? 1;
  const remainingToday = TIER_LIMITS[tier].dailyWithdrawal - (wallet.data?.usage.withdrawnToday ?? 0);
  const kobo = toKobo(amount);
  const max = Math.max(0, Math.min(balance - WITHDRAWAL_FEE, remainingToday));
  const account = accounts.data?.find((a) => a.id === (chosen ?? accounts.data.find((x) => x.isDefault)?.id ?? accounts.data[0]?.id));
  const problem =
    kobo && kobo < MIN_WITHDRAWAL ? `The minimum is ${formatNairaKobo(MIN_WITHDRAWAL)}.` : kobo > max ? (kobo + WITHDRAWAL_FEE > balance ? 'That’s more than your balance after the fee.' : `You can withdraw ${formatNairaKobo(remainingToday)} more today.`) : null;
  const valid = kobo >= MIN_WITHDRAWAL && !problem && !!account;

  if (reference) {
    const w = status.data;
    const state = !w || w.status === 'pending' || w.status === 'processing' ? 'sending' : w.status === 'succeeded' ? 'sent' : 'failed';
    return (
      <Screen
        tone={state === 'sent' ? 'mint' : 'bg'}
        className="topup-status"
        footer={
          state !== 'sending' && (
            <Button fullWidth onClick={() => navigate('/app/wallet', { replace: true })}>
              Done
            </Button>
          )
        }
      >
        <div className="topup-status__body">
          {state === 'sending' ? (
            <span className="state__spinner topup-status__spinner" aria-hidden />
          ) : (
            <motion.span className={`topup-status__icon ${state === 'sent' ? 'is-ok' : 'is-bad'}`} initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={spring.pop} aria-hidden>
              {state === 'sent' ? <Check strokeWidth={3} /> : <X strokeWidth={3} />}
            </motion.span>
          )}
          <h1 className="large-title">{state === 'sending' ? 'Sending to your bank' : state === 'sent' ? 'On its way' : 'Transfer returned'}</h1>
          <p className="screen-lede">
            {state === 'failed' ? (
              <>{w?.failureReason}. The full amount, fee included, is back in your wallet.</>
            ) : (
              <>
                <strong className="num">{formatNairaKobo(w?.amount ?? kobo)}</strong> to {account?.bankName} ••{account?.last4}.
              </>
            )}
          </p>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      topBar={<TopBar backTo="/app/wallet" title="Withdraw" />}
      footer={
        accounts.data && !account ? (
          <Button fullWidth iconLeft={<Plus />} onClick={() => setAddOpen(true)}>
            Add a bank account
          </Button>
        ) : (
          <Button fullWidth disabled={!valid} onClick={() => setPinOpen(true)}>
            {valid ? `Withdraw ${formatNairaKobo(kobo)}` : 'Enter an amount'}
          </Button>
        )
      }
      className="topup"
    >
      <h1 className="large-title">Withdraw to bank</h1>
      <p className="screen-lede">
        Available <span className="num">{formatNairaKobo(balance)}</span>
      </p>

      <div className="topup__amount">
        <AmountInput
          label="Amount"
          hideLabel
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setKey(newIdempotencyKey());
          }}
          size="xl"
          align="center"
          max={10_000_000}
        />
        <button type="button" className="contribute__hint contribute__fill" onClick={() => setAmount(Math.floor(fromKobo(max)))} disabled={max <= 0}>
          Withdraw everything · <span className="num">{formatNairaKobo(Math.max(0, max))}</span>
        </button>
      </div>

      <p className="menu-label">To</p>
      {accounts.isLoading ? (
        <Loading />
      ) : (
        <div className="choices" role="radiogroup" aria-label="Bank account">
          {accounts.data?.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={account?.id === a.id} className={`choice ${account?.id === a.id ? 'is-on' : ''}`} onClick={() => setChosen(a.id)}>
              <span className="choice__icon tint--lilac"><Landmark /></span>
              <span className="choice__text">
                <span className="choice__title">{a.bankName}</span>
                <span className="choice__sub num">
                  {a.accountName} · ••{a.last4}
                </span>
              </span>
              <span className="choice__radio" aria-hidden />
            </button>
          ))}
          <button type="button" className="choice choice--add" onClick={() => setAddOpen(true)}>
            <span className="choice__icon"><Plus /></span>
            <span className="choice__text">
              <span className="choice__title">Add a bank account</span>
            </span>
          </button>
        </div>
      )}

      {kobo > 0 && (
        <div className="summary topup__summary">
          <div className="summary__row">
            <span>You receive</span>
            <strong className="num">{formatNairaKobo(kobo)}</strong>
          </div>
          <div className="summary__row">
            <span>Transfer fee</span>
            <strong className="num">{formatNairaKobo(WITHDRAWAL_FEE)}</strong>
          </div>
          <div className="summary__row summary__row--total">
            <span>Taken from wallet</span>
            <strong className="num">{formatNairaKobo(kobo + WITHDRAWAL_FEE)}</strong>
          </div>
        </div>
      )}
      {problem && <Notice tone="danger">{problem}</Notice>}

      <AddBankSheet open={addOpen} onClose={() => setAddOpen(false)} onAdded={(a) => setChosen(a.id)} />
      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title={`Withdraw ${formatNairaKobo(kobo)}`}
        description={account ? <>To {account.bankName} ••{account.last4}. Enter your PIN.</> : undefined}
        onSubmit={async (pin) => {
          const w = await withdraw.mutateAsync({ amount: kobo, bankAccountId: account!.id, pin, key });
          setPinOpen(false);
          setReference(w.reference);
        }}
      />
    </Screen>
  );
}
