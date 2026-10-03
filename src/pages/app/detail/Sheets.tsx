import { Banknote, Check, CircleDot, Hand, Handshake, ListChecks, RotateCcw, Trash2, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '../../../api/client';
import { usePactPlan } from '../../../api/hooks';
import { Notice } from '../../../components/app/States';
import { AmountInput } from '../../../components/ui/AmountInput';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import type { BudgetLine, Pact, Participation, Task } from '../../../data/types';
import { getUser } from '../../../data/users';
import { formatNaira, toKobo } from '../../../lib/format';
import { clearDraft, readDraft, useSaveDraft } from '../../../lib/drafts';
import { colorOf, summarize } from '../../../lib/pact';
import { participationLabel } from '../../../lib/plan';
import '../../../components/app/app-ui.css';

const useRun = () => {
  const toast = useToast();
  return async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      return true;
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
      return false;
    }
  };
};

/* How are you showing up? ------------------------------------------------ */

const participationIcon: Record<Participation, JSX.Element> = { money: <Banknote />, task: <ListChecks />, both: <Handshake />, later: <Hand /> };
const participationTint: Record<Participation, string> = { money: 'mint', task: 'lilac', both: 'sun', later: 'sky' };

export function ParticipationPicker({ value, onChange }: { value: Participation | null; onChange: (p: Participation) => void }) {
  return (
    <div className="choices" role="radiogroup" aria-label="How you’re showing up">
      {(['money', 'task', 'both', 'later'] as Participation[]).map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} className={`choice ${value === p ? 'is-on' : ''}`} onClick={() => onChange(p)}>
          <span className={`choice__icon tint--${participationTint[p]}`}>{participationIcon[p]}</span>
          <span className="choice__text">
            <span className="choice__title">{participationLabel[p].long}</span>
          </span>
          <span className="choice__radio" aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function ParticipationSheet({ pact, open, onClose, current }: { pact: Pact; open: boolean; onClose: () => void; current: Participation | null }) {
  const plan = usePactPlan(pact.id);
  const run = useRun();
  const [value, setValue] = useState<Participation | null>(current);
  useEffect(() => setValue(current), [current, open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How are you showing up?"
      description="The group sees this, so everyone can plan around it."
      footer={
        <Button fullWidth disabled={!value} loading={plan.participation.isPending} onClick={async () => value && (await run(() => plan.participation.mutateAsync(value), 'Saved')) && onClose()}>
          Save
        </Button>
      }
    >
      <ParticipationPicker value={value} onChange={setValue} />
    </Modal>
  );
}

/* Task actions ------------------------------------------------------------- */

export function TaskSheet({ pact, task, meId, onClose }: { pact: Pact; task: Task | null; meId: string; onClose: () => void }) {
  const plan = usePactPlan(pact.id);
  const run = useRun();
  const [assignOpen, setAssignOpen] = useState(false);
  useEffect(() => setAssignOpen(false), [task?.id]);
  if (!task) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const isOrganizer = pact.organizerId === meId;
  const mine = task.assigneeId === meId;
  const canUpdate = mine || isOrganizer || !task.assigneeId;
  const canDelete = isOrganizer || (task.createdBy === meId && task.status === 'open');
  const busy = plan.updateTask.isPending || plan.deleteTask.isPending;
  const update = (body: { status?: Task['status']; assigneeId?: 'me' | string | null }, ok: string) =>
    run(() => plan.updateTask.mutateAsync({ id: task.id, ...body }), ok).then((done) => done && onClose());
  const members = pact.members.filter((m) => m.status === 'joined');
  const budgetName = pact.budget?.find((b) => b.id === task.budgetItemId)?.name;

  return (
    <Modal open onClose={onClose} title={task.title} description={task.assigneeId ? `${mine ? 'You’re' : `${getUser(task.assigneeId).name} is`} handling this${budgetName ? ` · ${budgetName}` : ''}` : `Nobody is doing this yet${budgetName ? ` · ${budgetName}` : ''}`}>
      {assignOpen ? (
        <ul className="contact-list">
          {members.map((m) => (
            <li key={m.userId}>
              <button type="button" className={`contact ${task.assigneeId === m.userId ? 'is-on' : ''}`} disabled={busy} onClick={() => update({ assigneeId: m.userId === meId ? 'me' : m.userId }, `Given to ${m.userId === meId ? 'you' : getUser(m.userId).name}`)}>
                <Avatar userId={m.userId} size="md" accent accentColor={colorOf(pact, m.userId)} label={false} />
                <span className="contact__name">{m.userId === meId ? 'You' : getUser(m.userId).fullName}</span>
                <span className="contact__check" aria-hidden>
                  {task.assigneeId === m.userId && <Check strokeWidth={3} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="menu">
          {!task.assigneeId && (
            <button type="button" className="menu__row" disabled={busy} onClick={() => update({ assigneeId: 'me' }, 'It’s yours')}>
              <span className="menu__icon tint--mint"><Hand /></span>
              <span className="menu__text"><span className="menu__title">I’ll do it</span><span className="menu__sub">Taking a task counts as showing up</span></span>
            </button>
          )}
          {canUpdate && task.status === 'open' && task.assigneeId && (
            <button type="button" className="menu__row" disabled={busy} onClick={() => update({ status: 'in_progress' }, 'Marked in progress')}>
              <span className="menu__icon tint--sun"><CircleDot /></span>
              <span className="menu__text"><span className="menu__title">Mark in progress</span></span>
            </button>
          )}
          {canUpdate && task.status !== 'done' && (
            <button type="button" className="menu__row" disabled={busy} onClick={() => update({ status: 'done' }, 'Done. Nice.')}>
              <span className="menu__icon tint--mint"><Check /></span>
              <span className="menu__text"><span className="menu__title">Mark done</span></span>
            </button>
          )}
          {canUpdate && task.status === 'done' && (
            <button type="button" className="menu__row" disabled={busy} onClick={() => update({ status: 'open' }, 'Reopened')}>
              <span className="menu__icon tint--sky"><RotateCcw /></span>
              <span className="menu__text"><span className="menu__title">Reopen</span></span>
            </button>
          )}
          {isOrganizer && (
            <button type="button" className="menu__row" disabled={busy} onClick={() => setAssignOpen(true)}>
              <span className="menu__icon tint--lilac"><ListChecks /></span>
              <span className="menu__text"><span className="menu__title">{task.assigneeId ? 'Give it to someone else' : 'Ask someone to do it'}</span></span>
            </button>
          )}
          {(mine || (isOrganizer && task.assigneeId)) && task.status !== 'done' && (
            <button type="button" className="menu__row" disabled={busy} onClick={() => update({ assigneeId: null }, mine ? 'You let it go' : 'Unassigned')}>
              <span className="menu__icon tint--sky"><UserMinus /></span>
              <span className="menu__text"><span className="menu__title">{mine ? 'Let it go' : 'Unassign'}</span></span>
            </button>
          )}
          {canDelete && (
            <button type="button" className="menu__row menu__row--danger" disabled={busy} onClick={() => run(() => plan.deleteTask.mutateAsync(task.id), 'Task removed').then((ok) => ok && onClose())}>
              <span className="menu__icon tint--coral"><Trash2 /></span>
              <span className="menu__text"><span className="menu__title">Remove task</span></span>
            </button>
          )}
          {!canUpdate && !isOrganizer && (
            <p className="sheet-note">Only {getUser(task.assigneeId!).name} or the organiser can update this task.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function AddTaskSheet({ pact, meId, open, onClose }: { pact: Pact; meId: string; open: boolean; onClose: () => void }) {
  const plan = usePactPlan(pact.id);
  const run = useRun();
  const [title, setTitle] = useState('');
  const [line, setLine] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const draftKey = `task.${pact.id}`;
  useEffect(() => {
    if (open) {
      const d = readDraft<{ title: string; line: string | null; mine: boolean }>(draftKey);
      setTitle(d?.title ?? '');
      setLine(d?.line ?? null);
      setMine(d?.mine ?? false);
    }
  }, [open, draftKey]);
  useSaveDraft(draftKey, { title, line, mine }, !title.trim(), open);
  const save = async () => {
    if (!title.trim()) return;
    const ok = await run(() => plan.addTask.mutateAsync({ title: title.trim(), budgetItemId: line, assigneeId: mine ? meId : null }), 'Task added');
    if (ok) {
      clearDraft(draftKey);
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a task"
      footer={
        <Button fullWidth disabled={!title.trim()} loading={plan.addTask.isPending} onClick={save}>
          Add task
        </Button>
      }
    >
      <div className="sheet-form">
        <Input label="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Pick up the cake" autoComplete="off" />
        {!!pact.budget?.length && (
          <div className="field">
            <span className="field__label">Part of the budget? (optional)</span>
            <div className="suggest">
              {pact.budget.map((b) => (
                <button key={b.id} type="button" className={`suggest__chip ${line === b.id ? 'is-on' : ''}`} aria-pressed={line === b.id} onClick={() => setLine(line === b.id ? null : b.id)}>
                  {line === b.id && <Check aria-hidden />} {b.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="sheet-check">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          <span>I’ll do this one</span>
        </label>
      </div>
    </Modal>
  );
}

/* Budget line (organiser) ---------------------------------------------------- */

export function BudgetLineSheet({ pact, line, open, onClose }: { pact: Pact; line: BudgetLine | null; open: boolean; onClose: () => void }) {
  const plan = usePactPlan(pact.id);
  const run = useRun();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  // Only a new line is remembered; editing an existing one starts from what's saved.
  const draftKey = `budget.${pact.id}`;
  useEffect(() => {
    if (open) {
      const d = line ? null : readDraft<{ name: string; amount: number }>(draftKey);
      setName(line?.name ?? d?.name ?? '');
      setAmount(line?.amount ?? d?.amount ?? 0);
    }
  }, [open, line, draftKey]);
  useSaveDraft(draftKey, { name, amount }, !name.trim() && amount < 1, open && !line);
  const busy = plan.addBudget.isPending || plan.updateBudget.isPending || plan.deleteBudget.isPending;
  const s = summarize(pact);
  const save = async () => {
    const body = { name: name.trim(), amount: toKobo(amount) };
    const ok = line ? await run(() => plan.updateBudget.mutateAsync({ id: line.id, ...body }), 'Budget updated') : await run(() => plan.addBudget.mutateAsync(body), 'Added to the budget');
    if (ok) {
      clearDraft(draftKey);
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={line ? 'Edit budget line' : 'Add to the budget'}
      description="The target is the budget total, and can’t drop below what’s already raised."
      footer={
        <div className="sheet-actions">
          {line && (
            <Button variant="secondary" disabled={busy} onClick={() => run(() => plan.deleteBudget.mutateAsync(line.id), 'Removed').then((ok) => ok && onClose())}>
              Remove
            </Button>
          )}
          <Button fullWidth disabled={!name.trim() || amount < 1} loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="sheet-form">
        <Input label="What for?" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Photography" autoComplete="off" />
        <AmountInput label="Amount" value={amount} onChange={setAmount} max={50_000_000} />
        <p className="field__hint num">Raised so far: {formatNaira(s.raised)}</p>
      </div>
    </Modal>
  );
}

/* Split the rest --------------------------------------------------------------- */

export function SplitSheet({ pact, open, onClose }: { pact: Pact; open: boolean; onClose: () => void }) {
  const plan = usePactPlan(pact.id);
  const run = useRun();
  const s = summarize(pact);
  const payers = pact.members.filter((m) => m.status === 'joined' && (m.participation ?? 'later') !== 'task');
  const share = payers.length ? Math.ceil(s.remaining / payers.length / 100) * 100 : 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Split the rest?"
      description={`${formatNaira(s.remaining)} to go.`}
      footer={
        <Button fullWidth disabled={!payers.length} loading={plan.splitRest.isPending} onClick={() => run(() => plan.splitRest.mutateAsync(undefined), 'Everyone’s been asked').then((ok) => ok && onClose())}>
          Ask {payers.length} {payers.length === 1 ? 'person' : 'people'} for {formatNaira(share)} each
        </Button>
      }
    >
      <ul className="split-list">
        {payers.map((m) => (
          <li key={m.userId}>
            <Avatar userId={m.userId} size="sm" accent accentColor={colorOf(pact, m.userId)} label={false} />
            <span>{getUser(m.userId).name}</span>
            <strong className="num">{formatNaira(share)}</strong>
          </li>
        ))}
      </ul>
      <Notice>Everyone gets a note with their share. Nobody is charged: each person still confirms their own contribution.</Notice>
    </Modal>
  );
}
