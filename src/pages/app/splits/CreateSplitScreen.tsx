import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../api/auth';
import { useCircle, useCircles } from '../../../api/circles';
import { ApiError } from '../../../api/client';
import { useCreateSplit, useSplit, useUpdateSplit } from '../../../api/splits';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Segmented } from '../../../components/ui/Segmented';
import { TopBar } from '../../../components/ui/TopBar';
import { getUser } from '../../../data/users';
import { equalPreview, koboInput, koboText, parseKobo } from '../../../lib/splitMoney';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';
import '../../../components/split/split.css';

type Step = 'circle' | 'title' | 'amount' | 'who' | 'review';
const EXAMPLES = ['Dinner', 'Uber to the airport', 'Groceries', 'Fuel'];

/**
 * Split an expense in a few taps: what, how much, who paid and who shares it, then a review. Equal by default; custom lets each
 * person have their own amount and shows what is left. The server does the real arithmetic and refuses anything that doesn't add up.
 * With ?edit=ID it changes an existing split instead (the server refuses money changes once anyone has settled).
 */
export function CreateSplitScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const circles = useCircles();
  const editId = params.get('edit') ?? undefined;
  const existing = useSplit(editId);
  const preCircle = params.get('circle') ?? '';
  const list = circles.data ?? [];
  const [circleId, setCircleId] = useState(preCircle);
  const chosen = existing.data?.circleId ?? (circleId || (list.length === 1 ? list[0].id : ''));
  const circle = useCircle(chosen || undefined);
  const create = useCreateSplit(chosen);
  const update = useUpdateSplit(editId ?? '');
  const me = user?.id ?? '';

  const [title, setTitle] = useState('');
  const [total, setTotal] = useState(0); // naira in the amount field
  const [paidBy, setPaidBy] = useState(me);
  const [included, setIncluded] = useState<string[]>([]);
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>('title');
  const [error, setError] = useState<string>();
  const seeded = useState({ done: false })[0];

  const members = useMemo(() => (circle.data?.members ?? []).map((m) => m.userId), [circle.data]);
  const needsCircleStep = !editId && !preCircle && list.length !== 1;
  const locked = !!editId && !!existing.data && !existing.data.canEditStructure;
  const steps = useMemo<Step[]>(() => (locked ? ['title', 'review'] : needsCircleStep ? ['circle', 'title', 'amount', 'who', 'review'] : ['title', 'amount', 'who', 'review']), [needsCircleStep, locked]);
  const idx = Math.max(0, steps.indexOf(step));
  const last = idx === steps.length - 1;
  const totalKobo = Math.round(total * 100);

  // Start from what is already there when editing; otherwise everyone in the Circle is ticked, and can be unticked.
  useEffect(() => {
    if (seeded.done) return;
    if (editId) {
      const s = existing.data;
      if (!s) return;
      seeded.done = true;
      setTitle(s.title);
      setTotal(s.total / 100);
      setPaidBy(s.paidBy);
      setIncluded(s.shares.map((x) => x.userId));
      setMode(s.mode);
      setCustom(Object.fromEntries(s.shares.map((x) => [x.userId, koboInput(x.amount)])));
    } else if (members.length) {
      seeded.done = true;
      setIncluded(members);
    }
  }, [editId, existing.data, members, seeded]);
  useEffect(() => {
    if (!paidBy && me) setPaidBy(me);
  }, [me, paidBy]);

  const others = included.filter((id) => id !== paidBy);
  const equal = useMemo(() => equalPreview(totalKobo, included.length), [totalKobo, included.length]);
  const amountFor = (id: string) => (locked ? existing.data!.shares.find((x) => x.userId === id)?.amount ?? 0 : mode === 'equal' ? equal[included.indexOf(id)] ?? 0 : parseKobo(custom[id] ?? ''));
  const sum = included.reduce((t, id) => t + amountFor(id), 0);
  const remaining = totalKobo - sum;
  const structureLocked = locked;

  const valid =
    step === 'circle' ? !!chosen : step === 'title' ? !!title.trim() : step === 'amount' ? totalKobo >= 100 : step === 'who' ? others.length >= 1 && !!paidBy : mode === 'equal' || (remaining === 0 && included.every((id) => amountFor(id) > 0));

  const toggle = (id: string) => setIncluded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const switchMode = (m: 'equal' | 'custom') => {
    if (m === 'custom') setCustom(Object.fromEntries(included.map((id, i) => [id, koboInput(equal[i] ?? 0)])));
    setMode(m);
  };

  const submit = async () => {
    setError(undefined);
    const body = {
      title: title.trim(),
      total: totalKobo,
      paidBy,
      mode,
      participants: included.map((userId) => (mode === 'custom' ? { userId, amount: amountFor(userId) } : { userId })),
    };
    try {
      if (editId) {
        // A title-only change is allowed any time; anything about the money only before someone settles.
        await update.mutateAsync(structureLocked ? { title: body.title } : body);
        navigate(`/app/splits/${editId}`, { replace: true });
      } else {
        const r = await create.mutateAsync({ ...body, from: preCircle ? 'circle' : 'nav' });
        navigate(`/app/splits/${r.data.id}`, { replace: true, state: { justCreated: true } });
      }
    } catch (e) {
      setError((e as ApiError).message);
    }
  };
  const next = () => (last ? void submit() : setStep(steps[idx + 1]));
  const name = (id: string) => (id === me ? 'You' : getUser(id).name);

  const heading = { circle: 'Which Circle?', title: 'What are we splitting?', amount: 'How much?', who: 'Who paid?', review: 'Split it' }[step];
  const sub = {
    circle: 'Who is this split with?',
    title: 'Something that already happened.',
    amount: 'The whole amount that was paid.',
    who: 'Then pick who the expense was for.',
    review: 'Check it, then create it.',
  }[step];

  return (
    <Screen
      topBar={<TopBar leading="back" onBack={() => (idx === 0 ? navigate(-1) : setStep(steps[idx - 1]))} title={editId ? 'Edit split' : `Step ${idx + 1} of ${steps.length}`} />}
      footer={
        <Button fullWidth onClick={next} disabled={!valid} loading={create.isPending || update.isPending}>
          {last ? (editId ? 'Save changes' : 'Create split') : 'Next'}
        </Button>
      }
    >
      <div className="ca">
        <h1 className="large-title">{heading}</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>{sub}</p>

        {step === 'circle' &&
          (list.length ? (
            <div className="ca__opts" role="radiogroup" aria-label="Circle">
              {list.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={chosen === c.id} className="ca__type" onClick={() => (setCircleId(c.id), (seeded.done = false))} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CircleBadge emoji={c.emoji} tint={c.tint} size="sm" />
                  <strong>{c.name}</strong>
                </button>
              ))}
            </div>
          ) : (
            <p>
              You’re not in a Circle yet. <Link to="/app/circles/new" className="link">Create one first</Link>.
            </p>
          ))}

        {step === 'title' && (
          <>
            <Input label="What was it for?" value={title} maxLength={80} autoFocus autoComplete="off" placeholder="Dinner at Yellow Chilli" enterKeyHint="next" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && next()} />
            <div className="ca__chips" aria-label="Ideas">
              {EXAMPLES.map((x) => (
                <button key={x} type="button" className="ca__chip" onClick={() => setTitle(x)}>
                  {x}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'amount' && <AmountInput label="Total amount" value={total} onChange={setTotal} size="xl" />}

        {step === 'who' && (
          <>
            <fieldset className="split-amounts" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field__label">Who paid?</legend>
              <div className="ca__chips" role="radiogroup" aria-label="Who paid">
                {members.map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={paidBy === id} className={`ca__chip ${paidBy === id ? 'is-on' : ''}`} style={paidBy === id ? { boxShadow: 'inset 0 0 0 2px var(--green-500)' } : undefined} onClick={() => setPaidBy(id)}>
                    {name(id)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field__label">Who was this expense for?</legend>
              <p className="split-note">Select everyone whose share should be included. This may include the payer.</p>
              <ul className="split-pick">
                {members.map((id) => {
                  const on = included.includes(id);
                  return (
                    <li key={id}>
                      <button type="button" role="checkbox" aria-checked={on} className="split-pick__row" onClick={() => toggle(id)}>
                        <Avatar userId={id} size="sm" label={false} />
                        <span className="split-pick__name">{name(id)}</span>
                        {on && <Check className="split-pick__mark" aria-hidden strokeWidth={3} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            {others.length < 1 && <p className="split-note">Add at least one other person to split this with.</p>}
          </>
        )}

        {step === 'review' && (
          <>
            <p className="split-head__total" aria-label={`Total ${koboText(totalKobo)}`}>
              {koboText(totalKobo)}
            </p>
            <p className="split-head__meta">
              {title.trim()} · Paid by {name(paidBy)}
            </p>
            {structureLocked ? (
              <p className="split-note">People have already started settling this split, so only the name can change.</p>
            ) : (
              <Segmented
                label="How to split"
                value={mode}
                onChange={switchMode}
                options={[
                  { value: 'equal', label: 'Equally' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
            )}
            {mode === 'custom' && !structureLocked && (
              <p className={`split-remaining ${remaining === 0 ? '' : 'is-bad'}`} role="status" aria-live="polite">
                <span>Remaining</span>
                <strong>{koboText(Math.abs(remaining))}{remaining < 0 ? ' too much' : ''}</strong>
              </p>
            )}
            <ul className="split-rows" aria-label="Shares">
              {included.map((id) =>
                mode === 'custom' && !structureLocked ? (
                  <li key={id} className="split-amounts">
                    <Input label={id === me ? 'Your amount' : `${name(id)}’s amount`} inputMode="decimal" value={custom[id] ?? ''} placeholder="0" onChange={(e) => setCustom({ ...custom, [id]: e.target.value })} />
                  </li>
                ) : (
                  <li key={id} className="split-row">
                    <Avatar userId={id} size="sm" label={false} />
                    <span className="split-row__who">
                      <span className="split-row__name">{name(id)}</span>
                      {id === paidBy && <span className="split-note">Paid originally</span>}
                    </span>
                    <span className="split-row__amount">{koboText(amountFor(id))}</span>
                  </li>
                ),
              )}
            </ul>
            <p className="split-note">PACT only keeps the record. Nobody pays anything through PACT.</p>
          </>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Screen>
  );
}
