import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../../api/auth';
import { useCircleInviteMine, useCircleInvitePreview, useJoinCircle } from '../../../api/circles';
import { ApiError } from '../../../api/client';
import { Bone } from '../../../components/app/Skeleton';
import { CircleSkeleton } from '../../../components/app/DetailSkeletons';
import { CircleTile, OBJECT_KINDS, ShareHeader } from '../../../components/objects';
import { useBeginSignIn } from '../../../components/share/HandoffSheet';
import { SharedBrand, SharedFooter, SharedUnavailable } from '../../../components/share/Shared';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { registerPeople } from '../../../data/users';
import { Screen } from '../Screen';
import '../../../components/circle/circle.css';

const intentKey = (token: string) => `pact.circleJoin.${token.slice(0, 12)}`;
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Where a Circle invite link lands (/app/c/:token): a group of people, and what they are up to. Anyone can see who invited them, a few
 * faces and, as counts only, what is going on; joining needs an account, and afterwards they land inside the Circle.
 */
export function CircleInviteScreen() {
  const { token = '' } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const preview = useCircleInvitePreview(token);
  const join = useJoinCircle();
  const begin = useBeginSignIn();
  // Signed in: if they are already in this Circle, take them there instead of asking again.
  const mine = useCircleInviteMine(token, status === 'signedIn');
  const auto = useRef(false);

  // The faces are first names, colours and photos only: given throwaway ids here so the shared avatar can draw them.
  const faces = useMemo(() => {
    const list = (preview.data?.members ?? []).map((m, i) => ({ id: `invite-${token.slice(0, 8)}-${i}`, firstName: m.firstName, lastName: '', color: m.color, tint: m.tint as 'mint', photoUrl: m.photoUrl }));
    const host = preview.data ? [{ id: `invite-${token.slice(0, 8)}-host`, firstName: preview.data.inviter.firstName, lastName: '', color: preview.data.inviter.color, tint: 'mint' as const, photoUrl: preview.data.inviter.photoUrl }] : [];
    registerPeople([...host, ...list]);
    return [...host, ...list].map((f) => f.id);
  }, [preview.data, token]);

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
    if (status !== 'signedIn' || !preview.data || mine.isLoading || mine.data?.memberOf || auto.current) return;
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
  }, [status, preview.data, mine.isLoading, mine.data]);

  if (preview.isLoading || status === 'loading') return <Screen className="share tint--sky"><div className="ci"><SharedBrand /><CircleSkeleton /></div></Screen>;
  if (preview.error || !preview.data) {
    return (
      <Screen className="share tint--sky">
        <div className="ci">
          <SharedBrand />
          <SharedUnavailable kind="circle" error={preview.error} onRetry={() => preview.refetch()} />
        </div>
      </Screen>
    );
  }
  if (status === 'signedIn' && mine.data?.memberOf) return <Navigate to={`/app/circles/${mine.data.memberOf}`} replace />;
  if (status === 'signedIn' && mine.isLoading) return <Screen className="share tint--sky"><div className="ci"><SharedBrand /><Bone w="100%" h={200} style={{ borderRadius: 34 }} /></div></Screen>;

  const p = preview.data;
  const onJoin = () => {
    if (status !== 'signedIn') {
      try {
        sessionStorage.setItem(intentKey(token), '1');
      } catch {
        /* ignore */
      }
      begin({ kind: 'circle', path: `/app/c/${token}`, title: p.name, from: p.inviter.firstName, action: 'join' });
      return;
    }
    void doJoin();
  };
  const rows = [
    p.now.plans > 0 && { k: 'plan' as const, title: count(p.now.plans, 'plan', 'plans'), body: 'coming up, with dates to answer' },
    p.now.asks > 0 && { k: 'ask' as const, title: count(p.now.asks, 'question', 'questions'), body: 'waiting for answers' },
    p.now.splits > 0 && { k: 'split' as const, title: count(p.now.splits, 'split', 'splits'), body: 'being settled up' },
  ].filter(Boolean) as { k: 'plan' | 'ask' | 'split'; title: string; body: string }[];
  const live = rows.length > 0;

  return (
    <Screen
      className={`share xhero xhero--full tint--${p.tint}`}
      footer={
        <Button fullWidth onClick={onJoin} loading={join.isPending}>
          Join {p.name}
        </Button>
      }
    >
      <div className="ci">
        <ShareHeader kind="circle" tint={p.tint} byName={p.inviter.firstName} verb="invited you to join" />
        <CircleTile
          density="header"
          name={p.name}
          emoji={p.emoji}
          tint={p.tint}
          meta={`${people(p.memberCount)} in`}
          peopleIds={faces}
          total={p.memberCount}
          live={live}
          signal={live ? 'Things are happening here' : 'Just getting started'}
        />
        <section aria-labelledby="ci-what" className="ci__now">
          <h2 id="ci-what" className="t-section">
            {live ? `Right now in ${p.name}` : 'What people do here'}
          </h2>
          <ul className="ci__does">
            {(live ? rows : (['ask', 'plan', 'split'] as const).map((k) => ({ k, title: k === 'ask' ? 'Settle things in a tap' : k === 'plan' ? 'Plan with real dates' : 'Split what you spend', body: k === 'ask' ? 'Quick questions, answered in seconds.' : k === 'plan' ? 'See who is in, and when.' : 'Know who has paid and who has not.' }))).map((r) => (
              <li key={r.k} className={`tint--${OBJECT_KINDS[r.k].tint}`}>
                <span className="ci__does-icon" aria-hidden>
                  {OBJECT_KINDS[r.k].icon}
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <span>{r.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        {status !== 'signedIn' && <p className="ci__hint">You’ll sign in first, with Google or your email, then land right inside {p.name}.</p>}
        <SharedFooter />
      </div>
    </Screen>
  );
}
