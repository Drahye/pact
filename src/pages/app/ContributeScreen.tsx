import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, CreditCard, LockKeyhole, Wallet } from 'lucide-react';
import { useAuth } from '../../api/auth';
import { newIdempotencyKey } from '../../api/client';
import { useContribute, usePact, useWallet } from '../../api/hooks';
import { PinSheet } from '../../components/app/PinSheet';
import { AmountSkeleton } from '../../components/app/Skeleton';
import { SegmentedBar } from '../../components/pact/SegmentedBar';
import { SegmentedRing } from '../../components/pact/SegmentedRing';
import { AnimatedNumber } from '../../components/pact/AnimatedNumber';
import { HoldButton } from '../../components/ui/HoldButton';
import { getUser } from '../../data/users';
import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { TopBar } from '../../components/ui/TopBar';
import { clearDraft, readDraft, useSaveDraft } from '../../lib/drafts';
import { formatNaira, formatNairaCompact, formatNairaKobo, formatPercent, fromKobo, toKobo } from '../../lib/format';
import { sharesOf, summarize } from '../../lib/pact';
import { ease, spring } from '../../tokens/tokens';
import { Screen } from './Screen';
import './contribute.css';

const PRESETS = [5_000, 10_000, 25_000];

/** A restrained burst: six shapes in friends' colours, once. */
const burst = [
  { x: -120, y: -70, r: 40, c: '#ffc53d', k: 'circle' },
  { x: 118, y: -84, r: -30, c: '#4da3ff', k: 'square' },
  { x: -140, y: 40, r: 60, c: '#ff6fb5', k: 'square' },
  { x: 136, y: 30, r: 20, c: '#9b7bff', k: 'circle' },
  { x: -60, y: -120, r: -45, c: '#ff7a5c', k: 'pill' },
  { x: 70, y: -128, r: 35, c: '#22b8a6', k: 'pill' },
];
type Choice = '5000' | '10000' | '25000' | 'custom';

