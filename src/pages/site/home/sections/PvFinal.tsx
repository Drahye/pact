import { ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../../../components/ui/Avatar';
import { Button } from '../../../../components/ui/Button';
import { friendColor } from '../../../../data/landing';
import { gsap, MQ, useGSAP } from '../../../../lib/gsap';
import { img } from './shared';

const polaroids = [
  { id: 'a', photo: 'polaroid-joy', caption: 'the laugh', rot: -7, speed: 0.5 },
  { id: 'b', photo: 'polaroid-trip', caption: 'the trip', rot: 6, speed: 0.9 },
  { id: 'c', photo: 'polaroid-laugh', caption: 'the catch-up', rot: -4, speed: 0.7 },
  { id: 'd', photo: 'polaroid-park', caption: 'the girls', rot: 5, speed: 0.6 },
] as const;

// Where each polaroid starts: a loose pile in the middle of the frame, each turned its own way.
const pile = [-13, 9, -5, 14];

/** The close: memories pinned around the invitation. They straighten and settle as you arrive. */
export function PvFinal() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MQ.motion, () => {
        gsap.from('.lp2-final__panel', { scale: 0.94, borderRadius: 90, scrollTrigger: { trigger: root.current, start: 'top 90%', end: 'top 35%', scrub: true } });
        // The polaroids start as a pile in the middle of the frame and spread to their places as the section scrolls in, scrubbed so the
        // spread follows the hand both ways. The offset is measured from layout (not from the transform) and re-measured on resize.
        const box = root.current?.querySelector<HTMLElement>('.lp2-polaroids');
        gsap.utils.toArray<HTMLElement>('.lp2-polaroid').forEach((el, i) => {
          const rot = Number(el.dataset.rot);
          const off = (axis: 'x' | 'y') => () => {
            if (!box) return 0;
            return axis === 'x' ? box.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2) : box.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2);
          };
          gsap.fromTo(
            el,
            { x: off('x'), y: off('y'), rotation: pile[i], scale: 0.8 },
            { x: 0, y: 0, rotation: rot, scale: 1, ease: 'power2.out', immediateRender: true, scrollTrigger: { trigger: root.current, start: 'top 85%', end: 'top 15%', scrub: 0.6, invalidateOnRefresh: true } },
          );
        });
        gsap.to('.lp2-final__shape', { rotate: 360, duration: 30, repeat: -1, ease: 'none', stagger: { each: 4 } });
      });
    },
    { scope: root },
  );

  return (
    <section className="lp2-final" ref={root} aria-labelledby="lp2-final-title">
      <div className="lp2-wrap">
        <ul className="lp2-polaroids" aria-hidden>
          {polaroids.map((p) => (
            <li key={p.id} className={`lp2-polaroid lp2-polaroid--${p.id}`} data-rot={p.rot} data-speed={p.speed} style={{ ['--r' as string]: `${p.rot}deg` }}>
              <img className="lp2-ph" src={img(p.photo)} width={1400} height={933} alt="" loading="lazy" />
              <span>{p.caption}</span>
            </li>
          ))}
        </ul>
        <div className="lp2-final__panel">
          <span className="lp2-final__shape lp2-final__shape--a" aria-hidden />
          <span className="lp2-final__shape lp2-final__shape--b" aria-hidden />
          <div className="lp2-final__copy">
            <div className="lp2-final__people" aria-hidden>
              {['sarah', 'david', 'maya', 'kemi', 'tolu'].map((id) => (
                <span key={id} style={{ ['--c' as string]: friendColor[id] }}>
                  <Avatar userId={id} size="lg" label={false} />
                </span>
              ))}
            </div>
            <h2 id="lp2-final-title" className="lp2-final__title">
              Your people are waiting.
            </h2>
            <p className="lp2-final__lede">Start a Pact, send one link, and watch the plan become a memory.</p>
            <Button to="/app" size="lg" iconRight={<ArrowRight />}>
              Start a Pact
            </Button>
            <p className="lp2-final__note">
              Creating a Pact is free. <Link to="/download">Get the app</Link> on your Home Screen, no app store needed.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
