import { Check, ChevronLeft, Share2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import '../../../components/pact/segmented-ring.css';
import { friendColor } from '../../../data/landing';
import { getUser } from '../../../data/users';
import { formatNaira } from '../../../lib/format';
import './demo.css';

/* Scroll maths -------------------------------------------------------------------- */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before `a`, 1 after `b`, eased in between. */
export const seg = (t: number, a: number, b: number) => {
  const x = clamp((t - a) / (b - a));
  return 1 - Math.pow(1 - x, 3);
};
/** The same without easing, for numbers that should move at the pace of the scroll. */
export const lin = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const kobo = (k: number) => formatNaira(Math.round(k) * 1000);

/* The Pact in every demo: Sarah's Birthday, ₦500,000, eight people. ------------------ */

export const TARGET_K = 500;
export const cast = ['sarah', 'abraham', 'tolu', 'david', 'maya', 'daniel', 'kemi', 'femi'] as const;

/** Who put in what, in the order it lands (thousands of naira). The first three are already in. */
export const contributions: { id: string; k: number }[] = [
  { id: 'sarah', k: 50 },
  { id: 'abraham', k: 40 },
  { id: 'tolu', k: 30 },
  { id: 'david', k: 80 },
  { id: 'maya', k: 120 },
  { id: 'daniel', k: 90 },
  { id: 'kemi', k: 50 },
  { id: 'femi', k: 40 },
];

/** Ring segments for a given total: contributions fill in the order they arrived. */
export function sharesAt(raisedK: number) {
  let left = raisedK;
  return contributions.map((c) => {
    const v = clamp(left, 0, c.k);
    left -= v;
    return { id: c.id, v };
  });
}

/** Who has contributed anything yet, most recent last. */
export const contributorsAt = (raisedK: number) => sharesAt(raisedK).filter((s) => s.v > 0);

/* Pieces ---------------------------------------------------------------------------- */

export const Face = ({ id, size = 'sm', ring = true }: { id: string; size?: 'xs' | 'sm' | 'md' | 'lg'; ring?: boolean }) => (
  <span className="d-face" style={ring ? { boxShadow: `0 0 0 2px ${friendColor[id]}` } : undefined}>
    <Avatar userId={id} size={size} label={false} />
  </span>
);

export function StatusBar() {
  return (
    <div className="d-status">
      <span>9:41</span>
      <span className="d-status__icons">
        <i /> <i /> <i className="d-status__bat" />
      </span>
    </div>
  );
}

export function AppBar({ title, left = 'back', right }: { title: string; left?: 'back' | 'close'; right?: boolean }) {
  return (
    <div className="d-bar">
      <span className="d-bar__btn">{left === 'close' ? <X /> : <ChevronLeft />}</span>
      <span className="d-bar__title">{title}</span>
      {right ? (
        <span className="d-bar__btn">
          <Share2 />
        </span>
      ) : (
        <span className="d-bar__btn d-bar__btn--ghost" />
      )}
    </div>
  );
}

/** The app's segmented ring, drawn from the same classes, but as a pure function of its input so it can be scrubbed. */
export function DemoRing({ shares, size = 190, stroke = 18, children }: { shares: { id: string; v: number }[]; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  const gap = stroke * 0.3;
  const segs = shares
    .filter((s) => s.v > 0.2)
    .map((s) => {
      const full = (s.v / TARGET_K) * c;
      const seg = { id: s.id, start: off, len: Math.max(0.5, full - gap) };
      off += full;
      return seg;
    });
  return (
    <span className="sring d-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="sring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        {segs.map((s) => (
          <circle
            key={s.id}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={friendColor[s.id]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${s.len} ${c}`}
            strokeDashoffset={-s.start}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <span className="sring__center">{children}</span>
    </span>
  );
}

export type Tone = 'mint' | 'sun' | 'sky' | 'quiet' | 'coral';
export const Chip = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`d-chip d-chip--${tone}`}>{children}</span>;

/** Text that fades and rises in whenever `k` changes: Next step, statuses, labels. */
export const Swap = ({ k, children, className = '' }: { k: string | number; children: ReactNode; className?: string }) => (
  <span key={k} className={`d-swap ${className}`}>
    {children}
  </span>
);

export function NextStepCard({ title, body, action, pressed, tone = 'mint' }: { title: string; body: string; action: string; pressed?: boolean; tone?: 'mint' | 'ink' }) {
  return (
    <div className={`d-next d-next--${tone}`}>
      <p className="d-eyebrow">Next step</p>
      <Swap k={title} className="d-next__text">
        <b>{title}</b>
        <span>{body}</span>
      </Swap>
      <span className={`d-btn ${pressed ? 'is-pressed' : ''}`}>{action}</span>
    </div>
  );
}

export function TaskRow({ name, who, status }: { name: string; who?: string; status: 'open' | 'doing' | 'done' }) {
  const label = { open: 'Unclaimed', doing: 'In progress', done: 'Done' }[status];
  return (
    <li className={`d-task d-task--${status}`}>
      <span className="d-task__mark">{status === 'done' && <Check strokeWidth={3} />}</span>
      <span className="d-task__name">
        <b>{name}</b>
        <small>{who ? getUser(who).name : 'Nobody yet'}</small>
      </span>
      {who ? <Face id={who} size="xs" /> : <span className="d-task__empty" />}
      <Swap k={label}>
        <Chip tone={status === 'done' ? 'mint' : status === 'doing' ? 'sky' : 'quiet'}>{label}</Chip>
      </Swap>
    </li>
  );
}

export function ActivityRow({ id, text, amount, fresh }: { id: string; text: string; amount?: number; fresh?: boolean }) {
  return (
    <li className={`d-act ${fresh ? 'is-fresh' : ''}`}>
      <Face id={id} size="sm" />
      <span className="d-act__text">
        <b>{getUser(id).name}</b> {text}
      </span>
      {amount !== undefined && <b className="d-act__amt">{kobo(amount)}</b>}
    </li>
  );
}
