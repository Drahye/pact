import { Megaphone, Pin, PinOff, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { newIdempotencyKey, type ApiError } from '../../../api/client';
import { useConversation, useThread } from '../../../api/hooks';
import { Notice } from '../../../components/app/States';
import { ActivityItem, describeActivity } from '../../../components/ui/ActivityItem';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import type { Activity, Pact, ReactionKey } from '../../../data/types';
import { getUser } from '../../../data/users';
import { formatRelative } from '../../../lib/format';
import { COMMENT_MAX, REACTIONS } from '../../../lib/reactions';
import './conversation.css';

/**
 * Conversation attached to activity, not a chat room: a short thread under each meaningful item,
 * four reactions, an organiser's updates in the same stream, and one pinned item.
 */

/** Housekeeping nobody needs to pin. Mirrors the server, which is the real check. */
const NOT_PINNABLE = ['join', 'committed', 'created', 'co_organizer', 'left', 'nudge'];
export const isPinnable = (a: Activity) => !NOT_PINNABLE.includes(a.type);

const plainWords = (a: Activity, meId: string) => {
  if (a.type === 'update') return a.body ?? '';
  const d = describeActivity(a, meId);
  return `${d.name} ${d.verb}${d.amount ? ` ${d.amount}` : ''}`;
};

/* Pinned ---------------------------------------------------------------------- */

/** One compact card near the top of the Pact. Tapping it opens the item's discussion. */
export function PinnedCard({ pact, meId, onOpen }: { pact: Pact; meId: string; onOpen: (a: Activity) => void }) {
  const pinned = pact.pinned;
  if (!pinned) return null;
  const a = pinned.activity;
  const by = pinned.pinnedBy === meId ? 'you' : getUser(pinned.pinnedBy).name;
  return (
    <button type="button" className="pinned" onClick={() => onOpen(a)} aria-label={`Pinned ${a.type === 'update' ? 'update' : 'item'}: ${plainWords(a, meId)}. Open the discussion`}>
      <span className="pinned__icon" aria-hidden>
        <Pin />
      </span>
      <span className="pinned__text">
        <span className="pinned__label">{a.type === 'update' ? 'Pinned update' : 'Pinned'}</span>
        <span className="pinned__body">{plainWords(a, meId)}</span>
        <span className="pinned__meta">
          Pinned by {by} · {formatRelative(pinned.pinnedAt)}
          {(a.commentCount ?? 0) > 0 ? ` · ${a.commentCount} ${a.commentCount === 1 ? 'comment' : 'comments'}` : ''}
        </span>
      </span>
    </button>
  );
}

/* A short text box with a counter ---------------------------------------------- */

function Composer({
  label,
  placeholder,
  submitLabel,
  pending,
  error,
  onSubmit,
  onChange,
  value,
  stacked = false,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Button under the box instead of beside it: for a longer note in a narrow sheet. */
  stacked?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const empty = value.trim().length === 0;
  // Grow with the text, up to a few lines, so the box never takes over the sheet.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!empty && !pending) onSubmit();
  };
  return (
    <form className="composer" onSubmit={submit}>
      {error && (
        <Notice tone="danger">{error}</Notice>
      )}
      <div className={`composer__row ${stacked ? 'composer__row--stacked' : ''}`}>
        <label className="visually-hidden" htmlFor="composer-input">
          {label}
        </label>
        <textarea
          id="composer-input"
          ref={ref}
          className="composer__input"
          rows={1}
          maxLength={COMMENT_MAX}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
        />
        <Button type="submit" size="md" iconLeft={<Send />} disabled={empty || pending} loading={pending} aria-label={submitLabel}>
          {submitLabel}
        </Button>
      </div>
      {value.length >= COMMENT_MAX - 100 && (
        <p className="composer__count num" aria-live="polite">
          {value.length}/{COMMENT_MAX}
        </p>
      )}
    </form>
  );
}

/* Thread ----------------------------------------------------------------------- */

export function ThreadSheet({ pact, activityId, meId, onClose }: { pact: Pact; activityId: string | null; meId: string; onClose: () => void }) {
  const toast = useToast();
  const thread = useThread(pact.id, activityId);
  const convo = useConversation(pact.id);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // One key per distinct message: a retry of the same text can never post it twice.
  const attempt = useRef<{ text: string; key: string } | null>(null);
  const runsMoney = pact.members.some((m) => m.userId === meId && m.status === 'joined' && (m.role === 'organizer' || m.role === 'co_organizer'));

  // A different item starts with a clean box.
  useEffect(() => {
    setText('');
    setError(null);
    setConfirmRemove(false);
    attempt.current = null;
  }, [activityId]);

  const data = thread.data;
  const activity = data?.activity;
  // After sending, bring the new comment into view.
  const end = useRef<HTMLLIElement>(null);
  const count = data?.comments.length ?? 0;
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    lastCount.current = count;
  }, [count]);
  const mine = (k: ReactionKey) => !!activity?.myReactions?.includes(k);
  const isPinned = pact.pinned?.activity.id === activityId;
  const isMyUpdate = activity?.type === 'update' && activity.userId === meId && runsMoney;
  const canReply = data?.canReply ?? false;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
    } catch (err) {
      toast((err as ApiError).message ?? 'That didn’t work. Try again.', 'neutral');
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!activityId || !body || sending) return;
    if (!attempt.current || attempt.current.text !== body) attempt.current = { text: body, key: newIdempotencyKey() };
    setSending(true);
    setError(null);
    try {
      await convo.comment.mutateAsync({ activityId, body, key: attempt.current.key });
      setText('');
      attempt.current = null;
    } catch (err) {
      // Whatever went wrong, what you typed is still here.
      setError(`${(err as ApiError).message ?? 'Couldn’t send.'} Your comment is still here.`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={!!activityId}
      onClose={onClose}
      title="Discussion"
      footer={
        data ? (
          canReply ? (
            <Composer label="Add a comment" placeholder="Add a comment" submitLabel="Send" pending={sending} error={error} value={text} onChange={setText} onSubmit={() => void send()} />
          ) : (
            <Notice tone="sun">This Pact is closed, so the discussion is read-only.</Notice>
          )
        ) : undefined
      }
    >
      {thread.isLoading && <p className="thread__status">Loading…</p>}
      {thread.isError && !data && (
        <Notice tone="danger">
          Couldn’t load this discussion.{' '}
          <button type="button" className="link-button" onClick={() => void thread.refetch()}>
            Try again
          </button>
        </Notice>
      )}
      {activity && (
        <div className="thread">
          <div className="thread__item">
            <ActivityItem activity={activity} viewerId={meId} />
          </div>

          <div className="thread__reactions" role="group" aria-label="Reactions">
            {REACTIONS.map((r) => {
              const n = activity.reactions?.[r.key] ?? 0;
              return (
                <button
                  key={r.key}
                  type="button"
                  className={`react ${mine(r.key) ? 'is-on' : ''}`}
                  aria-pressed={mine(r.key)}
                  aria-label={`${r.label}${n ? `, ${n}` : ''}`}
                  disabled={!canReply || convo.react.isPending}
                  onClick={() => void run(() => convo.react.mutateAsync({ activityId: activity.id, reaction: r.key, on: !mine(r.key) }))}
                >
                  <span aria-hidden>{r.emoji}</span>
                  {n > 0 && <span className="num">{n}</span>}
                </button>
              );
            })}
          </div>

          {runsMoney && (isPinnable(activity) || isMyUpdate) && (
            <div className="thread__tools">
              {isPinnable(activity) && (
                <button
                  type="button"
                  className="thread__tool"
                  disabled={!canReply || convo.pin.isPending}
                  onClick={() => void run(() => convo.pin.mutateAsync(isPinned ? null : activity.id), isPinned ? 'Unpinned' : 'Pinned to the top')}
                >
                  {isPinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {isPinned ? 'Unpin' : 'Pin to top'}
                </button>
              )}
              {isMyUpdate && (
                <button
                  type="button"
                  className="thread__tool thread__tool--danger"
                  disabled={convo.removeUpdate.isPending}
                  onClick={() => {
                    if (!confirmRemove) return setConfirmRemove(true);
                    void run(() => convo.removeUpdate.mutateAsync(activity.id), 'Update removed').then(onClose);
                  }}
                >
                  <Trash2 aria-hidden /> {confirmRemove ? 'Tap again to remove' : 'Remove update'}
                </button>
              )}
            </div>
          )}

          <h3 className="thread__heading">Comments{data.comments.filter((c) => !c.deleted).length ? ` · ${data.comments.filter((c) => !c.deleted).length}` : ''}</h3>
          {data.comments.length === 0 ? (
            <p className="thread__empty">No comments yet. Keep it short and to the point.</p>
          ) : (
            <ul className="thread__comments">
              {data.comments.map((c, i) => (
                <li key={c.id} className="comment" ref={i === data.comments.length - 1 ? end : undefined}>
                  <Avatar userId={c.userId} size="sm" label={false} />
                  <div className="comment__main">
                    <p className="comment__head">
                      <strong>{c.userId === meId ? 'You' : getUser(c.userId).name}</strong>
                      <span className="comment__time">{formatRelative(c.createdAt)}</span>
                    </p>
                    {c.deleted ? <p className="comment__removed">Comment removed</p> : <p className="comment__body">{c.body}</p>}
                  </div>
                  {c.userId === meId && !c.deleted && canReply && (
                    <button type="button" className="comment__remove" aria-label="Remove your comment" onClick={() => void run(() => convo.removeComment.mutateAsync({ commentId: c.id, activityId: activity.id }), 'Comment removed')}>
                      <Trash2 aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/* Post an update --------------------------------------------------------------- */

/** For organisers: a short note that joins the activity stream, so the group can react to it and talk about it. */
export function UpdateSheet({ pact, open, onClose }: { pact: Pact; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const convo = useConversation(pact.id);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const attempt = useRef<{ text: string; key: string } | null>(null);

  const post = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (!attempt.current || attempt.current.text !== body) attempt.current = { text: body, key: newIdempotencyKey() };
    setSending(true);
    setError(null);
    try {
      await convo.postUpdate.mutateAsync({ body, key: attempt.current.key });
      setText('');
      attempt.current = null;
      toast('Update posted. The group has been told.');
      onClose();
    } catch (err) {
      setError(`${(err as ApiError).message ?? 'Couldn’t post.'} Your update is still here.`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Post an update" description="A short note for everyone in the Pact. It joins the activity, and people can react and comment on it.">
      <div className="update-form">
        <Composer label="Update" placeholder="Venue confirmed for Saturday" submitLabel="Post update" stacked pending={sending} error={error} value={text} onChange={setText} onSubmit={() => void post()} />
        <p className="update-form__hint">
          <Megaphone aria-hidden /> Updates are for running the plan. They can’t change what the Pact records, like contributions and payments.
        </p>
      </div>
    </Modal>
  );
}
