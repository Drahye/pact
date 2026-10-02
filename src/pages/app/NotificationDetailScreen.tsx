import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useMarkRead, useNotification, usePact } from '../../api/hooks';
import { Loading, ErrorState } from '../../components/app/States';
import { dataFor, kindFor } from '../../components/communication/fromNotification';
import { renderTemplate } from '../../components/communication/registry';
import { TopBar } from '../../components/ui/TopBar';
import { notificationLink } from '../../../shared/notificationLink';
import { Screen } from './Screen';
import './notification-detail.css';

/**
 * One notification as a designed message: the same templates the gallery shows, filled with what happened and where the
 * Pact stands now. Opening it counts as reading it. Types without a template never get here (the list sends them straight
 * to where they lead), but if one does, it forwards instead of showing nothing.
 */
export function NotificationDetailScreen() {
  const { id } = useParams();
  const note = useNotification(id);
  const n = note.data;
  const pact = usePact(n?.pactId ?? undefined);
  const markRead = useMarkRead();

  useEffect(() => {
    if (n && !n.readAt) markRead.mutate([n.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n?.id]);

  if (note.isLoading) return <Loading full />;
  if (note.error || !n) return <Screen topBar={<TopBar backTo="/app/notifications" title="Notification" />}><ErrorState message="We couldn’t open that one." onRetry={() => note.refetch()} /></Screen>;
  const kind = kindFor(n);
  if (!kind) return <Navigate to={notificationLink(n) ?? '/app/notifications'} replace />;

  return (
    <Screen topBar={<TopBar backTo="/app/notifications" title="Notification" />}>
      <div className="note-detail">{renderTemplate(kind, dataFor(n, pact.data?.pact), 'h1')}</div>
    </Screen>
  );
}
