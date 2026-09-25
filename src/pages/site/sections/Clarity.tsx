import { Eye, History, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useRef } from 'react';
import { AvatarGroup } from '../../../components/ui/AvatarGroup';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { clarityPoints } from '../../../data/landing';
import { gsap, MQ, useGSAP } from '../../../lib/gsap';
import { showcaseFeed, showcaseMembers, showcaseSummary } from './pactFixtures';
import { ActivityItem } from '../../../components/ui/ActivityItem';

const icon = { payments: <ShieldCheck />, history: <History />, private: <LockKeyhole />, progress: <Eye /> };
const point = (id: (typeof clarityPoints)[number]['id']) => clarityPoints.find((p) => p.id === id)!;

/**
 * Gapless 4×2 bento (desktop):
 *  [ payments 2×2 ][ history 2×1 ]
 *  [              ][ private ][ progress ]
 */
export function Clarity() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(MQ.motion, () => {
        gsap.from('.bento__card', { y: 50, opacity: 0, stagger: 0.1, duration: 1, scrollTrigger: { trigger: '.bento', start: 'top 75%' } });
      });
    },
    { scope: root },
  );
  const Head = ({ id }: { id: (typeof clarityPoints)[number]['id'] }) => (
    <>
      <span className="bento__icon" aria-hidden>
        {icon[id]}
      </span>
      <h3>{point(id).title}</h3>
      <p>{point(id).body}</p>
    </>
  );
  return (
    <section id="clarity" className="section clarity" ref={root} aria-labelledby="clarity-title">
      <div className="container">
        <SectionHeading variant="site" id="clarity-title" title="Built around clarity." description="No surprises about where the money is, who can see it, or how close you are." />
        <div className="bento">
          <article className="bento__card bento__card--payments">
            <Head id="payments" />
            <div className="bento__visual bento__confirm" aria-hidden>
              <span className="bento__confirm-check">✓</span>
              <span>
                <strong className="num">₦25,000</strong> confirmed
              </span>
              <span className="bento__confirm-to">Sarah’s Birthday</span>
            </div>
          </article>
          <article className="bento__card bento__card--history">
            <Head id="history" />
            <div className="bento__visual bento__history" aria-hidden>
              {showcaseFeed.slice(0, 2).map((a) => (
                <ActivityItem key={a.id} activity={a} viewerId={null} size="sm" />
              ))}
            </div>
          </article>
          <article className="bento__card bento__card--private">
            <Head id="private" />
            <div className="bento__visual" aria-hidden>
              <AvatarGroup userIds={showcaseMembers} max={4} size="sm" />
            </div>
          </article>
          <article className="bento__card bento__card--progress">
            <Head id="progress" />
            <div className="bento__visual" aria-hidden>
              <ProgressBar value={showcaseSummary.percent} size="lg" label="Progress" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
