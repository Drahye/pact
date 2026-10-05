import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCircles } from '../../../api/circles';
import { ApiError } from '../../../api/client';
import { useCreatePlan } from '../../../api/plans';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { CirclePicker, DateField, planDates, StepHint } from '../../../components/create/fields';
import { useFinish } from '../../../components/create/useFinish';
import { QuickCircle } from '../../../components/circle/QuickCircle';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { isoDay } from '../../../lib/dates';
import { inferCategory } from '../../../lib/pact';
import { CreateShell } from '../../../components/create/CreateShell';
import '../../../components/ask/ask.css';

type Step = 'title' | 'when' | 'where' | 'circle';
const EXAMPLES = ['Ghana in December', 'Dinner on Friday', 'Beach Day', 'Sarah’s birthday'];

/** What are we doing, when and where (all optional), and which Circle if it is not already clear. */
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
  const steps = useMemo<Step[]>(() => (needsCircleStep ? ['title', 'when', 'where', 'circle'] : ['title', 'when', 'where']), [needsCircleStep]);
  const idx = Math.max(0, steps.indexOf(step));
  const last = idx === steps.length - 1;
  const optional = step === 'when' || step === 'where';
  const { done, finish } = useFinish();
  const [titleSeen, setTitleSeen] = useState(false);
  const dateBad = !!endDate && (!date || endDate < date);
  const valid = step === 'title' ? !!title.trim() : step === 'when' ? !dateBad : step === 'where' ? true : !!chosen;
  const circleName = list.find((c) => c.id === chosen);

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
      finish({ title: 'Your plan is up', line: title.trim() }, `/app/plans/${r.data.id}`, { replace: true, state: { justCreated: true } });
    } catch (e) {
      setError((e as ApiError).message);
    }
  };
  const next = () => (last ? void submit() : setStep(steps[idx + 1]));
  const skip = () => {
    if (step === 'when') (setDate(''), setEndDate(''));
    else (setLocation(''), setBudget(0));
    if (last) void submit();
    else setStep(steps[idx + 1]);
  };
  const heading = { title: 'What are you planning?', when: 'When?', where: 'Where?', circle: 'Who’s it for?' }[step];
  const sub = { title: 'Something you’re thinking of doing together.', when: 'A day, or a few. Not sure yet? Skip it.', where: 'A place, or leave it open for now.', circle: 'Pick the Circle that’s in on it.' }[step];

  return (
    <CreateShell
      kind="plan"
      stepIndex={idx}
      steps={steps.length}
      stepKey={step}
      onBack={() => setStep(steps[Math.max(0, idx - 1)])}
      onLeave={() => navigate(-1)}
      dirty={!!title.trim() || !!date || !!location.trim()}
      done={done}
      heading={heading}
      sub={sub}
      context={step !== 'title' && step !== 'circle' && circleName ? <><CircleBadge emoji={circleName.emoji} tint={circleName.tint} size="sm" /> {title.trim()} · {circleName.name}</> : undefined}
      footer={
        <>
          <Button fullWidth onClick={next} disabled={!valid || !!done} loading={create.isPending}>
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
      {step === 'title' && (
        <>
          <Input label="Plan name" value={title} maxLength={80} autoFocus autoComplete="off" placeholder="Ghana in December" enterKeyHint="next" onChange={(e) => setTitle(e.target.value)} onBlur={() => setTitleSeen(true)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && next()} />
          <StepHint show={titleSeen && !title.trim()}>Name your plan to continue.</StepHint>
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
          <DateField label="Starts" value={date} min={today} quick={planDates()} onChange={(v) => (setDate(v), endDate && v > endDate && setEndDate(''))} />
          {date && <DateField label="Ends (optional)" value={endDate} min={date} onChange={setEndDate} error={dateBad ? 'The end needs to be on or after the start.' : undefined} />}
        </>
      )}
      {step === 'where' && (
        <>
          <Input label="Where" value={location} maxLength={80} autoFocus autoComplete="off" placeholder="Accra, or TBD" enterKeyHint="next" onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} />
          <details className="cf__more">
            <summary>Add a rough budget</summary>
            <div>
              <p className="cf__sub">A ballpark so people know the size of it. Nobody pays anything yet.</p>
              <AmountInput label="Rough budget" value={budget} onChange={setBudget} size="xl" />
            </div>
          </details>
        </>
      )}
      {step === 'circle' &&
        (list.length ? <CirclePicker circles={list} value={chosen} onChange={setCircleId} /> : <QuickCircle onCreated={(id) => (setCircleId(id), setMadeCircle(true))} />)}
      {error && <p className="field__error" role="alert">{error}</p>}
    </CreateShell>
  );
}
