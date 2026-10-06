import { BadgeCheck, Download, FileText, Gift, Landmark, LifeBuoy, LockKeyhole, LogOut, ShieldCheck, Smartphone, UserRound, UserX } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIER_LIMITS } from '../../../../shared/policy';
import { useAccount } from '../../../api/account';
import { useAuth } from '../../../api/auth';
import { api, ApiError } from '../../../api/client';
import { useProfileActions } from '../../../api/hooks';
import { PinSheet } from '../../../components/app/PinSheet';
import { PushSetting } from '../../../components/app/PushSetting';
import { IosInstallSheet } from '../../../components/pwa/InstallPactPrompt';
import { SettingsGroup, SettingsRow } from '../../../components/settings/Settings';
import { Button } from '../../../components/ui/Button';
import { Segmented } from '../../../components/ui/Segmented';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { usePwaInstall } from '../../../hooks/usePwaInstall';
import { shareOrCopy } from '../../../lib/shareLink';
import { useTheme, type Theme } from '../../../theme/useTheme';
import { clearReturnTo } from '../auth/flow';
import { PageHero } from '../../../components/objects';
import { Screen } from '../Screen';
import '../profile.css';

/**
 * Everything you can change, in six calm groups. Nothing here is the first thing you see on Me: Me is about the person, this is the
 * machinery, so it lives one tap in.
 */
export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const account = useAccount();
  const navigate = useNavigate();
  const toast = useToast();
  const { closeAccount } = useProfileActions();
  const { theme, setTheme } = useTheme();
  const pwa = usePwaInstall();
  const [closeOpen, setCloseOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  if (!user) return null;
  const a = account.data;
  const tier = TIER_LIMITS[user.kycTier];
  const ways = [a?.email && 'Email', a?.google.connected && 'Google', a?.phone && 'Phone'].filter(Boolean).join(', ');

  const download = async () => {
    setExporting(true);
    try {
      const data = await api<unknown>('GET', '/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pact-my-data.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Your data is downloading');
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
    } finally {
      setExporting(false);
    }
  };
  const invite = async () => {
    const r = await shareOrCopy({ title: 'Make it happen together on PACT', text: `I use PACT to actually get group plans done: the people, money and tasks in one place. Join with my code ${user.referralCode}: ${window.location.origin}/download` });
    if (r === 'copied') toast('Invite copied');
  };

  return (
    <Screen className="settings xhero xhero--lite tint--lilac" topBar={<TopBar tone="transparent" backTo="/app/profile" title="Settings" collapse />}>
      <PageHero tint="lilac" title="Settings" />

      <SettingsGroup id="st-account" title="Account">
        <SettingsRow to="/app/profile/account" icon={<UserRound />} title="Account and sign-in" sub={ways || 'How you sign in'} />
        <SettingsRow
          to="/app/profile/verify"
          icon={user.kycTier >= 2 ? <BadgeCheck /> : <ShieldCheck />}
          tint={user.kycTier >= 2 ? 'mint' : 'sun'}
          title={user.kycTier >= 2 ? 'Identity verified' : 'Verify your identity'}
          sub={user.kycTier >= 2 ? `${tier.label} account` : 'Needed to release a Pact’s funds or withdraw more'}
        />
        <SettingsRow to="/app/profile/banks" icon={<Landmark />} tint="lilac" title="Bank accounts" sub="Where withdrawals go" />
      </SettingsGroup>

      <PushSetting />

      <SettingsGroup id="st-look" title="Appearance" plain>
        <Segmented<Theme>
          label="Appearance"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <p className="appearance__hint">{theme === 'system' ? 'Matches your phone’s setting.' : theme === 'light' ? 'Always light.' : 'Always dark.'}</p>
      </SettingsGroup>

      <SettingsGroup id="st-privacy" title="Privacy">
        <SettingsRow onClick={download} disabled={exporting} icon={<Download />} title="Download my data" sub="Your profile, Pacts and transactions as a file" end={exporting ? '…' : undefined} />
        <SettingsRow onClick={() => setCloseOpen(true)} icon={<UserX />} tint="coral" danger title="Close my account" sub="Needs an empty wallet and no money in open Pacts" end={<span />} />
      </SettingsGroup>

      <SettingsGroup id="st-security" title="Security">
        <SettingsRow
          to="/app/profile/security"
          icon={<LockKeyhole />}
          tint="mint"
          title="PIN and devices"
          sub={user.hasPin ? 'Change or reset your PIN, sign out other devices' : 'Create a PIN when you need to approve something sensitive'}
        />
      </SettingsGroup>

      <SettingsGroup id="st-about" title="About">
        <SettingsRow onClick={invite} icon={<Gift />} tint="sun" title="Tell a friend about PACT" sub={`Your code ${user.referralCode}`} />
        {pwa.available && <SettingsRow onClick={() => (pwa.canInstall ? void pwa.install() : setIosOpen(true))} icon={<Smartphone />} tint="mint" title="Install PACT" sub="Add PACT to your Home Screen" />}
        <SettingsRow href="mailto:support@pact.africa?subject=PACT%20help" icon={<LifeBuoy />} title="Help and support" sub="We reply within a day" />
        <SettingsRow to="/terms" icon={<FileText />} tint="pink" title="Terms, privacy and refunds" />
      </SettingsGroup>

      <div className="st-signout">
        <Button
          variant="secondary"
          fullWidth
          iconLeft={<LogOut />}
          onClick={async () => {
            await signOut();
            clearReturnTo();
            navigate('/app', { replace: true });
          }}
        >
          Sign out
        </Button>
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
      <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />
    </Screen>
  );
}
