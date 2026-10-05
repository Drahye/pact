import { Ellipsis, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SplitDTO, SplitShareDTO } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { useCancelSplit, useHandOverSplit, useResetSplitLink, useSettleShare, useSplit } from '../../../api/splits';
import { SplitSkeleton } from '../../../components/app/DetailSkeletons';
import { ErrorState, Notice } from '../../../components/app/States';
import { ActivityRow, CompletionState, SplitObject } from '../../../components/objects';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { HandOverSheet } from '../../../components/circle/HandOverSheet';
import { Modal } from '../../../components/ui/Modal';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { getUser } from '../../../data/users';
import { koboText } from '../../../lib/splitMoney';
import { shareSplit } from '../../../lib/splitShare';
import { Screen } from '../Screen';
import '../object-detail.css';

type Sheet = null | 'menu' | 'cancel' | 'reset' | 'hand' | { settle: SplitShareDTO } | { undo: SplitShareDTO };

/** "Daniel marked ₦15,625 settled", "Anthony marked Sarah settled". Plain words, no chat. */
function activityText(a: SplitDTO['activity'][number], who: (id: string) => string) {
  const actor = who(a.userId);
  const target = a.targetId ? who(a.targetId) : '';
  switch (a.kind) {
    case 'created':
      return `${actor} created the split`;
    case 'settled':
      return a.targetId === a.userId ? `${actor} marked ${a.amount ? koboText(a.amount) : 'their share'} settled` : `${actor} marked ${target} settled`;
    case 'unsettled':
      return a.targetId === a.userId ? `${actor} marked their share as unsettled` : `${actor} marked ${target} as unsettled`;
    case 'completed':
      return 'Everyone is settled';
    case 'reopened':
      return 'The split is open again';
    default:
      return `${actor} cancelled the split`;
  }
}

