import { AlertTriangle, Bell, BellRing, CheckCheck, CircleCheck, Clock, Coins, ListChecks, Megaphone, MessageCircle, PartyPopper, Pin, ShieldAlert, ShieldCheck, UserPlus, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationDTO } from '../../../shared/contracts';
import { notificationLink } from '../../../shared/notificationLink';
import { useMarkRead, useNotifications } from '../../api/hooks';
import { Empty, ErrorState } from '../../components/app/States';
import { RowListSkeleton } from '../../components/app/Skeleton';
import { IconButton } from '../../components/ui/IconButton';
import { TopBar } from '../../components/ui/TopBar';
import { formatRelative } from '../../lib/format';
import { Screen } from './Screen';
import './notifications.css';

type Look = { el: ReactNode; tint: string };
const looks: Record<string, Look> = {
  invite: { el: <UserPlus />, tint: 'lilac' },
  join: { el: <UserPlus />, tint: 'sky' },
  contribution: { el: <Coins />, tint: 'mint' },
  funded: { el: <PartyPopper />, tint: 'lilac' },
  completed: { el: <PartyPopper />, tint: 'mint' },
  approval: { el: <ShieldCheck />, tint: 'sun' },
  co_organizer: { el: <ShieldCheck />, tint: 'sun' },
  vendor_paid: { el: <CircleCheck />, tint: 'mint' },
  vendor_failed: { el: <AlertTriangle />, tint: 'coral' },
  task: { el: <ListChecks />, tint: 'sky' },
  task_due: { el: <Clock />, tint: 'coral' },
  update: { el: <Megaphone />, tint: 'mint' },
  pinned: { el: <Pin />, tint: 'sun' },
  comment: { el: <MessageCircle />, tint: 'sky' },
  nudge: { el: <BellRing />, tint: 'sun' },
  reminder: { el: <BellRing />, tint: 'sun' },
  pledge: { el: <BellRing />, tint: 'sun' },
  security: { el: <ShieldAlert />, tint: 'coral' },
  topup: { el: <Wallet />, tint: 'mint' },
  withdrawal: { el: <Wallet />, tint: 'mint' },
  refund: { el: <Wallet />, tint: 'mint' },
  released: { el: <Wallet />, tint: 'mint' },
};
const look = (type: string): Look => looks[type] ?? { el: <Bell />, tint: 'sky' };

function Row({ n, onOpen }: { n: NotificationDTO; onOpen: (n: NotificationDTO) => void }) {
  const l = look(n.type);
  return (
    <li>
      <button type="button" className={`notes__row ${n.readAt ? '' : 'is-unread'}`} onClick={() => onOpen(n)}>
        <span className={`notes__icon tint--${l.tint}`} aria-hidden>
          {l.el}
        </span>
        <span className="notes__text">
          <span className="notes__title">{n.title}</span>
          <span className="notes__body">{n.body}</span>
          <span className="notes__meta">
            {n.pactTitle && <span className="notes__pact">{n.pactTitle}</span>}
            <span className="notes__time">{formatRelative(n.createdAt)}</span>
          </span>
        </span>
        {!n.readAt && (
          <>
            <span className="notes__dot" aria-hidden />
            <span className="visually-hidden">Unread</span>
          </>
        )}
      </button>
    </li>
  );
}

function Section({ id, title, items, onOpen }: { id: string; title: string; items: NotificationDTO[]; onOpen: (n: NotificationDTO) => void }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby={id} className="notes__section">
      <h2 id={id} className="notes__heading">
        {title}
        <span className="notes__count num">{items.length}</span>
      </h2>
      <ul className="notes">
        {items.map((n) => (
          <Row key={n.id} n={n} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

export function NotificationsScreen() {
  const notes = useNotifications();
  const markRead = useMarkRead();
  const navigate = useNavigate();
  const items = notes.data?.items ?? [];
  const fresh = items.filter((n) => !n.readAt);
  const earlier = items.filter((n) => n.readAt);
  const unread = notes.data?.unread ?? 0;

  // Reading is something you do: tapping a line marks that one read and takes you there. Opening this screen,
  // or the app, leaves everything as it was, so nothing important is lost by looking.
  const open = (n: NotificationDTO) => {
    if (!n.readAt) markRead.mutate([n.id]);
    const to = notificationLink(n);
    if (to) navigate(to);
  };

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
      ) : !items.length ? (
        <Empty icon={<Bell />} title="You’re all caught up" body="Updates about your Pacts will show up here: invitations, goals reached, payments and things that need you." />
      ) : (
        <>
          <Section id="notes-new" title="New" items={fresh} onOpen={open} />
          <Section id="notes-earlier" title="Earlier" items={earlier} onOpen={open} />
        </>
      )}
    </Screen>
  );
}
