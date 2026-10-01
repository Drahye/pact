import { ArrowRight, Check } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../../components/ui/Button';
import { useReducedMotion } from 'framer-motion';
import { ScrollTrigger } from '../../../lib/gsap';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { CompleteDemo } from '../mockups/CompleteDemo';
import { CreateDemo } from '../mockups/CreateDemo';
import { clamp, lin } from '../mockups/demoKit';
import { ExecuteDemo } from '../mockups/ExecuteDemo';
import { InviteDemo } from '../mockups/InviteDemo';
import { Orbit } from '../mockups/Orbit';
import { PhoneFrame } from '../mockups/PhoneFrame';
import { ProgressDemo } from '../mockups/ProgressDemo';

const scenes = {
  start: {
    key: 'start',
    label: 'Start the Pact',
    tint: 'var(--sun-100)',
    solid: 'var(--sun-400)',
    title: 'Start with the plan.',
    body: 'Name it, set the goal and the date. That is the whole setup.',
    points: ['Name what the money is for', 'Set the goal and the date', 'Pick who you are doing it with'],
    alt: 'Creating a Pact: the name Sarah’s Birthday is typed, Gift is chosen, the goal fills to ₦500,000, the date is set and Create Pact turns green.',
    Screen: CreateDemo,
  },
  people: {
    key: 'people',
    label: 'Bring people in',
    tint: 'var(--sky-50)',
    solid: 'var(--sky-400)',
    title: 'Everyone brings something.',
    body: 'Share one link. People join and choose how they will show up: money, a task, or both.',
    points: ['One link, shared where your group already is', 'Money, a task, or both', 'Everyone sees who is in'],
    alt: 'Inviting people: the link is copied and David, Maya, Daniel, Kemi and Femi join, each choosing money, a task or both.',
    Screen: InviteDemo,
  },
  progress: {
    key: 'progress',
    label: 'Move it forward',
    tint: 'var(--coral-100)',
    solid: 'var(--coral-400)',
    title: 'PACT tells the group what needs to happen next.',
    body: 'Contributions land, tasks get claimed and finished, and the next step changes for everyone.',
    points: ['The ring fills as people contribute', 'Tasks are claimed, then done', 'One next step at a time'],
    alt: 'The Pact filling from ₦120,000 to ₦500,000 as people contribute, the cake task moving to done, and the next step changing to pay the venue.',
    Screen: ProgressDemo,
  },
  execute: {
    key: 'execute',
    label: 'Use the money',
    tint: 'var(--lilac-50)',
    solid: 'var(--lilac-400)',
    title: 'Use the money for the plan.',
    body: 'Pay the venue, the cake and transport straight from the Pact, and watch every payment as it happens.',
    points: ['Budget lines for what the plan needs', 'Pay someone straight from the Pact', 'See what is paid, pending and left'],
    alt: 'Using the funds: the venue is paid ₦200,000, the cake payment is pending, transport is not yet paid, and the money left in the Pact goes down.',
    Screen: ExecuteDemo,
  },
  complete: {
    key: 'complete',
    label: 'Finish it',
    tint: 'var(--mint-100)',
    solid: 'var(--green-500)',
    title: 'The plan gets finished, not just funded.',
    body: 'Complete the Pact and the group gets the outcome: what was paid, what got done, and who showed up.',
    points: ['The last tasks get ticked off', 'Complete the Pact', 'The outcome, kept as a receipt'],
    alt: 'Completing the Pact: the last payments and task settle, Complete Pact is tapped, and the screen becomes We made it happen with a receipt.',
    Screen: CompleteDemo,
  },
} as const;

type Scene = (typeof scenes)[keyof typeof scenes];

/** Each scene plays between these shares of its slot; the rest of the slot is a hold and the hand-over. */
const PLAY_FROM = 0.06;
const PLAY_TO = 0.72;
const HANDOVER = 0.12;

