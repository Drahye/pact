import { Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Attendance, PlanDTO } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { useJoinCircleFromPlan, usePlanLink, usePlanLinkMine, useRsvpViaLink } from '../../../api/plans';
import { PlanSkeleton } from '../../../components/app/DetailSkeletons';
import { statusLabel } from '../../../components/plan/PlanBits';
import { PlanObject, ShareHeader } from '../../../components/objects';
import { HandoffSheet, useBeginSignIn, type HandoffInput } from '../../../components/share/HandoffSheet';
import { ShareJoin, SharedBrand, SharedFooter, SharedUnavailable } from '../../../components/share/Shared';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { getUser } from '../../../data/users';
import { sharePlan } from '../../../lib/planShare';
import { Screen } from '../Screen';
import '../../../components/plan/plan.css';
import '../../../components/ask/ask.css';
import '../object-detail.css';

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
  const { status } = useAuth();
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
  const begin = useBeginSignIn();
  const handoff = (action: HandoffInput['action']): HandoffInput => ({
    kind: 'plan',
    path: `/p/${token}`,
    title: plan?.title ?? 'A plan',
    from: plan ? getUser(plan.createdBy).name : undefined,
    action,
    choice: action === 'rsvp' && pending ? { in: 'I’m in', maybe: 'Maybe', out: 'Can’t' }[pending] : undefined,
  });
  const continueToSignIn = () => {
    setSheet(false);
    begin(handoff('rsvp'));
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

  if (pub.isLoading || status === 'loading') return <Screen className="share tint--sun"><div className="plan-link"><SharedBrand /><PlanSkeleton /></div></Screen>;
  if (!plan) {
    return (
      <Screen className="share tint--sun">
        <div className="plan-link">
          <SharedBrand />
          <SharedUnavailable kind="plan" error={pub.error} onRetry={() => pub.refetch()} />
        </div>
      </Screen>
    );
  }
  if (signedIn && mine.data?.plan.isMember && !join.isPending && !joined) return <Navigate to={`/app/plans/${plan.id}?from=circle`} replace />;

  const showJoin = !joined && (saved || !live) && (!signedIn || !!mine.data?.canJoinCircle);
  const onJoin = () => {
    if (!signedIn) {
      write(key(token, 'join'), '1');
      begin(handoff('join'));
      return;
    }
    void doJoin();
  };
  const share = async () => {
    const r = await sharePlan(plan, token, { signedIn });
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };
  const going = plan.rsvps.filter((r) => r.status === 'in');
  const shown = plan.mine ?? (saved ? null : pending);
  const said = shown === 'in' ? `You’re in. ${plan.counts.in + (saved ? 0 : 1)} ${plan.counts.in + (saved ? 0 : 1) === 1 ? 'person is' : 'people are'} going.` : shown === 'maybe' ? 'You’re a maybe. You can change it any time.' : shown === 'out' ? 'Maybe next time. You can change it any time.' : null;
  const note = plan.pactId
    ? 'This plan is a Pact now, so the group is making it happen there.'
    : plan.status === 'done'
      ? 'This plan wrapped up. It happened.'
      : plan.status === 'cancelled'
        ? 'This plan was called off.'
        : !open
          ? saved ? 'RSVPs are closed. Your answer is saved.' : 'RSVPs are closed.'
          : null;

  return (
    <Screen className="share xhero xhero--full tint--sun">
      <div className="plan-link">
        <ShareHeader kind="plan" byId={plan.createdBy} byName={getUser(plan.createdBy).name} verb="is planning something" circleName={plan.circle.name} />
        <PlanObject
          heading
          title={plan.title}
          date={plan.date}
          endDate={plan.endDate}
          location={plan.location}
          goingIds={going.map((r) => r.userId)}
          going={plan.counts.in}
          maybe={plan.counts.maybe}
          status={plan.pactId ? 'Became a Pact' : statusLabel[plan.status]}
          history={!!plan.pactId}
          done={plan.status === 'done' && !plan.pactId}
          rsvp={shown}
          onRsvp={open && !plan.pactId ? pick : undefined}
          disabled={rsvp.isPending}
        />
        {open && !plan.pactId && !signedIn && !saved && <p className="od-note">Tap an answer. We’ll ask you to verify your email so the group knows it’s you.</p>}
        {said && open && (
          <p className="plan-link__said" role="status" aria-live="polite">
            {said}
          </p>
        )}
        {note && (
          <p className="od-note" role="status">
            {note}
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

        {(joined || showJoin) && (
          <ShareJoin circle={plan.circle.name} tint={plan.circle.tint} joined={!!joined} loading={join.isPending} onJoin={onJoin} onOpen={() => joined && navigate(`/app/circles/${joined.id}`)} why="Joining is optional. You can answer plans without being in the Circle." />
        )}

        {(saved || joined || !live) && (
          <Button variant="secondary" iconLeft={<Share2 />} onClick={share}>
            Share with someone
          </Button>
        )}
        <SharedFooter />
      </div>

      <HandoffSheet open={sheet} onClose={() => setSheet(false)} onContinue={continueToSignIn} h={handoff('rsvp')} />
    </Screen>
  );
}

export default PlanLinkScreen;
