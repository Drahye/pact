import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCircles } from '../../../api/circles';
import { useCreateAsk } from '../../../api/asks';
import { ApiError } from '../../../api/client';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { CirclePicker, StepHint } from '../../../components/create/fields';
import { useFinish } from '../../../components/create/useFinish';
import { QuickCircle } from '../../../components/circle/QuickCircle';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Input } from '../../../components/ui/Input';
import { CreateShell } from '../../../components/create/CreateShell';
import '../../../components/ask/ask.css';

type Step = 'title' | 'options' | 'circle';
const EXAMPLES = ['Where should we stay?', 'Which date works?', 'What should we buy?', 'Who’s free this weekend?'];
/** "Who’s free?", "Are you coming?" are asked as In / Maybe / Can’t; most other questions are a pick-one. */
const looksLikeAttendance = (t: string) => /^(who|anyone|are you|can you make|is anyone)\b|\bfree\b|\bcoming\b|\bin\?$/i.test(t.trim());

/** A question, its answers, and (only if needed) which Circle. Then it is live and ready to share. */
export function CreateAskScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const circles = useCircles();
  const preCircle = params.get('circle') ?? '';
  // Started from inside a Plan: the question is linked to it, and we come back to it afterwards.
  const planParam = params.get('plan') ?? '';
  const planId = /^[0-9a-f-]{36}$/i.test(planParam) ? planParam : undefined;
  const [title, setTitle] = useState((params.get('title') ?? '').slice(0, 80));
  const fromLink = params.get('type') === 'attendance' ? 'attendance' : params.get('type') === 'choice' ? 'choice' : null;
  const [picked, setPicked] = useState<'choice' | 'attendance' | null>(fromLink);
  // Smart default: the words of the question say which kind it is, until the person says otherwise.
  const type: 'choice' | 'attendance' = picked ?? (looksLikeAttendance(title) ? 'attendance' : 'choice');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [circleId, setCircleId] = useState(preCircle);
  const [madeCircle, setMadeCircle] = useState(false);
  const [step, setStep] = useState<Step>('title');
  const [error, setError] = useState<string>();
  const [titleSeen, setTitleSeen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const { done, finish } = useFinish();
  const list = circles.data ?? [];
  const chosen = circleId || (list.length === 1 ? list[0].id : '');
  const create = useCreateAsk(chosen);
  const needsCircleStep = !preCircle && (list.length !== 1 || madeCircle);

  const steps = useMemo<Step[]>(() => ['title', ...(type === 'choice' ? (['options'] as Step[]) : []), ...(needsCircleStep ? (['circle'] as Step[]) : [])], [type, needsCircleStep]);
  const idx = Math.max(0, steps.indexOf(step));
  const last = idx === steps.length - 1;
  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const dup = new Set(cleaned.map((o) => o.toLowerCase())).size !== cleaned.length;
  const circleName = list.find((c) => c.id === chosen);

  const back = () => setStep(steps[Math.max(0, idx - 1)]);
  const valid = step === 'title' ? !!title.trim() : step === 'options' ? cleaned.length >= 2 && !dup : !!chosen;

  const go = async () => {
    setError(undefined);
    if (!last) return setStep(steps[idx + 1]);
    if (!chosen) return;
    try {
      const r = await create.mutateAsync({ type, title: title.trim(), ...(type === 'choice' ? { options: cleaned } : {}), from: preCircle ? 'circle' : 'nav', ...(planId ? { planId } : {}) });
      if (planId) finish({ title: 'Added to the plan', line: title.trim() }, `/app/plans/${planId}`, { replace: true });
      else finish({ title: 'Your question is live', line: title.trim() }, `/app/asks/${r.data.id}`, { replace: true, state: { justCreated: true } });
    } catch (e) {
      setError((e as ApiError).message);
    }
  };

  const heading = { title: 'What do you want to ask?', options: 'What are the options?', circle: 'Which Circle?' }[step];
  return (
    <CreateShell
      kind="ask"
      stepIndex={idx}
      steps={steps.length}
      stepKey={step}
      onBack={back}
      onLeave={() => navigate(-1)}
      dirty={!!title.trim() || cleaned.length > 0}
      done={done}
      heading={heading}
      context={step !== 'circle' && circleName ? <><CircleBadge emoji={circleName.emoji} tint={circleName.tint} size="sm" /> in {circleName.name}</> : undefined}
      footer={
        <Button fullWidth onClick={go} disabled={!valid || !!done} loading={create.isPending}>
          {last ? 'Ask the group' : 'Next'}
        </Button>
      }
    >
      {step === 'title' && (
        <>
          <Input label="Your question" value={title} maxLength={80} autoFocus autoComplete="off" placeholder="Where should we stay?" enterKeyHint="next" onChange={(e) => setTitle(e.target.value)} onBlur={() => setTitleSeen(true)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && void go()} />
          <StepHint show={titleSeen && !title.trim()}>Add your question to continue.</StepHint>
          <div className="ca__chips" aria-label="Ideas">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" className="ca__chip" onClick={() => setTitle(x)}>
                {x}
              </button>
            ))}
          </div>
          <p className="cf__label">How should people answer?</p>
          <div className="cf__pair" role="radiogroup" aria-label="Kind of question">
            <button type="button" role="radio" aria-checked={type === 'choice'} className="ca__type" onClick={() => setPicked('choice')}>
              <strong>Pick one</strong>
              <span>You list the options.</span>
            </button>
            <button type="button" role="radio" aria-checked={type === 'attendance'} className="ca__type" onClick={() => setPicked('attendance')}>
              <strong>Who’s in?</strong>
              <span>In, Maybe or Can’t.</span>
            </button>
          </div>
        </>
      )}

      {step === 'options' && (
        <>
          <ul className="ca__opts">
            {options.map((o, i) => (
              <li key={i} className="ca__opt">
                <Input
                  label={`Option ${i + 1}`}
                  value={o}
                  maxLength={40}
                  autoFocus={i === focusIdx}
                  autoComplete="off"
                  enterKeyHint={i === options.length - 1 && options.length < 6 ? 'next' : 'done'}
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (i < options.length - 1) return void (e.currentTarget.closest('.ca__opts')?.querySelectorAll<HTMLInputElement>('input')[i + 1]?.focus());
                    if (o.trim() && options.length < 6) (setFocusIdx(options.length), setOptions([...options, '']));
                    else if (valid) void go();
                  }}
                />
                {options.length > 2 && <IconButton label={`Remove option ${i + 1}`} icon={<X />} onClick={() => setOptions(options.filter((_, j) => j !== i))} />}
              </li>
            ))}
          </ul>
          {options.length < 6 && (
            <button type="button" className="act act--tonal tint--sky" onClick={() => (setFocusIdx(options.length), setOptions([...options, '']))}>
              <Plus aria-hidden /> Add an option
            </button>
          )}
          <StepHint show={cleaned.length < 2}>Add at least two options.</StepHint>
          <StepHint show={dup}>Each option needs to be different.</StepHint>
        </>
      )}

      {step === 'circle' && (
        <>
          {circles.isLoading ? null : !list.length ? (
            <QuickCircle onCreated={(id) => (setCircleId(id), setMadeCircle(true))} />
          ) : (
            <CirclePicker circles={list} value={chosen} onChange={setCircleId} />
          )}
        </>
      )}
      {error && <p className="field__error" role="alert">{error}</p>}
    </CreateShell>
  );
}
