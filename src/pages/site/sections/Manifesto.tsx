import { useRef } from 'react';
import { gsap, MQ, SplitText, useGSAP } from '../../../lib/gsap';

/** One idea, read at scroll speed: words brighten from 0.5 to 1 as you move through. */
export function Manifesto() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        const split = SplitText.create('.manifesto__text', { type: 'words', aria: 'none' });
        gsap.fromTo(
          // The highlighted pills stay fully readable; only the words around them dim.
          split.words.filter((w) => !w.closest('.manifesto__pill')),
          // Dimmed, not hidden: 0.5 keeps unread words above large-text contrast (3:1).
          { opacity: 0.5 },
          {
            opacity: 1,
            stagger: 0.1,
            ease: 'none',
            scrollTrigger: { trigger: '.manifesto__text', start: 'top 80%', end: 'bottom 45%', scrub: true },
          },
        );
        gsap.from('.manifesto__pill', {
          scale: 0.6,
          rotate: -8,
          stagger: 0.15,
          ease: 'back.out(2)',
          scrollTrigger: { trigger: '.manifesto__text', start: 'top 70%' },
        });
        return () => split.revert();
      });
    },
    { scope: root },
  );
  return (
    <section className="manifesto" ref={root} aria-label="Why PACT">
      <div className="container">
        <p className="manifesto__text">
          Every trip, gift and shared bill starts in a group chat and ends with one person chasing everyone else. PACT puts{' '}
          <span className="manifesto__pill manifesto__pill--sun">the goal</span>,{' '}
          <span className="manifesto__pill manifesto__pill--sky">the people</span> and{' '}
          <span className="manifesto__pill manifesto__pill--mint">every naira</span> in one place, so everyone can see exactly where things stand.
        </p>
      </div>
    </section>
  );
}
