import { BadgeCheck, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIER_LIMITS, type KycTier } from '../../../../shared/policy';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { useProfileActions } from '../../../api/hooks';
import { Notice } from '../../../components/app/States';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { formatNairaKobo } from '../../../lib/format';
import { Screen } from '../Screen';
import '../../../components/app/app-ui.css';
import '../profile.css';

export function VerifyScreen() {
  const { user, config } = useAuth();
  const { verifyBvn } = useProfileActions();
  const toast = useToast();
  const navigate = useNavigate();
  const [bvn, setBvn] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState<string>();
  if (!user) return null;
  const verified = user.kycTier >= 2;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      await verifyBvn.mutateAsync({ bvn, dateOfBirth: dob });
      toast('You’re verified');
      navigate(-1);
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <Screen
      topBar={<TopBar backTo="/app/profile" title="Verification" />}
      footer={
        !verified && (
          <Button type="submit" form="bvn-form" fullWidth loading={verifyBvn.isPending} disabled={bvn.length !== 11 || !dob}>
            Verify BVN
          </Button>
        )
      }
    >
      <h1 className="large-title">{verified ? 'You’re verified' : 'Verify your identity'}</h1>
      <p className="screen-lede">
        {verified
          ? 'Your BVN is confirmed. Higher limits are on, and you can release Pact funds as an organiser.'
          : 'Nigerian regulations tie wallet limits to identity checks. Your BVN confirms who you are; it gives nobody access to your bank account.'}
      </p>

      <div className="tiers">
        {([1, 2, 3] as KycTier[]).map((t) => {
          const l = TIER_LIMITS[t];
          return (
            <div key={t} className={`tier ${user.kycTier === t ? 'is-current' : ''}`}>
              <div className="tier__head">
                <span>
                  <span className="tier__name">{l.label}</span> <span className="tier__req">· {l.requirement}</span>
                </span>
                {user.kycTier === t && (
                  <Badge tone="accent" icon={<BadgeCheck width={14} height={14} />}>
                    Current
                  </Badge>
                )}
              </div>
              <dl className="num">
                <dt>Wallet can hold</dt>
                <dd>{formatNairaKobo(l.maxBalance)}</dd>
                <dt>Top up per day</dt>
                <dd>{formatNairaKobo(l.dailyTopup)}</dd>
                <dt>Withdraw per day</dt>
                <dd>{formatNairaKobo(l.dailyWithdrawal)}</dd>
                <dt>Release Pact funds</dt>
                <dd>{l.canRelease ? 'Yes' : 'No'}</dd>
              </dl>
            </div>
          );
        })}
      </div>

      {!verified && (
        <form id="bvn-form" className="verify__form" onSubmit={submit} noValidate>
          <Input label="BVN" name="bvn" autoComplete="off" inputMode="numeric" maxLength={11} value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))} hint="Dial *565*0# from your bank-registered line to get it." className="num" />
          <Input label="Date of birth" name="bday" autoComplete="bday" type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10)} />
          <Notice icon={<Lock />}>We store only the last four digits and an encrypted copy for regulatory checks.{config?.sandbox && ' Sandbox: any 11 digits work.'}</Notice>
          {error && <Notice tone="danger">{error}</Notice>}
        </form>
      )}
    </Screen>
  );
}
