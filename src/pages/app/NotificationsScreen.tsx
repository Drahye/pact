import { Bell, BellRing, CheckCheck, Gift, ShieldAlert, Wallet } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarkRead, useNotifications } from '../../api/hooks';
import { Empty, ErrorState } from '../../components/app/States';
import { RowListSkeleton } from '../../components/app/Skeleton';
import { IconButton } from '../../components/ui/IconButton';
import { TopBar } from '../../components/ui/TopBar';
import { formatRelative } from '../../lib/format';
import { Screen } from './Screen';
import './notifications.css';

const icon = (type: string) => {
  if (type === 'security') return { el: <ShieldAlert />, tint: 'coral' };
  if (['topup', 'withdrawal', 'refund', 'released'].includes(type)) return { el: <Wallet />, tint: 'mint' };
  if (type === 'invite' || type === 'funded') return { el: <Gift />, tint: 'lilac' };
  if (type === 'nudge' || type === 'reminder') return { el: <BellRing />, tint: 'sun' };
  return { el: <Bell />, tint: 'sky' };
};

export function NotificationsScreen() {
  const notes = useNotifications();
  const markRead = useMarkRead();
  const navigate = useNavigate();
  const unread = notes.data?.unread ?? 0;

  // Opening the screen counts as seeing them, after a beat so unread styling is visible.
  useEffect(() => {
    if (!unread) return;
    const t = window.setTimeout(() => markRead.mutate(undefined), 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  return (
    <Screen
      topBar={
        <TopBar
          backTo="/app/home"
          title="Notifications"
          trailing={unread ? <IconButton label="Mark all as read" icon={<CheckCheck />} onClick={() => markRead.mutate(undefined)} /> : undefined}
        />
      }
    >
      {notes.isLoading ? (
        <RowListSkeleton trailing={false} label="Loading notifications" />
      ) : notes.error ? (
        <ErrorState onRetry={() => notes.refetch()} />
      ) : !notes.data?.items.length ? (
        <Empty icon={<Bell />} title="You’re all caught up" body="Invites, contributions and wallet updates will show up here." />
      ) : (
        <ul className="notes">
          {notes.data.items.map((n) => {
            const i = icon(n.type);
            const body = (
              <>
                <span className={`notes__icon tint--${i.tint}`} aria-hidden>
                  {i.el}
                </span>
                <span className="notes__text">
                  <span className="notes__title">{n.title}</span>
                  <span className="notes__body">{n.body}</span>
                  <span className="notes__time">{formatRelative(n.createdAt)}</span>
                </span>
                {!n.readAt && (
                  <>
                    <span className="notes__dot" aria-hidden />
                    <span className="visually-hidden">Unread</span>
                  </>
                )}
              </>
            );
            return (
              <li key={n.id}>
                {n.pactId ? (
                  <button type="button" className="notes__row" onClick={() => navigate(`/app/pact/${n.pactId}`)}>
                    {body}
                  </button>
                ) : (
                  <div className="notes__row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
