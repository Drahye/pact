import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatedNumber } from '../../../components/pact/AnimatedNumber';
import { SegmentedRing } from '../../../components/pact/SegmentedRing';
import { Reveal } from '../../../components/site/Reveal';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { HoldButton } from '../../../components/ui/HoldButton';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { Segmented } from '../../../components/ui/Segmented';
import type { UserId } from '../../../data/types';
import { getUser } from '../../../data/users';
import { formatNaira, formatNairaCompact } from '../../../lib/format';
import { gsap } from '../../../lib/gsap';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { spring } from '../../../tokens/tokens';
import { showcase, showcaseMembers } from './pactFixtures';

const AMOUNTS = ['10000', '25000', '50000'] as const;
type Amount = (typeof AMOUNTS)[number];

const startShares = () => Object.fromEntries(showcase.members.map((m) => [m.userId, m.contributed])) as Record<UserId, number>;

interface Landed {
  id: number;
  userId: UserId;
  amount: number;
}

/**
 * Everyone contributes, everyone sees it: choose who's paying and how much,
 * press and hold, and their coin flies into the ring and grows their colour.
 */
export function ContributeDemo() {
  const reduce = useReducedMotion();
  const wide = useMediaQuery('(min-width: 1024px)');
  const stage = useRef<HTMLDivElement>(null);
  const ringEl = useRef<HTMLDivElement>(null);
  const token = useRef<HTMLSpanElement>(null);
  const people = useRef<Record<string, HTMLButtonElement | null>>({});
  const inView = useInView(stage, { once: true, margin: '-30% 0px' });

  const [payer, setPayer] = useState<UserId>('david');
  const [choice, setChoice] = useState<Amount>('25000');
  const [shares, setShares] = useState(startShares);
  const [landed, setLanded] = useState<Landed[]>([]);
  const [flying, setFlying] = useState(false);
  const [demo, setDemo] = useState(false);
  const nextId = useRef(1);

  const raised = Object.values(shares).reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, showcase.target - raised);
  const amount = Math.min(Number(choice), remaining);
  const complete = remaining === 0;
  const pct = Math.min(100, (raised / showcase.target) * 100);
  const payerUser = getUser(payer);

  // Show the gesture once, by itself, when the section arrives.
  useEffect(() => {
    if (!inView) return;
    const t = window.setTimeout(() => setDemo(true), 700);
    return () => window.clearTimeout(t);
  }, [inView]);

  const land = (userId: UserId, value: number) => {
    setShares((sh) => ({ ...sh, [userId]: (sh[userId] ?? 0) + value }));
    setLanded((l) => [{ id: nextId.current++, userId, amount: value }, ...l].slice(0, 3));
    setFlying(false);
  };

  const send = () => {
    setDemo(false);
    if (!amount || flying) return;
    const userId = payer;
    const value = amount;
    const from = people.current[userId];
    if (reduce || !from || !ringEl.current || !stage.current || !token.current) return land(userId, value);

    // Fly a coin from the payer's avatar into the centre of the ring.
    const s = stage.current.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const r = ringEl.current.getBoundingClientRect();
    const fx = a.left + a.width / 2 - s.left;
    const fy = a.top + a.height / 2 - s.top;
    const tx = r.left + r.width / 2 - s.left;
    const ty = r.top + r.height / 2 - s.top;
    setFlying(true);
    const el = token.current;
    gsap.killTweensOf(el);
    gsap.set(el, { x: fx, y: fy, xPercent: -50, yPercent: -50, scale: 0.4, opacity: 0 });
    gsap
      .timeline({ onComplete: () => land(userId, value) })
      .to(el, { opacity: 1, scale: 1, duration: 0.18 })
      .to(el, { x: tx, duration: 0.85, ease: 'power2.inOut' }, 0.1)
      .to(el, { y: ty, duration: 0.85, ease: wide ? 'back.in(1.6)' : 'power2.in' }, 0.1)
      .to(el, { scale: 0.3, opacity: 0, duration: 0.2 }, 0.85);
  };

  const reset = () => {
    setShares(startShares());
    setLanded([]);
  };

  return (
    <section className="section give" aria-labelledby="give-title">
      <div className="container">
        <Reveal>
          <SectionHeading
            variant="site"
            align="center"
            id="give-title"
            eyebrow="Contributing"
            title="Watch the plan move."
            description="Choose who’s paying, press and hold, and watch their colour grow in the ring. Every member sees the same thing, instantly."
          />
        </Reveal>

        <Reveal delay={0.1} y={32}>
          <div className="give__stage" ref={stage}>
            <div className="give__controls">
              <div className="give__step">
                <p className="give__step-label">
                  <span className="num">1</span> Who’s paying?
                </p>
                <div className="give__people" role="radiogroup" aria-label="Who’s paying">
                  {showcaseMembers.map((id) => {
                    const u = getUser(id);
                    const on = payer === id;
                    return (
                      <button
                        key={id}
                        ref={(el) => (people.current[id] = el)}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`give__person ${on ? 'is-on' : ''}`}
                        style={{ ['--c' as string]: u.color }}
                        onClick={() => setPayer(id)}
                      >
                        <Avatar userId={id} size="md" label={false} />
                        <span>{u.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="give__step">
                <p className="give__step-label">
                  <span className="num">2</span> How much?
                </p>
                <Segmented<Amount>
                  label="Amount"
                  variant="chips"
                  value={choice}
                  onChange={setChoice}
                  options={AMOUNTS.map((a) => ({ value: a, label: formatNairaCompact(Number(a)) }))}
                />
              </div>

              <div className="give__step">
                <p className="give__step-label">
                  <span className="num">3</span> Press and hold to send
                </p>
                {complete ? (
                  <Button variant="secondary" fullWidth iconLeft={<RotateCcw />} onClick={reset}>
                    Start the Pact again
                  </Button>
                ) : (
                  <HoldButton
                    label={`Hold to send ${formatNaira(amount)} as ${payerUser.name}`}
                    holdingLabel={`Sending as ${payerUser.name}…`}
                    onComplete={send}
                    disabled={flying}
                    autoHold={demo}
                    duration={demo ? 1.2 : 0.9}
                  />
                )}
              </div>
            </div>

            <div className="give__result">
              <div ref={ringEl} className="give__ring">
                <SegmentedRing
                  shares={showcase.members.map((m) => ({ id: m.userId, color: getUser(m.userId).color, value: shares[m.userId] ?? 0 }))}
                  target={showcase.target}
                  size={wide ? 380 : 280}
                  stroke={wide ? 30 : 24}
                  label={`${showcase.title}: ${Math.round(pct)}% funded`}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {complete ? (
                      <motion.div key="done" className="give__center" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}>
                        <span className="give__check">
                          <Check strokeWidth={3} />
                        </span>
                        <p className="give__center-title">Goal reached</p>
                      </motion.div>
                    ) : (
                      <motion.div key="live" className="give__center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <p className="give__center-title">{showcase.title}</p>
                        <p className="give__total">
                          <AnimatedNumber value={raised} />
                        </p>
                        <p className="give__meta">
                          of <span className="num">{formatNaira(showcase.target)}</span> · <AnimatedNumber value={pct} format="percent" />
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </SegmentedRing>
              </div>

              <ul className="give__landed" aria-live="polite">
                <AnimatePresence initial={false}>
                  {landed.map((l) => (
                    <motion.li
                      key={l.id}
                      layout
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0 } }}
                      transition={spring.snappy}
                      style={{ ['--c' as string]: getUser(l.userId).color }}
                    >
                      <Avatar userId={l.userId} size="sm" label={false} />
                      <span>
                        <strong>{getUser(l.userId).name}</strong> added <strong className="num">{formatNaira(l.amount)}</strong>
                      </span>
                      <span className="give__everyone">Everyone sees this</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {!landed.length && <li className="give__empty">Contributions land here, for the whole group.</li>}
              </ul>
            </div>

            <span ref={token} className="give__token num" style={{ ['--c' as string]: payerUser.color }} aria-hidden>
              +{formatNaira(amount)}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
