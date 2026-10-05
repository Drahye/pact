import { BadgeCheck, Handshake, Mail, Settings2, ShieldCheck, Smartphone, Wallet as WalletIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAccount } from '../../api/account';
import { useAuth } from '../../api/auth';
import { useHome } from '../../api/home';
import { usePacts } from '../../api/hooks';
import { CirclesShelf, MadeItHappenSection } from '../../components/home/HomeBits';
import { EmptyState } from '../../components/objects';
import { SettingsGroup, SettingsRow } from '../../components/settings/Settings';
import { Avatar } from '../../components/ui/Avatar';
import { BottomNav } from '../../components/ui/BottomNav';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/ui/TopBar';
import { formatNaira, formatPhone } from '../../lib/format';
import { Screen } from './Screen';
import './profile.css';

/**
 * Me: about the person first. Who you are on PACT and how much it can trust you (a verified email, a verified phone), what you have
 * been part of, and what you have made happen. The machinery (sign-in, security, notifications, appearance) is one tap away in Settings.
 */
export function ProfileScreen() {
  const { user } = useAuth();
  const pacts = usePacts();
  const account = useAccount();
  const home = useHome();
  if (!user) return null;
  const a = account.data;
  const mine = (pacts.data ?? []).filter((p) => p.viewer?.status === 'joined');
  const given = mine.reduce((sum, p) => sum + (p.members.find((m) => m.userId === user.id)?.contributed ?? 0), 0);
  const circles = home.data?.circles ?? [];
  const recaps = home.data?.recaps ?? [];
  const phone = a?.phone ? formatPhone(a.phone.number) : user.phone ? formatPhone(user.phone) : null;
  const phoneVerified = !!a?.phone;

  return (
    <Screen
      tabBar={<BottomNav />}
      className="profile"
      topBar={<TopBar leading="none" title="Me" trailing={<Link to="/app/profile/settings" className="me__settings" aria-label="Settings"><Settings2 aria-hidden /></Link>} />}
    >
      <header className="me tint--mint">
        <Avatar userId={user.id} size="xl" />
        <div className="me__id">
          <h1 className="me__name">
            {user.firstName} {user.lastName}
          </h1>
          {user.kycTier >= 2 && (
            <p className="me__trust">
              <ShieldCheck aria-hidden /> Identity verified
            </p>
          )}
        </div>
        <ul className="me__ids" aria-label="How you’re verified">
          <li>
            <Mail aria-hidden />
            {a?.email ? (
              <>
                <span className="me__ids-text">{a.email.address}</span>
                <span className="me__ok">
                  <BadgeCheck aria-hidden /> Verified
                </span>
              </>
            ) : (
              <>
                <span className="me__ids-text">No email yet</span>
                <Link to="/app/profile/account" className="me__verify">
                  Add your email
                </Link>
              </>
            )}
          </li>
          <li>
            <Smartphone aria-hidden />
            {phoneVerified ? (
              <>
                <span className="me__ids-text num">{phone}</span>
                <span className="me__ok">
                  <BadgeCheck aria-hidden /> Verified
                </span>
              </>
            ) : (
              <>
                <span className="me__ids-text">Phone not verified</span>
                <Link to="/app/profile/account?verify=phone" className="me__verify">
                  Verify your phone
                </Link>
              </>
            )}
          </li>
        </ul>
        <dl className="me__stats">
          <div>
            <dd className="num">{circles.length}</dd>
            <dt>{circles.length === 1 ? 'Circle' : 'Circles'}</dt>
          </div>
          <div>
            <dd className="num">{mine.length}</dd>
            <dt>{mine.length === 1 ? 'Pact' : 'Pacts'}</dt>
          </div>
          <div>
            <dd className="num">{recaps.length}</dd>
            <dt>Made it happen</dt>
          </div>
          <div>
            <dd className="num">{formatNaira(given)}</dd>
            <dt>contributed</dt>
          </div>
        </dl>
      </header>

      {circles.length > 0 ? (
        <CirclesShelf circles={circles} />
      ) : (
        <section className="screen-section">
          <EmptyState kind="circle" compact title="No Circles yet." body="Start with the people you already make plans with." action={<Button variant="secondary" to="/app/circles/new">Start a Circle</Button>} />
        </section>
      )}
      {recaps.length > 0 ? (
        <MadeItHappenSection items={recaps} />
      ) : (
        <section className="screen-section">
          <EmptyState kind="pact" compact title="Nothing made it all the way yet." body="When a Pact, plan or split finishes, it lands here." />
        </section>
      )}

      <SettingsGroup id="me-yours" title="Yours">
        <SettingsRow to="/app/pacts" icon={<Handshake />} tint="mint" title="Your Pacts" sub={mine.length ? `${mine.length} ${mine.length === 1 ? 'Pact' : 'Pacts'}, running and finished` : 'Everything you’re part of'} />
        <SettingsRow to="/app/wallet" icon={<WalletIcon />} tint="sun" title="Wallet" sub="Balance, top up and withdraw" />
      </SettingsGroup>

      <SettingsGroup id="me-settings" title="Settings">
        <SettingsRow to="/app/profile/settings" icon={<Settings2 />} title="Settings" sub="Account, notifications, appearance, privacy and security" />
      </SettingsGroup>
    </Screen>
  );
}
