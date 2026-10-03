import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AskDTO, Attendance } from '../../../shared/contracts';
import { getUser } from '../../data/users';
import { CircleBadge } from '../circle/CircleBadge';
import { Avatar } from '../ui/Avatar';
import './ask.css';

export const attendanceLabel: Record<Attendance, string> = { in: 'In', maybe: 'Maybe', out: 'Can’t' };
const when = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

interface Props {
  ask: AskDTO;
  meId?: string;
  busy?: boolean;
  /** An answer chosen but not saved yet (waiting for sign-in, or a failed save). Shown as picked. */
  pending?: { optionId: string } | { attendance: Attendance } | null;
  onPick: (a: { optionId: string } | { attendance: Attendance }) => void;
  /** Slot for things that belong under the answers (a join prompt, a sign-in hint). */
  children?: ReactNode;
}

/** The question, the answers, and who said what. Used for members and for link visitors alike. */
export function AskView({ ask, meId, busy, pending, onPick, children }: Props) {
  const open = ask.status === 'open';
  const name = (id: string) => (id === meId ? 'You' : getUser(id).name);
  const total = ask.options.reduce((n, o) => n + o.count, 0);
  const max = Math.max(1, ...ask.options.map((o) => o.count));
  const mineOption = ask.mine?.optionId ?? null;
  const pendingOption = pending && 'optionId' in pending ? pending.optionId : null;
  const pendingAtt = pending && 'attendance' in pending ? pending.attendance : null;
  const labelOf = (id: string | null) => ask.options.find((o) => o.id === id)?.label ?? '';
  const voters = (optionId: string) => ask.responders.filter((r) => r.optionId === optionId).map((r) => r.userId);

  // The reward for answering: where the group has landed, said out loud.
  const leader = ask.type === 'choice' ? [...ask.options].sort((a, b) => b.count - a.count) : [];
  const top = leader[0];
  const leading = top && top.count > 0 && (leader[1]?.count ?? 0) < top.count ? top : null;
  const reward =
    !ask.mine || !open
      ? null
      : ask.type === 'choice'
        ? leading
          ? `${leading.label} is leading 🎉`
          : 'It’s a tie so far'
        : ask.mine.attendance === 'in'
          ? `You’re in 🎉 ${ask.attendance.in} ${ask.attendance.in === 1 ? 'person is' : 'people are'} going`
          : ask.mine.attendance === 'maybe'
            ? 'You’re a maybe. You can change it any time'
            : 'Maybe next time. You can change it any time';

  const mineText =
    ask.type === 'choice'
      ? ask.mine
        ? `you chose ${labelOf(mineOption)}`
        : ''
      : ask.mine?.attendance
        ? `you’re ${ask.mine.attendance === 'in' ? 'in' : ask.mine.attendance === 'maybe' ? 'a maybe' : 'out'}`
        : '';

  return (
    <section className="ask" aria-labelledby="ask-title">
      <p className="ask__circle">
        <CircleBadge emoji={ask.circle.emoji} tint={ask.circle.tint} size="sm" />
        <span>{ask.circle.name}</span>
      </p>
      <h1 id="ask-title" className="large-title ask__title">
        {ask.title}
      </h1>
      <p className={`ask__status ${open ? '' : 'is-closed'}`}>{open ? (ask.type === 'attendance' ? 'Who’s in?' : 'Vote below') : ask.type === 'choice' ? 'Decision made' : 'Responses closed'}</p>

      {ask.type === 'choice' ? (
        <div className="ask__options" role="radiogroup" aria-label={`Options for ${ask.title}`}>
          {ask.options.map((o) => {
            const mine = mineOption === o.id || (!ask.mine && pendingOption === o.id);
            const pct = Math.round((o.count / max) * 100);
            const who = voters(o.id);
            return (
              <button
                key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={mine}
                  disabled={!open || busy}
                  className={`ask__option ${mine ? 'is-mine' : ''}`}
                  onClick={() => onPick({ optionId: o.id })}
                  aria-label={`${o.label}, ${o.count} ${o.count === 1 ? 'vote' : 'votes'}${mine ? ', your vote' : ''}`}
                >
                  <span className="ask__bar" style={{ width: `${pct}%` }} aria-hidden />
                  <span className="ask__option-row">
                    <span className="ask__check" aria-hidden>
                      {mine && <Check strokeWidth={3} />}
                    </span>
                    <span className="ask__label">{o.label}</span>
                    <span className="ask__stack" aria-hidden>
                      {who.slice(0, 3).map((id) => (
                        <Avatar key={id} userId={id} size="xs" ring="surface" label={false} letters={1} />
                      ))}
                    </span>
                    <span className="ask__count num">{o.count}</span>
                  </span>
                </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="ask__att" role="radiogroup" aria-label="Your answer">
            {(['in', 'maybe', 'out'] as Attendance[]).map((a) => {
              const mine = ask.mine?.attendance === a || (!ask.mine && pendingAtt === a);
              return (
                <button key={a} type="button" role="radio" aria-checked={mine} disabled={!open || busy} className={`ask__att-btn ask__att-btn--${a} ${mine ? 'is-mine' : ''}`} onClick={() => onPick({ attendance: a })}>
                  {a === 'in' ? 'I’m in' : a === 'maybe' ? 'Maybe' : 'Can’t'}
                </button>
              );
            })}
          </div>
          <ul className="ask__roster" aria-label="Who’s answered">
            {ask.responders.map((r) => (
              <li key={r.userId}>
                <Avatar userId={r.userId} size="sm" label={false} />
                <span className="ask__roster-name">{name(r.userId)}</span>
                <span className={`ask__pill ask__pill--${r.attendance}`}>{r.attendance ? attendanceLabel[r.attendance] : ''}</span>
              </li>
            ))}
            {ask.waiting.map((id) => (
              <li key={id} className="is-waiting">
                <Avatar userId={id} size="sm" label={false} />
                <span className="ask__roster-name">{name(id)}</span>
                <span className="ask__pill">Not answered</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {reward && (
        <p className="ask__reward" role="status" aria-live="polite">
          {reward}
        </p>
      )}
      <p className="ask__summary" role="status" aria-live="polite">
        {!reward && <strong>{ask.headline}</strong>}
        <span>
          {mineText ? (reward ? `${mineText[0].toUpperCase()}${mineText.slice(1)}` : ` · ${mineText}`) : ''}
        </span>
        <span className="ask__people">
          {' '}
          · {ask.responseCount} of {Math.max(ask.memberCount, ask.responseCount)} {ask.type === 'choice' ? 'voted' : 'answered'}
        </span>
      </p>
      {!open && <p className="ask__hint">Responses are closed.</p>}
      {ask.type === 'choice' && total === 0 && open && <p className="ask__hint">Tap an option to vote. You can change it until it closes.</p>}
      {ask.mine && open && ask.type === 'choice' && <p className="ask__hint">You can change your vote until this closes.</p>}

      {children}

      {ask.activity.length > 0 && (
        <ul className="ask__feed" aria-label="Recent activity">
          {ask.activity.map((a, i) => (
            <li key={`${a.userId}-${a.at}-${i}`}>
              <Avatar userId={a.userId} size="sm" label={false} />
              <span className="ask__feed-text">
                {a.kind === 'closed'
                  ? `${name(a.userId)} closed it`
                  : ask.type === 'choice'
                    ? `${name(a.userId)} ${a.kind === 'changed' ? 'changed their vote to' : 'voted for'} ${labelOf(a.optionId)}`
                    : a.attendance === 'in'
                      ? `${name(a.userId)} ${a.userId === meId ? 'are' : 'is'} in`
                      : a.attendance === 'maybe'
                        ? `${name(a.userId)} said maybe`
                        : `${name(a.userId)} can’t make it`}
              </span>
              <span className="ask__when">{when(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
