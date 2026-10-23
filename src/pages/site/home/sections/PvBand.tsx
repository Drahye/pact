import { ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '../../../../components/ui/Avatar';
import { Button } from '../../../../components/ui/Button';
import { friendColor } from '../../../../data/landing';
import { gsap, MQ, SplitText, useGSAP } from '../../../../lib/gsap';

const faces = ['sarah', 'david', 'maya', 'kemi', 'tolu'];

const stats = [
  { to: 0, label: 'Reminders to send', note: 'Nobody chasing' },
  { to: 6, of: 6, label: 'Friends in', note: 'Nobody left out' },
  { to: 1, label: 'Link to share', note: 'Everyone in' },
] as const;

/**
 * The promise, said once, in a calm dark room (after Squarespace's proof band): a centred statement that reads itself as you scroll, three
 * large figures that count up to the three promises, and the faces of the people it is for. No photograph: the hero above already has one.
 */
export function PvBand() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MQ.motion, () => {
        const split = SplitText.create('.lp2-band__title', { type: 'words', aria: 'none' });
        gsap.fromTo(split.words, { opacity: 0.16 }, { opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: '.lp2-band__title', start: 'top 82%', end: 'bottom 52%', scrub: true } });

        // The figures count from nothing (or from one short of the target) once, when they arrive.
        gsap.utils.toArray<HTMLElement>('.lp2-band__num').forEach((el) => {
          const to = Number(el.dataset.to);
          const out = el.querySelector<HTMLElement>('.lp2-band__n');
          const state = { v: 0 };
          if (out) out.textContent = '0';
          gsap.to(state, { v: to, duration: 1.6, ease: 'power3.out', onUpdate: () => out && (out.textContent = String(Math.round(state.v))), scrollTrigger: { trigger: el, start: 'top 85%' } });
        });
        gsap.from('.lp2-stat', { y: 40, opacity: 0, duration: 0.9, stagger: 0.14, ease: 'expo.out', scrollTrigger: { trigger: '.lp2-stats', start: 'top 85%' } });
        gsap.from('.lp2-band__people > *', { scale: 0, duration: 0.6, stagger: 0.08, ease: 'back.out(2)', scrollTrigger: { trigger: '.lp2-band__people', start: 'top 90%' } });
        gsap.from('.lp2-band__cta', { y: 24, opacity: 0, scrollTrigger: { trigger: '.lp2-band__cta', start: 'top 92%' } });
        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <section className="lp2-band" ref={root} aria-labelledby="lp2-band-title">
      <div className="lp2-wrap lp2-band__inner">
        <p className="lp2-band__eyebrow">That is the whole idea</p>
        <h2 id="lp2-band-title" className="lp2-band__title" aria-label="Nobody chasing. Nobody left out. Everyone in.">
          Nobody chasing. Nobody left out. Everyone in.
        </h2>

        <ul className="lp2-stats">
          {stats.map((s) => (
            <li key={s.label} className="lp2-stat">
              <span className="lp2-band__num" data-to={s.to} aria-label={`${s.to}${'of' in s ? ` of ${s.of}` : ''}`}>
                <span className="lp2-band__n" aria-hidden>
                  {s.to}
                </span>
                {'of' in s && (
                  <span className="lp2-band__of" aria-hidden>
                    {' '}
                    of {s.of}
                  </span>
                )}
              </span>
              <span className="lp2-stat__label">{s.label}</span>
              <span className="lp2-stat__note">{s.note}</span>
            </li>
          ))}
        </ul>

        <div className="lp2-band__people" aria-hidden>
          {faces.map((id) => (
            <span key={id} style={{ ['--c' as string]: friendColor[id] }}>
              <Avatar userId={id} size="lg" label={false} />
            </span>
          ))}
        </div>
        <div className="lp2-band__cta">
          <Button to="/app" variant="inverse" size="lg" iconRight={<ArrowRight />}>
            Start a Pact
          </Button>
        </div>
      </div>
    </section>
  );
}
