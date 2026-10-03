import { Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { AskDTO } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { markAskStarted, recordAskStep, recordAuthCompleted, useAskLink, useAskLinkMine, useJoinCircleFromAsk, useRespondViaLink, type Answer } from '../../../api/asks';
import { ApiError } from '../../../api/client';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { ErrorState } from '../../../components/app/States';
import { AskView } from '../../../components/ask/AskView';
import { PactLogo } from '../../../components/brand/PactLogo';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { reshareAsk } from '../../../lib/askShare';
import { setReturnTo } from '../auth/flow';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';

const key = (token: string, what: 'answer' | 'join') => `pact.ask.${what}.${token.slice(0, 12)}`;
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
 * Where a shared Ask lands (/a/:token). It is a small social object, not an app screen: the question first, no navigation, no
 * sign-up wall. An answer can be chosen before signing in; it is kept through sign-in and saved on the way back, then the group's
 * result is the reward, and only then is joining the Circle offered (never automatically).
 */
export function AskLinkScreen() {
  const { token = '' } = useParams();
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const signedIn = status === 'signedIn';
  const pub = useAskLink(token, signedIn);
  const mine = useAskLinkMine(token, signedIn);
  const respond = useRespondViaLink(token);
  const join = useJoinCircleFromAsk(token);
  // An answer chosen but not saved yet: waiting for sign-in, or a save that failed and can be retried.
  const [pending, setPending] = useState<Answer | null>(() => {
    const raw = read(key(token, 'answer'));
    try {
      return raw ? (JSON.parse(raw) as Answer) : null;
    } catch {
      return null;
    }
  });
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [joined, setJoined] = useState<{ id: string; name: string } | null>(null);
  const resumed = useRef(false);
  const prompted = useRef(false);

  const ask: AskDTO | undefined = (signedIn && mine.data?.ask) || pub.data;
  const saved = !!ask?.mine;

  const save = async (a: Answer, afterAuth = false) => {
    setFailed(false);
    setPending(a);
    try {
      await respond.mutateAsync({ answer: a, afterAuth });
      write(key(token, 'answer'), null);
      setPending(null);
    } catch (e) {
      const err = e as ApiError;
      // A closed or turned-off Ask is a fact, not a glitch: say so. Anything else is retryable and keeps the pick.
      if (err.status === 409 || err.status === 410 || err.status === 404) {
        write(key(token, 'answer'), null);
        setPending(null);
        toast(err.message, 'neutral');
      } else setFailed(true);
    }
  };

  const pick = (a: Answer) => {
    markAskStarted(token, signedIn);
    if (signedIn) return void save(a);
    // Signed out: keep the pick and explain, in one sentence, why a number is needed.
    setPending(a);
    write(key(token, 'answer'), JSON.stringify(a));
    setSheet(true);
  };

  const continueToSignIn = () => {
    recordAskStep(token, 'auth_started');
    setReturnTo(`/a/${token}`);
    setSheet(false);
    navigate('/app/auth/welcome');
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

  // Back from sign-in: finish what they started. Their answer is saved at once; a join they asked for completes too.
  useEffect(() => {
    if (!signedIn || !mine.data || resumed.current) return;
    const a = read(key(token, 'answer'));
    const wantsJoin = read(key(token, 'join')) === '1';
    if (!a && !wantsJoin) return;
    resumed.current = true;
    if (a) {
      recordAuthCompleted(token);
      if (mine.data.ask.status === 'open' && !mine.data.ask.mine) void save(JSON.parse(a) as Answer, true);
      else write(key(token, 'answer'), null);
    }
    if (wantsJoin && mine.data.canJoinCircle) void doJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, mine.data]);

  // The Circle prompt is shown after the answer is saved (or when the Ask is closed), and counted once.
  const showJoin = !!ask && !joined && !(signedIn && mine.data?.ask.isMember) && (saved || ask.status === 'closed') && (!signedIn || !!mine.data?.canJoinCircle);
  useEffect(() => {
    if (showJoin && !prompted.current) {
      prompted.current = true;
      recordAskStep(token, 'join_prompt', signedIn);
    }
  }, [showJoin, token, signedIn]);

  if (pub.isLoading || status === 'loading') return <Screen topBar={<Brand />}><PactDetailSkeleton label="Loading question" /></Screen>;
  if (!ask) {
    const err = pub.error as ApiError | undefined;
    const message = err?.status === 410 ? 'This link is no longer active.' : err?.status === 404 ? 'This Ask is no longer available.' : undefined;
    return (
      <Screen topBar={<Brand />}>
        <ErrorState message={message} onRetry={message ? undefined : () => pub.refetch()} />
      </Screen>
    );
  }
  // Circle members have the full version, with the people who haven't answered yet.
  if (signedIn && mine.data?.ask.isMember && !join.isPending && !joined) return <Navigate to={`/app/asks/${ask.id}?from=circle`} replace />;

  const onJoin = () => {
    if (!signedIn) {
      write(key(token, 'join'), '1');
      setReturnTo(`/a/${token}`);
      recordAskStep(token, 'auth_started');
      navigate('/app/auth/welcome');
      return;
    }
    void doJoin();
  };
  const share = async () => {
    const r = await reshareAsk(ask, token, signedIn);
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };
  const circleName = `${ask.circle.name} ${ask.circle.emoji}`;

  return (
    <Screen topBar={<Brand />}>
      <div className="al">
        <AskView ask={ask} meId={user?.id} busy={respond.isPending} pending={saved ? null : pending} onPick={pick}>
          {failed && pending && (
            <div className="al__retry" role="alert">
              <p>We couldn’t save your response. Try again.</p>
              <Button loading={respond.isPending} onClick={() => void save(pending, read(key(token, 'answer')) !== null)}>
                Try again
              </Button>
            </div>
          )}
          {!signedIn && !saved && ask.status === 'open' && <p className="ask__hint">Tap an answer. We’ll ask you to sign in so the group knows it’s you.</p>}
        </AskView>

        {joined ? (
          <div className="al__join" role="status">
            <strong>You’re in 🎉</strong>
            <p>You’re now part of {circleName}.</p>
            <Button onClick={() => navigate(`/app/circles/${joined.id}`)}>Open {ask.circle.name}</Button>
          </div>
        ) : showJoin ? (
          <div className="al__join">
            <strong>This is happening in {circleName}</strong>
            <p>Join the Circle to see the final decision and whatever they plan next.</p>
            <Button loading={join.isPending} onClick={onJoin}>
              Join {ask.circle.name}
            </Button>
          </div>
        ) : null}

        {(saved || ask.status === 'closed' || joined) && (
          <Button variant="secondary" iconLeft={<Share2 />} onClick={share}>
            Share with someone
          </Button>
        )}
      </div>

      <Modal
        open={sheet}
        onClose={() => setSheet(false)}
        title="Save your vote"
        description="Sign in so the group knows it’s you. We’ll bring you straight back here."
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
