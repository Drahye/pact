import { Check } from 'lucide-react';
import { useRef } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { friendColor } from '../../../data/landing';
import { getUser } from '../../../data/users';
import { formatNaira, formatNairaCompact } from '../../../lib/format';
import { gsap, MQ, useGSAP } from '../../../lib/gsap';
import { finishedShares, showcase } from './pactFixtures';

const SIZE = 320;
const STROKE = 30;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 6; // px between segments

/** The payoff: the finished ring is made of everyone's money, each in their own colour. */
export function CompletedShowcase() {
  const root = useRef<HTMLElement>(null);
  const total = finishedShares.reduce((s, x) => s + x.amount, 0);
  let offset = 0;
  const segments = finishedShares.map((s) => {
    const len = (s.amount / total) * C;
    const seg = { ...s, start: offset, len: Math.max(0, len - GAP) };
    offset += len;
    return seg;
  });

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: '.done__stage', start: 'top 70%' } });
        tl.from('.done__seg', { attr: { 'stroke-dasharray': `0 ${C}` }, duration: 0.5, stagger: 0.12, ease: 'power2.inOut' })
          .from('.done__check', { scale: 0, rotate: -30, duration: 0.8, ease: 'back.out(2.2)' }, '-=0.1')
          .add(() => {
            const el = root.current!.querySelector<HTMLElement>('.done__amount')!;
            const n = { v: 0 };
            gsap.to(n, { v: showcase.target, duration: 1.2, ease: 'power2.out', onUpdate: () => (el.textContent = formatNaira(Math.round(n.v / 1000) * 1000)) });
          }, '<')
          .from('.done__person', { y: 20, opacity: 0, stagger: 0.06 }, '-=0.8');
      });
    },
    { scope: root },
  );

  return (
    <section className="section done" ref={root} aria-labelledby="done-title">
      <div className="container">
        <h2 id="done-title" className="done__title">
          Your goal is more than a number.
        </h2>
        <div className="done__stage">
          <div className="done__ring">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${showcase.title} fully funded by ${finishedShares.length} people`}>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
              {segments.map((s) => (
                <circle
                  key={s.userId}
                  className="done__seg"
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={friendColor[s.userId]}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${s.len} ${C}`}
                  strokeDashoffset={-s.start}
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                />
              ))}
            </svg>
            <span className="done__check" aria-hidden>
              <Check strokeWidth={3} />
            </span>
          </div>
          <div className="done__copy">
            <Badge tone="accent" dot>
              100% funded
            </Badge>
            <p className="done__amount num">{formatNaira(showcase.target)}</p>
            <p className="done__line">{showcase.title} is fully funded. Every colour is someone who showed up.</p>
          </div>
        </div>
        <ul className="done__people">
          {finishedShares.map((s) => (
            <li key={s.userId} className="done__person" style={{ ['--c' as string]: friendColor[s.userId] }}>
              <Avatar userId={s.userId} size="lg" label={false} />
              <span className="done__name">{getUser(s.userId).name}</span>
              <span className="done__share num">{formatNairaCompact(s.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
