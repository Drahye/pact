import { Bell, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { useActivity, useNotifications, usePacts, useWallet } from '../../api/hooks';
import { ErrorState } from '../../components/app/States';
import { PactListSkeleton } from '../../components/app/Skeleton';
import { WalletStrip } from '../../components/app/WalletCard';
import { attentionFor } from '../../lib/plan';
import { isoDay } from '../../lib/dates';
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
  // The most personal thing each open Pact needs from you, across all your Pacts.
  const needs = open
    .map((p) => ({ pact: p, item: attentionFor(p, user?.id ?? '')[0] }))
    .filter((x) => x.item)
    .slice(0, 4);

  return (
    <Screen tabBar={<BottomNav />} className="home">
      <header className="home__header">
        <div>
          <p className="eyebrow">{formatDate(isoDay(new Date()), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
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

      {needs.length > 0 && (
        <section className="screen-section screen-section--first" aria-labelledby="needs">
          <SectionHeading id="needs" title="Needs your attention" />
          <ul className="needs">
            {needs.map(({ pact, item }) => (
              <li key={pact.id}>
                <Link to={`/app/pact/${pact.id}`} className={`needs__row needs__row--${item!.tone}`}>
                  <span className="needs__dot" aria-hidden />
                  <span className="needs__text">
                    <span className="needs__pact">{pact.title}</span>
                    <strong>{item!.title}</strong>
                  </span>
                  <ChevronRight aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pacts.error ? (
        <ErrorState onRetry={() => pacts.refetch()} />
      ) : pacts.isLoading ? (
        <div className="screen-section list-stack">
          <PactListSkeleton label="Loading your Pacts" />
        </div>
      ) : (
        <>
          {!mine.length && !invites.length && (
            <section className="home__empty">
              <span className="home__empty-icon" aria-hidden>
                <Sparkles />
              </span>
              <h2>Nothing planned yet.</h2>
              <p>Create your first Pact and bring your people in.</p>
            </section>
          )}
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

      <div className="screen-section">
        <WalletStrip balance={wallet.data?.balance} />
      </div>

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
