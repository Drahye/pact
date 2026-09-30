import type { CSSProperties } from 'react';
import './skeleton.css';

interface BoneProps {
  w?: number | string;
  h?: number | string;
  round?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** One shimmering shape. Decorative: the wrapping Skeleton announces "Loading" once. */
export function Bone({ w, h = 14, round, className = '', style }: BoneProps) {
  return <span aria-hidden className={`bone ${round ? 'bone--round' : ''} ${className}`} style={{ width: w, height: h, ...style }} />;
}

/** Wraps skeleton layouts so screen readers hear a single polite "Loading". */
function Wrap({ label = 'Loading', className = '', children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`sk ${className}`} role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

export function PactCardSkeleton({ tall }: { tall?: boolean }) {
  return (
    <div className={`sk-card ${tall ? 'sk-card--tall' : ''}`}>
      <div className="sk-row">
        <Bone w={40} h={40} round />
        <div className="sk-col" style={{ flex: 1 }}>
          <Bone w="55%" h={16} />
          <Bone w="35%" h={12} />
        </div>
      </div>
      {tall && <Bone w="100%" h={120} style={{ borderRadius: 20 }} />}
      <Bone w="100%" h={10} style={{ borderRadius: 999 }} />
      <div className="sk-row sk-row--between">
        <Bone w={90} h={14} />
        <Bone w={60} h={14} />
      </div>
    </div>
  );
}

export function PactListSkeleton({ count = 3, label }: { count?: number; label?: string }) {
  return (
    <Wrap label={label} className="sk-list">
      {Array.from({ length: count }, (_, i) => (
        <PactCardSkeleton key={i} tall={i === 0 && count > 2} />
      ))}
    </Wrap>
  );
}

/** Rows with an icon or avatar, two lines of text and a trailing value: transactions, notifications, activity. */
export function RowListSkeleton({ count = 6, label, trailing = true }: { count?: number; label?: string; trailing?: boolean }) {
  return (
    <Wrap label={label} className="sk-rows">
      {Array.from({ length: count }, (_, i) => (
        <div className="sk-row sk-rowitem" key={i}>
          <Bone w={40} h={40} round />
          <div className="sk-col" style={{ flex: 1 }}>
            <Bone w={`${52 + ((i * 17) % 30)}%`} h={14} />
            <Bone w={`${28 + ((i * 11) % 20)}%`} h={11} />
          </div>
          {trailing && <Bone w={64} h={14} />}
        </div>
      ))}
    </Wrap>
  );
}

/** A Pact's hero (ring and title), the money strip and a few plan lines. */
export function PactDetailSkeleton({ label = 'Loading Pact' }: { label?: string }) {
  return (
    <Wrap label={label} className="sk-detail">
      <div className="sk-col sk-center">
        <Bone w={200} h={200} round />
        <Bone w="60%" h={22} />
        <Bone w="40%" h={14} />
      </div>
      <div className="sk-row sk-row--between">
        <Bone w="30%" h={40} style={{ borderRadius: 14 }} />
        <Bone w="30%" h={40} style={{ borderRadius: 14 }} />
        <Bone w="30%" h={40} style={{ borderRadius: 14 }} />
      </div>
      <Bone w="35%" h={16} />
      {[0, 1, 2].map((i) => (
        <div className="sk-row sk-rowitem" key={i}>
          <Bone w={36} h={36} style={{ borderRadius: 12 }} />
          <div className="sk-col" style={{ flex: 1 }}>
            <Bone w="60%" h={14} />
            <Bone w="30%" h={11} />
          </div>
          <Bone w={56} h={14} />
        </div>
      ))}
    </Wrap>
  );
}

/** Title, lede and a few labelled fields, for screens that load their form data first. */
export function FormSkeleton({ fields = 3, label }: { fields?: number; label?: string }) {
  return (
    <Wrap label={label} className="sk-form">
      <Bone w="70%" h={30} />
      <Bone w="90%" h={14} />
      {Array.from({ length: fields }, (_, i) => (
        <div className="sk-col" key={i}>
          <Bone w={90} h={12} />
          <Bone w="100%" h={52} style={{ borderRadius: 16 }} />
        </div>
      ))}
    </Wrap>
  );
}

/** Amount entry screens (contribute, top up, withdraw). */
export function AmountSkeleton({ label }: { label?: string }) {
  return (
    <Wrap label={label} className="sk-form">
      <div className="sk-col sk-center">
        <Bone w={72} h={72} round />
        <Bone w="50%" h={18} />
        <Bone w="65%" h={52} style={{ borderRadius: 16 }} />
      </div>
      <div className="sk-row">
        {[0, 1, 2].map((i) => (
          <Bone key={i} w="30%" h={40} style={{ borderRadius: 999 }} />
        ))}
      </div>
    </Wrap>
  );
}
