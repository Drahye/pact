import { Bone } from './Skeleton';
import './detail-skeletons.css';

/**
 * What each detail screen looks like before it has loaded, in the shapes it will have, so nothing jumps when the real thing arrives.
 * One per kind of thing: they are as different from each other as the screens are. Announced once, politely.
 */
const Wrap = ({ label, className, children }: { label: string; className: string; children: React.ReactNode }) => (
  <div className={`dsk ${className}`} role="status" aria-busy="true" aria-label={label}>
    {children}
  </div>
);

/** Circle: an identity block with a stack of faces, then two objects and a few agenda lines. */
export function CircleSkeleton() {
  return (
    <Wrap label="Loading Circle" className="dsk--circle">
      <div className="dsk__id">
        <Bone w={64} h={64} round />
        <div className="dsk__lines">
          <Bone w="58%" h={26} />
          <Bone w="30%" h={14} />
        </div>
      </div>
      <div className="dsk__faces">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} w={44} h={44} round className="dsk__face" />
        ))}
      </div>
      <Bone w={96} h={18} />
      <Bone w="100%" h={104} style={{ borderRadius: '20px 20px 20px 8px' }} />
      <Bone w="100%" h={132} style={{ borderRadius: '24px 24px 24px 8px' }} />
      <Bone w={84} h={18} />
      {[0, 1].map((i) => (
        <div key={i} className="dsk__agenda">
          <Bone w={56} h={14} />
          <div className="dsk__lines">
            <Bone w="62%" h={16} />
            <Bone w="38%" h={12} />
          </div>
        </div>
      ))}
    </Wrap>
  );
}

/** Ask: the question, three answers. Nothing else. */
export function AskSkeleton() {
  return (
    <Wrap label="Loading question" className="dsk--ask">
      <Bone w={72} h={12} />
      <Bone w="86%" h={34} />
      <Bone w="52%" h={34} />
      {[0, 1, 2].map((i) => (
        <Bone key={i} w="100%" h={60} style={{ borderRadius: 18 }} />
      ))}
      <Bone w="44%" h={14} />
    </Wrap>
  );
}

/** Plan: the date block beside the title, the going line, the answer track. */
export function PlanSkeleton() {
  return (
    <Wrap label="Loading plan" className="dsk--plan">
      <div className="dsk__plan-top">
        <Bone w={88} h={104} style={{ borderRadius: 22 }} />
        <div className="dsk__lines">
          <Bone w={64} h={12} />
          <Bone w="80%" h={28} />
          <Bone w="62%" h={14} />
          <Bone w="48%" h={14} />
        </div>
      </div>
      <div className="dsk__faces">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} w={36} h={36} round className="dsk__face" />
        ))}
      </div>
      <Bone w="100%" h={52} style={{ borderRadius: '16px 16px 16px 6px' }} />
      <Bone w="100%" h={88} style={{ borderRadius: 16 }} />
      <Bone w="100%" h={56} style={{ borderRadius: 14 }} />
    </Wrap>
  );
}

/** Split: the amount, the bar of settled people, a row for each person. */
export function SplitSkeleton() {
  return (
    <Wrap label="Loading split" className="dsk--split">
      <Bone w="52%" h={26} />
      <Bone w="64%" h={56} />
      <Bone w="40%" h={14} />
      <div className="dsk__bar">
        {[0, 1, 2].map((i) => (
          <Bone key={i} w="100%" h={10} style={{ borderRadius: 5 }} />
        ))}
      </div>
      <div className="dsk__rows">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dsk__share">
            <Bone w={40} h={40} round />
            <div className="dsk__lines">
              <Bone w="40%" h={15} />
              <Bone w="26%" h={13} />
            </div>
            <Bone w={96} h={36} style={{ borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </Wrap>
  );
}

/** Pact: the title and the progress first, then what you are handling, then the people. */
export function PactSkeleton() {
  return (
    <Wrap label="Loading Pact" className="dsk--pact">
      <div className="dsk__hero">
        <Bone w={92} h={22} style={{ borderRadius: 999 }} />
        <Bone w="76%" h={32} />
        <div className="dsk__hero-body">
          <Bone w={132} h={132} round />
          <div className="dsk__lines">
            <Bone w="80%" h={30} />
            <Bone w="56%" h={14} />
            <Bone w="64%" h={14} />
          </div>
        </div>
      </div>
      <Bone w="100%" h={72} style={{ borderRadius: 18 }} />
      <Bone w={110} h={18} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="dsk__share">
          <Bone w={40} h={40} round />
          <div className="dsk__lines">
            <Bone w="58%" h={15} />
            <Bone w="34%" h={12} />
          </div>
          <Bone w={44} h={24} style={{ borderRadius: 999 }} />
        </div>
      ))}
    </Wrap>
  );
}
