import { Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { AskDTO } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { markAskStarted, recordAskStep, recordAuthCompleted, useAskLink, useAskLinkMine, useJoinCircleFromAsk, useRespondViaLink, type Answer } from '../../../api/asks';
import { ApiError } from '../../../api/client';
import { AskSkeleton } from '../../../components/app/DetailSkeletons';
import { HandoffSheet, useBeginSignIn, type HandoffInput } from '../../../components/share/HandoffSheet';
import { ShareJoin, SharedBrand, SharedFooter, SharedUnavailable } from '../../../components/share/Shared';
import { AskView } from '../../../components/ask/AskView';
import { ShareHeader } from '../../../components/objects';
import { getUser } from '../../../data/users';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { reshareAsk } from '../../../lib/askShare';
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

  const pick = (a: Answer): Promise<void> | void => {
    markAskStarted(token, signedIn);
    if (signedIn) return save(a);
    // Signed out: keep the pick and explain, in one sentence, why a number is needed.
    setPending(a);
    write(key(token, 'answer'), JSON.stringify(a));
    setSheet(true);
  };

  const begin = useBeginSignIn();
  const handoff = (action: HandoffInput['action']): HandoffInput => ({
    kind: 'ask',
    path: `/a/${token}`,
    title: ask?.title ?? 'A question',
    from: ask ? getUser(ask.createdBy).name : undefined,
    action,
    choice: action === 'answer' && pending ? ('optionId' in pending ? ask?.options.find((o) => o.id === pending.optionId)?.label : { in: 'I’m in', maybe: 'Maybe', out: 'Can’t' }[pending.attendance]) : undefined,
  });
  const continueToSignIn = () => {
    recordAskStep(token, 'auth_started');
    setSheet(false);
    begin(handoff('answer'));
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

  if (pub.isLoading || status === 'loading') return <Screen className="share tint--sky"><div className="al"><SharedBrand /><AskSkeleton /></div></Screen>;
  if (!ask) {
    return (
      <Screen className="share tint--sky">
        <div className="al">
          <SharedBrand />
          <SharedUnavailable kind="ask" error={pub.error} onRetry={() => pub.refetch()} />
        </div>
      </Screen>
    );
  }
  // Circle members have the full version, with the people who haven't answered yet.
  if (signedIn && mine.data?.ask.isMember && !join.isPending && !joined) return <Navigate to={`/app/asks/${ask.id}?from=circle`} replace />;

  const onJoin = () => {
    if (!signedIn) {
      write(key(token, 'join'), '1');
      recordAskStep(token, 'auth_started');
      begin(handoff('join'));
      return;
    }
    void doJoin();
  };
  const share = async () => {
    const r = await reshareAsk(ask, token, signedIn);
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };

  return (
    <Screen className={`share tint--${ask.circle.tint}`}>
      <div className="al">
        <ShareHeader kind="ask" byId={ask.createdBy} byName={getUser(ask.createdBy).name} verb="asked the group" circleName={ask.circle.name} />
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

        {(joined || showJoin) && (
          <ShareJoin circle={ask.circle.name} tint={ask.circle.tint} joined={!!joined} loading={join.isPending} onJoin={onJoin} onOpen={() => joined && navigate(`/app/circles/${joined.id}`)} why={ask.status === 'closed' ? 'Join the Circle to see what they plan next. It’s optional.' : 'Join the Circle to see the final decision and whatever they plan next. It’s optional.'} />
        )}

        {(saved || ask.status === 'closed' || joined) && (
          <Button variant="secondary" iconLeft={<Share2 />} onClick={share}>
            Share with someone
          </Button>
        )}
        <SharedFooter />
      </div>

      <HandoffSheet open={sheet} onClose={() => setSheet(false)} onContinue={continueToSignIn} h={handoff('answer')} />
    </Screen>
  );
}

export default AskLinkScreen;
