import { Check, Link2 } from 'lucide-react';
import { SegmentedRing } from '../../components/pact/SegmentedRing';
import { CategoryIcon } from '../../components/pact/category';
import { Avatar } from '../../components/ui/Avatar';
import { AvatarGroup } from '../../components/ui/AvatarGroup';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { getUser } from '../../data/users';
import { formatNaira } from '../../lib/format';
import { DEMOS, DEMO_ORDER } from '../demo/fixtures';
import { DemoPactCard } from '../demo/DemoPactCard';
import './onboarding.css';

/**
 * The pictures in the intro are the product, drawn with the app's own components: a Pact card with its ring, people and
 * next step; the four steps with their real states; and the sample completed Pacts. No illustrations.
 */

const cast = ['abraham', 'david', 'maya', 'daniel', 'kemi', 'femi', 'tolu', 'zara'];
const shares = [
  { id: 'abraham', v: 120_000 }, { id: 'david', v: 80_000 }, { id: 'maya', v: 70_000 }, { id: 'daniel', v: 50_000 },
].map((s) => ({ id: s.id, color: getUser(s.id).color, value: s.v }));

/** Screen 1: a Pact as it looks mid-plan: who is in, how far it is, and the one thing to do next. */
export function PromiseScene() {
  return (
    <div className="ob-scene ob-pact" aria-hidden>
      <div className="ob-pact__head">
        <CategoryIcon category="birthday" size="md" />
        <div>
          <p className="ob-pact__title">Sarah’s Birthday</p>
          <p className="ob-pact__sub">Birthday · 12 days left</p>
        </div>
      </div>
      <div className="ob-pact__ring">
        <SegmentedRing shares={shares} target={500_000} size={148} stroke={16} label="Sarah’s Birthday is 64% funded">
          <span className="ob-pact__center">
            <strong className="num">{formatNaira(320_000)}</strong>
            <span className="num">of {formatNaira(500_000)}</span>
          </span>
        </SegmentedRing>
        <div className="ob-pact__people">
          <AvatarGroup userIds={cast} max={5} size="md" total={8} />
          <span>8 people</span>
        </div>
      </div>
      <div className="ob-next">
        <p className="ob-next__eyebrow">Next step</p>
        <p className="ob-next__title">Order the cake</p>
        <p className="ob-next__body">
          <Avatar userId="tolu" size="xs" label={false} accent /> Tolu is on it
        </p>
      </div>
    </div>
  );
}

/** Screen 2: invite, contribute, see what's left, finish. Each step is a small real state. */
export function HowScene() {
  return (
    <ol className="ob-scene ob-steps" aria-label="How a Pact works">
      <li style={{ ['--i' as string]: 0 }}>
        <span className="ob-steps__n num">1</span>
        <div>
          <strong>Invite your people</strong>
          <div className="ob-steps__vis">
            <AvatarGroup userIds={['david', 'maya', 'kemi', 'femi']} max={4} size="sm" total={4} />
            <span className="ob-chip"><Link2 aria-hidden /> One link</span>
          </div>
        </div>
      </li>
      <li style={{ ['--i' as string]: 1 }}>
        <span className="ob-steps__n num">2</span>
        <div>
          <strong>Contribute money, effort or both</strong>
          <div className="ob-steps__vis ob-steps__vis--wrap">
            <span className="ob-chip ob-chip--money num">David · {formatNaira(80_000)}</span>
            <span className="ob-chip ob-chip--task">Tolu · Order the cake</span>
          </div>
        </div>
      </li>
      <li style={{ ['--i' as string]: 2 }}>
        <span className="ob-steps__n num">3</span>
        <div>
          <strong>See what’s done and what’s left</strong>
          <div className="ob-steps__vis ob-steps__vis--col">
            <ProgressBar value={75} label="3 of 4 tasks done" size="sm" />
            <span className="ob-steps__note num">3 done · 1 left · {formatNaira(120_000)} to go</span>
          </div>
        </div>
      </li>
      <li style={{ ['--i' as string]: 3 }}>
        <span className="ob-steps__n num">4</span>
        <div>
          <strong>Finish the Pact together</strong>
          <div className="ob-steps__vis">
            <span className="ob-chip ob-chip--done"><Check aria-hidden strokeWidth={3} /> Completed</span>
            <span className="ob-steps__note">We made it happen</span>
          </div>
        </div>
      </li>
    </ol>
  );
}

/** Screen 3: sample completed Pacts, labelled as samples. */
export function ProofScene() {
  return (
    <div className="ob-scene ob-proof">
      {DEMO_ORDER.map((id, i) => (
        <div key={id} style={{ ['--i' as string]: i }} className="ob-proof__item">
          <DemoPactCard demo={DEMOS[id]} from="onboarding" compact />
        </div>
      ))}
      <p className="ob-proof__note">Sample Pacts, to show how people use PACT. Not real customers.</p>
    </div>
  );
}
