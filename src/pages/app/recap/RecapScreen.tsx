import { Link2, Share2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../api/client';
import { useRecap, useRecapShare, type RecapKind } from '../../../api/home';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { ErrorState } from '../../../components/app/States';
import { RecapView } from '../../../components/home/RecapView';
import { Button } from '../../../components/ui/Button';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { recapLink, shareRecap } from '../../../lib/recapShare';
import { Screen } from '../Screen';
import '../../../components/ask/ask.css';

const KINDS = ['plan', 'pact', 'split'];

/** A finished thing, for the people who were in it. Sharing is the organiser's choice, off until they turn it on. */
export function RecapScreen() {
  const { kind = '', id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const k = (KINDS.includes(kind) ? kind : 'plan') as RecapKind;
  const recap = useRecap(k, id, params.get('from') === 'home' ? 'home' : undefined);
  const share = useRecapShare(k, id);
  const back = () => navigate(-1);

  if (recap.isLoading) return <Screen topBar={<TopBar leading="back" onBack={back} />}><PactDetailSkeleton label="Loading recap" /></Screen>;
  if (recap.error || !recap.data) {
    const gone = (recap.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar leading="back" onBack={back} />}>
        <ErrorState message={gone ? 'This recap isn’t available yet. It appears once the plan is finished.' : undefined} onRetry={gone ? undefined : () => recap.refetch()} />
      </Screen>
    );
  }
  const r = recap.data;
  const token = r.share?.token ?? null;
  const send = async () => {
    if (!token) return;
    const out = await shareRecap(r, token, { kind: k, id });
    if (out === 'copied') toast('Link copied');
    else if (out === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };
  const turnOn = async () => {
    try {
      await share.on.mutateAsync();
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
    }
  };
  const turnOff = async () => {
    try {
      await share.off.mutateAsync();
      toast('Link turned off');
    } catch (e) {
      toast((e as ApiError).message, 'neutral');
    }
  };

  return (
    <Screen topBar={<TopBar leading="back" onBack={back} title="Recap" />}>
      <div className="plan-section" style={{ gap: 'var(--space-4)', paddingBottom: 'var(--space-6)' }}>
        <RecapView recap={r} />
        {token ? (
          <>
            <Button iconLeft={<Share2 />} onClick={send}>
              Share recap
            </Button>
            {r.share?.canManage && (
              <>
                <p className="split-note" style={{ margin: 0 }}>
                  Anyone with the link can see this recap: the title and a few numbers, no names. <span style={{ overflowWrap: 'anywhere' }}>{recapLink(token)}</span>
                </p>
                <Button variant="ghost" loading={share.off.isPending} onClick={turnOff}>
                  Turn the link off
                </Button>
              </>
            )}
          </>
        ) : r.share?.canManage ? (
          <>
            <Button iconLeft={<Link2 />} loading={share.on.isPending} onClick={turnOn}>
              Make a link to share
            </Button>
            <p className="split-note" style={{ margin: 0 }}>
              Sharing is off until you turn it on. The link shows the title and a few numbers, never names or what anyone owed.
            </p>
          </>
        ) : null}
      </div>
    </Screen>
  );
}