export function ContributeScreen() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = usePact(id);
  const wallet = useWallet();
  const contribute = useContribute(id);
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const pact = q.data?.pact;
  const [params] = useSearchParams();
  // "Cover the rest" and "Add your share" arrive with an amount.
  // A typed amount is remembered unless the link brought one.
  const draftKey = `contribute.${id}`;
  const [saved] = useState(() => (Number(params.get('amount')) > 0 ? null : readDraft<{ amount: number }>(draftKey)));
  const [amount, setAmount] = useState<number | null>(() => (Number(params.get('amount')) > 0 ? Math.floor(Number(params.get('amount'))) : saved?.amount ?? null));
  const [choice, setChoice] = useState<Choice | null>(saved ? (PRESETS.includes(saved.amount) ? (String(saved.amount) as Choice) : 'custom') : null);
  const [phase, setPhase] = useState<'enter' | 'done'>('enter');
  const [source, setSource] = useState<'balance' | 'other' | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [before, setBefore] = useState(0);
  const [given, setGiven] = useState(0);
  // One key per intent: retries after a wrong PIN reuse it, so a double tap can never pay twice.
  const [intentKey, setIntentKey] = useState(newIdempotencyKey);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set while our own contribution is in flight, so completing the goal shows the confirmation
  // instead of the "already funded" redirect.
  const paying = useRef(false);
  useSaveDraft(draftKey, { amount: amount ?? 0 }, !amount, phase === 'enter');

  if (q.isLoading) return <Screen topBar={<TopBar leading="close" backTo={`/app/pact/${id}`} title="Contribute" />}><AmountSkeleton label="Loading" /></Screen>;
  if (!pact) return <Navigate to="/app/home" replace />;
  const s = summarize(pact);
  const base = `/app/pact/${pact.id}`;
  if (s.isFunded && phase === 'enter' && !paying.current) return <Navigate to={base} replace />;

  const suggested = pact.viewer?.suggestedShare || 0;
  const defaultAmount = suggested > 0 ? Math.min(suggested, s.remaining) : Math.min(25_000, s.remaining);
  const value = amount ?? defaultAmount;
  const capped = Math.min(value, s.remaining);
  const balance = wallet.data ? fromKobo(wallet.data.balance) : undefined;
  const short = balance !== undefined && capped > balance ? Math.ceil(capped - balance) : 0;
  const have = Math.floor(balance ?? 0);
  // Start from the PACT balance when there is one (topping up only the difference); otherwise a card or transfer.
  const payWith: 'balance' | 'other' = source ?? (have > 0 ? 'balance' : 'other');
  const after = s.raised + capped;
  const afterPct = (after / Math.max(1, s.target)) * 100;

  const pick = (c: Choice) => {
    setChoice(c);
    if (c === 'custom') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else setAmount(Number(c));
    setIntentKey(newIdempotencyKey());
  };

  const onType = (v: number) => {
    setAmount(v);
    setIntentKey(newIdempotencyKey());
    setChoice(PRESETS.includes(v) ? (String(v) as Choice) : 'custom');
  };

  const submit = async (pin: string) => {
    const raisedBefore = s.raised;
    paying.current = true;
    try {
      await contribute.mutateAsync({ amount: toKobo(capped), pin, key: intentKey });
    } catch (err) {
      paying.current = false;
      throw err;
    }
    clearDraft(draftKey);
    setBefore(raisedBefore);
    setGiven(capped);
    setPinOpen(false);
    setPhase('done');
  };

  const me = getUser(user?.id ?? '');

  if (phase === 'done') {
    const completed = before + given >= pact.target;
    return (
      <Screen
        tone="mint"
        className="confirm"
        footer={
          <Button fullWidth onClick={() => navigate(base, { replace: true, state: { fromRaised: before } })}>
            {completed ? 'See it complete' : `Back to ${pact.title}`}
          </Button>
        }
      >
        <div className="confirm__body">
          <div className="confirm__burst" aria-hidden>
            {burst.map((b, i) => (
              <motion.span
                key={i}
                className={`confirm__shape confirm__shape--${b.k}`}
                style={{ background: b.c }}
                initial={reduce ? false : { x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
                animate={{ x: b.x, y: b.y, scale: 1, rotate: b.r, opacity: reduce ? 1 : [1, 1, 0.9] }}
                transition={{ duration: 1.1, ease: ease.out, delay: 0.1 }}
              />
            ))}
          </div>
          <SegmentedRing shares={sharesOf(pact)} target={pact.target} size={176} stroke={16} delay={0.2} label={`${pact.title} progress`}>
            <motion.span
              className="confirm__check"
              initial={reduce ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring.pop}
              aria-hidden
            >
              <Check strokeWidth={3} />
            </motion.span>
          </SegmentedRing>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ease.out, delay: 0.15 }}
          >
            <h1 className="confirm__title">You’re in.</h1>
            <p className="confirm__line">
              <strong className="num">{formatNaira(given)}</strong> added to {pact.title}.
              {completed && ' That completed the goal.'}
            </p>
          </motion.div>
          <motion.div
            className="confirm__card"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ease.out, delay: 0.3 }}
          >
            <div className="confirm__row">
              <p className="confirm__raised">
                <AnimatedNumber value={before + given} from={before} />
                <span className="num"> / {formatNaira(pact.target)}</span>
              </p>
              <span className="confirm__delta num" style={{ ['--c' as string]: me.color }}>
                +{formatNaira(given)}
              </span>
            </div>
            <SegmentedBar shares={sharesOf(pact)} target={pact.target} size="md" label="Funded" />
            <p className="confirm__meta num">
              <AnimatedNumber value={((before + given) / Math.max(1, pact.target)) * 100} from={(before / Math.max(1, pact.target)) * 100} format="percent" /> funded · {s.daysLeft} days left
            </p>
          </motion.div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      topBar={<TopBar leading="close" backTo={base} title="Contribute" />}
      footer={
        <>
          {capped < 100 ? (
            <Button fullWidth disabled>
              Enter at least ₦100
            </Button>
          ) : payWith === 'balance' && short === 0 ? (
            <HoldButton label={`Hold to add ${formatNaira(capped)}`} onComplete={() => setPinOpen(true)} disabled={balance === undefined} />
          ) : payWith === 'balance' && have > 0 ? (
            <Button fullWidth to={`/app/wallet/topup?amount=${Math.max(100, short)}&return=${encodeURIComponent(`/app/pact/${pact.id}/contribute?amount=${capped}`)}`}>
              Pay the remaining {formatNaira(Math.max(100, short))} by transfer or card
            </Button>
          ) : (
            <Button fullWidth to={`/app/wallet/topup?amount=${capped}&pact=${pact.id}`}>
              Add {formatNaira(capped)} by transfer or card
            </Button>
          )}
          <p className="contribute__secure">
            <LockKeyhole aria-hidden /> {payWith === 'balance' && short === 0 ? 'Hold, then confirm with your PIN · ' : ''}Everyone in the Pact sees it
          </p>
        </>
      }
      className="contribute"
    >
      <h1 className="large-title">Add to {pact.title}</h1>

      <div className="contribute__status">
        <div className="contribute__status-row">
          <p className="num">
            <strong>{formatNaira(s.raised)}</strong> / {formatNaira(s.target)}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={Math.round(afterPct)}
              className="contribute__after"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {capped ? <>→ {formatPercent(afterPct)}</> : formatPercent(s.percent)}
            </motion.p>
          </AnimatePresence>
        </div>
        <SegmentedBar shares={sharesOf(pact)} target={pact.target} preview={{ amount: capped, color: me.color }} size="md" label="Current progress" />
      </div>

      <div className="contribute__amount">
        <AmountInput ref={inputRef} label="Amount" hideLabel value={value} onChange={onType} size="xl" align="center" max={s.remaining} />
        {value >= s.remaining && s.remaining > 0 ? (
          <p className="contribute__hint contribute__hint--accent">This covers the rest of the goal</p>
        ) : (
          <button type="button" className="contribute__hint contribute__fill" onClick={() => onType(s.remaining)}>
            {formatNaira(s.remaining)} to go · <span>Cover the rest</span>
          </button>
        )}
      </div>

      <Segmented<Choice>
        label="Quick amounts"
        variant="chips"
        value={choice ?? (PRESETS.includes(value) ? (String(value) as Choice) : 'custom')}
        onChange={pick}
        options={[...PRESETS.map((p) => ({ value: String(p) as Choice, label: formatNairaCompact(p) })), { value: 'custom', label: 'Custom' }]}
      />

      {capped >= 100 && (
        <div className="contribute__pay">
          <p className="menu-label">Pay with</p>
          <div className="choices" role="radiogroup" aria-label="Pay with">
            {have > 0 && (
              <button type="button" role="radio" aria-checked={payWith === 'balance'} className={`choice ${payWith === 'balance' ? 'is-on' : ''}`} onClick={() => setSource('balance')}>
                <span className="choice__icon tint--sun"><Wallet /></span>
                <span className="choice__text">
                  <span className="choice__title">PACT balance</span>
                  <span className="choice__sub num">{formatNairaKobo(wallet.data?.balance ?? 0)} available</span>
                </span>
                <span className="choice__radio" aria-hidden />
              </button>
            )}
            <button type="button" role="radio" aria-checked={payWith === 'other'} className={`choice ${payWith === 'other' ? 'is-on' : ''}`} onClick={() => setSource('other')}>
              <span className="choice__icon tint--sky"><CreditCard /></span>
              <span className="choice__text">
                <span className="choice__title">Bank transfer or card</span>
                <span className="choice__sub">Transfer is free. Cards show their fee first.</span>
              </span>
              <span className="choice__radio" aria-hidden />
            </button>
          </div>
          {payWith === 'balance' && short > 0 && have > 0 && (
            <p className="contribute__shortfall num">
              You have {formatNaira(have)} in PACT. Pay the remaining {formatNaira(short)} by transfer or card, then this goes in.
            </p>
          )}
        </div>
      )}

      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title={`Send ${formatNaira(capped)}`}
        description={<>To {pact.title}. Enter your PIN to confirm.</>}
        onSubmit={submit}
      />
    </Screen>
  );
}
