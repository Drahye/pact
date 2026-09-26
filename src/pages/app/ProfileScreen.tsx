import { BadgeCheck, ChevronRight, Download, FileText, Gift, Landmark, LifeBuoy, LockKeyhole, LogOut, ShieldCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useProfileActions } from '../../api/hooks';
import { PinSheet } from '../../components/app/PinSheet';
import { Link, useNavigate } from 'react-router-dom';
import { TIER_LIMITS } from '../../../shared/policy';
import { useAuth } from '../../api/auth';
import { usePacts } from '../../api/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { BottomNav } from '../../components/ui/BottomNav';
import { useToast } from '../../components/ui/Toast';
import { formatNaira, formatPhone } from '../../lib/format';
import '../../components/app/app-ui.css';
import { clearReturnTo } from './auth/flow';
import { Screen } from './Screen';
import './profile.css';

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const pacts = usePacts();
  const navigate = useNavigate();
  const toast = useToast();
  const { closeAccount } = useProfileActions();
  const [closeOpen, setCloseOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  if (!user) return null;

  const download = async () => {
    setExporting(true);
    try {
      const data = await api<unknown>('GET', '/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pact-my-data.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Your data is downloading');
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
    } finally {
      setExporting(false);
    }
  };
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

      <p className="menu-label">Your data</p>
      <div className="menu">
        <button type="button" className="menu__row" onClick={download} disabled={exporting}>
          <span className="menu__icon tint--sky"><Download /></span>
          <span className="menu__text"><span className="menu__title">Download my data</span><span className="menu__sub">Profile, Pacts, transactions and devices as a file</span></span>
          <span className="menu__end">{exporting ? '…' : <ChevronRight />}</span>
        </button>
        <button type="button" className="menu__row menu__row--danger" onClick={() => setCloseOpen(true)}>
          <span className="menu__icon tint--coral"><UserX /></span>
          <span className="menu__text"><span className="menu__title">Close my account</span><span className="menu__sub">Needs an empty wallet and no money in open Pacts</span></span>
        </button>
      </div>

      <PinSheet
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close your account?"
        description="Your name and details are erased. Transaction records are kept for as long as financial regulations require. This can’t be undone. Enter your PIN to confirm."
        onSubmit={async (pin) => {
          await closeAccount.mutateAsync(pin);
          setCloseOpen(false);
          toast('Your account is closed');
          await signOut().catch(() => undefined);
          navigate('/app', { replace: true });
        }}
      />

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
          <span className="menu__text"><span className="menu__title">Terms, privacy and refunds</span></span>
          <span className="menu__end"><ChevronRight /></span>
        </Link>
        <button
          type="button"
          className="menu__row menu__row--danger"
          onClick={async () => {
            await signOut();
            clearReturnTo();
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
