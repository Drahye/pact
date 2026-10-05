import { useParams } from 'react-router-dom';
import { usePublicRecap } from '../../../api/home';
import { RecapView } from '../../../components/home/RecapView';
import { SharedBrand, SharedFooter, SharedUnavailable } from '../../../components/share/Shared';
import { Button } from '../../../components/ui/Button';
import { Screen } from '../Screen';
import '../object-detail.css';

const TINT = { pact: 'mint', split: 'lilac', plan: 'sun' } as const;

/**
 * A shared recap (/r/:token): what a group did together, as a result. No names and nothing anyone owed: the title, a few numbers
 * and the Circle it came from. The invitation underneath is one sentence and one button.
 */
export function RecapLinkScreen() {
  const { token = '' } = useParams();
  const recap = usePublicRecap(token);
  if (recap.isLoading) {
    return (
      <Screen className="share tint--mint">
        <div className="rl">
          <SharedBrand />
          <div className="rl__skeleton" role="status" aria-busy="true" aria-label="Loading recap" />
        </div>
      </Screen>
    );
  }
  if (!recap.data) {
    return (
      <Screen className="share tint--mint">
        <div className="rl">
          <SharedBrand />
          <SharedUnavailable kind="pact" error={recap.error} onRetry={() => recap.refetch()} />
        </div>
      </Screen>
    );
  }
  const r = recap.data;
  return (
    <Screen className={`share tint--${TINT[r.kind]}`}>
      <div className="rl">
        <SharedBrand />
        <RecapView recap={r} />
        <section className="rl__ask" aria-labelledby="rl-h">
          <h2 id="rl-h" className="t-section">
            {r.kind === 'split' ? 'Settling up, without the awkward.' : r.kind === 'plan' ? 'Plans that actually happen.' : 'Things happen when people commit.'}
          </h2>
          <p className="t-support">Ask the group, make a plan, split what you spend, commit to the big things. All with your people, in one place.</p>
          <Button to="/app/auth/start">Start something with your people</Button>
        </section>
        <SharedFooter />
      </div>
    </Screen>
  );
}

export default RecapLinkScreen;