const ringsA = [
  { size: 100, seconds: 90, dashed: true, faces: [{ id: 'sarah', deg: 200, px: 44 }, { id: 'maya', deg: 20, px: 44 }], dots: [{ color: 'var(--sun-400)', deg: -70, px: 18 }] },
  { size: 78, seconds: 70, reverse: true, faces: [{ id: 'david', deg: -40, px: 40 }, { id: 'kemi', deg: 150, px: 40 }], dots: [{ color: 'var(--pink-400)', deg: 80, px: 14 }] },
];
const ringsB = [
  { size: 100, seconds: 80, dashed: true, faces: [{ id: 'abraham', deg: 160, px: 44 }, { id: 'femi', deg: -30, px: 44 }], dots: [{ color: 'var(--sky-400)', deg: 70, px: 18 }] },
  { size: 78, seconds: 64, reverse: true, faces: [{ id: 'tolu', deg: 30, px: 40 }, { id: 'daniel', deg: 210, px: 40 }], dots: [{ color: 'var(--sun-400)', deg: -80, px: 14 }] },
];

function Copy({ s, n }: { s: Scene; n: number }) {
  return (
    <>
      <p className="story__kicker">
        <span className="num">{String(n).padStart(2, '0')}</span> {s.label}
      </p>
      <h3 className="story__title">{s.title}</h3>
      <p className="story__body">{s.body}</p>
      <ul className="story__points">
        {s.points.map((p) => (
          <li key={p}>
            <Check strokeWidth={3} aria-hidden /> {p}
          </li>
        ))}
      </ul>
    </>
  );
}

