import { Receipt } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MIN_PACT_TARGET, NGN } from '../../../shared/policy';
import { TEMPLATES } from '../../../shared/templates';
import { ApiError, newIdempotencyKey } from '../../api/client';
import { useCreatePact, usePacts } from '../../api/hooks';
import { Notice } from '../../components/app/States';
import { categoryMeta } from '../../components/pact/category';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { CreateShell } from '../../components/create/CreateShell';
import { DateField, StepHint } from '../../components/create/fields';
import { useFinish } from '../../components/create/useFinish';
import type { PactCategory } from '../../data/types';
import { addDaysIso, isoDay } from '../../lib/dates';
import { daysUntil, formatDate, formatDaysLeft, formatNaira, toKobo } from '../../lib/format';
import { trackOnboarding } from './track';
import './guided-start.css';

/** What people say they are planning, and the kind of Pact that fits it. */
const KINDS: { label: string; category: PactCategory; icon?: ReactNode }[] = [
  { label: 'Birthday', category: 'birthday' },
  { label: 'Trip', category: 'trip' },
  { label: 'Wedding', category: 'wedding' },
  { label: 'Group gift', category: 'gift' },
  { label: 'Dinner / event', category: 'event' },
  { label: 'Shared expense', category: 'other', icon: <Receipt /> },
  { label: 'Home / moving', category: 'household' },
  { label: 'Something else', category: 'other' },
];

const WHEN = [
  { label: 'In 2 weeks', days: 14 },
  { label: 'In a month', days: 30 },
  { label: 'In 2 months', days: 60 },
];
const AMOUNTS = [50_000, 100_000, 250_000, 500_000];
const MIN_TARGET = MIN_PACT_TARGET / NGN;
const STARTING_POINT = 100_000;
const STEPS = 4;

/**
 * Starting a first Pact in four small questions: what, name, when, roughly how much. Everything else (a budget, tasks,
 * approval rules) is deliberately left for later, when it is useful. It creates the same real Pact as the full form,
 * then goes straight to inviting people.
 */
