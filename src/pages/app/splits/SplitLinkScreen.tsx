import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { useJoinCircleFromSplit, useSettleViaLink, useSplitLink, useSplitLinkMine } from '../../../api/splits';
import { SplitSkeleton } from '../../../components/app/DetailSkeletons';
import { CompletionState, ShareHeader, SplitObject } from '../../../components/objects';
import { useBeginSignIn } from '../../../components/share/HandoffSheet';
import { ShareJoin, SharedBrand, SharedFooter, SharedUnavailable } from '../../../components/share/Shared';
import { ShareStatus } from '../../../components/split/SplitBits';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { koboText } from '../../../lib/splitMoney';
import { shareSplit } from '../../../lib/splitShare';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';
import '../../../components/plan/plan.css';
import '../../../components/split/split.css';
import '../object-detail.css';

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
  const begin = useBeginSignIn();
  const [sheet, setSheet] = useState<null | 'settle' | 'undo'>(null);
  const [touched, setTouched] = useState(false);
  const [joined, setJoined] = useState<{ id: string; name: string } | null>(null);

  const view = (signedIn && mine.data) || pub.data;

  if (pub.isLoading || status === 'loading' || (signedIn && mine.isLoading)) return <Screen className="share tint--lilac"><div className="split-link"><SharedBrand /><SplitSkeleton /></div></Screen>;
  if (!view) {
    return (
      <Screen className="share tint--lilac">
        <div className="split-link">
          <SharedBrand />
          <SharedUnavailable kind="split" error={pub.error} onRetry={() => pub.refetch()} />
        </div>
      </Screen>
    );
  }
  // Members get the full split, not the summary.
  if (signedIn && view.isMember && view.splitId && !join.isPending && !joined) return <Navigate to={`/app/splits/${view.splitId}?from=circle`} replace />;

  const payer = view.payer.firstName;
  const circleName = `${view.circle.name} ${view.circle.emoji}`;
  const m = view.mine;
  const open = view.status === 'open';
  const signIn = () => begin({ kind: 'split', path: `/s/${token}`, title: view.title, from: payer, action: 'share' });
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
    <Screen className="share xhero xhero--full tint--lilac">
      <div className="split-link sl">
        <ShareHeader kind="split" byName={payer} verb="paid and split it" circleName={view.circle.name} />
        {view.status === 'settled' && <CompletionState tint="lilac" size="sm" title="All settled." line="Everyone is square." flourish={false} />}
        <SplitObject
          heading
          kobo
          title={view.title}
          total={view.total}
          summary={{ amount: 0, owe: false, settled: view.settledCount, count: view.owedCount }}
          cancelled={view.status === 'cancelled'}
        />

        {view.status !== 'cancelled' &&
          (!signedIn ? (
            <section className="sl__mine" aria-labelledby="share-h">
              <h2 id="share-h" className="t-section">
                Are you in this split?
              </h2>
              <p className="od-note">Sign in and we’ll show your share. It’s matched to your account, so only you see it.</p>
              <Button onClick={signIn}>See my share</Button>
            </section>
          ) : m ? (
            <section className={`sl__mine ${m.status === 'settled' ? 'is-settled' : ''}`} aria-labelledby="share-h">
              <h2 id="share-h" className="t-section">
                Your share
              </h2>
              {m.isPayer ? (
                <p className="od-note">You paid this one. Your part of {koboText(m.amount)} is covered.</p>
              ) : (
                <>
                  <p className="sl__amount num" aria-label={`Your share ${koboText(m.amount)}`}>
                    {koboText(m.amount)}
                  </p>
                  <p className="sl__status">
                    <ShareStatus status={m.status} />
                  </p>
                  {open && m.status === 'owed' && <Button onClick={() => setSheet('settle')}>Mark settled</Button>}
                  {open && m.status === 'settled' && (
                    <Button variant="ghost" onClick={() => setSheet('undo')}>
                      Mark as unsettled
                    </Button>
                  )}
                  <p className="od-note">PACT only keeps the record. Settling happens outside PACT.</p>
                </>
              )}
            </section>
          ) : (
            <p className="od-note">This link doesn’t have a share for you.</p>
          ))}
        {view.status === 'cancelled' && <p className="od-note">This split was called off.</p>}

        {(joined || showJoin) && <ShareJoin circle={view.circle.name} tint="lilac" joined={!!joined} loading={join.isPending} onJoin={doJoin} onOpen={() => joined && navigate(`/app/circles/${joined.id}`)} why={`This was shared from ${circleName}. Joining is optional.`} />}

        {view.status !== 'cancelled' && (
          <Button variant="secondary" iconLeft={<Share2 />} onClick={share}>
            Share
          </Button>
        )}
        <SharedFooter />
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

export default SplitLinkScreen;