/** One split, for the Circle's members: what it was, who paid, who has settled. A record, not a bank account. */
export function SplitScreen() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const from = params.get('from') === 'home' ? 'home' : params.get('from') === 'circle' ? 'circle' : undefined;
  const split = useSplit(id, from);
  const settle = useSettleShare(id);
  const cancel = useCancelSplit(id);
  const reset = useResetSplitLink(id);
  const handOver = useHandOverSplit(id);
  const [sheet, setSheet] = useState<Sheet>(null);
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated === true;

  if (split.isLoading) return <Screen topBar={<TopBar backTo="/app/circles" />}><SplitSkeleton /></Screen>;
  if (split.error || !split.data) {
    const gone = (split.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar backTo="/app/circles" />}>
        <ErrorState message={gone ? 'This split isn’t available. It may be in a Circle you’re not in.' : undefined} onRetry={gone ? undefined : () => split.refetch()} />
      </Screen>
    );
  }
  const s = split.data;
  const name = (uid: string) => (uid === user?.id ? 'You' : getUser(uid).name);
  const cancelled = s.status === 'cancelled';
  const close = () => setSheet(null);
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
      return false;
    }
  };
  const share = async () => {
    const mine = s.mine && !s.mine.isPayer ? s.mine.amount : undefined;
    const r = await shareSplit(s.title, s.shareToken!, { splitId: s.id }, mine);
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };
  const sheetShare = typeof sheet === 'object' && sheet ? ('settle' in sheet ? sheet.settle : sheet.undo) : null;

  return (
    <Screen
      topBar={
        <TopBar
          backTo={params.get('from') === 'home' ? '/app/home' : `/app/circles/${s.circleId}`}
          title={s.circle.name}
          trailing={
            <span className="detail__top-actions">
              <IconButton label="Share split" icon={<Share2 />} onClick={share} />
              {(s.canEdit || s.canHandOver) && <IconButton label="More" icon={<Ellipsis />} onClick={() => setSheet(s.canEdit ? 'menu' : 'hand')} />}
            </span>
          }
        />
      }
    >
      <div className="od-split">
        {justCreated && s.status === 'open' && <Notice tone="accent">Your split is up. Share it so people can see their share.</Notice>}
        {s.status === 'settled' && (
          <CompletionState tint="lilac" size="sm" title="All settled." line="Everyone is square." peopleIds={s.shares.map((x) => x.userId)} action={<Button variant="secondary" size="md" to={`/app/recap/split/${s.id}`}>View recap</Button>} />
        )}
        <SplitObject
          heading
          kobo
          title={s.title}
          total={s.total}
          payerId={s.paidBy}
          modeText={s.mode === 'equal' ? 'split equally' : 'custom amounts'}
          viewerId={user?.id}
          cancelled={cancelled}
          shares={s.shares.map((x) => ({ userId: x.userId, amount: x.amount, status: x.isPayer || x.status === 'not_applicable' ? 'payer' : x.status, canChange: x.canChange }))}
          onSettle={(uid) => setSheet({ settle: s.shares.find((x) => x.userId === uid)! })}
          onUndo={(uid) => setSheet({ undo: s.shares.find((x) => x.userId === uid)! })}
        />
        {cancelled && <Notice tone="neutral">This split was cancelled.</Notice>}
        <p className="od-note">PACT only keeps the record. Settling happens outside PACT.</p>

        {s.activity.length > 0 && (
          <section className="od-lately" aria-labelledby="split-lately">
            <h2 id="split-lately" className="t-label">
              Lately
            </h2>
            <ul>
              {s.activity.map((a, i) => (
                <li key={`${a.kind}-${a.userId}-${a.at}-${i}`}>
                  <ActivityRow actorId={a.userId} kind="split" at={a.at} text={activityText(a, name)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!cancelled && s.status === 'open' && (
          <Button variant="secondary" iconLeft={<Share2 />} onClick={share}>
            Share
          </Button>
        )}
      </div>

      <Modal open={sheet === 'menu'} onClose={close} title={s.title}>
        <div className="menu">
          {s.canEditStructure ? (
            <button type="button" className="menu__row" onClick={() => navigate(`/app/splits/new?edit=${s.id}`)}>
              <span className="menu__text"><span className="menu__title">Edit split</span><span className="menu__sub">Name, amount, who paid and who shares</span></span>
            </button>
          ) : (
            <>
              <button type="button" className="menu__row" onClick={() => navigate(`/app/splits/new?edit=${s.id}`)}>
                <span className="menu__text"><span className="menu__title">Edit name</span><span className="menu__sub">People have already started settling this split</span></span>
              </button>
            </>
          )}
          <button type="button" className="menu__row" onClick={() => setSheet('hand')}>
            <span className="menu__text"><span className="menu__title">Hand over</span><span className="menu__sub">Let someone else run this split</span></span>
          </button>
          <button type="button" className="menu__row" onClick={() => setSheet('reset')}>
            <span className="menu__text"><span className="menu__title">Reset the link</span><span className="menu__sub">Turns the old link off</span></span>
          </button>
          {s.canCancel && (
            <button type="button" className="menu__row menu__row--danger" onClick={() => setSheet('cancel')}>
              <span className="menu__text"><span className="menu__title">Cancel split</span></span>
            </button>
          )}
        </div>
      </Modal>

      <Modal
        open={!!sheetShare}
        onClose={close}
        title={sheetShare && typeof sheet === 'object' && sheet && 'undo' in sheet ? `Mark ${koboText(sheetShare.amount)} as unsettled?` : `Mark ${sheetShare ? koboText(sheetShare.amount) : ''} as settled?`}
        description={
          sheetShare && typeof sheet === 'object' && sheet && 'undo' in sheet
            ? `${name(sheetShare.userId)} will show as owing again.`
            : `This only records that it was settled outside PACT.${sheetShare && sheetShare.userId !== user?.id ? ` You’re marking ${name(sheetShare.userId)}’s share.` : ''}`
        }
        footer={
          <>
            <Button
              fullWidth
              loading={settle.isPending}
              onClick={async () => {
                if (!sheetShare) return;
                const settled = !(typeof sheet === 'object' && sheet && 'undo' in sheet);
                if (await act(() => settle.mutateAsync({ userId: sheetShare.userId, settled }), settled ? 'Marked settled' : 'Marked as unsettled')) close();
              }}
            >
              {typeof sheet === 'object' && sheet && 'undo' in sheet ? 'Mark as unsettled' : 'Mark settled'}
            </Button>
            <Button fullWidth variant="ghost" onClick={close}>
              Not now
            </Button>
          </>
        }
      >
        <span />
      </Modal>

      <HandOverSheet open={sheet === 'hand'} onClose={close} circleId={s.circleId} currentId={s.createdBy} busy={handOver.isPending} onPick={async (uid) => (await act(() => handOver.mutateAsync(uid), 'Handed over')) && close()} />

      <Modal
        open={sheet === 'reset'}
        onClose={close}
        title="Reset the link?"
        description="The current link stops working at once. Share the new one with the people who still need it."
        footer={
          <Button fullWidth loading={reset.isPending} onClick={async () => (await act(() => reset.mutateAsync(), 'New link ready')) && close()}>
            Reset link
          </Button>
        }
      >
        <span />
      </Modal>

      <Modal
        open={sheet === 'cancel'}
        onClose={close}
        title="Cancel this split?"
        description="It becomes read-only and stays in the Circle’s history as cancelled. You can’t undo this."
        footer={
          <>
            <Button fullWidth loading={cancel.isPending} onClick={async () => (await act(() => cancel.mutateAsync(), 'Split cancelled')) && close()}>
              Cancel split
            </Button>
            <Button fullWidth variant="ghost" onClick={close}>
              Keep it
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </Screen>
  );
}
