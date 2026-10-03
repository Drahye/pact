import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCircles } from '../../../api/circles';
import { ApiError } from '../../../api/client';
import { useCreatePlan } from '../../../api/plans';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { QuickCircle } from '../../../components/circle/QuickCircle';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { TopBar } from '../../../components/ui/TopBar';
import { isoDay } from '../../../lib/dates';
import { inferCategory } from '../../../lib/pact';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';

type Step = 'title' | 'when' | 'where' | 'budget' | 'circle';
const EXAMPLES = ['Ghana in December', 'Dinner on Friday', 'Beach Day', 'Sarah’s birthday'];

/** Quick on purpose: only the title is needed. When, where and a rough budget can wait. */
export function CreatePlanScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const circles = useCircles();
  const preCircle = params.get('circle') ?? '';
  const today = isoDay(new Date());
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState(0);
  const [circleId, setCircleId] = useState(preCircle);
  const [madeCircle, setMadeCircle] = useState(false);
  const [step, setStep] = useState<Step>('title');
  const [error, setError] = useState<string>();
  const list = circles.data ?? [];
  const chosen = circleId || (list.length === 1 ? list[0].id : '');
  const create = useCreatePlan(chosen);
  const needsCircleStep = !preCircle && (list.length !== 1 || madeCircle);
  const steps = useMemo<Step[]>(() => (needsCircleStep ? ['title', 'when', 'where', 'budget', 'circle'] : ['title', 'when', 'where', 'budget']), [needsCircleStep]);
  const idx = Math.max(0, steps.indexOf(step));
  const last = idx === steps.length - 1;
  const optional = step === 'when' || step === 'where' || step === 'budget';
  const dateBad = !!endDate && (!date || endDate < date);
  const valid = step === 'title' ? !!title.trim() : step === 'when' ? !dateBad : step === 'circle' ? !!chosen : true;

  const submit = async () => {
    if (!chosen) return;
    setError(undefined);
    try {
      const r = await create.mutateAsync({
        title: title.trim(),
        category: inferCategory(title),
        ...(date ? { date } : {}),
        ...(date && endDate ? { endDate } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(budget > 0 ? { roughBudget: Math.round(budget * 100) } : {}),
      });
      navigate(`/app/plans/${r.data.id}`, { replace: true, state: { justCreated: true } });
    } catch (e) {
      setError((e as ApiError).message);
    }
  };
  const next = () => (last ? void submit() : setStep(steps[idx + 1]));
  const skip = () => {
    if (step === 'when') (setDate(''), setEndDate(''));
    if (step === 'where') setLocation('');
    if (step === 'budget') setBudget(0);
    next();
  };
  const heading = { title: 'What are you planning?', when: 'When?', where: 'Where?', budget: 'Rough budget?', circle: 'Which Circle?' }[step];
  const sub = {
    title: 'Something you’re thinking of doing together.',
    when: 'A day, or a few. You can change it later.',
    where: 'A city, a venue, or “TBD”.',
    budget: 'A ballpark so people know the size of it. Nobody pays anything yet.',
    circle: 'Who is this plan for?',
  }[step];

  return (
    <Screen
      topBar={<TopBar leading="back" onBack={() => (idx === 0 ? navigate(-1) : setStep(steps[idx - 1]))} title={`Step ${idx + 1} of ${steps.length}`} />}
      footer={
        <>
          <Button fullWidth onClick={next} disabled={!valid} loading={create.isPending}>
            {last ? 'Create plan' : 'Next'}
          </Button>
          {optional && (
            <Button fullWidth variant="ghost" onClick={skip}>
              {last ? 'Skip and create' : 'Skip'}
            </Button>
          )}
        </>
      }
    >
      <div className="ca">
        <h1 className="large-title">{heading}</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>{sub}</p>

        {step === 'title' && (
          <>
            <Input label="Plan name" value={title} maxLength={80} autoFocus autoComplete="off" placeholder="Ghana in December" enterKeyHint="next" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && next()} />
            <div className="ca__chips" aria-label="Ideas">
              {EXAMPLES.map((x) => (
                <button key={x} type="button" className="ca__chip" onClick={() => setTitle(x)}>
                  {x}
                </button>
              ))}
            </div>
          </>
        )}
        {step === 'when' && (
          <>
            <Input label="Starts" type="date" min={today} value={date} onChange={(e) => (setDate(e.target.value), endDate && e.target.value > endDate && setEndDate(''))} />
            <Input label="Ends (optional)" type="date" min={date || today} value={endDate} disabled={!date} onChange={(e) => setEndDate(e.target.value)} error={dateBad && date ? 'The end needs to be on or after the start.' : undefined} />
          </>
        )}
        {step === 'where' && <Input label="Where" value={location} maxLength={80} autoFocus autoComplete="off" placeholder="Accra" onChange={(e) => setLocation(e.target.value)} />}
        {step === 'budget' && <AmountInput label="Rough budget" value={budget} onChange={setBudget} size="xl" />}
        {step === 'circle' &&
          (list.length ? (
            <div className="ca__opts" role="radiogroup" aria-label="Circle">
              {list.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={chosen === c.id} className="ca__type" onClick={() => setCircleId(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CircleBadge emoji={c.emoji} tint={c.tint} size="sm" />
                  <strong>{c.name}</strong>
                </button>
              ))}
            </div>
          ) : (
            <QuickCircle onCreated={(id) => (setCircleId(id), setMadeCircle(true))} />
          ))}
        {error && <p className="field__error" role="alert">{error}</p>}
      </div>
    </Screen>
  );
}
