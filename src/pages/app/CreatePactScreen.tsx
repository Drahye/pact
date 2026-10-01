import { CalendarDays, Check, ChevronDown, ChevronRight, History, ListChecks, Phone, Plus, RotateCcw, Scale, ShoppingBag, Wallet, X } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, newIdempotencyKey } from '../../api/client';
import { useCreatePact, useRecentPeople } from '../../api/hooks';
import { Notice } from '../../components/app/States';
import { categoryMeta } from '../../components/pact/category';
import { AmountInput } from '../../components/ui/AmountInput';
import { Avatar } from '../../components/ui/Avatar';
import { AvatarGroup } from '../../components/ui/AvatarGroup';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Segmented } from '../../components/ui/Segmented';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import type { PactCategory } from '../../data/types';
import { getUser } from '../../data/users';
import { addDaysIso, isoDay } from '../../lib/dates';
import { clearDraft, pushRecent, readDraft, readRecents, useSaveDraft } from '../../lib/drafts';
import { daysUntil, formatDate, formatDaysLeft, formatNaira, joinNames, parseAmount, formatAmountInput, toKobo } from '../../lib/format';
import { PACT_TYPES, TEMPLATES } from '../../../shared/templates';
import { inferCategory } from '../../lib/pact';
import { Screen } from './Screen';
import '../../components/app/app-ui.css';
import './create.css';

const kinds = PACT_TYPES.map((value) => ({ value: value as PactCategory, label: TEMPLATES[value].label }));

interface Line {
  key: number;
  name: string;
  amount: number;
}
let lineKey = 0;

interface ItemDraft {
  key: number;
  name: string;
  price: number;
  options: string;
  stock: string;
}

/** Everything on the form except the idempotency key. Kept on this device until the Pact is created. */
interface CreateDraft {
  title: string;
  target: number;
  deadline: string;
  invitees: string[];
  phones: string[];
  picked: PactCategory | null;
  policy: 'refund' | 'release';
  split: 'flexible' | 'equal';
  mode: 'target' | 'budget' | 'orders';
  items: ItemDraft[];
  lines: Line[];
  tasks: string[];
}
const DRAFT_KEY = 'create-pact';

/** An optional part of the form: closed by default so the first-time path stays four fields long. */
function Disclosure({ icon, title, summary, open, onToggle, children }: { icon: ReactNode; title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className={`disclosure ${open ? 'is-open' : ''}`}>
      <button type="button" className="disclosure__head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="disclosure__icon">{icon}</span>
        <span className="disclosure__text">
          <strong>{title}</strong>
          {summary && <small>{summary}</small>}
        </span>
        <ChevronDown aria-hidden className="disclosure__chev" />
      </button>
      {open && (
        <div id={id} className="disclosure__body">
          {children}
        </div>
      )}
    </div>
  );
}

const normalizePhone = (raw: string) => {
  const d = raw.replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '');
  return /^[789][01]\d{8}$/.test(d) ? `0${d}` : null;
};

