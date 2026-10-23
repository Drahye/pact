import { ArrowDown, ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '../../../../components/ui/Avatar';
import { Button } from '../../../../components/ui/Button';
import { friendColor } from '../../../../data/landing';
import { gsap, MQ, SplitText, useGSAP } from '../../../../lib/gsap';
import { img } from './shared';

const slides = ['laughing-three', 'beach-hug', 'hero-sunset-arms', 'hero-dinner-friends'];

const peeks = [
  { photo: 'trip-road-2', label: 'The trip' },
  { photo: 'peek-wedding-party', label: 'The wedding' },
  { photo: 'peek-party-laugh', label: 'The gift' },
];

const faces = ['sarah', 'david', 'maya'];

/**
 * The first frame is the whole screen: a slow slideshow of people, one line, one button, and three moments peeking up from the bottom
 * edge. The people are the parent page's own idea, small and contained: a stack of faces sitting inside the headline. The next section
 * slides over this one like a curtain (see .lp2-curtain), so leaving it is a continuous motion and not a cut.
 */
export function PvHero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MQ.motion, () => {
        const split = SplitText.create('.lp2-hero__title-text', { type: 'words', mask: 'words', aria: 'none' });
        const tl = gsap.timeline({ delay: 0.1 });
        tl.from(split.words, { yPercent: 110, duration: 1.1, stagger: 0.07, ease: 'expo.out' }, 0.05)
          .from('.lp2-hero__faces .avatar', { scale: 0, duration: 0.7, stagger: 0.09, ease: 'back.out(2)' }, 0.5)
          .from('.lp2-hero__lede, .lp2-hero__ctas', { y: 24, opacity: 0, stagger: 0.1 }, 0.6)
          .from('.lp2-peek', { yPercent: 70, opacity: 0, duration: 1.3, stagger: 0.12, ease: 'expo.out' }, 0.7);

        // Leaving: the next section rises over this one as a plain sheet (CSS sticky, so the browser does the pinning). The words and the
        // three peeking moments only fade and drift as it arrives, so nothing is ever read through, or tucked behind, the rising edge.
        // The photo layers are left alone: scaling or moving a stack of full-screen images under a scrub is what made tiles drop out.
        // The trigger is the next section, a sibling of this one, so it is passed as an element: selector strings are scoped to this section.
        const next = document.querySelector('.lp2-should');
        const leave = (end = 'top 8%') => ({ trigger: next, start: 'top 95%', end, scrub: true });
        gsap.to('.lp2-hero__content', { opacity: 0, y: -48, ease: 'none', scrollTrigger: leave('top 35%') });
        gsap.to('.lp2-peeks', { opacity: 0, ease: 'none', scrollTrigger: leave('top 55%') });
        gsap.to('.lp2-hero__veil', { opacity: 0.7, ease: 'none', scrollTrigger: leave() });

        return () => split.revert();
      });

      // Pointer: the main button leans toward the cursor.
      mm.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
        const offs = gsap.utils.toArray<HTMLElement>('.lp2-magnet').map((el) => {
          const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
          const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
          const move = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            x((e.clientX - (r.left + r.width / 2)) * 0.28);
            y((e.clientY - (r.top + r.height / 2)) * 0.4);
          };
          const out = () => (x(0), y(0));
          el.addEventListener('pointermove', move);
          el.addEventListener('pointerleave', out);
          return () => (el.removeEventListener('pointermove', move), el.removeEventListener('pointerleave', out));
        });
        return () => offs.forEach((off) => off());
      });
    },
    { scope: root },
  );

  return (
    <section className="lp2-hero" ref={root} aria-labelledby="lp2-hero-title">
      <div className="lp2-hero__bgs" aria-hidden>
        {slides.map((photo, i) => (
          <img key={photo} className="lp2-hero__bg" style={{ animationDelay: `${i * 5.5 - 1.4}s` }} src={img(photo)} width={1400} height={933} alt="" />
        ))}
      </div>
      <span className="lp2-hero__scrim" aria-hidden />
      <span className="lp2-hero__veil" aria-hidden />

      <div className="lp2-hero__content">
        <h1 id="lp2-hero-title" className="lp2-hero__title" aria-label="Life is better when everyone shows up.">
          <span className="lp2-hero__title-text">Life is better when</span>{' '}
          <span className="hero__faces lp2-hero__faces" aria-hidden>
            {faces.map((id) => (
              <span key={id} style={{ ['--c' as string]: friendColor[id] }}>
                <Avatar userId={id} size="lg" label={false} />
              </span>
            ))}
          </span>{' '}
          <span className="lp2-hero__title-text">everyone shows up.</span>
        </h1>
        <p className="lp2-hero__lede">Plan the trip, the wedding, the gift and the dinner with your people, and actually make it happen together.</p>
        <div className="lp2-hero__ctas">
          <span className="lp2-magnet">
            <Button to="/app" variant="inverse" size="lg" iconRight={<ArrowRight />}>
              Start a Pact
            </Button>
          </span>
          <a href="#should" className="lp2-link lp2-link--light">
            Step inside <ArrowDown aria-hidden />
          </a>
        </div>
      </div>

      <ul className="lp2-peeks" aria-hidden>
        {peeks.map((p, i) => (
          <li key={p.photo} className={`lp2-peek lp2-peek--${i}`}>
            <img className="lp2-ph" src={img(p.photo)} width={1400} height={788} alt="" />
            <span className="lp2-peek__label">{p.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