/** One phone, one scene, scrubbed by how far its own article has travelled. Used on phones and for reduced motion. */
function StackedScene({ s, n, still }: { s: Scene; n: number; still: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(still ? 1 : 0);
  useEffect(() => {
    if (still || !ref.current) return;
    let last = -1;
    const st = ScrollTrigger.create({
      trigger: ref.current,
      start: 'top 85%',
      end: 'center 40%',
      onUpdate: (self) => {
        const v = Math.round(self.progress * 200) / 200;
        if (v !== last) setP((last = v));
      },
    });
    return () => st.kill();
  }, [still]);
  return (
    <article className="story__card" style={{ ['--tint' as string]: s.tint }}>
      <div className="story__card-copy">
        <Copy s={s} n={n} />
      </div>
      <div className="story__card-stage" ref={ref}>
        <PhoneFrame label={s.alt} className="story__phone">
          <s.Screen t={still ? 1 : lin(p, 0.05, 0.92)} />
        </PhoneFrame>
      </div>
    </article>
  );
}

/** Which scene is on top, how far through its own play it is, and how visible it is while it hands over. */
function sceneAt(g: number, i: number) {
  const f = g - i;
  const t = lin(f, PLAY_FROM, PLAY_TO);
  const into = i === 0 ? 1 : clamp((g - (i - HANDOVER)) / HANDOVER);
  const gone = g >= i + 1 + HANDOVER;
  return { t, into, gone };
}

interface ChapterProps {
  id: string;
  eyebrow: string;
  title: string;
  list: readonly Scene[];
  /** Number of the first scene, so the two chapters read as one story. */
  from: number;
  /** Phone on the left and copy on the right. */
  flip?: boolean;
  rings: typeof ringsA;
  after?: ReactNode;
}

/**
 * A pinned phone beside scrolling copy. Scroll position decides which scene is on the phone and how far
 * through it is; on phones, and for reduced motion, each scene becomes its own card instead.
 */
function Chapter({ id, eyebrow, title, list, from, flip, rings, after }: ChapterProps) {
  const reduce = !!useReducedMotion();
  const wide = useMediaQuery('(min-width: 1024px)');
  const pinned = wide && !reduce;
  const copy = useRef<HTMLOListElement>(null);
  const root = useRef<HTMLElement>(null);
  const [g, setG] = useState(0);
  const N = list.length;

  useEffect(() => {
    if (!pinned || !copy.current) return;
    const el = copy.current;
    let last = -1;
    const compute = () => {
      const r = el.getBoundingClientRect();
      const slot = r.height / N;
      const v = clamp((window.innerHeight * 0.5 - r.top) / slot, 0, N - 0.001);
      const q = Math.round(v * 400) / 400;
      if (q !== last) setG((last = q));
    };
    compute();
    const st = ScrollTrigger.create({ trigger: root.current, start: 'top bottom', end: 'bottom top', onUpdate: compute, onRefresh: compute });
    return () => st.kill();
  }, [pinned, N]);

  const active = clamp(Math.floor(g + HANDOVER), 0, N - 1);
  const tilt = Math.sin(g * Math.PI * 2) * (flip ? -2.5 : 2.5);
  const headId = `${id}-title`;

  const head = (
    <header className="story__head">
      <p className="story__eyebrow">{eyebrow}</p>
      <h2 id={headId} className="story__h2">
        {title}
      </h2>
    </header>
  );

  return (
    <section id={id} className={`story ${pinned ? 'is-pinned' : ''} ${flip ? 'is-flip' : ''}`} ref={root} aria-labelledby={headId} style={{ ['--tint' as string]: list[active].tint, ['--solid' as string]: list[active].solid }}>
      {pinned ? (
        <div className="container story__grid">
          <div className="story__copycol">
            {head}
            <ol className="story__copy" ref={copy}>
              {list.map((s, i) => (
                <li key={s.key} className={`story__block ${active === i ? 'is-active' : ''}`}>
                  <Copy s={s} n={from + i} />
                </li>
              ))}
            </ol>
          </div>
          <div className="story__stage">
            <div className="story__sticky">
              <div className="story__disc" aria-hidden />
              <div className="story__orbit">
                <Orbit rings={rings} />
                <svg className="story__arc" viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="49" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (g / N) * 100} />
                </svg>
              </div>
              <div className="story__tilt" style={{ transform: `perspective(1400px) rotateY(${tilt}deg)` }}>
                <PhoneFrame label={list[active].alt} className="story__phone">
                  {list.map((s, i) => {
                    const { t, into, gone } = sceneAt(g, i);
                    if (gone || (i > 0 && into === 0)) return null;
                    return (
                      <div key={s.key} className="story__layer" style={{ opacity: into, transform: `translateY(${(1 - into) * 28}px) scale(${0.97 + 0.03 * into})`, zIndex: i }}>
                        <s.Screen t={t} />
                      </div>
                    );
                  })}
                </PhoneFrame>
              </div>
              <ol className="story__dots" aria-hidden>
                {list.map((s, i) => (
                  <li key={s.key} className={active === i ? 'is-on' : ''} />
                ))}
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <div className="container story__stack">
          {head}
          {list.map((s, i) => (
            <StackedScene key={s.key} s={s} n={from + i} still={reduce} />
          ))}
        </div>
      )}
      {after}
    </section>
  );
}

/** Section 3: how a group uses it, from the first idea to a funded Pact. Phone on the right. */
export function HowItWorks() {
  return <Chapter id="story" eyebrow="How it works" title="One plan, from first idea to fully funded." list={[scenes.start, scenes.people, scenes.progress]} from={1} rings={ringsA} />;
}

/** Section 4: the execution layer. The composition flips: phone on the left. */
export function Execution() {
  return (
    <Chapter
      id="execution"
      eyebrow="What makes PACT different"
      title="Funded is not finished."
      list={[scenes.execute, scenes.complete]}
      from={4}
      flip
      rings={ringsB}
      after={
        <div className="container story__cta">
          <p>That is the whole plan, from idea to done.</p>
          <Button to="/app" iconRight={<ArrowRight />}>
            Start a Pact
          </Button>
        </div>
      }
    />
  );
}