export function CreatePactScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreatePact();
  const people = useRecentPeople();
  const minDate = isoDay(new Date(Date.now() + 86_400_000));
  // A half-finished Pact comes back after a refresh, a dropped connection or an expired session.
  const [saved] = useState(() => {
    const d = readDraft<CreateDraft>(DRAFT_KEY);
    if (!d) return null;
    // Rows need fresh keys, and a date that has since passed isn't worth keeping.
    d.lines = (d.lines ?? []).map((l) => ({ ...l, key: lineKey++ }));
    d.items = (d.items ?? []).map((i) => ({ ...i, key: lineKey++ }));
    if (d.deadline && d.deadline < minDate) d.deadline = '';
    return d;
  });
  const [recentPhones] = useState(() => readRecents<{ phone: string }>('invite-phones'));
  const [restored, setRestored] = useState(!!saved);
  // Optional parts stay closed unless a restored draft already has something in them.
  const [tasksOpen, setTasksOpen] = useState(!!saved?.tasks?.length);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [title, setTitle] = useState(saved?.title ?? '');
  const [target, setTarget] = useState(saved?.target ?? 0);
  const [deadline, setDeadline] = useState(saved?.deadline ?? '');
  const [invitees, setInvitees] = useState<string[]>(saved?.invitees ?? []);
  const [phones, setPhones] = useState<string[]>(saved?.phones ?? []);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneError, setPhoneError] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [picked, setPicked] = useState<PactCategory | null>(saved?.picked ?? null);
  const [policy, setPolicy] = useState<'refund' | 'release'>(saved?.policy ?? 'refund');
  const [split, setSplit] = useState<'flexible' | 'equal'>(saved?.split ?? 'flexible');
  const [error, setError] = useState<string>();
  const [key] = useState(newIdempotencyKey);
  const [mode, setMode] = useState<'target' | 'budget' | 'orders'>(saved?.mode ?? 'target');
  const [items, setItems] = useState<ItemDraft[]>(saved?.items ?? []);
  const addItem = () => setItems((l) => [...l, { key: lineKey++, name: '', price: 0, options: '', stock: '' }]);
  const setItem = (key: number, patch: Partial<ItemDraft>) => setItems((all) => all.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const [lines, setLines] = useState<Line[]>(saved?.lines ?? []);
  const [tasks, setTasks] = useState<string[]>(saved?.tasks ?? []);
  const [taskDraft, setTaskDraft] = useState('');
  const category = picked ?? inferCategory(title);
  const template = TEMPLATES[category];
  const budgetTotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const goal = mode === 'budget' ? budgetTotal : target;
  const addLine = (name = '') => setLines((l) => [...l, { key: lineKey++, name, amount: 0 }]);
  const toggleTask = (t: string) => setTasks((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  const errors = useMemo(
    () => ({
      title: !title.trim() ? 'Give your Pact a name.' : undefined,
      target:
        mode === 'orders'
          ? !items.length || items.some((i) => !i.name.trim() || i.price < 100)
            ? 'Give every item a name and a price of at least ₦100.'
            : undefined
          : mode === 'budget'
          ? lines.some((l) => !l.name.trim() || l.amount < 1)
            ? 'Give every line a name and an amount.'
            : budgetTotal < 1_000
              ? 'The budget needs to add up to at least ₦1,000.'
              : undefined
          : target < 1_000
            ? 'Enter at least ₦1,000.'
            : undefined,
      deadline: !deadline ? 'Pick a date.' : deadline < minDate ? 'Choose a date after today.' : undefined,
    }),
    [title, target, deadline, minDate, mode, lines, budgetTotal, items],
  );
  const valid = !errors.title && !errors.target && !errors.deadline;
  const count = invitees.length + phones.length;

  const untouched = !title.trim() && !target && !deadline && !count && !picked && !lines.length && !items.length && !tasks.length;
  useSaveDraft<CreateDraft>(DRAFT_KEY, { title, target, deadline, invitees, phones, picked, policy, split, mode, items, lines, tasks }, untouched, !create.isSuccess);
  const startOver = () => {
    clearDraft(DRAFT_KEY);
    setTitle('');
    setTarget(0);
    setDeadline('');
    setInvitees([]);
    setPhones([]);
    setPicked(null);
    setPolicy('refund');
    setSplit('flexible');
    setMode('target');
    setItems([]);
    setLines([]);
    setTasks([]);
    setTouched(false);
    setRestored(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setError(undefined);
    try {
      const r = await create.mutateAsync({
        key,
        input: {
          title: title.trim(),
          category,
          // With a budget the server works out the target from the lines.
          ...(mode === 'orders'
            ? {
                mode: 'orders' as const,
                items: items.map((i) => ({
                  name: i.name.trim(),
                  price: toKobo(i.price),
                  options: i.options.split(',').map((o) => o.trim()).filter(Boolean),
                  stock: i.stock ? Number(i.stock) : null,
                })),
              }
            : mode === 'budget'
              ? { budget: lines.map((l) => ({ name: l.name.trim(), amount: toKobo(l.amount) })) }
              : { target: toKobo(target) }),
          tasks: tasks.map((t) => ({ title: t })),
          deadline,
          missedGoalPolicy: policy,
          splitMode: split,
          inviteUserIds: invitees,
          invitePhones: phones,
        },
      });
      clearDraft(DRAFT_KEY);
      phones.forEach((phone) => pushRecent('invite-phones', { phone }, (x) => x.phone, 6));
      toast('Pact created');
      navigate(`/app/pact/${r.data.pact.id}/invite`, { replace: true, state: { created: true } });
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  const toggle = (id: string) => setInvitees((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const addPhone = () => {
    const p = normalizePhone(phoneDraft);
    if (!p) return setPhoneError('Enter an 11-digit Nigerian number.');
    if (!phones.includes(p)) setPhones((l) => [...l, p]);
    setPhoneDraft('');
    setPhoneError(undefined);
  };

  return (
    <Screen
      topBar={<TopBar leading="close" backTo="/app/home" title="New Pact" />}
      footer={
        <Button type="submit" form="create-pact" fullWidth loading={create.isPending}>
          {goal >= 1000 ? `Create Pact · ${formatNaira(goal)}` : 'Create Pact'}
        </Button>
      }
      className="create"
    >
      <h1 className="large-title">What are you planning?</h1>
      <p className="screen-lede">Name it, pick a date, say roughly how much. Everything else can wait.</p>

      {restored && (
        <Notice tone="accent" icon={<History />}>
          We kept what you’d filled in.{' '}
          <button type="button" className="link" onClick={startOver}>
            Start over
          </button>
        </Notice>
      )}

      <form id="create-pact" className="create__form" onSubmit={submit} noValidate>
        <Input
          label="Name"
          placeholder={template.placeholder}
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          error={touched ? errors.title : undefined}
          autoComplete="off"
        />

        <div className="create__kinds" role="radiogroup" aria-label="Kind of plan (optional)">
          {kinds.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={category === k.value}
              className={`create__kind tint--${categoryMeta[k.value].tint} ${category === k.value ? 'is-on' : ''}`}
              onClick={() => setPicked(k.value)}
            >
              {categoryMeta[k.value].icon}
              {k.label}
            </button>
          ))}
        </div>

        <Input
          label="When is it happening?"
          type="date"
          min={minDate}
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          error={touched ? errors.deadline : undefined}
          trailing={<CalendarDays />}
          hint={deadline && !errors.deadline ? `${formatDate(deadline)} · ${formatDaysLeft(daysUntil(deadline))}` : 'Up to a year from today'}
          className={deadline ? '' : 'is-empty'}
          autoComplete="off"
        />
        <div className="suggest" role="group" aria-label="Quick dates">
          {[
            { label: 'In 1 week', days: 7 },
            { label: 'In 2 weeks', days: 14 },
            { label: 'In a month', days: 30 },
          ].map((q) => {
            const v = addDaysIso(isoDay(new Date()), q.days);
            return (
              <button key={q.label} type="button" className={`suggest__chip ${deadline === v ? 'is-on' : ''}`} aria-pressed={deadline === v} onClick={() => setDeadline(v)}>
                {deadline === v && <Check aria-hidden />} {q.label}
              </button>
            );
          })}
        </div>


        <div className="field">
          <span className="field__label">{mode === 'orders' ? 'What are people ordering?' : 'Roughly how much do you need?'}</span>
          {mode === 'orders' && <p className="field__hint">For aso-ebi, souvenirs or tickets: people order what they want, and the total is what they order.</p>}
        </div>

        {mode === 'orders' ? (
          <div className="budget-edit">
            <ul className="item-edit">
              {items.map((it, i) => (
                <li key={it.key} className="item-edit__card">
                  <div className="budget-edit__line">
                    <input className="budget-edit__name" aria-label={`Item ${i + 1} name`} placeholder="e.g. Aso-oke + gele" value={it.name} maxLength={60} onChange={(e) => setItem(it.key, { name: e.target.value })} />
                    <span className="budget-edit__amount">
                      <span aria-hidden>₦</span>
                      <input className="num" inputMode="numeric" aria-label={`Item ${i + 1} price`} placeholder="0" value={formatAmountInput(it.price)} onChange={(e) => setItem(it.key, { price: Math.min(50_000_000, parseAmount(e.target.value)) })} />
                    </span>
                    <button type="button" className="budget-edit__remove" aria-label={`Remove ${it.name || 'item'}`} onClick={() => setItems((all) => all.filter((x) => x.key !== it.key))}>
                      <X />
                    </button>
                  </div>
                  <div className="item-edit__extra">
                    <input aria-label={`Item ${i + 1} sizes or colours`} placeholder="Sizes or colours: S, M, L" value={it.options} maxLength={200} onChange={(e) => setItem(it.key, { options: e.target.value })} />
                    <input className="num" inputMode="numeric" aria-label={`Item ${i + 1} how many available`} placeholder="Stock: no limit" value={it.stock} onChange={(e) => setItem(it.key, { stock: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="suggest">
              <button type="button" className="suggest__chip suggest__chip--own" onClick={addItem}>
                <Plus aria-hidden /> Add an item
              </button>
            </div>
            {touched && errors.target && <p className="field__error">{errors.target}</p>}
          </div>
        ) : mode === 'target' ? (
          <div className={`create__amount ${touched && errors.target ? 'has-error' : ''}`}>
            <AmountInput label="Target" hideLabel value={target} onChange={setTarget} placeholder="500,000" max={50_000_000} />
            {touched && errors.target && <p className="field__error">{errors.target}</p>}
          </div>
        ) : (
          <div className="budget-edit">
            <ul className="budget-edit__lines">
              {lines.map((l, i) => (
                <li key={l.key} className="budget-edit__line">
                  <input
                    className="budget-edit__name"
                    aria-label={`Line ${i + 1} name`}
                    placeholder="What for?"
                    value={l.name}
                    maxLength={60}
                    onChange={(e) => setLines((all) => all.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))}
                  />
                  <span className="budget-edit__amount">
                    <span aria-hidden>₦</span>
                    <input
                      className="num"
                      inputMode="numeric"
                      aria-label={`Line ${i + 1} amount`}
                      placeholder="0"
                      value={formatAmountInput(l.amount)}
                      onChange={(e) => setLines((all) => all.map((x) => (x.key === l.key ? { ...x, amount: Math.min(50_000_000, parseAmount(e.target.value)) } : x)))}
                    />
                  </span>
                  <button type="button" className="budget-edit__remove" aria-label={`Remove ${l.name || 'line'}`} onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))}>
                    <X />
                  </button>
                </li>
              ))}
            </ul>
            <div className="suggest">
              {template.budget
                .filter((name) => !lines.some((l) => l.name.toLowerCase() === name.toLowerCase()))
                .map((name) => (
                  <button key={name} type="button" className="suggest__chip" onClick={() => addLine(name)}>
                    <Plus aria-hidden /> {name}
                  </button>
                ))}
              <button type="button" className="suggest__chip suggest__chip--own" onClick={() => addLine()}>
                <Plus aria-hidden /> Add a line
              </button>
            </div>
            <p className="budget-edit__total">
              Target <strong className="num">{formatNaira(budgetTotal)}</strong>
            </p>
            {touched && errors.target && <p className="field__error">{errors.target}</p>}
          </div>
        )}

        {mode === 'target' && (
          <button type="button" className="create__link" onClick={() => { setMode('budget'); if (!lines.length) setLines(template.budget.slice(0, 3).map((name) => ({ key: lineKey++, name, amount: 0 }))); }}>
            <Plus aria-hidden /> Break it into what the money covers
          </button>
        )}
        {mode === 'budget' && (
          <button type="button" className="create__link" onClick={() => setMode('target')}>
            Use one target instead
          </button>
        )}
        {mode === 'orders' && (
          <button type="button" className="create__link" onClick={() => setMode('target')}>
            Back to a normal Pact
          </button>
        )}

        <Disclosure icon={<ListChecks aria-hidden />} title="Add things that need doing" summary={tasks.length ? `${tasks.length} added` : 'Optional'} open={tasksOpen} onToggle={() => setTasksOpen((o) => !o)}>
        <div className="field">
          <div className="suggest">
            {[...template.tasks, ...tasks.filter((t) => !template.tasks.includes(t))].map((t) => {
              const on = tasks.includes(t);
              return (
                <button key={t} type="button" className={`suggest__chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggleTask(t)}>
                  {on ? <Check aria-hidden /> : <Plus aria-hidden />} {t}
                </button>
              );
            })}
          </div>
          <div className="create__task-add">
            <input
              className="field__input create__task-input"
              aria-label="Add your own task"
              placeholder="Add your own"
              value={taskDraft}
              maxLength={80}
              onChange={(e) => setTaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && taskDraft.trim()) {
                  e.preventDefault();
                  if (!tasks.includes(taskDraft.trim())) setTasks((l) => [...l, taskDraft.trim()]);
                  setTaskDraft('');
                }
              }}
            />
          </div>
          <p className="field__hint">People can pick these up once they join. {tasks.length ? `${tasks.length} selected.` : ''}</p>
        </div>
        </Disclosure>

        <div className="field">
          <span className="field__label" id="invite-label">
            Bring your people <span className="field__optional">Optional</span>
          </span>
          <button type="button" className="create__invite" onClick={() => setPickerOpen(true)} aria-describedby="invite-label">
            {count ? (
              <>
                {invitees.length > 0 && <AvatarGroup userIds={invitees} max={4} size="sm" />}
                <span className="create__invite-text">
                  {joinNames([...invitees.map((id) => getUser(id).name), ...phones], 2)}
                </span>
              </>
            ) : (
              <span className="create__invite-text">Invite people now</span>
            )}
            <ChevronRight aria-hidden />
          </button>
          <p className="field__hint">You’ll also get a link to share with anyone.</p>
        </div>


        {mode === 'orders' ? (
          <Notice icon={<Scale />}>
            The date above is the pay-by date. People pay for their own orders by then, and PACT reminds them on the day. Unpaid orders are released after it.
          </Notice>
        ) : (
          <div className="create__rules">
            <p className="create__rules-line">
              <Scale aria-hidden />
              <span>
                <strong>If the goal isn’t reached:</strong>{' '}
                {policy === 'refund' ? 'everyone gets their money back.' : 'the organiser keeps what was raised.'}{' '}
                <strong>Contributions:</strong>{' '}
                {split === 'equal' && goal >= 1000 ? `equal shares of ${formatNaira(goal)}.` : split === 'equal' ? 'equal shares.' : 'everyone chooses what they can add.'}
              </span>
              <button type="button" className="link" aria-expanded={rulesOpen} onClick={() => setRulesOpen((o) => !o)}>
                {rulesOpen ? 'Done' : 'Change'}
              </button>
            </p>
            {rulesOpen && (
              <div className="create__rules-edit">
        <div className="field">
          <span className="field__label">Contributions</span>
          <Segmented<'flexible' | 'equal'>
            label="Split"
            value={split}
            onChange={setSplit}
            options={[
              { value: 'flexible', label: 'Everyone chooses' },
              { value: 'equal', label: 'Split equally instead' },
            ]}
          />
          <p className="field__hint">
            {split === 'equal' && goal >= 1000
              ? `Everyone is asked for an equal share of ${formatNaira(goal)}, updated as people join.`
              : 'Everyone gives what they can.'}
          </p>
        </div>
        <div className="field">
          <span className="field__label" id="rule-label">
            <Scale aria-hidden className="create__label-icon" /> If the goal isn’t reached by the deadline
          </span>
          <div className="choices" role="radiogroup" aria-labelledby="rule-label">
            <button type="button" role="radio" aria-checked={policy === 'refund'} className={`choice ${policy === 'refund' ? 'is-on' : ''}`} onClick={() => setPolicy('refund')}>
              <span className="choice__icon tint--mint"><RotateCcw /></span>
              <span className="choice__text">
                <span className="choice__title">Refund everyone</span>
                <span className="choice__sub">Each contribution goes back automatically. Recommended.</span>
              </span>
              <span className="choice__radio" aria-hidden />
            </button>
            <button type="button" role="radio" aria-checked={policy === 'release'} className={`choice ${policy === 'release' ? 'is-on' : ''}`} onClick={() => setPolicy('release')}>
              <span className="choice__icon tint--sun"><Wallet /></span>
              <span className="choice__text">
                <span className="choice__title">Keep what was raised</span>
                <span className="choice__sub">The organiser receives whatever came in.</span>
              </span>
              <span className="choice__radio" aria-hidden />
            </button>
          </div>
          <p className="field__hint">Everyone sees this rule before they contribute. It can’t be changed later.</p>
        </div>
              </div>
            )}
          </div>
        )}

        {mode !== 'orders' && (
          <Disclosure icon={<ShoppingBag aria-hidden />} title="More ways to use PACT" summary="Group orders" open={moreOpen} onToggle={() => setMoreOpen((o) => !o)}>
            <button type="button" className="choice" onClick={() => { setMode('orders'); if (!items.length) addItem(); }}>
              <span className="choice__icon tint--pink"><ShoppingBag /></span>
              <span className="choice__text">
                <span className="choice__title">Group order</span>
                <span className="choice__sub">Aso-ebi, shirts, tickets: people order what they want and pay for their own.</span>
              </span>
              <ChevronRight aria-hidden />
            </button>
          </Disclosure>
        )}

        {error && <Notice tone="danger">{error}</Notice>}
      </form>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Invite people"
        description="They’ll get an invite as soon as the Pact is created. Numbers not on PACT get a text."
        footer={
          <Button fullWidth onClick={() => setPickerOpen(false)}>
            {count ? `Add ${count} ${count === 1 ? 'person' : 'people'}` : 'Done'}
          </Button>
        }
      >
        <div className="create__phone">
          <Input
            label="Add by phone number"
            inputMode="tel"
            placeholder="0803 123 4567"
            value={phoneDraft}
            onChange={(e) => {
              setPhoneDraft(e.target.value);
              setPhoneError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPhone();
              }
            }}
            leading={<Phone />}
            error={phoneError}
            type="tel"
            name="invite-phone"
            autoComplete="off"
            enterKeyHint="done"
          />
          <Button size="md" variant="secondary" onClick={addPhone}>
            Add
          </Button>
        </div>
        {recentPhones.filter((r) => !phones.includes(r.phone)).length > 0 && (
          <div className="field">
            <span className="field__label">Invited before</span>
            <div className="suggest">
              {recentPhones
                .filter((r) => !phones.includes(r.phone))
                .map((r) => (
                  <button key={r.phone} type="button" className="suggest__chip" onClick={() => setPhones((l) => [...l, r.phone])}>
                    <Plus aria-hidden /> <span className="num">{r.phone}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
        {phones.length > 0 && (
          <ul className="create__phones">
            {phones.map((p) => (
              <li key={p}>
                <span className="num">{p}</span>
                <button type="button" aria-label={`Remove ${p}`} onClick={() => setPhones((l) => l.filter((x) => x !== p))}>
                  <X />
                </button>
              </li>
            ))}
          </ul>
        )}
        {!!people.data?.length && (
          <>
            <p className="menu-label">People you’ve done Pacts with</p>
            <ul className="contact-list">
              {people.data.map((p) => {
                const on = invitees.includes(p.id);
                return (
                  <li key={p.id}>
                    <button type="button" className={`contact ${on ? 'is-on' : ''}`} onClick={() => toggle(p.id)} aria-pressed={on}>
                      <Avatar userId={p.id} size="md" label={false} />
                      <span className="contact__name">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="contact__check" aria-hidden>
                        {on && <Check strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Modal>
    </Screen>
  );
}
