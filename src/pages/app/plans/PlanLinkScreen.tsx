import { Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Attendance, PlanDTO } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { useJoinCircleFromPlan, usePlanLink, usePlanLinkMine, useRsvpViaLink } from '../../../api/plans';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { ErrorState } from '../../../components/app/States';
import { PlanHeading, RsvpButtons } from '../../../components/plan/PlanBits';
import { PactLogo } from '../../../components/brand/PactLogo';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { getUser } from '../../../data/users';
import { goingText } from '../../../lib/planDates';
import { sharePlan } from '../../../lib/planShare';
import { setReturnTo } from '../auth/flow';
import { Screen } from '../Screen';
import '../../../components/plan/plan.css';

const key = (token: string, what: 'rsvp' | 'join') => `pact.plan.${what}.${token.slice(0, 12)}`;
const read = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    /* storage unavailable: the page still works, it just can't remember across sign-in */
  }
};

/**
 * Where a shared plan lands (/p/:token): when, where and who's in, with a one-tap RSVP. No navigation, no sign-up wall. The answer
 * is kept through sign-in and saved on the way back; only then is joining the Circle offered, and never automatically.
 */
export function PlanLinkScreen() {
  const { token = '' } = useParams();
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const signedIn = status === 'signedIn';
  const pub = usePlanLink(token);
  const mine = usePlanLinkMine(token, signedIn);
  const rsvp = useRsvpViaLink(token);
  const join = useJoinCircleFromPlan(token);
  const [pending, setPending] = useState<Attendance | null>(() => (read(key(token, 'rsvp')) as Attendance | null) ?? null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [changing, setChanging] = useState(false);
  const [joined, setJoined] = useState<{ id: string; name: string } | null>(null);
  const resumed = useRef(false);

  const plan: PlanDTO | undefined = (signedIn && mine.data?.plan) || pub.data;
  const saved = !!plan?.mine;
  const live = plan?.status === 'planning' || plan?.status === 'confirmed';
  const open = live && plan?.rsvpOpen !== false;

  const save = async (a: Attendance, afterAuth = false) => {
    setFailed(false);
    setPending(a);
    try {
      await rsvp.mutateAsync({ status: a, afterAuth });
      write(key(token, 'rsvp'), null);
      setPending(null);
      setChanging(false);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 || err.status === 410 || err.status === 404) {
        write(key(token, 'rsvp'), null);
        setPending(null);
        toast(err.message, 'neutral');
      } else setFailed(true);
    }
  };

  const pick = (a: Attendance) => {
    if (signedIn) return void save(a);
    setPending(a);
    write(key(token, 'rsvp'), a);
    setSheet(true);
  };
  const continueToSignIn = () => {
    setReturnTo(`/p/${token}`);
    setSheet(false);
    navigate('/app/auth/phone');
  };
  const doJoin = async () => {
    try {
      const r = await join.mutateAsync();
      write(key(token, 'join'), null);
      setJoined({ id: r.data.id, name: r.data.name });
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
    }
  };

  // Back from sign-in: save the RSVP they chose, and finish a join they asked for.
  useEffect(() => {
    if (!signedIn || !mine.data || resumed.current) return;
    const a = read(key(token, 'rsvp')) as Attendance | null;
    const wantsJoin = read(key(token, 'join')) === '1';
    if (!a && !wantsJoin) return;
    resumed.current = true;
    if (a) {
      if (['planning', 'confirmed'].includes(mine.data.plan.status) && mine.data.plan.rsvpOpen && !mine.data.plan.mine) void save(a, true);
      else write(key(token, 'rsvp'), null);
    }
    if (wantsJoin && mine.data.canJoinCircle) void doJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, mine.data]);

  if (pub.isLoading || status === 'loading') return <Screen topBar={<Brand />}><PactDetailSkeleton label="Loading plan" /></Screen>;
  if (!plan) {
    const err = pub.error as ApiError | undefined;
    const message = err?.status === 410 ? 'This link is no longer active.' : err?.status === 404 ? 'This plan is no longer available.' : undefined;
    return (
      <Screen topBar={<Brand />}>
        <ErrorState message={message} onRetry={message ? undefined : () => pub.refetch()} />
      </Screen>
    );
  }
  if (signedIn && mine.data?.plan.isMember && !join.isPending && !joined) return <Navigate to={`/app/plans/${plan.id}?from=circle`} replace />;

  const showJoin = !joined && (saved || !live) && (!signedIn || !!mine.data?.canJoinCircle);
  const onJoin = () => {
    if (!signedIn) {
      write(key(token, 'join'), '1');
      setReturnTo(`/p/${token}`);
      navigate('/app/auth/phone');
      return;
    }
    void doJoin();
  };
  const share = async () => {
    const r = await sharePlan(plan, token, { signedIn });
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };
  const circleName = `${plan.circle.name} ${plan.circle.emoji}`;
  const going = plan.rsvps.filter((r) => r.status === 'in');
  const reward = !plan.mine || !live ? null : plan.mine === 'in' ? `You’re in 🎉 ${plan.counts.in} ${plan.counts.in === 1 ? 'person is' : 'people are'} going.` : plan.mine === 'maybe' ? 'You’re a maybe. You can change it any time' : 'Maybe next time. You can change it any time';

  return (
    <Screen topBar={<Brand />}>
      <div className="plan-link">
        <PlanHeading plan={plan} />
        <p className="plan-stats" aria-label="Who is coming">
          <span className="is-in">{plan.counts.in === 1 ? '1 person is in' : `${plan.counts.in} people are in`}</span>
          {plan.counts.maybe > 0 && <span>{plan.counts.maybe} maybe</span>}
        </p>
        {open ? (
          <section className="plan-section" aria-labelledby="rsvp-h">
            {saved && !changing ? (
              <>
                <h2 id="rsvp-h" className="plan-section__title">
                  {plan.mine === 'in' ? 'You’re in ✓' : plan.mine === 'maybe' ? 'You’re a maybe' : 'You can’t make it'}
                </h2>
                <div className="plan-section__row">
                  <Button variant="ghost" onClick={() => setChanging(true)}>
                    Change response
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 id="rsvp-h" className="plan-section__title">
                  Are you coming?
                </h2>
                <RsvpButtons value={plan.mine} pending={saved ? null : pending} disabled={rsvp.isPending} onPick={pick} />
              </>
            )}
          </section>
        ) : (
          <p className="plan-note">
            {plan.status === 'done' ? 'This plan happened.' : plan.status === 'cancelled' ? 'This plan was cancelled.' : saved ? 'RSVPs are closed. Your answer is saved.' : 'RSVPs are closed.'}
          </p>
        )}
        {failed && pending && (
          <div className="al__retry" role="alert">
            <p>We couldn’t save your response. Try again.</p>
            <Button loading={rsvp.isPending} onClick={() => void save(pending, read(key(token, 'rsvp')) !== null)}>
              Try again
            </Button>
          </div>
        )}
        {!signedIn && !saved && open && <p className="ask__hint">Tap an answer. We’ll ask for your number so the group knows it’s you.</p>}
        {reward && (
          <p className="ask__reward" role="status" aria-live="polite">
            {reward}
          </p>
        )}
        {going.length > 0 && (
          <ul className="plan-people" aria-label="Who’s in">
            {going.map((r) => (
              <li key={r.userId}>
                <Avatar userId={r.userId} size="sm" label={false} />
                <span className="ask__roster-name">{r.userId === user?.id ? 'You' : getUser(r.userId).name}</span>
                <span className="ask__pill ask__pill--in">In</span>
              </li>
            ))}
          </ul>
        )}
        <p className="ask__people">{goingText(plan.counts)}</p>

        {joined ? (
          <div className="al__join" role="status">
            <strong>You’re in 🎉</strong>
            <p>You’re now part of {circleName}.</p>
            <Button onClick={() => navigate(`/app/circles/${joined.id}`)}>Open {plan.circle.name}</Button>
          </div>
        ) : showJoin ? (
          <div className="al__join">
            <strong>Stay in the loop with {circleName}</strong>
            <p>Joining is optional. You can answer plans without being in the Circle.</p>
            <Button loading={join.isPending} onClick={onJoin}>
              Join {plan.circle.name}
            </Button>
          </div>
        ) : null}

        {(saved || joined || !live) && (
          <Button variant="secondary" iconLeft={<Share2 />} onClick={share}>
            Share with someone
          </Button>
        )}
      </div>

      <Modal
        open={sheet}
        onClose={() => setSheet(false)}
        title="Save your answer"
        description="Enter your number so the group knows it’s you. We’ll bring you straight back here."
        footer={
          <>
            <Button fullWidth onClick={continueToSignIn}>
              Continue
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setSheet(false)}>
              Not now
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </Screen>
  );
}

function Brand() {
  return (
    <div className="al__brand" aria-hidden>
      <PactLogo size="sm" />
    </div>
  );
}

/** The one place the plan page stands in for the app. */
export default PlanLinkScreen;
