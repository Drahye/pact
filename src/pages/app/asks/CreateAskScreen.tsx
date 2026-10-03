import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCircles } from '../../../api/circles';
import { useCreateAsk } from '../../../api/asks';
import { ApiError } from '../../../api/client';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { QuickCircle } from '../../../components/circle/QuickCircle';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Input } from '../../../components/ui/Input';
import { TopBar } from '../../../components/ui/TopBar';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';

type Step = 'title' | 'type' | 'options' | 'circle';
const EXAMPLES = ['Where should we stay?', 'Which date works?', 'What should we buy?', 'Who’s free this weekend?'];

/** A few quick steps: the question, its kind, the options, the Circle. Then it is live and ready to share. */
export function CreateAskScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const circles = useCircles();
  const preCircle = params.get('circle') ?? '';
  // Started from inside a Plan: the question is linked to it, and we come back to it afterwards.
  const planParam = params.get('plan') ?? '';
  const planId = /^[0-9a-f-]{36}$/i.test(planParam) ? planParam : undefined;
  const [title, setTitle] = useState((params.get('title') ?? '').slice(0, 80));
  const [type, setType] = useState<'choice' | 'attendance' | null>(params.get('type') === 'attendance' ? 'attendance' : params.get('type') === 'choice' ? 'choice' : null);
  const [options, setOptions] = useState<string[]>(['', '']);
  const [circleId, setCircleId] = useState(preCircle);
  const [madeCircle, setMadeCircle] = useState(false);
  const [step, setStep] = useState<Step>('title');
  const [error, setError] = useState<string>();
  const list = circles.data ?? [];
  const chosen = circleId || (list.length === 1 ? list[0].id : '');
  const create = useCreateAsk(chosen);

  const steps = useMemo<Step[]>(() => (type === 'choice' ? ['title', 'type', 'options', 'circle'] : ['title', 'type', 'circle']), [type]);
  const idx = Math.max(0, steps.indexOf(step));
  // With a Circle already chosen (from inside it, or the only one), the last step is just the button.
  const needsCircleStep = !preCircle && (list.length > 1 || madeCircle);
  const last = step === 'circle' || (step === (type === 'choice' ? 'options' : 'type') && !needsCircleStep && !!chosen);
  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const dup = new Set(cleaned.map((o) => o.toLowerCase())).size !== cleaned.length;

  const back = () => (idx === 0 ? navigate(-1) : setStep(steps[idx - 1]));
  const valid = step === 'title' ? !!title.trim() : step === 'type' ? !!type : step === 'options' ? cleaned.length >= 2 && !dup : !!chosen;

  const go = async () => {
    setError(undefined);
    if (!last) return setStep(steps[idx + 1]);
    if (!chosen || !type) return;
    try {
      const r = await create.mutateAsync({ type, title: title.trim(), ...(type === 'choice' ? { options: cleaned } : {}), from: preCircle ? 'circle' : 'nav', ...(planId ? { planId } : {}) });
      if (planId) navigate(`/app/plans/${planId}`, { replace: true });
      else navigate(`/app/asks/${r.data.id}`, { replace: true, state: { justCreated: true } });
    } catch (e) {
      setError((e as ApiError).message);
    }
  };

  const heading = { title: 'What do you want to ask?', type: 'What kind of question?', options: 'What are the options?', circle: 'Which Circle?' }[step];
  return (
    <Screen
      topBar={<TopBar leading="back" onBack={back} title={`Step ${idx + 1} of ${steps.length}`} />}
      footer={
        <Button fullWidth onClick={go} disabled={!valid} loading={create.isPending}>
          {last ? 'Create and share' : 'Next'}
        </Button>
      }
    >
      <div className="ca">
        <h1 className="large-title">{heading}</h1>

        {step === 'title' && (
          <>
            <Input label="Your question" value={title} maxLength={80} autoFocus autoComplete="off" placeholder="Where should we stay?" enterKeyHint="next" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && void go()} />
            <div className="ca__chips" aria-label="Ideas">
              {EXAMPLES.map((x) => (
                <button key={x} type="button" className="ca__chip" onClick={() => setTitle(x)}>
                  {x}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'type' && (
          <div className="ca__types" role="radiogroup" aria-label="Kind of question">
            <button type="button" role="radio" aria-checked={type === 'choice'} className="ca__type" onClick={() => setType('choice')}>
              <strong>Choice</strong>
              <span>People pick one option.</span>
            </button>
            <button type="button" role="radio" aria-checked={type === 'attendance'} className="ca__type" onClick={() => setType('attendance')}>
              <strong>Who’s in?</strong>
              <span>In, Maybe or Can’t. Fast.</span>
            </button>
          </div>
        )}

        {step === 'options' && (
          <>
            <ul className="ca__opts">
              {options.map((o, i) => (
                <li key={i} className="ca__opt">
                  <Input label={`Option ${i + 1}`} value={o} maxLength={40} autoComplete="off" onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
                  {options.length > 2 && <IconButton label={`Remove option ${i + 1}`} icon={<X />} onClick={() => setOptions(options.filter((_, j) => j !== i))} />}
                </li>
              ))}
            </ul>
            {options.length < 6 && (
              <Button variant="secondary" iconLeft={<Plus />} onClick={() => setOptions([...options, ''])}>
                Add an option
              </Button>
            )}
            {dup && <p className="field__error" role="alert">Each option needs to be different.</p>}
          </>
        )}

        {step === 'circle' && (
          <>
            {circles.isLoading ? null : !list.length ? (
              <QuickCircle onCreated={(id) => (setCircleId(id), setMadeCircle(true))} />
            ) : (
              <div className="ca__opts" role="radiogroup" aria-label="Circle">
                {list.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={chosen === c.id} className="ca__type" onClick={() => setCircleId(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CircleBadge emoji={c.emoji} tint={c.tint} size="sm" />
                    <strong>{c.name}</strong>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {error && <p className="field__error" role="alert">{error}</p>}
      </div>
    </Screen>
  );
}
