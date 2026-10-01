import { ArrowDown } from 'lucide-react';
import { useRef } from 'react';
import { planTypes } from '../../../data/landing';
import { gsap, MQ, SplitText, useGSAP } from '../../../lib/gsap';

const tints = ['sun', 'sky', 'coral', 'lilac', 'mint', 'pink'];

/** Two rows of plans drifting in opposite directions. Pauses on hover and stands still for reduced motion. */
function Ribbons() {
  const rows = [planTypes, [...planTypes].reverse()];
  return (
    <div className="ribbons" role="group" aria-label="What people make Pacts for">
      <p className="visually-hidden">People make Pacts for: {planTypes.join(', ')}.</p>
      {rows.map((row, r) => (
        <div key={r} className={`ribbons__row ${r ? 'ribbons__row--reverse' : ''}`} aria-hidden>
          <div className="ribbons__track">
            {[...row, ...row].map((label, i) => (
              <span key={i} className={`ribbons__pill ribbons__pill--${tints[(i + r * 2) % tints.length]}`}>
                <span className="ribbons__dot" />
                {label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Section 2, deliberately calm and centred after the energetic hero: the ribbons say how many kinds of
 * plan this holds, then one large statement says what PACT brings together.
 */
export function WhatIsPact() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        const split = SplitText.create('.what__statement', { type: 'words', aria: 'none' });
        const trigger = { trigger: '.what__statement', start: 'top 85%' };
        gsap.from('.ribbons', { y: 36, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.ribbons', start: 'top 92%' } });
        gsap.from('.what__lead', { y: 20, opacity: 0, duration: 0.9, scrollTrigger: { trigger: '.what__lead', start: 'top 90%' } });
        // words rise in a quick wave; the highlighted phrases then land one after another
        gsap.from(
          split.words.filter((w) => !w.closest('.what__pill')),
          { y: 26, opacity: 0, duration: 0.8, stagger: 0.03, ease: 'power3.out', scrollTrigger: trigger },
        );
        gsap.from('.what__pill', { scale: 0.7, opacity: 0, rotate: -4, duration: 0.7, stagger: 0.28, delay: 0.35, ease: 'back.out(1.8)', scrollTrigger: trigger });
        gsap.from('.what__support, .what__more', { y: 18, opacity: 0, duration: 0.9, stagger: 0.12, scrollTrigger: { trigger: '.what__support', start: 'top 92%' } });
        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <section id="what" className="what" ref={root} aria-labelledby="what-title">
      <Ribbons />
      <div className="container what__inner">
        <p className="what__kicker">What is PACT?</p>
        <p className="what__lead">Most group plans start in a chat and end with one person chasing everyone.</p>
        <h2 id="what-title" className="what__statement">
          PACT puts <span className="what__pill what__pill--sun">the goal</span>, <span className="what__pill what__pill--sky">the people</span>,{' '}
          <span className="what__pill what__pill--mint">the money</span> and <span className="what__pill what__pill--coral">what happens next</span> in one place, so the plan actually gets done.
        </h2>
        <p className="what__support">From the first invite to the final payment, PACT keeps everyone aligned on what has happened, what is left and who is doing what.</p>
        <a className="what__more" href="#story">
          See how PACT works <ArrowDown aria-hidden />
        </a>
      </div>
    </section>
  );
}
