import { Check, CheckCircle2, ChevronRight, Circle, CircleDashed, CircleDot, Plus } from 'lucide-react';
import type { BudgetLine, Pact, Task } from '../../data/types';
import { getUser } from '../../data/users';
import { formatNairaCompact } from '../../lib/format';
import { colorOf } from '../../lib/pact';
import { taskStatusLabel, type AttentionItem, type Checkpoint } from '../../lib/plan';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import './plan.css';

/* What needs attention --------------------------------------------------- */

export function AttentionCard({ items, onAction, title = 'Needs attention' }: { items: AttentionItem[]; onAction: (item: AttentionItem) => void; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="attention" aria-labelledby="attention-title">
      <h2 id="attention-title" className="attention__title">
        {title}
      </h2>
      <ul>
        {items.map((it) => (
          <li key={it.key} className={`attention__item attention__item--${it.tone}`}>
            <span className="attention__dot" aria-hidden />
            <span className="attention__text">
              <strong>{it.title}</strong>
              {it.body && <span>{it.body}</span>}
            </span>
            {it.action && (
              <button type="button" className="attention__action" onClick={() => onAction(it)}>
                {it.action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The single most useful thing to do right now. One action, no competing buttons. */
export function NextStep({ item, onAction }: { item: AttentionItem; onAction: (item: AttentionItem) => void }) {
  return (
    <section className="nextstep" aria-labelledby="next-step">
      <h2 id="next-step" className="nextstep__label">
        Next step
      </h2>
      <p className="nextstep__title">{item.title}</p>
      {item.body && <p className="nextstep__body">{item.body}</p>}
      <Button fullWidth onClick={() => onAction(item)}>
        {item.action!.label}
      </Button>
    </section>
  );
}

/** Organiser only: is the Pact moving? A short list of what's done and what's left, never a dashboard. */
export function OrganizerProgress({ rows, onInvite }: { rows: Checkpoint[]; onInvite: () => void }) {
  if (rows.length < 2) return null;
  return (
    <section className="progress" aria-labelledby="getting-there">
      <h2 id="getting-there" className="progress__title">
        Getting there
      </h2>
      <ul>
        {rows.map((r) => (
          <li key={r.key} className={r.done ? 'is-done' : ''}>
            {r.done ? <CheckCircle2 aria-hidden /> : <Circle aria-hidden />}
            <span className="visually-hidden">{r.done ? 'Done: ' : 'To do: '}</span>
            {r.to ? (
              <button type="button" className="progress__link" onClick={onInvite}>
                {r.text}
              </button>
            ) : (
              <span>{r.text}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* The plan: budget lines ---------------------------------------------------- */

export function BudgetList({ lines, editable, onEdit, onAdd }: { lines: BudgetLine[]; editable?: boolean; onEdit?: (line: BudgetLine) => void; onAdd?: () => void }) {
  return (
    <div className="budget">
      <ul className="budget__list">
        {lines.map((l) => {
          const pct = Math.min(100, (l.funded / l.amount) * 100);
          const full = l.funded >= l.amount;
          const Row = editable ? 'button' : 'div';
          return (
            <li key={l.id}>
              <Row {...(editable ? { type: 'button' as const, onClick: () => onEdit?.(l) } : {})} className="budget__row">
                <span className="budget__head">
                  <span className="budget__name">{l.name}</span>
                  <span className={`budget__state num ${full ? 'is-full' : ''}`}>
                    {full ? (
                      <>
                        <Check aria-hidden /> Funded
                      </>
                    ) : l.funded > 0 ? (
                      `${formatNairaCompact(l.funded)} of ${formatNairaCompact(l.amount)}`
                    ) : (
                      `${formatNairaCompact(l.amount)} · not yet`
                    )}
                  </span>
                </span>
                <span className="budget__bar" role="progressbar" aria-label={`${l.name} funded`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                  <span style={{ width: `${pct}%` }} />
                </span>
                {!!l.paid && <span className="budget__paid num">{formatNairaCompact(l.paid)} paid to vendors</span>}
              </Row>
            </li>
          );
        })}
      </ul>
      {editable && onAdd && (
        <button type="button" className="plan-add" onClick={onAdd}>
          <Plus aria-hidden /> Add a budget line
        </button>
      )}
    </div>
  );
}

/* Tasks -------------------------------------------------------------------- */

const statusIcon = { open: <Circle />, in_progress: <CircleDot />, done: <Check strokeWidth={3} /> };

export function TaskList({ pact, tasks, meId, onOpen, onAdd }: { pact: Pact; tasks: Task[]; meId: string; onOpen: (t: Task) => void; onAdd?: () => void }) {
  const budget = new Map((pact.budget ?? []).map((b) => [b.id, b.name]));
  const order = { in_progress: 0, open: 1, done: 2 };
  const sorted = [...tasks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div className="tasks">
      {sorted.length === 0 ? (
        <p className="plan-empty">
          <CircleDashed aria-hidden /> No tasks yet. Add anything the group needs to get done.
        </p>
      ) : (
        <ul className="tasks__list">
          {sorted.map((t) => {
            const who = t.assigneeId ? (t.assigneeId === meId ? 'You' : getUser(t.assigneeId).name) : 'Nobody yet';
            return (
              <li key={t.id}>
                <button type="button" className={`task task--${t.status}`} onClick={() => onOpen(t)} aria-label={`${t.title}. ${taskStatusLabel[t.status]}. ${t.assigneeId ? `Handled by ${who}` : 'Unassigned'}.`}>
                  <span className="task__status" aria-hidden>
                    {statusIcon[t.status]}
                  </span>
                  <span className="task__text">
                    <span className="task__title">{t.title}</span>
                    <span className="task__meta">
                      {taskStatusLabel[t.status]}
                      {t.budgetItemId && budget.get(t.budgetItemId) ? ` · ${budget.get(t.budgetItemId)}` : ''}
                    </span>
                  </span>
                  <span className={`task__who ${t.assigneeId ? '' : 'is-open'}`}>
                    {t.assigneeId ? <Avatar userId={t.assigneeId} size="xs" accent accentColor={colorOf(pact, t.assigneeId)} label={false} /> : null}
                    <span className="task__who-name">{who}</span>
                  </span>
                  <ChevronRight className="task__chevron" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onAdd && (
        <button type="button" className="plan-add" onClick={onAdd}>
          <Plus aria-hidden /> Add a task
        </button>
      )}
    </div>
  );
}
