import { Ellipsis, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../api/auth';
import { useAsk, useCloseAsk, useResetAskLink, useRespond } from '../../../api/asks';
import { ApiError } from '../../../api/client';
import { AskSkeleton } from '../../../components/app/DetailSkeletons';
import { ErrorState, Notice } from '../../../components/app/States';
import { AskView } from '../../../components/ask/AskView';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal } from '../../../components/ui/Modal';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { shareAsk } from '../../../lib/askShare';
import { Screen } from '../Screen';
import '../object-detail.css';

type Sheet = null | 'menu' | 'close' | 'reset';

/** A question inside a Circle, for its members. */
export function AskScreen() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const from = params.get('from') === 'home' ? 'home' : params.get('from') === 'circle' ? 'circle' : undefined;
  const ask = useAsk(id, from);
  const respond = useRespond(id);
  const close = useCloseAsk(id);
  const reset = useResetAskLink(id);
  const [sheet, setSheet] = useState<Sheet>(null);
  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated === true;

  if (ask.isLoading) return <Screen topBar={<TopBar backTo="/app/circles" />}><AskSkeleton /></Screen>;
  if (ask.error || !ask.data) {
    const gone = (ask.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar backTo="/app/circles" />}>
        <ErrorState message={gone ? 'This question isn’t available. It may be in a Circle you’re not in.' : undefined} onRetry={gone ? undefined : () => ask.refetch()} />
      </Screen>
    );
  }
  const a = ask.data;
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
    const r = await shareAsk(a);
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };

  return (
    <Screen
      topBar={
        <TopBar
          backTo={params.get('from') === 'home' ? '/app/home' : `/app/circles/${a.circleId}`}
          title={a.circle.name}
          trailing={
            <span className="detail__top-actions">
              <IconButton label="Share" icon={<Share2 />} onClick={share} />
              {a.canClose && <IconButton label="More" icon={<Ellipsis />} onClick={() => setSheet('menu')} />}
            </span>
          }
        />
      }
      footer={
        justCreated && a.status === 'open' ? (
          <Button fullWidth iconLeft={<Share2 />} onClick={share}>
            Share with the group
          </Button>
        ) : undefined
      }
    >
      {justCreated && a.status === 'open' && (
        <Notice tone="accent">Your question is live. Share it so people can answer.</Notice>
      )}
      <AskView ask={a} meId={user?.id} busy={respond.isPending} onPick={(x) => act(() => respond.mutateAsync(x))} />

      <Modal open={sheet === 'menu'} onClose={() => setSheet(null)} title="This question">
        <div className="menu">
          <button type="button" className="menu__row" onClick={() => setSheet('close')}>
            <span className="menu__text"><span className="menu__title">Close it</span><span className="menu__sub">{a.type === 'choice' ? 'Lock in the result' : 'Stop taking answers'}</span></span>
          </button>
          <button type="button" className="menu__row" onClick={() => setSheet('reset')}>
            <span className="menu__text"><span className="menu__title">Reset the link</span><span className="menu__sub">Turns the old link off</span></span>
          </button>
        </div>
      </Modal>
      <Modal
        open={sheet === 'close'}
        onClose={() => setSheet(null)}
        title="Close this question?"
        description="Nobody can answer or change an answer after this. The result stays in the Circle."
        footer={
          <Button fullWidth loading={close.isPending} onClick={async () => (await act(() => close.mutateAsync(), a.type === 'choice' ? 'Decision made' : 'Responses closed')) && setSheet(null)}>
            Close it
          </Button>
        }
      >
        <span />
      </Modal>
      <Modal
        open={sheet === 'reset'}
        onClose={() => setSheet(null)}
        title="Reset the link?"
        description="The current link stops working at once. Share the new one with the people who still need it."
        footer={
          <Button fullWidth loading={reset.isPending} onClick={async () => (await act(() => reset.mutateAsync(), 'New link ready')) && (setSheet(null), navigate(`/app/asks/${id}`, { replace: true, state: { justCreated: true } }))}>
            Reset link
          </Button>
        }
      >
        <span />
      </Modal>
    </Screen>
  );
}
