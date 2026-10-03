import { useParams } from 'react-router-dom';
import { ApiError } from '../../../api/client';
import { usePublicRecap } from '../../../api/home';
import { PactDetailSkeleton } from '../../../components/app/Skeleton';
import { ErrorState } from '../../../components/app/States';
import { PactLogo } from '../../../components/brand/PactLogo';
import { RecapView } from '../../../components/home/RecapView';
import { Button } from '../../../components/ui/Button';
import { Screen } from '../Screen';

/** A shared recap (/r/:token): the celebration, no names, no sign-in. */
export function RecapLinkScreen() {
  const { token = '' } = useParams();
  const recap = usePublicRecap(token);
  const brand = (
    <div className="al__brand" aria-hidden>
      <PactLogo size="sm" />
    </div>
  );
  if (recap.isLoading) return <Screen topBar={brand}><PactDetailSkeleton label="Loading recap" /></Screen>;
  if (!recap.data) {
    const s = (recap.error as ApiError)?.status;
    return (
      <Screen topBar={brand}>
        <ErrorState message={s === 410 ? 'This link is no longer active.' : s === 404 ? 'This recap is no longer available.' : undefined} onRetry={s ? undefined : () => recap.refetch()} />
      </Screen>
    );
  }
  return (
    <Screen topBar={brand}>
      <div className="plan-section" style={{ gap: 'var(--space-4)', paddingBottom: 'var(--space-6)' }}>
        <RecapView recap={recap.data} />
        <Button variant="secondary" to="/">
          What is PACT?
        </Button>
      </div>
    </Screen>
  );
}

export default RecapLinkScreen;
