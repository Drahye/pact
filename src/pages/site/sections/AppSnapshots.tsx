import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { PhoneFrame } from '../../../components/site/PhoneFrame';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { gsap, MQ, ScrollTrigger, useGSAP } from '../../../lib/gsap';

/** Snapshots captured from the working prototype (see scripts/snapshots.py). */
const shots = [
  { src: 'welcome', title: 'Friends, paying in live', body: 'The first screen is the product: people around one goal, money filling it.', tint: 'mint' },
  { src: 'home', title: 'Every Pact at a glance', body: 'Your most urgent goal leads, with the rest one tap away.', tint: 'sun' },
  { src: 'create', title: 'Create in three details', body: 'Name it, pick the kind of plan, set the amount and the date.', tint: 'sky' },
  { src: 'invite', title: 'One link brings everyone', body: 'Share on WhatsApp or Messages and watch people join.', tint: 'lilac' },
  { src: 'detail', title: 'Every colour is someone', body: 'The ring is made of everyone’s money. Tap a colour to see who gave it.', tint: 'coral' },
  { src: 'contribute', title: 'Hold to send', body: 'See your share land in your colour, then press and hold to confirm.', tint: 'sun' },
  { src: 'confirmation', title: 'You’re in', body: 'Instant confirmation, and the progress moves for everyone.', tint: 'pink' },
  { src: 'activity', title: 'One feed for the group', body: 'Who joined, who paid, and how close you are.', tint: 'sky' },
  { src: 'completed', title: 'Goal reached', body: 'A full ring of everyone’s colours, and who put in what.', tint: 'lilac' },
];

/**
 * Desktop: the section pins and the phones travel sideways as you scroll.
 * Mobile: a native swipe carousel with snap points and arrow buttons.
 */
export function AppSnapshots() {
  const root = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.desktop, () => {
        const track = root.current!.querySelector<HTMLElement>('.snaps__track')!;
        const distance = () => track.scrollWidth - window.innerWidth + 96;
        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: '.snaps__pin',
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
            onUpdate: (self) => setIndex(Math.round(self.progress * (shots.length - 1))),
          },
        });
        // each phone lifts and settles as it crosses the centre of the screen
        gsap.utils.toArray<HTMLElement>('.snap').forEach((el) => {
          gsap.fromTo(
            el.querySelector('.phone'),
            { y: 60, rotate: 4, scale: 0.9 },
            {
              y: 0,
              rotate: 0,
              scale: 1,
              ease: 'none',
              scrollTrigger: { trigger: el, containerAnimation: tween, start: 'left 100%', end: 'left 45%', scrub: true },
            },
          );
        });
        return () => ScrollTrigger.refresh();
      });
    },
    { scope: root },
  );

  const scrollBy = (dir: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.snap');
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + 16), behavior: 'smooth' });
  };

  return (
    <section id="app" className="snaps" ref={root} aria-labelledby="snaps-title">
      <div className="snaps__pin">
        <div className="container snaps__head">
          <SectionHeading variant="site" id="snaps-title" title="The whole Pact, in your pocket." description="Real screens from the working PACT app. Every one of them is part of the same flow." />
          <div className="snaps__nav">
            <p className="snaps__count num" aria-hidden>
              {String(index + 1).padStart(2, '0')} / {String(shots.length).padStart(2, '0')}
            </p>
            <button type="button" onClick={() => scrollBy(-1)} aria-label="Previous screen">
              <ChevronLeft />
            </button>
            <button type="button" onClick={() => scrollBy(1)} aria-label="Next screen">
              <ChevronRight />
            </button>
          </div>
        </div>
        <div
          className="snaps__rail"
          ref={rail}
          tabIndex={0}
          aria-label="App screens, scroll sideways"
          onScroll={(e) => {
            const el = e.currentTarget;
            const card = el.querySelector<HTMLElement>('.snap');
            if (card) setIndex(Math.round(el.scrollLeft / (card.offsetWidth + 16)));
          }}
        >
          <ol className="snaps__track">
            {shots.map((s, i) => (
              <li key={s.src} className={`snap snap--${s.tint}`}>
                <PhoneFrame src={s.src} alt={`PACT app: ${s.title}`} priority={i < 2} />
                <div className="snap__caption">
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="snaps__progress" aria-hidden>
          <span style={{ transform: `scaleX(${(index + 1) / shots.length})` }} />
        </div>
      </div>
    </section>
  );
}
