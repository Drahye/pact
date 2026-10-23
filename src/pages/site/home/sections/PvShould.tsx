import { useRef } from 'react';
import { planTypes } from '../../../../data/landing';
import { gsap, MQ, SplitText, useGSAP } from '../../../../lib/gsap';
import { img } from './shared';

const tints = ['sun', 'sky', 'coral', 'lilac', 'mint', 'pink'];

/** The parent page's ribbons: two rows of plans drifting in opposite directions, pausing on hover, still for reduced motion. */
function Ribbons() {
  const rows = [planTypes, [...planTypes].reverse()];
  return (
    <div className="ribbons lp2-ribbons" role="group" aria-label="What people make Pacts for">
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

const chat = [
  { who: 'Ada', text: 'We should do Calabar this December', mine: false },
  { who: 'Tolu', text: 'YES. Let’s actually do it', mine: true },
  { who: 'Femi', text: 'ok who is booking?', mine: false },
];

/** The problem, felt: a group chat that goes quiet, a headline that reads itself as you scroll, a photo that opens like a door. */
export function PvShould() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MQ.motion, () => {
        const split = SplitText.create('.lp2-should__title', { type: 'words', aria: 'none' });
        gsap.fromTo(split.words, { opacity: 0.14 }, { opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: '.lp2-should__title', start: 'top 85%', end: 'bottom 50%', scrub: true } });

        const door = () => ({ trigger: '.lp2-should__photo', start: 'top 92%', end: 'top 30%', scrub: true });
        gsap.fromTo('.lp2-should__photo', { clipPath: 'inset(16% 16% 16% 16% round 200px)' }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'none', scrollTrigger: door() });
        gsap.fromTo('.lp2-should__photo img', { scale: 1.4 }, { scale: 1, ease: 'none', scrollTrigger: door() });

        gsap.from('.lp2-bubble', { scale: 0.4, y: 24, opacity: 0, transformOrigin: 'left bottom', duration: 0.7, stagger: 0.55, ease: 'back.out(2)', scrollTrigger: { trigger: '.lp2-chat', start: 'top 85%' } });
        gsap.from('.lp2-should__text p', { y: 30, opacity: 0, stagger: 0.18, scrollTrigger: { trigger: '.lp2-should__text', start: 'top 88%' } });
        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <section id="should" className="lp2-should" ref={root} aria-labelledby="lp2-should-title">
      <div className="lp2-wrap">
        <h2 id="lp2-should-title" className="lp2-should__title" aria-label="Every good memory starts with somebody saying, “we should.”">
          Every good memory starts with somebody saying, “we should.”
        </h2>
        <div className="lp2-should__row">
          <div className="lp2-should__stage">
            <div className="lp2-should__photo">
              <img className="lp2-ph" src={img('trip-jump-sunset')} width={1400} height={933} alt="Friends jumping for joy on a beach at sunset" loading="lazy" />
            </div>
            <ul className="lp2-chat" aria-label="A group chat, as an illustration">
              {chat.map((m) => (
                <li key={m.text} className={`lp2-bubble ${m.mine ? 'is-mine' : ''}`}>
                  <b>{m.who}</b> {m.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp2-should__text">
            <p>Then the group chat goes quiet. Somebody has to chase the money. Somebody forgets the date. The plan slips away.</p>
            <p className="lp2-should__strong">PACT is for the next part: the part where it actually happens.</p>
          </div>
        </div>
      </div>
      <Ribbons />
    </section>
  );
}
