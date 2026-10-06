import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCircles } from '../../../api/circles';
import { ErrorState } from '../../../components/app/States';
import { CircleTile, EmptyState, PageHero } from '../../../components/objects';
import { PactListSkeleton } from '../../../components/app/Skeleton';
import { BottomNav } from '../../../components/ui/BottomNav';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
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
      className="xhero xhero--lite tint--coral"
      tabBar={<BottomNav />}
      topBar={<TopBar tone="transparent" leading="none" title="Circles" collapse trailing={<IconButton label="New Circle" icon={<Plus />} to="/app/circles/new" />} />}
    >
      <PageHero tint="coral" title="Your Circles" subtitle="The people you make things happen with." />
      {circles.isLoading ? (
        <PactListSkeleton count={3} label="Loading your Circles" />
      ) : circles.error ? (
        <ErrorState onRetry={() => circles.refetch()} />
      ) : !items.length ? (
        <EmptyState
          kind="circle"
          title="Start with the people you already plan with."
          body="A Circle keeps your group, its plans and its questions in one place: the friends, the family, the crew."
          action={
            <Button to="/app/circles/new" iconLeft={<Plus />}>
              Create a Circle
            </Button>
          }
        />
      ) : (
        <>
          <ul className="ch-tiles" aria-label="Your Circles">
            {items.map((c, i) => (
              <li key={c.id}>
                <CircleTile name={c.name} emoji={c.emoji} tint={c.tint} peopleIds={c.memberIds} total={c.memberCount} signal={c.live ? c.live.text : people(c.memberCount)} live={!!c.live?.needsYou} alt={i % 2 === 1} to={`/app/circles/${c.id}`} />
              </li>
            ))}
            <li>
              <Link to="/app/circles/new" className="ch-tiles__new" aria-label="New Circle">
                <Plus aria-hidden />
                <span>New Circle</span>
              </Link>
            </li>
          </ul>
        </>
      )}
    </Screen>
  );
}
