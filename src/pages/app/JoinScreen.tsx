import { CalendarDays, Users } from 'lucide-react';
import { useState } from 'react';
import type { Participation } from '../../data/types';
import { ParticipationPicker } from './detail/Sheets';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useInvitePreview, useJoinByCode } from '../../api/hooks';
import { CategoryIcon } from '../../components/pact/category';
import { ErrorState, Loading, Notice } from '../../components/app/States';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import { daysUntil, formatDate, formatDaysLeft, formatNairaKobo } from '../../lib/format';
import { setReturnTo } from './auth/flow';
import { Screen } from './Screen';
import './join.css';

/** Where an invite link lands. Anyone can see what it's for; joining needs an account. */
export function JoinScreen() {
  const { code = '' } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const preview = useInvitePreview(code);
  const join = useJoinByCode();
  // A choice made before signing up is remembered for the way back.
  const [choice, setChoice] = useState<Participation | null>(() => {
    try {
      return (sessionStorage.getItem(`pact.joinChoice.${code}`) as Participation | null) ?? null;
    } catch {
      return null;
    }
  });

  if (preview.isLoading) return <Screen topBar={<TopBar backTo="/app" />}><Loading /></Screen>;
  if (preview.error || !preview.data) {
    const notFound = (preview.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar backTo="/app" />}>
        <ErrorState message={notFound ? 'This invite link doesn’t work any more. Ask for a new one.' : undefined} onRetry={notFound ? undefined : () => preview.refetch()} />
      </Screen>
    );
  }
  const p = preview.data;
  const pct = Math.min(100, (p.raised / p.target) * 100);
  const open = p.status === 'open';

  const onJoin = async () => {
    if (status !== 'signedIn') {
      try {
        if (choice) sessionStorage.setItem(`pact.joinChoice.${code}`, choice);
      } catch {
        /* ignore */
      }
      setReturnTo(`/app/join/${code}`);
      navigate('/app/auth/phone');
      return;
    }
    try {
      const r = await join.mutateAsync({ code, participation: choice });
      try {
        sessionStorage.removeItem(`pact.joinChoice.${code}`);
      } catch {
        /* ignore */
      }
      toast(`You’re in ${r.data.pact.title}`);
      navigate(`/app/pact/${r.data.pact.id}`, { replace: true });
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
    }
  };

  return (
    <Screen
      topBar={<TopBar backTo={status === 'signedIn' ? '/app/home' : '/app'} />}
      footer={
        open ? (
          <Button fullWidth onClick={onJoin} loading={join.isPending} disabled={!choice}>
            {!choice ? 'Choose how you’ll show up' : status === 'signedIn' ? 'Join this Pact' : 'Sign up to join'}
          </Button>
        ) : undefined
      }
      className="join"
    >
      <p className="eyebrow">{p.organizer.firstName} invited you to</p>
      <div className="join__card">
        <CategoryIcon category={p.category} size="lg" />
        <h1 className="join__title">{p.title}</h1>
        <p className="join__amount num">
          <strong>{formatNairaKobo(p.raised)}</strong> of {formatNairaKobo(p.target)}
        </p>
        <ProgressBar value={pct} label={`${Math.round(pct)}% funded`} />
        <ul className="join__facts">
          <li>
            <Users aria-hidden /> {p.memberCount} {p.memberCount === 1 ? 'person' : 'people'} in
          </li>
          <li>
            <CalendarDays aria-hidden /> {formatDate(p.deadline, { month: 'short', day: 'numeric' })} · {formatDaysLeft(daysUntil(p.deadline))}
          </li>
        </ul>
      </div>
      {!open && <Notice>This Pact isn’t taking new people. It’s {p.status === 'funded' ? 'already fully funded' : 'closed'}.</Notice>}
      {open && (
        <section className="join__choose" aria-labelledby="join-how">
          <h2 id="join-how" className="join__how-title">
            Make it happen together. How do you want to show up?
          </h2>
          <ParticipationPicker value={choice} onChange={setChoice} />
        </section>
      )}
      <ul className="join__how">
        <li>Money goes into the Pact, not anyone’s personal account.</li>
        <li>Everyone in the Pact sees every contribution.</li>
        <li>If the goal isn’t reached, the Pact’s rule decides: usually a full refund.</li>
      </ul>
    </Screen>
  );
}
