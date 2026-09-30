import { Activity as ActivityIcon } from 'lucide-react';
import { useActivity, usePacts } from '../../api/hooks';
import { Empty, ErrorState } from '../../components/app/States';
import { PactListSkeleton } from '../../components/app/Skeleton';
import { FeedGroup } from '../../components/pact/FeedGroup';
import { TopBar } from '../../components/ui/TopBar';
import type { Activity, PactId } from '../../data/types';
import { summarize } from '../../lib/pact';
import { Screen } from './Screen';

/** Social feed grouped by Pact, most recently active first. Every row leads back into its Pact. */
export function ActivityScreen() {
  const activity = useActivity();
  const pacts = usePacts();
  const groups = (activity.data ?? []).reduce<{ pactId: PactId; items: Activity[] }[]>((acc, a) => {
    const g = acc.find((x) => x.pactId === a.pactId);
    if (g) {
      if (g.items.length < 4) g.items.push(a);
    } else acc.push({ pactId: a.pactId, items: [a] });
    return acc;
  }, []);

  return (
    <Screen topBar={<TopBar backTo="/app/home" title="Activity" />}>
      {activity.isLoading ? (
        <PactListSkeleton count={2} label="Loading activity" />
      ) : activity.error ? (
        <ErrorState onRetry={() => activity.refetch()} />
      ) : !groups.length ? (
        <Empty icon={<ActivityIcon />} title="Nothing yet" body="Contributions and new members in your Pacts show up here." />
      ) : (
        <div className="list-stack">
          {groups.map(({ pactId, items }) => {
            const pact = pacts.data?.find((p) => p.id === pactId);
            if (!pact) return null;
            return <FeedGroup key={pactId} title={pact.title} percent={summarize(pact).percent} items={items} to={`/app/pact/${pact.id}`} category={pact.category} />;
          })}
        </div>
      )}
    </Screen>
  );
}
