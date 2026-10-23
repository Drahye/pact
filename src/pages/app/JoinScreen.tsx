import { CalendarDays, Copy, Landmark, Users } from 'lucide-react';
import { useState } from 'react';
import type { Participation } from '../../data/types';
import { ParticipationPicker } from './detail/Sheets';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useInvitePreview, useJoinByCode } from '../../api/hooks';
import { coverOf } from '../../lib/covers';
import { ErrorState, Notice } from '../../components/app/States';
import { PactDetailSkeleton } from '../../components/app/Skeleton';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/ui/TopBar';
import { useToast } from '../../components/ui/Toast';
import { daysUntil, formatDate, formatDaysLeft, formatNairaKobo } from '../../lib/format';
import { setReturnTo } from './auth/flow';
import { Screen } from './Screen';
import './join.css';
import './detail/money.css';

/** "Tolu, Ada and 3 others": the first names shown, then the rest counted. */
const peopleSentence = (names: string[], total: number) => {
  const shown = names.slice(0, 2);
  const rest = total - shown.length;
  if (rest <= 0) return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0] ?? '';
  return `${shown.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
};

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

  if (preview.isLoading) return <Screen topBar={<TopBar backTo="/app" />}><PactDetailSkeleton label="Loading invite" /></Screen>;
  if (preview.error || !preview.data) {
    const notFound = (preview.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar backTo="/app" />}>
        <ErrorState message={notFound ? 'This invite link doesn’t work any more. Ask for a new one.' : undefined} onRetry={notFound ? undefined : () => preview.refetch()} />
      </Screen>
    );
  }
  const p = preview.data;
  const pct = p.target > 0 ? Math.min(100, (p.raised / p.target) * 100) : 0;
  const open = p.status === 'open';
  const faces = p.members ?? [];

  const onJoin = async () => {
    if (status !== 'signedIn') {
      try {
        if (choice) sessionStorage.setItem(`pact.joinChoice.${code}`, choice);
      } catch {
        /* ignore */
      }
      setReturnTo(`/app/join/${code}`);
      navigate('/app/auth/start');
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
      <header className="join__hero">
        <img className="join__photo" src={coverOf({ category: p.category, cover: p.cover, id: code })} alt="" decoding="async" />
        <div className="join__hero-body">
          <p className="join__eyebrow">{p.organizer.firstName} invited you to</p>
          <h1 className="join__title">{p.title}</h1>
          {faces.length > 0 && (
            <p className="join__people">
              <span className="join__faces" aria-hidden>
                {faces.map((f, i) =>
                  f.photoUrl ? (
                    <img key={i} src={f.photoUrl} alt="" style={{ ['--c' as string]: f.color }} />
                  ) : (
                    <span key={i} style={{ ['--c' as string]: f.color }}>
                      {f.firstName.slice(0, 1)}
                    </span>
                  ),
                )}
              </span>
              <span>{peopleSentence(faces.map((f) => f.firstName), p.memberCount)} {p.memberCount === 1 ? 'is' : 'are'} in.</span>
            </p>
          )}
        </div>
      </header>
      <div className="join__card">
        {p.mode === 'orders' ? (
          <p className="join__amount num">
            {p.target ? <><strong>{formatNairaKobo(p.target)}</strong> ordered so far</> : 'Taking orders now'}
          </p>
        ) : (
          <>
            <p className="join__amount num">
              <strong>{formatNairaKobo(p.raised)}</strong> of {formatNairaKobo(p.target)}
            </p>
            <ProgressBar value={pct} label={`${Math.round(pct)}% funded`} />
          </>
        )}
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
            Everyone brings something. How will you show up?
          </h2>
          <ParticipationPicker value={choice} onChange={setChoice} />
        </section>
      )}
      {p.bankAccount && (
        <section className="pay-transfer" aria-labelledby="join-pay">
          <div className="pay-transfer__head">
            <span className="pay-transfer__icon tint--mint" aria-hidden>
              <Landmark />
            </span>
            <div>
              <h2 id="join-pay" className="pay-transfer__title">
                Just want to pay, without an account?
              </h2>
              <p className="pay-transfer__sub">Transfer from any bank app. No account needed.</p>
            </div>
          </div>
          <button
            type="button"
            className="pay-transfer__number"
            onClick={() => navigator.clipboard?.writeText(p.bankAccount!.accountNumber).then(() => toast('Account number copied'))}
            aria-label={`Copy account number ${p.bankAccount.accountNumber}`}
          >
            <span className="num">{p.bankAccount.accountNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}</span>
            <Copy aria-hidden />
          </button>
          <p className="pay-transfer__meta">
            {p.bankAccount.bankName} · {p.bankAccount.accountName}
          </p>
          <p className="pay-transfer__hint">Your name shows in the Pact as a guest, with what you sent.</p>
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
