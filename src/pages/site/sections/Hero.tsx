import { ArrowDown, ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { friendColor } from '../../../data/landing';
import { gsap, MQ, SplitText, useGSAP } from '../../../lib/gsap';
import { HeroStage } from './HeroStage';

const faces = ['sarah', 'david', 'maya'];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        const split = SplitText.create('.hero__title-text', { type: 'words', mask: 'words' });
        const tl = gsap.timeline({ delay: 0.1 });
        tl.from(split.words, { yPercent: 110, duration: 1.1, stagger: 0.07, ease: 'expo.out' })
          .from('.hero__faces .avatar', { scale: 0, duration: 0.7, stagger: 0.08, ease: 'back.out(2)' }, 0.35)
          .from('.hero__lede, .hero__ctas', { y: 24, opacity: 0, stagger: 0.1 }, 0.5)
          .from('.stage', { y: 60, opacity: 0, duration: 1.4, ease: 'expo.out' }, 0.55);
        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <section className="hero" ref={root} aria-labelledby="hero-title">
      <div className="container hero__copy">
        <h1 id="hero-title" className="hero__title">
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
        <p className="hero__lede">Plan the trip. Fund the gift. Organise the event. PACT brings your people, money and plan together.</p>
        <div className="hero__ctas">
          <Button to="/download" iconRight={<ArrowRight />}>
            Get the app
          </Button>
          <Button href="#how" variant="secondary" iconRight={<ArrowDown />}>
            See how it works
          </Button>
        </div>
      </div>
      <HeroStage />
    </section>
  );
}
