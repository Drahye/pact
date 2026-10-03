import { useNeedsYou } from '../../api/asks';
import { usePlanNeeds } from '../../api/plans';
import { useSplitNeeds } from '../../api/splits';
import { PlanNeedCard } from '../plan/PlanBits';
import { SplitNeedCard } from '../split/SplitBits';
import { SectionHeading } from '../ui/SectionHeading';
import { AskCard } from './AskCard';
import './ask.css';

/** Only questions waiting on me: unanswered, in my Circles, asked by someone else. Quiet when there are none. */
export function HomeNeedsYou() {
  const needs = useNeedsYou();
  const plans = usePlanNeeds();
  const splits = useSplitNeeds();
  const splitItems = (splits.data ?? []).slice(0, 3);
  const items = (needs.data ?? []).slice(0, 3);
  const planItems = (plans.data ?? []).slice(0, 3);
  if (!items.length && !planItems.length && !splitItems.length) return null;
  return (
    <section className="screen-section" aria-labelledby="needs-you">
      <SectionHeading id="needs-you" title="Needs you" />
      <ul className="list-stack">
        {splitItems.map((n) => (
          <li key={`${n.splitId}-${n.kind}`}>
            <SplitNeedCard need={n} />
          </li>
        ))}
        {planItems.map((n) => (
          <li key={`${n.planId}-${n.kind}-${n.text}`}>
            <PlanNeedCard need={n} />
          </li>
        ))}
        {items.map((a) => (
          <li key={a.id}>
            <AskCard ask={a} from="home" showCircle />
          </li>
        ))}
      </ul>
    </section>
  );
}
