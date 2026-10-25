import { AirplaneIcon, ForkKnifeIcon, GiftIcon, HeartIcon } from '@phosphor-icons/react';
import { useRef } from 'react';
import { gsap, MQ, useGSAP } from '../../../../lib/gsap';
import { img } from './shared';

const moments = [
  { id: 'trips', icon: AirplaneIcon, tint: 'sky', photo: 'trip-road', alt: 'Two friends smiling on a road trip through green hills', title: 'The trip you keep talking about', line: 'Flights, stays and who books what. Then the part you will tell stories about for years.', chip: 'Calabar weekend · 6 friends' },
  { id: 'weddings', icon: HeartIcon, tint: 'pink', photo: 'moment-aso-ebi', alt: 'Women in matching aso ebi holding feather fans at a wedding', title: 'The wedding everyone shows up for', line: 'Aso ebi, food, the venue. Shared costs, shared jobs, and everyone in on the day.', chip: 'Wedding contributions · 24 guests' },
  { id: 'birthdays', icon: GiftIcon, tint: 'coral', photo: 'party-birthday', alt: 'Women in colourful dresses celebrating together with balloons', title: 'The gift that is from all of you', line: 'One gift, everyone in, nobody chasing. Her face when she opens it is the point.', chip: 'Sarah’s Birthday · 8 people' },
  { id: 'dinners', icon: ForkKnifeIcon, tint: 'sun', photo: 'dinner-friends', alt: 'Friends sharing a meal at a low table and laughing', title: 'The long table and the late night', line: 'Owambe, team dinners, match day. Pay the vendors from the Pact and enjoy the evening.', chip: 'Team dinner · 12 people' },
] as const;

/**
 * A dark room with four doors. On a laptop the page stops and you walk through them sideways (the photos slide inside their frames at a
 * different speed from the frames); on a phone each moment is a card whose photo drifts as you pass.
 */
export function PvMoments() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MQ.desktop, () => {
        const track = root.current!.querySelector<HTMLElement>('.lp2-theatre__track')!;
        const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
        const walk = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.lp2-theatre__pin', pin: true, scrub: 1, start: 'top top', end: () => `+=${dist()}`, anticipatePin: 1, invalidateOnRefresh: true, onUpdate: (self) => { const n = Math.min(moments.length, Math.floor(self.progress * moments.length) + 1); const c = root.current?.querySelector('.lp2-theatre__count'); if (c) c.textContent = `0${n} / 0${moments.length}`; } } });
        gsap.utils.toArray<HTMLElement>('.lp2-moment').forEach((card) => {
          // A card settles as it arrives: a little smaller and dimmer at the edge, full size in the middle of the screen.
          gsap.fromTo(card, { scale: 0.9 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: walk, start: 'left 98%', end: 'left 45%', scrub: true } });
          gsap.fromTo(card.querySelector('.lp2-moment__img'), { xPercent: -7 }, { xPercent: 7, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: walk, start: 'left right', end: 'right left', scrub: true } });
          // Scrubbed, not fired once: the words always match where the card is, however fast the walk is crossed.
          gsap.fromTo(card.querySelectorAll('.lp2-moment__icon, .lp2-moment__title, .lp2-moment__line, .lp2-chip'), { y: 36, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: walk, start: 'left 90%', end: 'left 55%', scrub: true } });
        });
        gsap.from('.lp2-theatre__head > *', { y: 40, opacity: 0, stagger: 0.1, scrollTrigger: { trigger: '.lp2-theatre__pin', start: 'top 70%' } });
      });

      mm.add(MQ.mobile, () => {
        gsap.from('.lp2-theatre__head > *', { y: 30, opacity: 0, stagger: 0.1, scrollTrigger: { trigger: '.lp2-theatre__head', start: 'top 85%' } });
        gsap.utils.toArray<HTMLElement>('.lp2-moment').forEach((card) => {
          gsap.fromTo(card.querySelector('.lp2-moment__img'), { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
          gsap.from(card.querySelectorAll('.lp2-moment__icon, .lp2-moment__title, .lp2-moment__line, .lp2-chip'), { y: 28, opacity: 0, stagger: 0.08, duration: 0.8, scrollTrigger: { trigger: card, start: 'top 75%' } });
        });
      });
    },
    { scope: root },
  );

  return (
    <section id="moments" className="lp2-theatre" ref={root} aria-labelledby="lp2-moments-title">
      <div className="lp2-theatre__pin">
        <div className="lp2-theatre__track">
          <header className="lp2-theatre__head">
            <p className="lp2-eyebrow lp2-eyebrow--dark">Real plans</p>
            <h2 id="lp2-moments-title" className="lp2-h2">
              Whatever you are celebrating, do it together.
            </h2>
            <p className="lp2-theatre__hint" aria-hidden>
              Keep scrolling
            </p>
          </header>
          <ul className="lp2-theatre__cards">
            {moments.map(({ id, icon: Icon, tint, photo, alt, title, line, chip }) => (
              <li
                key={id}
                className="lp2-moment"
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
                  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
                }}
              >
                <img className="lp2-ph lp2-moment__img" src={img(photo)} width={1400} height={933} alt={alt} loading="lazy" />
                <span className="lp2-moment__scrim" aria-hidden />
                <span className={`lp2-moment__icon lp2-tint--${tint}`} aria-hidden>
                  <Icon />
                </span>
                <div className="lp2-moment__text">
                  <h3 className="lp2-moment__title">{title}</h3>
                  <p className="lp2-moment__line">{line}</p>
                  <span className={`lp2-chip lp2-chip--${tint}`}>{chip}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="lp2-theatre__count" aria-hidden>
          01 / 04
        </p>
      </div>
    </section>
  );
}
