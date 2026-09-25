import { Bell, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { useActivity, useNotifications, usePacts, useWallet } from '../../api/hooks';
import { ErrorState } from '../../components/app/States';
import { WalletCard } from '../../components/app/WalletCard';
import { FeaturedPactCard } from '../../components/pact/FeaturedPactCard';
import { PactCard } from '../../components/pact/PactCard';
import { ActivityItem } from '../../components/ui/ActivityItem';
import { Avatar } from '../../components/ui/Avatar';
import { BottomNav } from '../../components/ui/BottomNav';
import '../../components/ui/button.css';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { formatDate, greeting } from '../../lib/format';
import { summarize } from '../../lib/pact';
import { Screen } from './Screen';
import { InvitationCard } from './InvitationCard';
import './home.css';

export function HomeScreen() {
  const { user } = useAuth();
  const pacts = usePacts();
  const wallet = useWallet();
  const notes = useNotifications();
  const activity = useActivity();
  const all = pacts.data ?? [];
  const invites = all.filter((p) => p.viewer?.status === 'invited');
  const mine = all.filter((p) => p.viewer?.status === 'joined');
  const open = mine.filter((p) => p.status === 'open');
  // Feature the open Pact that closes soonest.
  const featured = [...open].sort((a, b) => summarize(a).daysLeft - summarize(b).daysLeft)[0];
  const rest = mine.filter((p) => p.id !== featured?.id && (p.status === 'open' || p.status === 'funded')).slice(0, 4);
  const unread = notes.data?.unread ?? 0;

  return (
    <Screen tabBar={<BottomNav />} className="home">
      <header className="home__header">
        <div>
          <p className="eyebrow">{formatDate(new Date().toISOString(), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="large-title">
            {greeting()}, {user?.firstName}
          </h1>
        </div>
        <div className="home__header-actions">
          <Link to="/app/notifications" className="icon-btn icon-btn--surface bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
            <Bell />
            {unread > 0 && <span className="bell__dot num">{unread > 9 ? '9+' : unread}</span>}
          </Link>
          <Link to="/app/profile" aria-label="Your profile" className="home__me">
            {user && <Avatar userId={user.id} size="md" label={false} />}
          </Link>
        </div>
      </header>

      <WalletCard balance={wallet.data?.balance} tier={wallet.data?.tier} />

      {invites.length > 0 && (
        <section className="screen-section" aria-labelledby="invites">
          <SectionHeading id="invites" title={`Invitations · ${invites.length}`} />
          <div className="list-stack">
            {invites.map((p) => (
              <InvitationCard key={p.id} pact={p} />
            ))}
          </div>
        </section>
      )}

      {pacts.error ? (
        <ErrorState onRetry={() => pacts.refetch()} />
      ) : pacts.isLoading ? (
        <div className="screen-section list-stack">
          <span className="skeleton skeleton--card" style={{ height: 300 }} />
          <span className="skeleton skeleton--card" />
        </div>
      ) : (
        <>
          {featured && (
            <section className="screen-section" aria-label="Closing soonest">
              <FeaturedPactCard pact={featured} to={`/app/pact/${featured.id}`} />
            </section>
          )}
          <section className="screen-section" aria-labelledby="your-pacts">
            <SectionHeading id="your-pacts" title="Your Pacts" action={mine.length > 1 ? { label: 'See all', to: '/app/pacts' } : undefined} />
            <div className="list-stack">
              {rest.map((p) => (
                <PactCard key={p.id} pact={p} to={`/app/pact/${p.id}`} />
              ))}
              <Link to="/app/create" className="home__new">
                <span className="icon-btn icon-btn--surface home__new-icon" aria-hidden>
                  <Plus />
                </span>
                <span>
                  <strong>{mine.length ? 'Start a new Pact' : 'Start your first Pact'}</strong>
                  <span>Trip, gift, event or shared bill</span>
                </span>
              </Link>
            </div>
          </section>
        </>
      )}

      {!!activity.data?.length && (
        <section className="screen-section" aria-labelledby="recent">
          <SectionHeading id="recent" title="Recent activity" action={{ label: 'See all', to: '/app/activity' }} />
          <ul className="activity-list">
            {activity.data.slice(0, 4).map((a) => (
              <li key={a.id}>
                <ActivityItem activity={a} to={`/app/pact/${a.pactId}`} meta={undefined} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  );
}
