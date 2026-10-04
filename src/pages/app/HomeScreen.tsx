import { Bell, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { trackHome, useHome } from '../../api/home';
import { usePacts, useNotifications } from '../../api/hooks';
import { HomeFirstTime } from '../../features/onboarding/HomeStates';
import { introSeen } from '../../features/onboarding/store';
import { PushPrompt } from '../../components/app/PushPrompt';
import { ErrorState, Notice } from '../../components/app/States';
import { PactListSkeleton } from '../../components/app/Skeleton';
import { CirclesShelf, ComingUpSection, MadeItHappenSection, MakeHappenSection, NeedsYouSection, RecentSection } from '../../components/home/HomeBits';
import { PactCard } from '../../components/pact/PactCard';
import { Avatar } from '../../components/ui/Avatar';
import { BottomNav } from '../../components/ui/BottomNav';
import '../../components/ui/button.css';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { LargeTitle } from '../../components/ui/LargeTitle';
import { TopBar } from '../../components/ui/TopBar';
import { isoDay } from '../../lib/dates';
import { formatDate, greeting } from '../../lib/format';
import { Screen } from './Screen';
import { InvitationCard } from './InvitationCard';
import './home.css';

/**
 * Home answers one question: what needs me right now? One request builds it (Needs You, Circles, Coming up, Recent, what we
 * finished). Pacts stay a short list below, and invitations stay on top until answered.
 */
export function HomeScreen() {
  const { user } = useAuth();
  const home = useHome();
  const pacts = usePacts();
  const notes = useNotifications();
  const all = pacts.data ?? [];
  const invites = all.filter((p) => p.viewer?.status === 'invited');
  const mine = all.filter((p) => p.viewer?.status === 'joined');
  const running = mine.filter((p) => p.status === 'open' || p.status === 'funded').slice(0, 3);
  const unread = notes.data?.unread ?? 0;
  const h = home.data;
  const firstTime = pacts.isSuccess && !mine.length && !invites.length && h?.state === 'new';

  // One coarse "Home was looked at" per visit, once the data is in. Never what was on it.
  const seen = useRef(false);
  useEffect(() => {
    if (!h || seen.current) return;
    seen.current = true;
    trackHome('home_viewed', { state: h.state, has_needs: h.needsYou.length > 0 });
    if (h.needsYou.length) trackHome('home_needs_you_opened', { count: h.needsYou.length });
  }, [h]);

  // Brand new and has not seen the intro: show it first, then land back here.
  if (firstTime && user && !introSeen(user.id)) return <Navigate to="/app/onboarding" replace />;

  const stale = home.isError && !!h;
  return (
    <Screen
      tabBar={<BottomNav />}
      className="home"
      topBar={
        <TopBar
          leading="none"
          title="Home"
          collapse
          trailing={
            <span className="home__header-actions">
              <Link to="/app/notifications" className="icon-btn icon-btn--surface bell" aria-label={unread ? `Notifications, ${unread > 99 ? 'more than 99' : unread} unread` : 'Notifications'}>
                <Bell />
                {unread > 0 && <span className="bell__dot num">{unread > 99 ? '99+' : unread}</span>}
              </Link>
              <Link to="/app/profile" aria-label="Your profile" className="home__me">
                {user && <Avatar userId={user.id} size="md" label={false} />}
              </Link>
            </span>
          }
        />
      }
    >
      <LargeTitle className="home__header" eyebrow={formatDate(isoDay(new Date()), { weekday: 'long', month: 'long', day: 'numeric' })}>
        <span className="home__hi">{greeting()},</span>
        <span className="home__name">{user?.firstName}</span>
      </LargeTitle>

      <PushPrompt hasPact={mine.length > 0} />

      {stale && (
        <Notice tone="neutral">
          {typeof navigator !== 'undefined' && navigator.onLine === false ? 'You’re offline. This may be out of date.' : 'Couldn’t refresh. This may be out of date.'}
        </Notice>
      )}

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

      {home.isLoading && !h ? (
        <div className="screen-section list-stack">
          <PactListSkeleton label="Loading your Home" />
        </div>
      ) : !h ? (
        <ErrorState onRetry={() => home.refetch()} />
      ) : firstTime ? (
        <>
          <MakeHappenSection heading="What do you want to make happen?" />
          <section className="screen-section" aria-labelledby="home-circles">
            <Link to="/app/circles/new" className="home-circles__cta">
              <span className="icon-btn icon-btn--surface" aria-hidden>
                <Plus />
              </span>
              <span>
                <strong id="home-circles">Your people</strong>
                <span>Create a Circle for the groups you regularly do things with.</span>
              </span>
            </Link>
          </section>
          <HomeFirstTime compact />
        </>
      ) : (
        <>
          {h.state === 'finished_only' && <MakeHappenSection heading="You’ve made things happen before." />}
          <NeedsYouSection items={h.needsYou} total={h.needsYouTotal} circles={h.circles} />
          {h.state === 'finished_only' && <MadeItHappenSection items={h.recaps} />}
          {h.circles.length > 0 ? (
            <CirclesShelf circles={h.circles} />
          ) : (
            <section className="screen-section" aria-labelledby="home-circles">
              <Link to="/app/circles/new" className="home-circles__cta">
                <span className="icon-btn icon-btn--surface" aria-hidden>
                  <Plus />
                </span>
                <span>
                  <strong id="home-circles">Your people, in one place</strong>
                  <span>Create a Circle for the groups you regularly do things with.</span>
                </span>
              </Link>
            </section>
          )}
          <ComingUpSection items={h.comingUp} />
          {running.length > 0 && (
            <section className="screen-section" aria-labelledby="your-pacts">
              <SectionHeading id="your-pacts" title="Your Pacts" action={mine.length > 1 ? { label: 'See all', to: '/app/pacts' } : undefined} />
              <div className="list-stack">
                {running.map((p) => (
                  <PactCard key={p.id} pact={p} to={`/app/pact/${p.id}`} />
                ))}
              </div>
            </section>
          )}
          <RecentSection items={h.recent} />
          {h.state !== 'finished_only' && <MadeItHappenSection items={h.recaps} />}
        </>
      )}
    </Screen>
  );
}
