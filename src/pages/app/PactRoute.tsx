import { useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { usePact } from '../../api/hooks';
import { ErrorState } from '../../components/app/States';
import { PactDetailSkeleton } from '../../components/app/Skeleton';
import { TopBar } from '../../components/ui/TopBar';
import { CompletedScreen } from './CompletedScreen';
import { PactDetailScreen } from './PactDetailScreen';
import { Screen } from './Screen';

/** A funded Pact becomes its completed state: same URL, new moment. */
export function PactRoute() {
  const { id = '' } = useParams();
  const q = usePact(id);
  if (q.isLoading) return <Screen topBar={<TopBar backTo="/app/home" />}><PactDetailSkeleton /></Screen>;
  if (q.error || !q.data) {
    const missing = (q.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar backTo="/app/home" />}>
        <ErrorState message={missing ? 'This Pact doesn’t exist, or you’re not in it.' : undefined} onRetry={missing ? undefined : () => q.refetch()} />
      </Screen>
    );
  }
  const { pact, activities } = q.data;
  if (pact.status === 'funded' || pact.status === 'released') return <CompletedScreen pact={pact} activity={activities} />;
  return <PactDetailScreen pact={pact} activity={activities} />;
}
