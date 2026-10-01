import { ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { StoreButtons } from '../../../components/site/StoreButtons';
import { Button } from '../../../components/ui/Button';
import { gsap, MQ, useGSAP } from '../../../lib/gsap';

export function FinalCta() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(MQ.motion, () => {
        gsap.from('.final__panel', { scale: 0.94, borderRadius: 80, scrollTrigger: { trigger: root.current, start: 'top 90%', end: 'top 35%', scrub: true } });
        // the round shapes keep orbiting, slowly: the motif from the hero, closing the loop
        gsap.to('.final__shape', { rotate: 360, duration: 30, repeat: -1, ease: 'none', stagger: { each: 4 } });
      });
    },
    { scope: root },
  );
  return (
    <section className="final" ref={root} aria-labelledby="final-title">
      <div className="container">
        <div className="final__panel">
          <span className="final__shape final__shape--a" aria-hidden />
          <span className="final__shape final__shape--b" aria-hidden />
          <span className="final__shape final__shape--c" aria-hidden />
          <div className="final__copy">
            <h2 id="final-title" className="final__title">
              Make your next group plan easier to finish.
            </h2>
            <p className="final__lede">PACT helps your group track what matters, contribute in different ways, and actually get to the outcome.</p>
            <div className="final__ctas">
              <Button to="/app" variant="inverse" iconRight={<ArrowRight />}>
                Start a Pact
              </Button>
            </div>
            <p className="final__note">Creating a Pact is free. iOS and Android are coming soon.</p>
            <StoreButtons tone="light" compact />
          </div>
        </div>
      </div>
    </section>
  );
}
