import { useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { usePact } from '../../api/hooks';
import { ErrorState } from '../../components/app/States';
import { PactSkeleton } from '../../components/app/DetailSkeletons';
import { TopBar } from '../../components/ui/TopBar';
import { isOutcomeComplete } from '../../lib/execution';
import { CompletedScreen } from './CompletedScreen';
import { PactDetailScreen } from './PactDetailScreen';
import { Screen } from './Screen';

/** The Pact has two big moments: funded (the money is ready, same screen, new section) and completed (the plan happened, same URL, new screen). */
export function PactRoute() {
  const { id = '' } = useParams();
  const q = usePact(id);
  if (q.isLoading) return <Screen topBar={<TopBar backTo="/app/home" />}><PactSkeleton /></Screen>;
  if (q.error || !q.data) {
    const missing = (q.error as ApiError)?.status === 404;
    return (
      <Screen topBar={<TopBar backTo="/app/home" />}>
        <ErrorState message={missing ? 'This Pact doesn’t exist, or you’re not in it.' : undefined} onRetry={missing ? undefined : () => q.refetch()} />
      </Screen>
    );
  }
  const { pact, activities } = q.data;
  if (isOutcomeComplete(pact)) return <CompletedScreen pact={pact} activity={activities} />;
  return <PactDetailScreen pact={pact} activity={activities} />;
}
