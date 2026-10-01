import { ArrowRight } from 'lucide-react';
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

const scenes = [
  {
    key: 'start',
    label: 'Start the Pact',
    tint: 'var(--sun-100)',
    solid: 'var(--sun-400)',
    title: 'Start with the plan.',
    body: 'Name it, set the goal and the date. That is the whole setup.',
    alt: 'Creating a Pact: the name Sarah’s Birthday is typed, Gift is chosen, the goal fills to ₦500,000, the date is set and Create Pact turns green.',
    Screen: CreateDemo,
  },
  {
    key: 'people',
    label: 'Bring people in',
    tint: 'var(--sky-50)',
    solid: 'var(--sky-400)',
    title: 'Everyone brings something.',
    body: 'Share one link. People join and choose how they will show up: money, a task, or both.',
    alt: 'Inviting people: the link is copied and David, Maya, Daniel, Kemi and Femi join, each choosing money, a task or both.',
    Screen: InviteDemo,
  },
  {
    key: 'progress',
    label: 'Move it forward',
    tint: 'var(--coral-100)',
    solid: 'var(--coral-400)',
    title: 'PACT tells the group what needs to happen next.',
    body: 'Watch the ring fill, the cake get claimed and finished, and the next step change for everyone.',
    alt: 'The Pact filling from ₦120,000 to ₦500,000 as people contribute, the cake task moving to done, and the next step changing to pay the venue.',
    Screen: ProgressDemo,
  },
  {
    key: 'execute',
    label: 'Use the money',
    tint: 'var(--lilac-50)',
    solid: 'var(--lilac-400)',
    title: 'Funded is not the finish line.',
    body: 'Pay the venue, the cake and transport straight from the Pact, and see every payment as it happens.',
    alt: 'Using the funds: the venue is paid ₦200,000, the cake payment is pending, transport is not yet paid, and the money left in the Pact goes down.',
    Screen: ExecuteDemo,
  },
  {
    key: 'complete',
    label: 'Finish it',
    tint: 'var(--mint-100)',
    solid: 'var(--green-500)',
    title: 'The plan gets finished, not just funded.',
    body: 'Complete the Pact and the group gets the outcome: what was paid, what got done, and who showed up.',
    alt: 'Completing the Pact: the last payments and task settle, Complete Pact is tapped, and the screen becomes We made it happen with a receipt.',
    Screen: CompleteDemo,
  },
] as const;

const N = scenes.length;
/** Each scene plays between these shares of its slot; the rest of the slot is a hold and the hand-over. */
const PLAY_FROM = 0.06;
const PLAY_TO = 0.72;
const HANDOVER = 0.12;

const orbitRings = [
  { size: 100, seconds: 90, dashed: true, faces: [{ id: 'sarah', deg: 200, px: 44 }, { id: 'maya', deg: 20, px: 44 }], dots: [{ color: 'var(--sun-400)', deg: -70, px: 18 }] },
  { size: 78, seconds: 70, reverse: true, faces: [{ id: 'david', deg: -40, px: 40 }, { id: 'kemi', deg: 150, px: 40 }], dots: [{ color: 'var(--pink-400)', deg: 80, px: 14 }] },
];

function Copy({ i, children }: { i: number; children?: ReactNode }) {
  const s = scenes[i];
  return (
    <>
      <p className="story__kicker">
        <span className="num">{String(i + 1).padStart(2, '0')}</span> {s.label}
      </p>
      <h3 className="story__title">{s.title}</h3>
      <p className="story__body">{s.body}</p>
      {children}
    </>
  );
}

/** One phone, one scene, scrubbed by how far its own article has travelled. Used on phones and for reduced motion. */
function StackedScene({ i, still }: { i: number; still: boolean }) {
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
  const { Screen, alt } = scenes[i];
  return (
    <article className="story__card" style={{ ['--tint' as string]: scenes[i].tint }}>
      <div className="story__card-copy">
        <Copy i={i} />
      </div>
      <div className="story__card-stage" ref={ref}>
        <PhoneFrame label={alt} className="story__phone">
          <Screen t={still ? 1 : lin(p, 0.05, 0.92)} />
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

export function ProductStory() {
  const reduce = !!useReducedMotion();
  const wide = useMediaQuery('(min-width: 1024px)');
  const pinned = wide && !reduce;
  const copy = useRef<HTMLOListElement>(null);
  const root = useRef<HTMLElement>(null);
  const [g, setG] = useState(0);

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
  }, [pinned]);

  const active = clamp(Math.floor(g + HANDOVER), 0, N - 1);
  const tilt = Math.sin(g * Math.PI * 2) * 2.5;

  return (
    <section id="story" className={`story ${pinned ? 'is-pinned' : ''}`} ref={root} aria-labelledby="story-title" style={{ ['--tint' as string]: scenes[active].tint, ['--solid' as string]: scenes[active].solid }}>
      <h2 id="story-title" className="visually-hidden">
        How a Pact works, from the first idea to a finished plan
      </h2>

      {pinned ? (
        <div className="container story__grid">
          <ol className="story__copy" ref={copy}>
            {scenes.map((s, i) => (
              <li key={s.key} className={`story__block ${active === i ? 'is-active' : ''}`}>
                <Copy i={i} />
              </li>
            ))}
          </ol>
          <div className="story__stage">
            <div className="story__sticky">
              <div className="story__disc" aria-hidden />
              <div className="story__orbit">
                <Orbit rings={orbitRings} />
                <svg className="story__arc" viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="49" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (g / N) * 100} />
                </svg>
              </div>
              <div className="story__tilt" style={{ transform: `perspective(1400px) rotateY(${tilt}deg)` }}>
                <PhoneFrame label={scenes[active].alt} className="story__phone">
                  {scenes.map((s, i) => {
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
                {scenes.map((s, i) => (
                  <li key={s.key} className={active === i ? 'is-on' : ''} />
                ))}
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <div className="container story__stack">
          {scenes.map((s, i) => (
            <StackedScene key={s.key} i={i} still={reduce} />
          ))}
        </div>
      )}

      <div className="container story__cta">
        <p>That is the whole plan, from idea to done.</p>
        <Button to="/app" iconRight={<ArrowRight />}>
          Start a Pact
        </Button>
      </div>
    </section>
  );
}
