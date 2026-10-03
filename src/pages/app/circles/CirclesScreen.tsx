import { Plus, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCircles } from '../../../api/circles';
import { Empty, ErrorState } from '../../../components/app/States';
import { PactListSkeleton } from '../../../components/app/Skeleton';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { AvatarGroup } from '../../../components/ui/AvatarGroup';
import { BottomNav } from '../../../components/ui/BottomNav';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { LargeTitle } from '../../../components/ui/LargeTitle';
import { TopBar } from '../../../components/ui/TopBar';
import { Screen } from '../Screen';
import '../../../components/circle/circle.css';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** The groups someone makes things happen with. */
export function CirclesScreen() {
  const circles = useCircles();
  const items = circles.data ?? [];
  return (
    <Screen
      tabBar={<BottomNav />}
      topBar={<TopBar leading="none" title="Circles" collapse trailing={<IconButton label="New Circle" icon={<Plus />} to="/app/circles/new" />} />}
    >
      <LargeTitle className="pacts-head" subtitle="The people you make things happen with.">
        Your Circles
      </LargeTitle>
      {circles.isLoading ? (
        <PactListSkeleton count={3} label="Loading your Circles" />
      ) : circles.error ? (
        <ErrorState onRetry={() => circles.refetch()} />
      ) : !items.length ? (
        <Empty
          icon={<UsersRound />}
          title="Your people, in one place"
          body="Create a Circle for the groups you plan things with: the friends, the family, the crew."
          action={
            <Button to="/app/circles/new" iconLeft={<Plus />}>
              Create a Circle
            </Button>
          }
        />
      ) : (
        <>
          <ul className="list-stack" aria-label="Your Circles">
            {items.map((c) => (
              <li key={c.id}>
                <Link to={`/app/circles/${c.id}`} className="circle-row">
                  <CircleBadge emoji={c.emoji} tint={c.tint} size="md" />
                  <span className="circle-row__text">
                    <span className="circle-row__name">{c.name}</span>
                    <span className={`circle-row__meta ${c.live?.needsYou ? 'is-live' : ''}`}>{c.live ? c.live.text : people(c.memberCount)}</span>
                  </span>
                  <AvatarGroup userIds={c.memberIds} total={c.memberCount} size="sm" max={3} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="screen-section">
            <Button to="/app/circles/new" variant="secondary" fullWidth iconLeft={<Plus />}>
              New Circle
            </Button>
          </div>
        </>
      )}
    </Screen>
  );
}
