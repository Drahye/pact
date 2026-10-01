import { Check, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { friendColor } from '../../../data/landing';
import { formatNaira } from '../../../lib/format';
import './mockups.css';

/**
 * Staged product moments for the landing page. They are built from the app's own
 * tokens (rings, avatars, plan rows, status pills) rather than screenshots, so they
 * stay sharp at any size and always match the product. Each one is described once
 * for assistive tech and its pieces are hidden from the reading order.
 */

function Mock({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`mock ${className}`} role="img" aria-label={label}>
      <div aria-hidden>{children}</div>
    </div>
  );
}

const Face = ({ id, size = 'sm' }: { id: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) => (
  <span className="mface" style={{ ['--c' as string]: friendColor[id] }}>
    <Avatar userId={id} size={size} label={false} />
  </span>
);

/** A ring cut into one coloured segment per person, like the app's Pact ring. */
export function MiniRing({ shares, size = 120, stroke = 12, children }: { shares: { id: string; v: number }[]; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = shares.reduce((s, x) => s + x.v, 0);
  let off = 0;
  return (
    <span className="mring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-track)" strokeWidth={stroke} />
        {shares.map((s) => {
          const len = (s.v / total) * c;
          const seg = (
            <circle
              key={s.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={friendColor[s.id]}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(1, len - stroke * 0.55)} ${c}`}
              strokeDashoffset={-off}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          off += len;
          return seg;
        })}
      </svg>
      <span className="mring__center">{children}</span>
    </span>
  );
}

/* Why PACT ------------------------------------------------------------------ */

const chat = [
  { who: 'ada', text: 'Who has sent theirs?', side: 'in' },
  { who: 'femi', text: 'sent! see screenshot', side: 'in', shot: true },
  { who: 'kemi', text: 'Who is getting the cake??', side: 'in' },
  { who: 'ada', text: 'Which account again?', side: 'out' },
  { who: 'femi', text: 'so how much is left', side: 'in' },
] as const;

export function GroupChatMock() {
  return (
    <Mock label="A group chat full of unanswered questions: who has paid, who is getting the cake, which account to use." className="mock--chat">
      <p className="mock__eyebrow">Group chat · 23 unread</p>
      <ul className="mchat">
        {chat.map((m, i) => (
          <li key={i} className={`mchat__msg mchat__msg--${m.side}`}>
            {m.side === 'in' && <Face id={m.who} size="xs" />}
            <span className="mchat__bubble">
              {'shot' in m && (
                <span className="mchat__shot">
                  <Receipt />
                  <span>
                    <b>Transfer</b>
                    <i>₦20,000</i>
                  </span>
                </span>
              )}
              {m.text}
            </span>
          </li>
        ))}
      </ul>
    </Mock>
  );
}

const sharesNow = [
  { id: 'abraham', v: 90 },
  { id: 'sarah', v: 40 },
  { id: 'david', v: 60 },
  { id: 'maya', v: 70 },
  { id: 'kemi', v: 30 },
  { id: 'femi', v: 30 },
];

export function PactSnapshotMock() {
  return (
    <Mock label="Sarah's Birthday in PACT: ₦320,000 of ₦500,000, 6 of 8 paid, 2 of 3 tasks done, 16 days left." className="mock--snapshot">
      <div className="msnap__top">
        <MiniRing shares={sharesNow} size={116} stroke={13}>
          <b className="num">64%</b>
          <small>funded</small>
        </MiniRing>
        <div className="msnap__meta">
          <p className="mock__eyebrow">Birthday gift</p>
          <p className="mock__headline">Sarah’s Birthday</p>
          <p className="mock__sub num">{formatNaira(320_000)} of {formatNaira(500_000)}</p>
        </div>
      </div>
      <ul className="msnap__stats">
        <li>
          <b>6 of 8</b>
          <span>have paid</span>
        </li>
        <li>
          <b>2 of 3</b>
          <span>tasks done</span>
        </li>
        <li>
          <b>16</b>
          <span>days left</span>
        </li>
      </ul>
      <div className="msnap__next">
        <span className="msnap__next-dot" />
        <span>
          <b>Next: book the DJ</b>
          <small>Femi · due Friday</small>
        </span>
      </div>
    </Mock>
  );
}

const finished = [
  { id: 'abraham', v: 110 },
  { id: 'sarah', v: 60 },
  { id: 'david', v: 85 },
  { id: 'maya', v: 85 },
  { id: 'kemi', v: 50 },
  { id: 'femi', v: 50 },
  { id: 'tolu', v: 30 },
  { id: 'zara', v: 30 },
];

/* Finish ------------------------------------------------------------------------------ */

export function CompletedCard() {
  return (
    <Mock label="Sarah's Birthday happened. ₦500,000 from 8 people, every one of them in the ring." className="mock--done">
      <MiniRing shares={finished} size={168} stroke={18}>
        <span className="mring__check mring__check--lg">
          <Check strokeWidth={3} />
        </span>
      </MiniRing>
      <p className="mock__eyebrow">Completed</p>
      <p className="mock__headline mock__headline--lg">Sarah’s Birthday happened</p>
      <p className="mock__sub num">{formatNaira(500_000)} · 8 people showed up</p>
      <ul className="mdone__faces">
        {finished.slice(0, 6).map((f) => (
          <li key={f.id}>
            <Face id={f.id} size="sm" />
          </li>
        ))}
        <li className="mdone__more">+2</li>
      </ul>
    </Mock>
  );
}
