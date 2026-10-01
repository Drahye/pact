import { Check, CircleDot, Copy, Link2, Plus, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { friendColor } from '../../../data/landing';
import { getUser } from '../../../data/users';
import { formatNaira } from '../../../lib/format';
import './mockups.css';

/**
 * Staged product moments for the landing page. They are built from the app's own
 * tokens (rings, avatars, plan rows, status pills) rather than screenshots, so they
 * stay sharp at any size and always match the product. Each one is described once
 * for assistive tech and its pieces are hidden from the reading order.
 */

export type MockPart = 'bring' | 'next' | 'use' | 'context';

function Mock({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`mock ${className}`} role="img" aria-label={label}>
      <div aria-hidden>{children}</div>
    </div>
  );
}

const Pill = ({ tone, children }: { tone: 'mint' | 'sun' | 'sky' | 'quiet'; children: ReactNode }) => <span className={`mpill mpill--${tone}`}>{children}</span>;

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

/* Hero --------------------------------------------------------------------- */

export function NextStepCard() {
  return (
    <Mock label="Next step: pay the venue deposit, ₦120,000 is ready in the Pact." className="mock--float">
      <p className="mock__eyebrow">Next step</p>
      <p className="mock__headline">Pay the venue deposit</p>
      <p className="mock__sub">{formatNaira(120_000)} is ready in the Pact</p>
      <span className="mbtn">Pay now</span>
    </Mock>
  );
}

