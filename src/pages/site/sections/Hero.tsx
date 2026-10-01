import { ArrowDown, ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { friendColor } from '../../../data/landing';
import { gsap, MQ, SplitText, useGSAP } from '../../../lib/gsap';
import { Orbit } from '../mockups/Orbit';
import { HeroPhone } from '../mockups/PactDemo';

const faces = ['sarah', 'david', 'maya'];

const rings = [
  {
    size: 100,
    seconds: 70,
    faces: [
      { id: 'david', deg: -150, px: 58 },
      { id: 'maya', deg: -20, px: 54 },
      { id: 'kemi', deg: 100, px: 50 },
    ],
    dots: [
      { color: 'var(--sun-400)', deg: 40, px: 22 },
      { color: 'var(--pink-400)', deg: 200, px: 16 },
    ],
  },
  {
    size: 74,
    seconds: 55,
    reverse: true,
    dashed: true,
    faces: [
      { id: 'tolu', deg: 200, px: 46 },
      { id: 'femi', deg: 20, px: 46 },
    ],
    dots: [{ color: 'var(--sky-400)', deg: 110, px: 20 }],
  },
];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        const split = SplitText.create('.hero__title-text', { type: 'words', mask: 'words', aria: 'none' });
        const tl = gsap.timeline({ delay: 0.1 });
        tl.from('.hero__eyebrow', { y: 12, opacity: 0, duration: 0.7 })
          .from(split.words, { yPercent: 110, duration: 1.1, stagger: 0.07, ease: 'expo.out' }, 0.05)
          .from('.hero__faces .avatar', { scale: 0, duration: 0.7, stagger: 0.08, ease: 'back.out(2)' }, 0.35)
          .from('.hero__lede, .hero__ctas, .hero__note', { y: 24, opacity: 0, stagger: 0.1 }, 0.5)
          .from('.hero__phone-wrap', { y: 80, opacity: 0, duration: 1.3, ease: 'expo.out' }, 0.4)
          .from('.hero__orbit', { scale: 0.85, opacity: 0, duration: 1.6, ease: 'expo.out' }, 0.5);
        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <section className="hero" ref={root} aria-labelledby="hero-title">
      <div className="container hero__grid">
        <div className="hero__copy">
          <p className="hero__eyebrow">For trips, gifts, events and shared bills</p>
          <h1 id="hero-title" className="hero__title" aria-label="Make it happen together.">
            <span className="hero__title-text">Make it happen</span>{' '}
            <span className="hero__faces" aria-hidden>
              {faces.map((id) => (
                <span key={id} style={{ ['--c' as string]: friendColor[id] }}>
                  <Avatar userId={id} size="lg" label={false} />
                </span>
              ))}
            </span>{' '}
            <span className="hero__title-text">together.</span>
          </h1>
          <p className="hero__lede">PACT keeps the people, money, tasks and next steps for a shared plan in one place, so the plan actually gets done.</p>
          <div className="hero__ctas">
            <Button to="/app" iconRight={<ArrowRight />}>
              Start a Pact
            </Button>
            <Button href="#story" variant="secondary" iconRight={<ArrowDown />}>
              See how it works
            </Button>
          </div>
          <p className="hero__note">Keep the group chat. Put the plan in PACT.</p>
        </div>

        <div className="hero__visual">
          <div className="hero__orbit">
            <Orbit rings={rings} />
          </div>
          <div className="hero__phone-wrap">
            <HeroPhone />
          </div>
        </div>
      </div>
    </section>
  );
}
