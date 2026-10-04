import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuth } from '../../../api/auth';
import { useCircle, useCircleInvitePreview, useJoinCircle } from '../../../api/circles';
import { ApiError } from '../../../api/client';
import { ErrorState } from '../../../components/app/States';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { Button } from '../../../components/ui/Button';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { setReturnTo } from '../auth/flow';
import { Screen } from '../Screen';
import '../../../components/circle/circle.css';

const intentKey = (token: string) => `pact.circleJoin.${token.slice(0, 12)}`;
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Where a Circle invite link lands. Anyone can see what it is for; joining needs an account. */
export function CircleInviteScreen() {
  const { token = '' } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const preview = useCircleInvitePreview(token);
  const join = useJoinCircle();
  // Signed in: if they are already in this Circle, take them there instead of asking again.
  const already = useCircle(status === 'signedIn' ? preview.data?.circleId : undefined);
  const auto = useRef(false);

  const doJoin = async () => {
    try {
      const r = await join.mutateAsync(token);
      try {
        sessionStorage.removeItem(intentKey(token));
      } catch {
        /* ignore */
      }
      toast(`You’re in ${r.data.name}`);
      navigate(`/app/circles/${r.data.id}`, { replace: true });
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
    }
  };

  // They pressed Join while signed out, went through sign-in, and came back: finish what they started.
  useEffect(() => {
    if (status !== 'signedIn' || !preview.data || already.isLoading || already.data || auto.current) return;
    let wanted = false;
    try {
      wanted = sessionStorage.getItem(intentKey(token)) === '1';
    } catch {
      /* ignore */
    }
    if (wanted) {
      auto.current = true;
      void doJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, preview.data, already.isLoading, already.data]);

  if (preview.isLoading || (status === 'loading')) return <Screen topBar={<TopBar backTo="/app" />}><PactDetailSkeleton label="Loading invite" /></Screen>;
  if (preview.error || !preview.data) {
    const err = preview.error as ApiError | undefined;
    const message = err?.status === 410 ? err.message : err?.status === 404 ? 'This invite link doesn’t work. Ask for a new one.' : undefined;
    return (
      <Screen topBar={<TopBar backTo="/app" />}>
        <ErrorState message={message} onRetry={message ? undefined : () => preview.refetch()} />
      </Screen>
    );
  }
  if (status === 'signedIn' && already.data) return <Navigate to={`/app/circles/${already.data.id}`} replace />;
  if (status === 'signedIn' && already.isLoading) return <Screen topBar={<TopBar backTo="/app" />}><PactDetailSkeleton label="Loading invite" /></Screen>;

  const p = preview.data;
  const onJoin = () => {
    if (status !== 'signedIn') {
      try {
        sessionStorage.setItem(intentKey(token), '1');
      } catch {
        /* ignore */
      }
      setReturnTo(`/app/c/${token}`);
      navigate('/app/auth/welcome');
      return;
    }
    void doJoin();
  };

  return (
    <Screen
      topBar={<TopBar leading="none" />}
      footer={
        <Button fullWidth onClick={onJoin} loading={join.isPending}>
          Join Circle
        </Button>
      }
    >
      <div className="ci">
        <span className="ci__inviter" style={{ borderColor: p.inviter.color }} aria-hidden>
          {p.inviter.firstName.slice(0, 1)}
        </span>
        <p className="ci__lead">
          <strong>{p.inviter.firstName}</strong> invited you to
        </p>
        <CircleBadge emoji={p.emoji} tint={p.tint} size="xl" />
        <h1 className="large-title ci__name">
          {p.name} <span aria-hidden>{p.emoji}</span>
        </h1>
        <p className="ci__meta">{people(p.memberCount)}</p>
        <p className="ci__body">They’re planning things together on PACT: trips, gifts, bills and celebrations.</p>
        {status !== 'signedIn' && <p className="ci__hint">You’ll sign in with your phone number first. It takes a minute.</p>}
      </div>
    </Screen>
  );
}
