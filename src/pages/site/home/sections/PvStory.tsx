import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger } from '../../../../lib/gsap';
import { useMediaQuery } from '../../../../lib/useMediaQuery';
import { CompleteDemo } from '../../mockups/CompleteDemo';
import { CreateDemo } from '../../mockups/CreateDemo';
import { clamp, lin } from '../../mockups/demoKit';
import { ExecuteDemo } from '../../mockups/ExecuteDemo';
import { InviteDemo } from '../../mockups/InviteDemo';
import { PhoneFrame } from '../../mockups/PhoneFrame';
import { ProgressDemo } from '../../mockups/ProgressDemo';
import { img } from './shared';
import '../mockups-bold.css';

const scenes = [
  {
    key: 'start',
    tint: 'mint',
    label: 'Start the Pact',
    title: 'Start with the plan.',
    body: 'Name it, set the goal and the date. That is the whole setup.',
    points: ['Name what the money is for', 'Set the goal and the date', 'Pick who you are doing it with'],
    photo: 'dinner-women',
    alt: 'Creating a Pact: the name Sarah’s Birthday is typed, Gift is chosen, the goal fills to ₦500,000, the date is set and Create Pact turns green.',
    Screen: CreateDemo,
    calls: [{ text: 'Sarah’s Birthday', side: 'l', y: '22%' }, { text: '₦500,000 goal', side: 'r', y: '52%' }],
  },
  {
    key: 'people',
    tint: 'mint',
    label: 'Bring people in',
    title: 'Everyone brings something.',
    body: 'Share one link. People join and choose how they will show up: money, a task, or both.',
    points: ['One link, shared where your group already is', 'Money, a task, or both', 'Everyone sees who is in'],
    photo: 'friends-agbada',
    alt: 'Inviting people: the link is copied and David, Maya, Daniel, Kemi and Femi join, each choosing money, a task or both.',
    Screen: InviteDemo,
    calls: [{ text: 'Maya is in', side: 'l', y: '30%' }, { text: 'David joined', side: 'r', y: '58%' }],
  },
  {
    key: 'progress',
    tint: 'coral',
    label: 'Move it forward',
    title: 'PACT tells the group what needs to happen next.',
    body: 'Contributions land, tasks get claimed and finished, and the next step changes for everyone.',
    points: ['The ring fills as people contribute', 'Tasks are claimed, then done', 'One next step at a time'],
    photo: 'story-wedding-dance',
    alt: 'The Pact filling from ₦120,000 to ₦500,000 as people contribute, the cake task moving to done, and the next step changing to pay the venue.',
    Screen: ProgressDemo,
    calls: [{ text: '₦120,000 in', side: 'l', y: '26%' }, { text: 'Cake is claimed', side: 'r', y: '62%' }],
  },
  {
    key: 'execute',
    tint: 'coral',
    label: 'Use the money',
    title: 'Use the money for the plan.',
    body: 'Pay the venue, the cake and transport straight from the Pact, and watch every payment as it happens.',
    points: ['Budget lines for what the plan needs', 'Pay someone straight from the Pact', 'See what is paid, pending and left'],
    photo: 'story-toast',
    alt: 'Using the funds: the venue is paid ₦200,000, the cake payment is pending, transport is not yet paid, and the money left in the Pact goes down.',
    Screen: ExecuteDemo,
    calls: [{ text: 'Venue paid', side: 'l', y: '34%' }, { text: 'Everyone can see it', side: 'r', y: '64%' }],
  },
  {
    key: 'complete',
    tint: 'mint',
    label: 'Finish it',
    title: 'The plan gets finished, not just funded.',
    body: 'Complete the Pact and the group gets the outcome: what was paid, what got done, and who showed up.',
    points: ['The last tasks get ticked off', 'Complete the Pact', 'The outcome, kept as a receipt'],
    photo: 'story-sunset-sit',
    alt: 'Completing the Pact: the last payments and task settle, Complete Pact is tapped, and the screen becomes We made it happen with a receipt.',
    Screen: CompleteDemo,
    calls: [{ text: 'We made it happen', side: 'l', y: '28%' }, { text: 'Receipt saved', side: 'r', y: '60%' }],
  },
] as const;

const N = scenes.length;
/** Each scene plays between these shares of its slot; the rest is a hold and the hand-over. */
const PLAY_FROM = 0.08;
const PLAY_TO = 0.78;
/** How wide the cross-fade between two scenes is, in scenes. */
const FADE = 0.16;

const smooth = (x: number) => x * x * (3 - 2 * x);

