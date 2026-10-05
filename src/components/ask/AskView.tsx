import { useState, type ReactNode } from 'react';
import type { AskDTO, Attendance } from '../../../shared/contracts';
import { getUser } from '../../data/users';
import { ActivityRow, AskObject, AvatarStack, EmptyState, type AskOption } from '../objects';
import './ask.css';
import './ask-page.css';

export const attendanceLabel: Record<Attendance, string> = { in: 'In', maybe: 'Maybe', out: 'Can’t' };
const ATTENDANCE: { id: Attendance; label: string }[] = [
  { id: 'in', label: 'I’m in' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'out', label: 'Can’t' },
];

type Answer = { optionId: string } | { attendance: Attendance };

interface Props {
  ask: AskDTO;
  meId?: string;
  busy?: boolean;
  /** An answer chosen but not saved yet (waiting for sign-in, or a failed save). Shown as picked. */
  pending?: { optionId: string } | { attendance: Attendance } | null;
  /** Resolve true when the answer was saved, false when it was not (the pick is taken back). */
  onPick: (a: Answer) => void | Promise<unknown>;
  /** Slot for things that belong under the answers (a join prompt, a sign-in hint). */
  children?: ReactNode;
}

const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`);

/**
 * The question and what people said, on the Ask object. The question is the page; an answer lands at once (selected, its count ticks,
 * its bar grows) and the server confirms behind it. Used for members and for link visitors alike.
 */
export function AskView({ ask, meId, busy, pending, onPick, children }: Props) {
  const open = ask.status === 'open';
  const name = (id: string) => (id === meId ? 'You' : getUser(id).name);
  const choice = ask.type === 'choice';
  // What the person has just tapped, shown before the server has said so: the pick, and its count, move at once.
  const [local, setLocal] = useState<string | null>(null);
  const mineId = choice ? ask.mine?.optionId ?? null : ask.mine?.attendance ?? null;
  const pendingId = pending ? ('optionId' in pending ? pending.optionId : pending.attendance) : null;
  const selectedId = local ?? mineId ?? (!ask.mine ? pendingId : null);
  const shift = (id: string) => (local && local !== mineId ? (id === local ? 1 : id === mineId ? -1 : 0) : 0);

  const options: AskOption[] = choice
    ? ask.options.map((o) => ({ id: o.id, label: o.label, count: Math.max(0, o.count + shift(o.id)), voters: ask.responders.filter((r) => r.optionId === o.id).map((r) => r.userId) }))
    : ATTENDANCE.map((a) => ({ id: a.id, label: a.label, count: Math.max(0, ask.attendance[a.id] + shift(a.id)), voters: ask.responders.filter((r) => r.attendance === a.id).map((r) => r.userId) }));

  const of = Math.max(ask.memberCount, ask.responseCount, 1);
  const answered = ask.responseCount + (local && !ask.mine ? 1 : 0);
  const sorted = [...options].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const leading = choice && sorted[0] && (sorted[0].count ?? 0) > 0 && (sorted[1]?.count ?? 0) < (sorted[0].count ?? 0) ? sorted[0] : null;
  const said = selectedId !== null;

  // Said out loud, in a few words: where the group has landed, and where you stand.
  const line = !open
    ? ask.headline
    : !answered
      ? 'No one has answered yet.'
      : said
        ? choice
          ? leading
            ? `${leading.label} is leading`
            : 'It’s a tie so far'
          : ask.attendance.in + shift('in') > 0
            ? `${ask.attendance.in + shift('in')} ${ask.attendance.in + shift('in') === 1 ? 'person is' : 'people are'} going`
            : 'Nobody is in yet'
        : ask.headline;
  const statusText = `${line}${answered ? ` · ${answered} of ${of} answered` : ''}`;

  const waiting = ask.waiting.filter((id) => id !== meId);

  const choose = async (id: string) => {
    if (!open || busy || id === selectedId) return;
    setLocal(id);
    try {
      await onPick(choice ? { optionId: id } : { attendance: id as Attendance });
    } finally {
      // Saved, the server's answer now carries the pick. Not saved, it is taken back.
      setLocal(null);
    }
  };

  const kicker = choice ? 'Question' : 'Who’s in?';
  return (
    <div className="ask-page">
      <AskObject
        heading
        question={ask.title}
        kicker={kicker}
        tint={ask.circle.tint}
        options={options}
        selectedId={selectedId}
        onSelect={choose}
        closed={!open}
        countNoun={choice ? 'vote' : null}
        answered={answered}
        of={of}
        statusText={statusText}
      />

      {open && waiting.length > 0 && answered > 0 && (
        <p className="ask-page__waiting t-support">
          <AvatarStack userIds={waiting} size="xs" max={4} />
          <span>Waiting on {list(waiting.map((id) => getUser(id).name))}</span>
        </p>
      )}
      {open && choice && said && <p className="ask-page__hint t-meta">You can change your vote until this closes.</p>}
      {!open && <p className="ask-page__hint t-meta">Answers are closed.</p>}

      {children}

      {ask.activity.length > 0 ? (
        <section className="ask-page__lately" aria-labelledby="ask-lately">
          <h2 id="ask-lately" className="t-label">
            Lately
          </h2>
          <ul>
            {ask.activity.map((a, i) => (
              <li key={`${a.userId}-${a.at}-${i}`}>
                <ActivityRow
                  actorId={a.userId}
                  kind="ask"
                  at={a.at}
                  text={
                    a.kind === 'closed'
                      ? `${name(a.userId)} closed it`
                      : choice
                        ? `${name(a.userId)} ${a.kind === 'changed' ? 'changed their vote to' : 'voted for'} ${ask.options.find((o) => o.id === a.optionId)?.label ?? ''}`
                        : a.attendance === 'in'
                          ? `${name(a.userId)} ${a.userId === meId ? 'are' : 'is'} in`
                          : a.attendance === 'maybe'
                            ? `${name(a.userId)} said maybe`
                            : `${name(a.userId)} can’t make it`
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        open && !answered && <EmptyState kind="ask" compact title="Be the first to say." />
      )}
    </div>
  );
}