export function TaskChip() {
  return (
    <Mock label="Tolu is picking up the cake. In progress." className="mock--float mock--chip">
      <span className="mtask__dot">
        <CircleDot />
      </span>
      <span className="mtask__text">
        <strong>Pick up the cake</strong>
        <small>Tolu · In progress</small>
      </span>
      <Face id="tolu" size="xs" />
    </Mock>
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

/* How it works ---------------------------------------------------------------- */

export function StartMock() {
  return (
    <Mock label="Creating a Pact: name Sarah's Birthday, kind of plan gift, goal ₦500,000, date 24 October." className="mock--step">
      <p className="mfield__label">What’s the plan?</p>
      <p className="mfield">Sarah’s Birthday</p>
      <div className="mchips">
        <span className="mchip is-on">Gift</span>
        <span className="mchip">Trip</span>
        <span className="mchip">Event</span>
      </div>
      <div className="mrow2">
        <div>
          <p className="mfield__label">Goal</p>
          <p className="mfield num">{formatNaira(500_000)}</p>
        </div>
        <div>
          <p className="mfield__label">By</p>
          <p className="mfield">24 Oct</p>
        </div>
      </div>
    </Mock>
  );
}

export function InviteMock() {
  return (
    <Mock label="Invite link ready to share. Maya, David and Kemi have joined." className="mock--step">
      <div className="mlink">
        <Link2 />
        <span>pact.app/join/sarahs-bday</span>
        <span className="mlink__copy">
          <Copy /> Copy
        </span>
      </div>
      <ul className="mjoined">
        {['maya', 'david', 'kemi'].map((id) => (
          <li key={id}>
            <Face id={id} size="sm" />
            <span>
              <b>{getUser(id).name}</b> joined
            </span>
          </li>
        ))}
      </ul>
      <p className="mock__sub">
        <Plus /> Everyone brings money, a task, or both.
      </p>
    </Mock>
  );
}

export function MoveMock() {
  return (
    <Mock label="Plan in progress: cake done, venue deposit paid, decor not paid yet." className="mock--step">
      <ul className="mplan">
        <li>
          <span className="mplan__icon mplan__icon--done">
            <Check />
          </span>
          <span className="mplan__name">Cake · Tolu</span>
          <Pill tone="mint">Done</Pill>
        </li>
        <li>
          <span className="mplan__icon mplan__icon--done">
            <Check />
          </span>
          <span className="mplan__name">Venue deposit</span>
          <Pill tone="mint">Paid</Pill>
        </li>
        <li>
          <span className="mplan__icon" />
          <span className="mplan__name">Decor</span>
          <Pill tone="sun">Not paid</Pill>
        </li>
      </ul>
      <div className="mbar">
        <span style={{ width: '64%' }} />
      </div>
      <p className="mock__sub num">{formatNaira(180_000)} left to fund</p>
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

export function CompleteMock() {
  return (
    <Mock label="Completed: Sarah's Birthday happened with 8 people." className="mock--step mock--center">
      <MiniRing shares={finished} size={104} stroke={12}>
        <span className="mring__check">
          <Check strokeWidth={3} />
        </span>
      </MiniRing>
      <p className="mock__headline">It happened</p>
      <p className="mock__sub">8 people · memory added</p>
    </Mock>
  );
}

/* Execution ---------------------------------------------------------------------- */

/**
 * The centrepiece: a funded Pact being carried out. `lit` dims everything but one idea
 * so the points beside it can point at the right part of the screen.
 */
export function ExecutionMock({ lit }: { lit: MockPart | null }) {
  const cls = (p: MockPart) => (lit ? (lit === p ? 'is-lit' : 'is-dim') : '');
  return (
    <Mock
      label="A funded Pact being carried out: ₦500,000 raised, next step is paying the venue deposit, the plan shows which lines are paid, tasks have owners, and the activity feed shows each payment."
      className="mock--exec"
    >
      <div className="mexec__head">
        <MiniRing shares={finished} size={64} stroke={8}>
          <b className="num">100%</b>
        </MiniRing>
        <div>
          <p className="mock__headline">Sarah’s Birthday</p>
          <p className="mock__sub">
            <Pill tone="mint">Funded</Pill> <span>Making it happen</span>
          </p>
        </div>
      </div>

      <section className={`mexec__block mexec__next ${cls('next')}`}>
        <p className="mock__eyebrow">Next step</p>
        <p className="mock__headline">Pay the venue deposit</p>
        <span className="mbtn mbtn--block">Pay {formatNaira(120_000)}</span>
      </section>

      <section className={`mexec__block ${cls('use')}`}>
        <p className="mock__eyebrow">The plan</p>
        <ul className="mplan">
          <li>
            <span className="mplan__icon mplan__icon--done">
              <Check />
            </span>
            <span className="mplan__name">Venue deposit</span>
            <span className="mplan__amt num">{formatNaira(120_000)}</span>
            <Pill tone="mint">Paid</Pill>
          </li>
          <li>
            <span className="mplan__icon mplan__icon--part" />
            <span className="mplan__name">Catering</span>
            <span className="mplan__amt num">{formatNaira(180_000)}</span>
            <Pill tone="sky">Partly paid</Pill>
          </li>
          <li>
            <span className="mplan__icon" />
            <span className="mplan__name">Decor</span>
            <span className="mplan__amt num">{formatNaira(60_000)}</span>
            <Pill tone="sun">Not paid</Pill>
          </li>
        </ul>
      </section>

      <section className={`mexec__block ${cls('bring')}`}>
        <p className="mock__eyebrow">Tasks</p>
        <ul className="mtasks">
          <li>
            <Face id="tolu" size="xs" />
            <span>Pick up the cake</span>
            <Pill tone="sky">In progress</Pill>
          </li>
          <li>
            <Face id="femi" size="xs" />
            <span>Book the DJ</span>
            <Pill tone="mint">Done</Pill>
          </li>
        </ul>
      </section>

      <section className={`mexec__block mexec__activity ${cls('context')}`}>
        <p className="mock__eyebrow">Activity</p>
        <p className="mexec__line">
          <Face id="abraham" size="xs" />
          <span>
            <b>Abraham</b> paid the venue {formatNaira(120_000)} from the Pact
          </span>
        </p>
      </section>
    </Mock>
  );
}

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
