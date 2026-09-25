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
        gsap.from('.final__panel', { scale: 0.92, borderRadius: 80, scrollTrigger: { trigger: root.current, start: 'top 85%', end: 'top 30%', scrub: true } });
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
          <h2 id="final-title" className="final__title">
            Make the plan. Make it happen together.
          </h2>
          <p className="final__lede">Start your first Pact in the web app today. iOS and Android are coming soon.</p>
          <Button to="/download" variant="inverse" iconRight={<ArrowRight />} className="final__btn">
            Get the app
          </Button>
          <StoreButtons tone="light" compact />
        </div>
      </div>
    </section>
  );
}
