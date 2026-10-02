import { Check, CircleDashed, Clock, Quote as QuoteIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { getUser } from '../../data/users';
import { formatNaira } from '../../lib/format';
import { SegmentedRing } from '../pact/SegmentedRing';
import { Avatar } from '../ui/Avatar';
import { CommunicationCard } from './CommunicationCard';
import type { BudgetLineData, CommunicationData } from './model';

/** Building blocks the templates share. Each is small on purpose: a template is a few of these in a row. */

/** A big amount with a caption: the one number the message is about. */
export function AmountHero({ amount, caption, tone = 'default' }: { amount: number; caption: string; tone?: 'default' | 'good' }) {
  return (
    <CommunicationCard className={`comm-amount comm-amount--${tone}`} label={caption}>
      <p className="comm-amount__value num">{formatNaira(amount)}</p>
      <p className="comm-amount__caption">{caption}</p>
    </CommunicationCard>
  );
}

export function StatGrid({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <CommunicationCard className="comm-stats" label="At a glance">
      <dl>
        {stats.map((s) => (
          <div key={s.label}>
            <dd className="num">{s.value}</dd>
            <dt>{s.label}</dt>
          </div>
        ))}
      </dl>
    </CommunicationCard>
  );
}

export function Quote({ children, by }: { children: ReactNode; by?: string }) {
  return (
    <CommunicationCard className="comm-quote" label="Message">
      <QuoteIcon aria-hidden className="comm-quote__mark" />
      <blockquote>{children}</blockquote>
      {by && <p className="comm-quote__by">{by}</p>}
    </CommunicationCard>
  );
}

export function StepList({ title, steps }: { title: string; steps: { title: string; body: string }[] }) {
  return (
    <CommunicationCard className="comm-steps" label={title}>
      <h3 className="comm-card__title">{title}</h3>
      <ol>
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="comm-steps__n num" aria-hidden>
              {i + 1}
            </span>
            <span>
              <strong>{s.title}</strong>
              <span>{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </CommunicationCard>
  );
}

const statusLook = {
  paid: { label: 'Paid', icon: <Check aria-hidden />, cls: 'good' },
  pending: { label: 'Pending', icon: <Clock aria-hidden />, cls: 'wait' },
  not_paid: { label: 'Not paid', icon: <CircleDashed aria-hidden />, cls: 'quiet' },
} as const;

export function LineList({ title, lines }: { title: string; lines: BudgetLineData[] }) {
  return (
    <CommunicationCard className="comm-lines" label={title}>
      <h3 className="comm-card__title">{title}</h3>
      <ul>
        {lines.map((l) => {
          const s = statusLook[l.status];
          return (
            <li key={l.name}>
              <span className="comm-lines__name">
                <strong>{l.name}</strong>
                <span className="num">{formatNaira(l.amount)}</span>
              </span>
              <span className={`comm-chip comm-chip--${s.cls}`}>
                {s.icon}
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </CommunicationCard>
  );
}

/** A task, who has it, and where it stands. Status is written out, not just coloured. */
export function TaskCard({ data }: { data: CommunicationData }) {
  const done = data.taskStatus === 'done';
  const who = data.assigneeName;
  const pct = data.tasksTotal ? Math.round(((data.tasksDone ?? 0) / data.tasksTotal) * 100) : null;
  return (
    <CommunicationCard className="comm-task" label="Task">
      <div className="comm-task__row">
        <span className={`comm-task__mark ${done ? 'is-done' : ''}`} aria-hidden>
          {done && <Check />}
        </span>
        <span className="comm-task__text">
          <strong>{data.taskName ?? 'A task'}</strong>
          {who && <span>{done ? `Done by ${who}` : `With ${who}`}</span>}
        </span>
        <span className={`comm-chip comm-chip--${done ? 'good' : 'wait'}`}>{done ? <Check aria-hidden /> : <Clock aria-hidden />}{done ? 'Done' : data.taskStatus === 'claimed' ? 'In progress' : 'To do'}</span>
      </div>
      {pct !== null && (
        <p className="comm-task__plan">
          <span className="num">{data.tasksDone} of {data.tasksTotal}</span> tasks done in {data.pactName}
        </p>
      )}
    </CommunicationCard>
  );
}

/** The Pact's ring, one colour per person: the same picture the app uses for progress. */
export function PeopleRing({ data, size = 132, children }: { data: CommunicationData; size?: number; children?: ReactNode }) {
  const ids = data.people?.length ? data.people : [];
  const target = data.targetAmount ?? 1;
  const raised = Math.min(data.raisedAmount ?? target, target);
  const shares = ids.length ? ids.map((id) => ({ id, color: getUser(id).color, value: raised / ids.length })) : [{ id: 'all', color: 'var(--color-accent)', value: raised }];
  return (
    <SegmentedRing shares={shares} target={target} size={size} stroke={Math.round(size * 0.12)} label={`${data.pactName} funding`} animate={false}>
      {children}
    </SegmentedRing>
  );
}

export function Person({ userId, name, note }: { userId?: string; name: string; note?: string }) {
  return (
    <span className="comm-person">
      {userId ? <Avatar userId={userId} size="md" label={false} /> : <span className="comm-person__initial" aria-hidden>{name[0]}</span>}
      <span className="comm-person__text">
        <strong>{name}</strong>
        {note && <span>{note}</span>}
      </span>
    </span>
  );
}
