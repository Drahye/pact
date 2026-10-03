import { Activity as ActivityIcon } from 'lucide-react';
import { useFeed } from '../../api/home';
import { useActivity, usePacts } from '../../api/hooks';
import { RecentList } from '../../components/home/HomeBits';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { Empty, ErrorState } from '../../components/app/States';
import { PactListSkeleton } from '../../components/app/Skeleton';
import { FeedGroup } from '../../components/pact/FeedGroup';
import { BottomNav } from '../../components/ui/BottomNav';
import { LargeTitle } from '../../components/ui/LargeTitle';
import { TopBar } from '../../components/ui/TopBar';
import type { Activity, PactId } from '../../data/types';
import { summarize } from '../../lib/pact';
import { Screen } from './Screen';

/** Everything across the person's Circles, newest first, then the money feed grouped by Pact. Every row leads to its object. */
export function ActivityScreen() {
  const activity = useActivity();
  const pacts = usePacts();
  const feed = useFeed();
  const groups = (activity.data ?? []).reduce<{ pactId: PactId; items: Activity[] }[]>((acc, a) => {
    const g = acc.find((x) => x.pactId === a.pactId);
    if (g) {
      if (g.items.length < 4) g.items.push(a);
    } else acc.push({ pactId: a.pactId, items: [a] });
    return acc;
  }, []);

  return (
    <Screen tabBar={<BottomNav />} topBar={<TopBar leading="none" title="Activity" collapse />}>
      <LargeTitle className="pacts-head">Activity</LargeTitle>
      {activity.isLoading && feed.isLoading ? (
        <PactListSkeleton count={2} label="Loading activity" />
      ) : activity.error && feed.error ? (
        <ErrorState onRetry={() => (activity.refetch(), feed.refetch())} />
      ) : !groups.length && !feed.data?.length ? (
        <Empty icon={<ActivityIcon />} title="Nothing yet" body="Answers, plans, splits and contributions from your Circles show up here." />
      ) : (
        <>
          {!!feed.data?.length && (
            <section className="screen-section" aria-labelledby="act-all-h">
              <SectionHeading id="act-all-h" title="Latest" />
              <RecentList items={feed.data} />
            </section>
          )}
          {!!groups.length && (
            <section className="screen-section" aria-labelledby="act-pacts-h">
              <SectionHeading id="act-pacts-h" title="In your Pacts" />
              <div className="list-stack">
                {groups.map(({ pactId, items }) => {
                  const pact = pacts.data?.find((p) => p.id === pactId);
                  if (!pact) return null;
                  return <FeedGroup key={pactId} title={pact.title} percent={summarize(pact).percent} items={items} to={`/app/pact/${pact.id}`} category={pact.category} />;
                })}
              </div>
            </section>
          )}
        </>
      )}
    </Screen>
  );
}
