import { Ellipsis, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SplitDTO, SplitShareDTO } from '../../../../shared/contracts';
import { useAuth } from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { useCancelSplit, useSettleShare, useSplit } from '../../../api/splits';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { ErrorState, Notice } from '../../../components/app/States';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { ShareStatus, progressText } from '../../../components/split/SplitBits';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal } from '../../../components/ui/Modal';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { getUser } from '../../../data/users';
import { koboText } from '../../../lib/splitMoney';
import { shareSplit } from '../../../lib/splitShare';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';
import '../../../components/split/split.css';

type Sheet = null | 'menu' | 'cancel' | { settle: SplitShareDTO } | { undo: SplitShareDTO };

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
  const [sheet, setSheet] = useState<Sheet>(null);
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated === true;

  if (split.isLoading) return <Screen topBar={<TopBar backTo="/app/circles" />}><PactDetailSkeleton label="Loading split" /></Screen>;
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
          backTo={`/app/circles/${s.circleId}`}
          title={s.circle.name}
          trailing={
            <span className="detail__top-actions">
              <IconButton label="Share split" icon={<Share2 />} onClick={share} />
              {s.canEdit && <IconButton label="More" icon={<Ellipsis />} onClick={() => setSheet('menu')} />}
            </span>
          }
        />
      }
    >
      <div className="plan-section" style={{ gap: 'var(--space-5)', paddingBottom: 'var(--space-6)' }}>
        <header className="split-head">
          <p className="ask__circle">
            <CircleBadge emoji={s.circle.emoji} tint={s.circle.tint} size="sm" />
            <span>{s.circle.name}</span>
          </p>
          <h1 className="large-title plan-head__title">{s.title}</h1>
          <p className="split-head__total" aria-label={`Total ${koboText(s.total)}`}>
            {koboText(s.total)}
          </p>
          <p className="split-head__meta">Paid by {name(s.paidBy)}</p>
          {s.status === 'open' && (
            <p className="plan-head__going" role="status">
              {progressText(s)}
              {s.unsettled > 0 && <span className="split-head__meta"> · {koboText(s.unsettled)} still unsettled</span>}
            </p>
          )}
        </header>

        {justCreated && s.status === 'open' && <Notice tone="accent">Your split is up. Share it so people can see their share.</Notice>}
        {s.status === 'settled' && (
          <div className="split-done" role="status">
            <strong>All settled ✓</strong>
            <p>Everyone is square.</p>
            <Button variant="secondary" to={`/app/recap/split/${s.id}`}>
              View recap
            </Button>
          </div>
        )}
        {cancelled && <Notice tone="neutral">This split was cancelled.</Notice>}

        <section className="plan-section" aria-labelledby="people-h">
          <SectionHeading id="people-h" title="People" />
          <ul className="split-rows">
            {s.shares.map((x) => (
              <li key={x.userId} className="split-row">
                <Avatar userId={x.userId} size="sm" label={false} />
                <span className="split-row__who">
                  <span className="split-row__name">{name(x.userId)}</span>
                  <span className="split-row__amount">{koboText(x.amount)}</span>
                </span>
                <span className="split-row__side">
                  <ShareStatus status={x.status} payer={x.isPayer} />
                  {!x.isPayer && x.canChange && x.status === 'owed' && (
                    <button type="button" className="split-row__act" aria-label={`Mark ${name(x.userId)}’s ${koboText(x.amount)} as settled`} onClick={() => setSheet({ settle: x })}>
                      Mark settled
                    </button>
                  )}
                  {!x.isPayer && x.canChange && x.status === 'settled' && (
                    <button type="button" className="split-row__act" aria-label={`Mark ${name(x.userId)}’s ${koboText(x.amount)} as unsettled`} onClick={() => setSheet({ undo: x })}>
                      Mark as unsettled
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="split-note">PACT only keeps the record. Settling happens outside PACT.</p>
        </section>

        {s.activity.length > 0 && (
          <ul className="ask__feed" aria-label="Recent activity">
            {s.activity.map((a, i) => (
              <li key={`${a.kind}-${a.userId}-${a.at}-${i}`}>
                <Avatar userId={a.userId} size="sm" label={false} />
                <span className="ask__feed-text">{activityText(a, name)}</span>
              </li>
            ))}
          </ul>
        )}

        {!cancelled && (
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
