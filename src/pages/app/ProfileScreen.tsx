import { Handshake, Settings2, ShieldCheck, Wallet as WalletIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { useHome } from '../../api/home';
import { usePacts } from '../../api/hooks';
import { CirclesShelf, MadeItHappenSection } from '../../components/home/HomeBits';
import { AvatarStack, EmptyState, Hero, Sheet } from '../../components/objects';
import { SettingsGroup, SettingsRow } from '../../components/settings/Settings';
import { Bone } from '../../components/app/Skeleton';
import { Avatar } from '../../components/ui/Avatar';
import { BottomNav } from '../../components/ui/BottomNav';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/ui/TopBar';
import { formatNairaCompact } from '../../lib/format';
import { peopleLine } from '../../lib/peopleLine';
import { Screen } from './Screen';
import './profile.css';

/**
 * Me: your history with people. Who you are, who you do things with, and what you have made happen together. How you sign in, what is
 * verified, security and appearance are one tap away in Settings: this page is not an account dashboard.
 */
export function ProfileScreen() {
  const { user } = useAuth();
  const pacts = usePacts();
  const home = useHome();
  if (!user) return null;
  const mine = (pacts.data ?? []).filter((p) => p.viewer?.status === 'joined');
  const given = mine.reduce((sum, p) => sum + (p.members.find((m) => m.userId === user.id)?.contributed ?? 0), 0);
  const circles = home.data?.circles ?? [];
  const recaps = home.data?.recaps ?? [];
  // Everyone who shares a Circle with you, once, whichever Circles they are in.
  const people = [...new Set(circles.flatMap((c) => c.memberIds))].filter((id) => id !== user.id);
  // Until Home's data is in, say nothing about people or Circles: a zero or "No Circles yet" would be wrong for a moment.
  const loading = home.isLoading && !home.data;
  const since = new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Screen
      tabBar={<BottomNav />}
      className="profile xhero tint--pink"
      topBar={<TopBar leading="none" tone="transparent" title="Me" trailing={<Link to="/app/profile/settings" className="me__settings" aria-label="Settings"><Settings2 aria-hidden /></Link>} />}
    >
      <Hero tint="pink" className="xh--me">
        <Avatar userId={user.id} size="xl" />
        <div className="me__id">
          <h1 className="me__name">
            {user.firstName} {user.lastName}
          </h1>
          <p className="me__since">On PACT since {since}</p>
          {user.kycTier >= 2 && (
            <p className="me__trust">
              <ShieldCheck aria-hidden /> Identity verified
            </p>
          )}
        </div>
        {loading ? (
          <Bone w="100%" h={56} style={{ gridColumn: '1 / -1', borderRadius: 16 }} />
        ) : people.length > 0 ? (
          <div className="me__people">
            <AvatarStack userIds={people} total={people.length} size="md" max={6} />
            <p>
              You do things with <strong>{peopleLine(people, null, { names: 2 })}</strong>.
            </p>
          </div>
        ) : (
          <p className="me__people-empty">Your people will show up here once you start a Circle.</p>
        )}
        {!loading && recaps.length + circles.length > 0 && (
          <p className="me__story">
            {recaps.length > 0 ? (
              <>
                You’ve made <b className="num">{recaps.length}</b> {recaps.length === 1 ? 'thing' : 'things'} happen
                {people.length > 0 && (
                  <>
                    {' '}
                    with <b className="num">{people.length}</b> {people.length === 1 ? 'person' : 'people'}
                  </>
                )}
                .
              </>
            ) : (
              <>
                You’re in <b className="num">{circles.length}</b> {circles.length === 1 ? 'Circle' : 'Circles'}. Nothing has made it all the way yet.
              </>
            )}
            {given > 0 && (
              <>
                {' '}
                <span className="me__given-inline">
                  <b className="num">{formatNairaCompact(given)}</b> put in together.
                </span>
              </>
            )}
          </p>
        )}
      </Hero>
      <Sheet className="me-sheet">

      {loading ? null : recaps.length > 0 ? (
        <MadeItHappenSection items={recaps} title="What you made happen" />
      ) : (
        <section className="screen-section">
          <EmptyState kind="pact" compact title="Nothing made it all the way yet." body="When a Pact, plan or split finishes, it lands here." />
        </section>
      )}

      {loading ? (
        <section className="screen-section" aria-label="Loading">
          <Bone w="100%" h={168} style={{ borderRadius: 34 }} />
        </section>
      ) : circles.length > 0 ? (
        <CirclesShelf circles={circles} />
      ) : (
        <section className="screen-section">
          <EmptyState kind="circle" compact title="No Circles yet." body="Start with the people you already make plans with." action={<Button variant="secondary" to="/app/circles/new">Start a Circle</Button>} />
        </section>
      )}
      <SettingsGroup id="me-yours" title="Yours">
        <SettingsRow to="/app/pacts" icon={<Handshake />} tint="mint" title="Your Pacts" sub={mine.length ? `${mine.length} ${mine.length === 1 ? 'Pact' : 'Pacts'}, running and finished` : 'Everything you’re part of'} />
        <SettingsRow to="/app/wallet" icon={<WalletIcon />} tint="sun" title="Wallet" sub="Balance, top up and withdraw" />
      </SettingsGroup>

      <SettingsGroup id="me-settings" title="Settings">
        <SettingsRow to="/app/profile/settings" icon={<Settings2 />} title="Settings" sub="Account, notifications, appearance, privacy and security" />
      </SettingsGroup>
      </Sheet>
    </Screen>
  );
}