/** How visible scene i is at position g: it fades in around g = i and out around g = i + 1. */
function visibility(g: number, i: number) {
  const inn = i === 0 ? 1 : smooth(clamp((g - (i - FADE)) / (FADE * 2)));
  const out = i === N - 1 ? 0 : smooth(clamp((g - (i + 1 - FADE)) / (FADE * 2)));
  return inn * (1 - out);
}

/**
 * The product, held. A pinned room: the page stops, the scene on the phone and the words beside it follow your scroll, and the photograph
 * behind changes with the moment. The position is eased toward the scroll (it never jumps), scenes cross-fade instead of cutting, and the
 * phone is small enough to sit beside the words rather than dominate them. On reduced motion each scene is simply a card.
 */
export function PvStory() {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const root = useRef<HTMLElement>(null);
  const [g, setG] = useState(0);

  useEffect(() => {
    if (reduce || !root.current) return;
    const el = root.current;
    const state = { target: 0, current: 0, last: -1 };
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        state.target = clamp(self.progress * N, 0, N - 0.0001);
      },
    });
    // The scene position chases the scroll position: a short ease, so a fast flick plays the scenes through instead of skipping them.
    const tick = (_t: number, dt: number) => {
      const k = 1 - Math.exp(-dt / 140);
      state.current += (state.target - state.current) * k;
      if (Math.abs(state.target - state.current) < 0.0005) state.current = state.target;
      const q = Math.round(state.current * 1000) / 1000;
      if (q !== state.last) {
        state.last = q;
        setG(q);
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      st.kill();
    };
  }, [reduce]);

  const active = clamp(Math.floor(g + 0.0001), 0, N - 1);
  const tilt = Math.sin(g * Math.PI * 1.2) * 3;

  if (reduce) {
    return (
      <section id="story" className="lp2-story lp2-story--still" aria-label="How PACT works">
        <div className="lp2-wrap">
          {scenes.map((s) => (
            <article key={s.key} className="lp2-story__card">
              <div>
                <p className="lp2-story__kicker">{s.label}</p>
                <h2 className="lp2-story__title">{s.title}</h2>
                <p className="lp2-story__body">{s.body}</p>
              </div>
              <div className={`d-bold tint--${s.tint}`}>
                <PhoneFrame label={s.alt} className="lp2-story__phone">
                  <s.Screen t={1} />
                </PhoneFrame>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="story" className="lp2-story" ref={root} aria-label="How PACT works" style={{ height: `${N * 90 + 100}svh` }}>
      <div className="lp2-story__sticky">
        {scenes.map((s, i) => (
          <div key={s.key} className={`lp2-story__bg ${active === i ? 'is-on' : ''}`} aria-hidden>
            <img className="lp2-ph" src={img(s.photo)} width={1400} height={933} alt="" loading="lazy" />
          </div>
        ))}
        <span className="lp2-story__scrim" aria-hidden />

        <div className="lp2-wrap lp2-story__grid">
          <div className="lp2-story__copy">
            {scenes.map((s, i) => (
              <div key={s.key} className={`lp2-story__block ${active === i ? 'is-on' : ''}`} aria-hidden={active !== i}>
                <p className="lp2-story__kicker">
                  <span className="num">{String(i + 1).padStart(2, '0')}</span> {s.label}
                </p>
                <h2 className="lp2-story__title">{s.title}</h2>
                <p className="lp2-story__body">{s.body}</p>
                <ul className="lp2-story__points">
                  {s.points.map((p) => (
                    <li key={p}>
                      <Check strokeWidth={3} aria-hidden /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="lp2-story__stage">
            <div className="lp2-story__tilt d-bold" style={{ transform: `perspective(1400px) rotateY(${tilt}deg)` }}>
              <PhoneFrame label={scenes[active].alt} className="lp2-story__phone">
                {scenes.map((s, i) => {
                  const o = visibility(g, i);
                  if (o <= 0.001) return null;
                  return (
                    <div key={s.key} className={`lp2-story__layer tint--${s.tint}`} style={{ opacity: o, transform: `scale(${0.97 + 0.03 * o})`, zIndex: i }}>
                      <s.Screen t={lin(g - i, PLAY_FROM, PLAY_TO)} />
                    </div>
                  );
                })}
              </PhoneFrame>
              {scenes.map((s, i) =>
                s.calls.map((c, j) => (
                  <span key={`${s.key}${j}`} className={`lp2-call lp2-call--${c.side} ${active === i ? 'is-on' : ''}`} style={{ top: c.y, transitionDelay: active === i ? `${0.25 + j * 0.18}s` : '0s' }} aria-hidden>
                    {c.text}
                  </span>
                )),
              )}
            </div>
            <ol className="lp2-story__dots" aria-hidden>
              {scenes.map((s, i) => (
                <li key={s.key} className={active === i ? 'is-on' : ''} />
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
