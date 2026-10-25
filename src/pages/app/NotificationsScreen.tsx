import { BellIcon, BellRingingIcon, ChatCircleIcon, CheckCircleIcon, ChecksIcon, ClockIcon, CoinsIcon, ConfettiIcon, ListChecksIcon, MegaphoneIcon, PushPinIcon, ShieldCheckIcon, ShieldWarningIcon, UserPlusIcon, WalletIcon, WarningIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationDTO } from '../../../shared/contracts';
import { notificationLink } from '../../../shared/notificationLink';
import { kindFor } from '../../components/communication/fromNotification';
import { useMarkRead, useNotifications } from '../../api/hooks';
import { ErrorState } from '../../components/app/States';
import { CompletionState, PageHero } from '../../components/objects';
import { RowListSkeleton } from '../../components/app/Skeleton';
import { IconButton } from '../../components/ui/IconButton';
import { TopBar } from '../../components/ui/TopBar';
import { formatRelative } from '../../lib/format';
import { Screen } from './Screen';
import './notifications.css';

type Look = { el: ReactNode; tint: string };
const looks: Record<string, Look> = {
  invite: { el: <UserPlusIcon />, tint: 'lilac' },
  join: { el: <UserPlusIcon />, tint: 'sky' },
  contribution: { el: <CoinsIcon />, tint: 'mint' },
  funded: { el: <ConfettiIcon />, tint: 'lilac' },
  completed: { el: <ConfettiIcon />, tint: 'mint' },
  approval: { el: <ShieldCheckIcon />, tint: 'sun' },
  co_organizer: { el: <ShieldCheckIcon />, tint: 'sun' },
  vendor_paid: { el: <CheckCircleIcon />, tint: 'mint' },
  vendor_failed: { el: <WarningIcon />, tint: 'coral' },
  task: { el: <ListChecksIcon />, tint: 'sky' },
  task_due: { el: <ClockIcon />, tint: 'coral' },
  update: { el: <MegaphoneIcon />, tint: 'mint' },
  pinned: { el: <PushPinIcon />, tint: 'sun' },
  comment: { el: <ChatCircleIcon />, tint: 'sky' },
  nudge: { el: <BellRingingIcon />, tint: 'sun' },
  reminder: { el: <BellRingingIcon />, tint: 'sun' },
  pledge: { el: <BellRingingIcon />, tint: 'sun' },
  security: { el: <ShieldWarningIcon />, tint: 'coral' },
  topup: { el: <WalletIcon />, tint: 'mint' },
  withdrawal: { el: <WalletIcon />, tint: 'mint' },
  refund: { el: <WalletIcon />, tint: 'mint' },
  released: { el: <WalletIcon />, tint: 'mint' },
};
const look = (type: string): Look => looks[type] ?? { el: <BellIcon />, tint: 'sky' };

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
    // A designed message when this kind has one; otherwise straight to where it leads.
    if (kindFor(n)) navigate(`/app/notifications/${n.id}`);
    else {
      const to = notificationLink(n);
      if (to) navigate(to);
    }
  };

  return (
    <Screen
      className="xhero xhero--lite tint--sun"
      topBar={
        <TopBar
          tone="transparent"
          backTo="/app/home"
          title="Notifications"
          collapse
          trailing={unread ? <IconButton label="Mark all as read" icon={<ChecksIcon />} onClick={() => markRead.mutate(undefined)} /> : undefined}
        />
      }
    >
      <PageHero tint="sun" title="Notifications" subtitle="Invitations, answers, and what needs you." />
      {notes.isLoading ? (
        <RowListSkeleton trailing={false} label="Loading notifications" />
      ) : notes.error ? (
        <ErrorState onRetry={() => notes.refetch()} />
      ) : !items.length ? (
        <CompletionState size="sm" title="You’re all caught up." line="Nobody is waiting on you. New invitations and answers will land here." />
      ) : (
        <>
          <Section id="notes-new" title="New" items={fresh} onOpen={open} />
          <Section id="notes-earlier" title="Earlier" items={earlier} onOpen={open} />
        </>
      )}
    </Screen>
  );
}
