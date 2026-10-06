import { Bell, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { trackHome, useHome } from '../../api/home';
import { usePacts, useNotifications } from '../../api/hooks';
import { HomeFirstTime } from '../../features/onboarding/HomeStates';
import { introSeen } from '../../features/onboarding/store';
import { SignInUpgradePrompt } from '../../components/app/SignInUpgradePrompt';
import { PushPrompt } from '../../components/app/PushPrompt';
import { ErrorState, Loading, Notice } from '../../components/app/States';
import { CirclesShelf, ComingUpSection, HomePulse, HomeShortcuts, MadeItHappenSection, NeedsYouSection, RecentSection } from '../../components/home/HomeBits';
import { Hero, Sheet } from '../../components/objects';
import { HomeSkeleton } from '../../components/home/HomeSkeleton';
import { HomeStart } from '../../components/home/HomeStart';
import { Avatar } from '../../components/ui/Avatar';
import { BottomNav } from '../../components/ui/BottomNav';
import '../../components/ui/button.css';
import { SectionHeading } from '../../components/ui/SectionHeading';
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
  // Someone who has not seen the intro might be brand new, and that is only known once both requests answer. Until then show no Home at all (no title,
  // greeting or tab bar), so a new person goes straight to the intro instead of seeing Home for a second first. Someone who has seen it never waits here.
  if (user && !introSeen(user.id) && (pacts.isPending || home.isPending)) return <Loading full label="Getting things ready" />;

  const stale = home.isError && !!h;
  // Two quiet prompts, never above what needs you: notifications first, then the better way to sign in.
  const prompts = (
    <>
      <PushPrompt hasPact={mine.length > 0} />
      <SignInUpgradePrompt />
    </>
  );
  return (
    <Screen
      tabBar={<BottomNav />}
      className="home xhero xhero--home"
      topBar={
        <TopBar
          leading="none"
          tone="transparent"
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
      <Hero className="xh--home home__header">
        <p className="home__date">{formatDate(isoDay(new Date()), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="home__title">
          <span className="home__hi">{greeting()},</span>
          <span className="home__name">{user?.firstName}</span>
        </h1>
        {h && !firstTime && h.state !== 'new' && <HomePulse total={h.needsYouTotal} next={h.comingUp[0]} recent={h.recent} selfId={user?.id} />}
      </Hero>
      <Sheet>
        {h && !firstTime && h.state !== 'new' && <HomeShortcuts />}
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
        <HomeSkeleton />
      ) : !h ? (
        <ErrorState onRetry={() => home.refetch()} />
      ) : firstTime ? (
        <>
          <HomeStart variant="new" />
          {prompts}
          <HomeFirstTime compact brief />
        </>
      ) : (
        <>
          {h.state === 'finished_only' && <HomeStart variant="again" />}
          <NeedsYouSection items={h.needsYou} total={h.needsYouTotal} circles={h.circles} caughtUp={h.state === 'active'} />
          {prompts}
          {h.circles.length > 0 ? (
            <CirclesShelf circles={h.circles} />
          ) : (
            <section className="screen-section" aria-label="Circles">
              <Link to="/app/circles/new" className="hm-circle-cta">
                <span className="icon-btn icon-btn--surface" aria-hidden>
                  <Plus />
                </span>
                <span>
                  <strong>Start a Circle</strong>
                  <span>Your people, in one place.</span>
                </span>
              </Link>
            </section>
          )}
          <ComingUpSection items={h.comingUp} />
          <RecentSection items={h.recent} />
          <MadeItHappenSection items={h.recaps} />
        </>
      )}
      </Sheet>
    </Screen>
  );
}
