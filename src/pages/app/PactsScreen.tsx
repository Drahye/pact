import { Plus } from 'lucide-react';
import { usePacts } from '../../api/hooks';
import { Empty, ErrorState } from '../../components/app/States';
import { PactListSkeleton } from '../../components/app/Skeleton';
import { PactCard } from '../../components/pact/PactCard';
import { BottomNav } from '../../components/ui/BottomNav';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { Screen } from './Screen';

export function PactsScreen() {
  const pacts = usePacts();
  const mine = (pacts.data ?? []).filter((p) => p.viewer?.status === 'joined');
  const open = mine.filter((p) => p.status === 'open');
  const funded = mine.filter((p) => p.status === 'funded');
  const closed = mine.filter((p) => p.status !== 'open' && p.status !== 'funded');
  const groups = [
    { id: 'open', title: `In progress · ${open.length}`, items: open },
    { id: 'funded', title: `Funded · ${funded.length}`, items: funded },
    { id: 'closed', title: `Closed · ${closed.length}`, items: closed },
  ].filter((g) => g.items.length);

  return (
    <Screen tabBar={<BottomNav />}>
      <div className="screen-title-row">
        <h1 className="large-title">Pacts</h1>
        <IconButton label="Create a Pact" icon={<Plus />} to="/app/create" />
      </div>
      {pacts.isLoading ? (
        <PactListSkeleton label="Loading your Pacts" />
      ) : pacts.error ? (
        <ErrorState onRetry={() => pacts.refetch()} />
      ) : !mine.length ? (
        <Empty
          icon={<Plus />}
          title="No Pacts yet"
          body="Start one for a trip, a gift or a shared bill, or join with an invite link."
          action={<Button to="/app/create">Create a Pact</Button>}
        />
      ) : (
        groups.map((g, i) => (
          <section key={g.id} className={`screen-section ${i === 0 ? 'screen-section--first' : ''}`} aria-labelledby={`g-${g.id}`}>
            <SectionHeading id={`g-${g.id}`} title={g.title} />
            <div className="list-stack">
              {g.items.map((p) => (
                <PactCard key={p.id} pact={p} to={`/app/pact/${p.id}`} />
              ))}
            </div>
          </section>
        ))
      )}
    </Screen>
  );
}
