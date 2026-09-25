import { BadgeCheck, ChevronRight, FileText, Gift, Landmark, LifeBuoy, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { TIER_LIMITS } from '../../../shared/policy';
import { useAuth } from '../../api/auth';
import { usePacts } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { BottomNav } from '../../components/ui/BottomNav';
import { useToast } from '../../components/ui/Toast';
import { formatNaira, formatPhone } from '../../lib/format';
import '../../components/app/app-ui.css';
import { Screen } from './Screen';
import './profile.css';

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const pacts = usePacts();
  const navigate = useNavigate();
  const toast = useToast();
  if (!user) return null;
  const mine = (pacts.data ?? []).filter((p) => p.viewer?.status === 'joined');
  const given = mine.reduce((sum, p) => sum + (p.members.find((m) => m.userId === user.id)?.contributed ?? 0), 0);
  const tier = TIER_LIMITS[user.kycTier];

  const shareInvite = async () => {
    const text = `I use PACT to pool money with friends. Sign up with my code ${user.referralCode}: ${window.location.origin}/download`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me on PACT', text });
      } catch {
        /* dismissed */
      }
    } else {
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      toast('Invite copied');
    }
  };

  return (
    <Screen tabBar={<BottomNav />} className="profile">
      <div className="profile__head">
        <Avatar userId={user.id} size="xl" />
        <h1 className="large-title">
          {user.firstName} {user.lastName}
        </h1>
        <p className="profile__phone num">{formatPhone(user.phone)}</p>
        <div className="profile__stats">
          <span>
            <strong className="num">{mine.length}</strong> Pacts
          </span>
          <span>
            <strong className="num">{formatNaira(given)}</strong> contributed
          </span>
        </div>
      </div>

      <Link to="/app/profile/verify" className={`profile__tier ${user.kycTier >= 2 ? 'is-verified' : ''}`}>
        {user.kycTier >= 2 ? <BadgeCheck aria-hidden /> : <ShieldCheck aria-hidden />}
        <span>
          <strong>{user.kycTier >= 2 ? `${tier.label} account` : 'Verify your identity'}</strong>
          <span>{user.kycTier >= 2 ? `BVN ••${user.bvnLast4 ?? '••••'} · higher limits on` : 'Raise your limits and release Pact funds'}</span>
        </span>
        <ChevronRight aria-hidden />
      </Link>

      <p className="menu-label">Money</p>
      <div className="menu">
        <Link to="/app/profile/banks" className="menu__row">
          <span className="menu__icon tint--lilac"><Landmark /></span>
          <span className="menu__text"><span className="menu__title">Bank accounts</span><span className="menu__sub">Where withdrawals go</span></span>
          <span className="menu__end"><ChevronRight /></span>
        </Link>
        <Link to="/app/profile/security" className="menu__row">
          <span className="menu__icon tint--mint"><LockKeyhole /></span>
          <span className="menu__text"><span className="menu__title">PIN and devices</span><span className="menu__sub">Change PIN, sign out other devices</span></span>
          <span className="menu__end"><ChevronRight /></span>
        </Link>
      </div>

      <p className="menu-label">More</p>
      <div className="menu">
        <button type="button" className="menu__row" onClick={shareInvite}>
          <span className="menu__icon tint--sun"><Gift /></span>
          <span className="menu__text"><span className="menu__title">Invite friends</span><span className="menu__sub num">Your code {user.referralCode}</span></span>
          <span className="menu__end"><ChevronRight /></span>
        </button>
        <a href="mailto:support@pact.africa?subject=PACT%20help" className="menu__row">
          <span className="menu__icon tint--sky"><LifeBuoy /></span>
          <span className="menu__text"><span className="menu__title">Help and support</span><span className="menu__sub">We reply within a day</span></span>
          <span className="menu__end"><ChevronRight /></span>
        </a>
        <Link to="/terms" className="menu__row">
          <span className="menu__icon tint--pink"><FileText /></span>
          <span className="menu__text"><span className="menu__title">Terms and privacy</span></span>
          <span className="menu__end"><ChevronRight /></span>
        </Link>
        <button
          type="button"
          className="menu__row menu__row--danger"
          onClick={async () => {
            await signOut();
            navigate('/app', { replace: true });
          }}
        >
          <span className="menu__icon tint--coral"><LogOut /></span>
          <span className="menu__text"><span className="menu__title">Sign out</span></span>
        </button>
      </div>
    </Screen>
  );
}
