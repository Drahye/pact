import { ArrowDown, ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { friendColor } from '../../../data/landing';
import { gsap, MQ, SplitText, useGSAP } from '../../../lib/gsap';
import { NextStepCard, TaskChip } from '../mockups/Mockups';
import { HeroStage } from './HeroStage';

const faces = ['sarah', 'david', 'maya'];

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
          .from('.hero__visual', { y: 60, opacity: 0, duration: 1.4, ease: 'expo.out' }, 0.45)
          .from('.hero__float', { y: 30, scale: 0.94, opacity: 0, duration: 0.9, stagger: 0.15, ease: 'expo.out' }, 1.1);
        // the two cards bob out of step with each other, like they are being passed around
        gsap.to('.hero__float--a', { y: -8, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        gsap.to('.hero__float--b', { y: 8, duration: 3.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
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
          <p className="hero__lede">
            PACT keeps the people, money, tasks and next steps for a shared plan in one place, so trips, birthdays, gifts and shared expenses actually get done.
          </p>
          <div className="hero__ctas">
            <Button to="/app" iconRight={<ArrowRight />}>
              Start a Pact
            </Button>
            <Button href="#how" variant="secondary" iconRight={<ArrowDown />}>
              See how it works
            </Button>
          </div>
          <p className="hero__note">Keep the group chat. Put the plan in PACT.</p>
        </div>

        <div className="hero__visual">
          <HeroStage />
          <div className="hero__float hero__float--a">
            <NextStepCard />
          </div>
          <div className="hero__float hero__float--b">
            <TaskChip />
          </div>
        </div>
      </div>
    </section>
  );
}