export function GuidedStartScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const create = useCreatePact();
  const pacts = usePacts();
  const from = (location.state as { from?: string } | null)?.from;
  // Started from inside a Circle: the Pact belongs to it (the server checks they are in it).
  const circleParam = params.get('circle') ?? '';
  const circleId = /^[0-9a-f-]{36}$/i.test(circleParam) ? circleParam : undefined;
  // "Do another dinner" arrives with the kind of the last Pact; a few kinds share a tile here.
  const asked = params.get('category');
  const preset = (KINDS.find((k) => k.category === (asked === 'dinner' ? 'event' : asked === 'fund' ? 'other' : asked))?.category ?? null) as PactCategory | null;

  const [step, setStep] = useState(preset ? 2 : 1);
  const [kindLabel, setKindLabel] = useState<string | null>(preset ? KINDS.find((k) => k.category === preset)!.label : null);
  const [category, setCategory] = useState<PactCategory | null>(preset);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [target, setTarget] = useState(0);
  const [roughly, setRoughly] = useState(false);
  const [error, setError] = useState<string>();
  const key = useRef(newIdempotencyKey()).current;
  const [titleSeen, setTitleSeen] = useState(false);
  const { done, finish } = useFinish();
  const minDate = isoDay(new Date(Date.now() + 86_400_000));

  // The funnel's first step: only for someone who has no Pact yet, once.
  const hasAny = (pacts.data ?? []).some((p) => p.viewer?.status === 'joined');
  useEffect(() => {
    if (pacts.isSuccess && !hasAny) trackOnboarding('first_pact_started', { from: from === 'onboarding' ? 'onboarding' : 'home' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacts.isSuccess]);
  useEffect(() => {
    if (step === 2) setTitleSeen(false);
  }, [step]);

  const template = TEMPLATES[category ?? 'other'];
  const valid = useMemo(() => {
    if (step === 1) return !!category;
    if (step === 2) return title.trim().length > 0;
    if (step === 3) return !!deadline && deadline >= minDate;
    return roughly || target >= MIN_TARGET;
  }, [step, category, title, deadline, minDate, roughly, target]);

  const back = () => (step > 1 && !(preset && step === 2) ? setStep(step - 1) : navigate(-1));

  const next = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    if (step < STEPS) return setStep(step + 1);
    setError(undefined);
    try {
      const r = await create.mutateAsync({
        key,
        input: { title: title.trim(), category: category!, target: toKobo(roughly ? STARTING_POINT : target), tasks: [], deadline, missedGoalPolicy: 'refund', splitMode: 'flexible', inviteUserIds: [], invitePhones: [], ...(circleId ? { circleId } : {}) },
      });
      finish({ title: 'Your Pact is made', line: title.trim(), strong: true }, `/app/pact/${r.data.pact.id}/invite`, { replace: true, state: { created: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We couldn’t create that. Check your connection and try again.');
    }
  };

  const titles = ['What are you planning?', 'What should we call it?', 'When should this happen?', 'Roughly how much might the group need?'];
  const subs = ['Pick the closest. You can always change it.', 'A name your people will recognise.', 'A date to aim for. Not sure? Choose the nearest.', 'A rough number is fine. Add what the money covers later.'];
  const keys = ['kind', 'name', 'when', 'amount'];
  const quick = WHEN.map((w) => ({ label: w.label, value: addDaysIso(isoDay(new Date()), w.days) }));
  const dirty = !!category || !!title.trim() || !!deadline || target > 0;

  return (
    <CreateShell
      kind="pact"
      stepIndex={step - 1}
      steps={STEPS}
      stepKey={keys[step - 1]}
      onBack={back}
      onLeave={() => navigate(-1)}
      dirty={dirty && !preset}
      done={done}
      heading={titles[step - 1]}
      sub={subs[step - 1]}
      context={step > 1 && kindLabel && category ? <><span className="gs__ctx-icon" aria-hidden>{categoryMeta[category].icon}</span> {kindLabel}</> : undefined}
      footer={
        <Button fullWidth onClick={() => void next()} disabled={!valid || !!done} loading={create.isPending}>
          {step < STEPS ? 'Next' : 'Create Pact'}
        </Button>
      }
    >
      {error && <Notice tone="danger">{error}</Notice>}

      {step === 1 && (
        <div className="gs__kinds" role="radiogroup" aria-label="What are you planning?">
          {KINDS.map((k) => (
            <button
              key={k.label}
              type="button"
              role="radio"
              aria-checked={kindLabel === k.label}
              className={`gs__kind tint--${categoryMeta[k.category].tint} ${kindLabel === k.label ? 'is-on' : ''}`}
              onClick={() => {
                setKindLabel(k.label);
                setCategory(k.category);
              }}
            >
              <span className="gs__kind-icon" aria-hidden>
                {k.icon ?? categoryMeta[k.category].icon}
              </span>
              {k.label}
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <>
          <Input label="Name" placeholder={template.placeholder} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && void next()} autoComplete="off" autoFocus enterKeyHint="next" />
          <StepHint show={!title.trim() && titleSeen}>Give it a name to continue.</StepHint>
        </>
      )}

      {step === 3 && <DateField label="Or pick a date" value={deadline} min={minDate} quick={quick} onChange={setDeadline} hint={deadline ? `${formatDate(deadline)} · ${daysUntil(deadline) ? formatDaysLeft(daysUntil(deadline)) : 'Due today'}` : 'Up to a year from today'} />}

      {step === 4 && (
        <>
          <AmountInput label="Rough amount" value={roughly ? 0 : target} onChange={(v) => { setRoughly(false); setTarget(v); }} size="xl" />
          <div className="gs__chips" role="group" aria-label="Quick amounts">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" aria-pressed={!roughly && target === a} className={`suggest__chip num ${!roughly && target === a ? 'is-on' : ''}`} onClick={() => { setRoughly(false); setTarget(a); }}>
                {formatNaira(a)}
              </button>
            ))}
            <button type="button" aria-pressed={roughly} className={`suggest__chip ${roughly ? 'is-on' : ''}`} onClick={() => { setRoughly(true); setTarget(0); }}>
              Not sure yet
            </button>
          </div>
          {roughly && <p className="cf__sub">We’ll start at {formatNaira(STARTING_POINT)} as a placeholder.</p>}
        </>
      )}
    </CreateShell>
  );
}
