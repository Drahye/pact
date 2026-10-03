import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { useJoinCircleFromSplit, useSettleViaLink, useSplitLink, useSplitLinkMine } from '../../../api/splits';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { ErrorState } from '../../../components/app/States';
import { PactLogo } from '../../../components/brand/PactLogo';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { ShareStatus, progressText } from '../../../components/split/SplitBits';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { koboText } from '../../../lib/splitMoney';
import { shareSplit } from '../../../lib/splitShare';
import { setReturnTo } from '../auth/flow';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';
import '../../../components/plan/plan.css';
import '../../../components/split/split.css';

/**
 * Where a shared split lands (/s/:token). Anyone sees the title, the total, who paid and how far along it is. Your own share
 * appears once you are signed in, matched by your account: there is no list to pick yourself from. You can mark only that share.
 * Joining the Circle is offered afterwards and never required.
 */
export function SplitLinkScreen() {
  const { token = '' } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const signedIn = status === 'signedIn';
  const pub = useSplitLink(token);
  const mine = useSplitLinkMine(token, signedIn);
  const settle = useSettleViaLink(token);
  const join = useJoinCircleFromSplit(token);
  const [sheet, setSheet] = useState<null | 'settle' | 'undo'>(null);
  const [touched, setTouched] = useState(false);
  const [joined, setJoined] = useState<{ id: string; name: string } | null>(null);

  const view = (signedIn && mine.data) || pub.data;

  if (pub.isLoading || status === 'loading' || (signedIn && mine.isLoading)) return <Screen topBar={<Brand />}><PactDetailSkeleton label="Loading split" /></Screen>;
  if (!view) {
    const err = pub.error as ApiError | undefined;
    const message = err?.status === 404 ? 'This split is no longer available.' : undefined;
    return (
      <Screen topBar={<Brand />}>
        <ErrorState message={message} onRetry={message ? undefined : () => pub.refetch()} />
      </Screen>
    );
  }
  // Members get the full split, not the summary.
  if (signedIn && view.isMember && view.splitId && !join.isPending && !joined) return <Navigate to={`/app/splits/${view.splitId}?from=circle`} replace />;

  const payer = view.payer.firstName;
  const circleName = `${view.circle.name} ${view.circle.emoji}`;
  const m = view.mine;
  const open = view.status === 'open';
  const signIn = () => {
    setReturnTo(`/s/${token}`);
    navigate('/app/auth/phone');
  };
  const doSettle = async (settled: boolean) => {
    try {
      await settle.mutateAsync({ settled });
      setTouched(true);
      setSheet(null);
      toast(settled ? 'Marked settled' : 'Marked as unsettled');
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
      setSheet(null);
    }
  };
  const doJoin = async () => {
    try {
      const r = await join.mutateAsync();
      setJoined({ id: r.data.id, name: r.data.name });
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
    }
  };
  const share = async () => {
    const r = await shareSplit(view.title, token, { signedIn }, undefined);
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };
  const showJoin = !joined && signedIn && view.canJoinCircle && (touched || (!!m && m.status === 'settled'));

  return (
    <Screen topBar={<Brand />}>
      <div className="split-link">
        <header className="split-head">
          <p className="ask__circle">
            <CircleBadge emoji={view.circle.emoji} tint={view.circle.tint} size="sm" />
            <span>{view.circle.name}</span>
          </p>
          <h1 className="large-title plan-head__title">{view.title}</h1>
          <p className="split-head__meta">Total</p>
          <p className="split-head__total" aria-label={`Total ${koboText(view.total)}`}>
            {koboText(view.total)}
          </p>
          <p className="split-head__meta">Paid by {payer}</p>
          <p className="plan-head__going" role="status">
            {view.status === 'cancelled' ? 'This split was cancelled.' : progressText(view)}
          </p>
        </header>

        {view.status === 'settled' && (
          <div className="split-done" role="status">
            <strong>All settled ✓</strong>
            <p>Everyone is square.</p>
          </div>
        )}

        {!signedIn ? (
          view.status !== 'cancelled' && (
            <section className="plan-section" aria-labelledby="share-h">
              <h2 id="share-h" className="plan-section__title">
                Your share
              </h2>
              <p className="split-note">Sign in to see your share. We’ll bring you straight back here.</p>
              <Button onClick={signIn}>See my share</Button>
            </section>
          )
        ) : m ? (
          <section className="plan-section" aria-labelledby="share-h">
            <h2 id="share-h" className="plan-section__title">
              Your share
            </h2>
            {m.isPayer ? (
              <p className="split-note">You paid this one. Your part of {koboText(m.amount)} is covered.</p>
            ) : (
              <>
                <p className="split-head__total" aria-label={`Your share ${koboText(m.amount)}`}>
                  {koboText(m.amount)}
                </p>
                <p className="split-head__meta">
                  Status <ShareStatus status={m.status} />
                </p>
                {open && m.status === 'owed' && <Button onClick={() => setSheet('settle')}>Mark settled</Button>}
                {open && m.status === 'settled' && (
                  <Button variant="ghost" onClick={() => setSheet('undo')}>
                    Mark as unsettled
                  </Button>
                )}
                <p className="split-note">PACT only keeps the record. Settling happens outside PACT.</p>
              </>
            )}
          </section>
        ) : (
          view.status !== 'cancelled' && <p className="split-note">This link doesn’t have a share for you.</p>
        )}

        {joined ? (
          <div className="al__join" role="status">
            <strong>You’re in 🎉</strong>
            <p>You’re now part of {circleName}.</p>
            <Button onClick={() => navigate(`/app/circles/${joined.id}`)}>Open {view.circle.name}</Button>
          </div>
        ) : showJoin ? (
          <div className="al__join">
            <strong>This was shared from {circleName}</strong>
            <p>Join the Circle to stay in the loop. Joining is optional.</p>
            <Button loading={join.isPending} onClick={doJoin}>
              Join {view.circle.name}
            </Button>
          </div>
        ) : null}

        {view.status !== 'cancelled' && (
          <Button variant="secondary" iconLeft={<Share2 />} onClick={share}>
            Share
          </Button>
        )}
      </div>

      <Modal
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'undo' ? `Mark ${m ? koboText(m.amount) : ''} as unsettled?` : `Mark ${m ? koboText(m.amount) : ''} as settled?`}
        description={sheet === 'undo' ? 'It will show as owing again.' : 'This only records that it was settled outside PACT.'}
        footer={
          <>
            <Button fullWidth loading={settle.isPending} onClick={() => void doSettle(sheet !== 'undo')}>
              {sheet === 'undo' ? 'Mark as unsettled' : 'Mark settled'}
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setSheet(null)}>
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

export default SplitLinkScreen;
