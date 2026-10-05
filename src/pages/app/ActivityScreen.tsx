import { useFeed } from '../../api/home';
import { RecentList } from '../../components/home/HomeBits';
import { ErrorState } from '../../components/app/States';
import { RowListSkeleton } from '../../components/app/Skeleton';
import { EmptyState } from '../../components/objects';
import { BottomNav } from '../../components/ui/BottomNav';
import { LargeTitle } from '../../components/ui/LargeTitle';
import { TopBar } from '../../components/ui/TopBar';
import { Screen } from './Screen';

/**
 * What your people have been doing, newest first, in the words a person would use: who did what, when, and the thing it was about.
 * Grouped Today, Yesterday and Earlier. The money in a single Pact lives on that Pact; this is the whole picture across all of them.
 */
export function ActivityScreen() {
  const feed = useFeed();
  return (
    <Screen tabBar={<BottomNav />} topBar={<TopBar leading="none" title="Activity" collapse />}>
      <LargeTitle className="pacts-head">Activity</LargeTitle>
      {feed.isLoading ? (
        <RowListSkeleton count={7} label="Loading activity" />
      ) : feed.error ? (
        <ErrorState onRetry={() => feed.refetch()} />
      ) : !feed.data?.length ? (
        <EmptyState kind="circle" title="Quiet for now." body="When your people start moving, you’ll see it here." />
      ) : (
        <RecentList items={feed.data} />
      )}
    </Screen>
  );
}
