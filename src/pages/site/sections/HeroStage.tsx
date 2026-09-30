import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { Hand, Pause, Play } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatedNumber } from '../../../components/pact/AnimatedNumber';
import type { Friend, Payment } from '../../../components/three/PaymentScene';
import { Avatar } from '../../../components/ui/Avatar';
import { friendColor, liveAmounts } from '../../../data/landing';
import { getUser } from '../../../data/users';
import { formatNaira } from '../../../lib/format';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { spring } from '../../../tokens/tokens';
import { showcase, showcaseMembers, showcaseSummary } from './pactFixtures';
import './stage.css';

const PaymentScene = lazy(() => import('../../../components/three/PaymentScene'));

const friends: Friend[] = showcaseMembers.map((userId) => ({ userId, color: friendColor[userId] }));
const START = showcaseSummary.raised;
const TARGET = showcase.target;

interface FeedEntry {
  id: number;
  userId: string;
  amount: number;
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The hero's live Pact: friends orbit the goal, their payments fly in as coins,
 * the ring fills. Drag to spin, tap a friend to send, and it plays itself when idle.
 */
export function HeroStage() {
  const reduce = !!useReducedMotion();
  const compact = useMediaQuery('(max-width: 767px)');
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { margin: '-15% 0px' });
  const [raised, setRaised] = useState(START);
  const [inflight, setInflight] = useState<Payment[]>([]);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [webgl] = useState(hasWebGL);
  const nextId = useRef(1);
  const spin = useRef(0);
  const lastTouch = useRef(0);
  const drag = useRef<{ x: number; t: number } | null>(null);
  const pending = inflight.reduce((s, p) => s + p.amount, 0);
  const complete = raised >= TARGET;
  const running = inView && !paused && !reduce;

  // A ref mirrors in-flight payments so arrival can read them without nesting state updates.
  const flight = useRef<Payment[]>([]);
  const setFlight = (list: Payment[]) => {
    flight.current = list;
    setInflight(list);
  };
  const raisedRef = useRef(raised);
  raisedRef.current = raised;

  const send = useCallback((from: number, amount = liveAmounts[Math.floor(Math.random() * liveAmounts.length)]) => {
    const room = TARGET - raisedRef.current - flight.current.reduce((s, p) => s + p.amount, 0);
    if (room <= 0) return;
    setFlight([...flight.current, { id: nextId.current++, from, amount: Math.min(amount, room) }]);
  }, []);

  const arrive = useCallback((id: number) => {
    const p = flight.current.find((x) => x.id === id);
    if (!p) return;
    setFlight(flight.current.filter((x) => x.id !== id));
    setRaised((r) => Math.min(TARGET, r + p.amount));
    setFeed((f) => [{ id: p.id, userId: friends[p.from].userId, amount: p.amount }, ...f].slice(0, 3));
  }, []);

  // Auto-play: a friend pays every couple of seconds unless someone is interacting.
  useEffect(() => {
    if (!running || complete) return;
    const t = window.setInterval(() => {
      if (Date.now() - lastTouch.current < 4000) return;
      send(Math.floor(Math.random() * friends.length));
    }, 2300);
    return () => window.clearInterval(t);
  }, [running, complete, send]);

  // Celebrate at 100%, then start the story again.
  useEffect(() => {
    if (!complete) return;
    const t = window.setTimeout(() => {
      setRaised(START);
      setFeed([]);
    }, reduce ? 6000 : 4200);
    return () => window.clearTimeout(t);
  }, [complete, reduce]);

  const percent = Math.min(100, (raised / TARGET) * 100);

  const center = (
    <div className={`stage-center ${complete ? 'is-complete' : ''}`} aria-hidden>
      <p className="stage-center__title">{showcase.title}</p>
      <p className="stage-center__amount">
        <AnimatedNumber value={raised} />
      </p>
      <p className="stage-center__meta">
        {complete ? (
          'Goal reached'
        ) : (
          <>
            of <span className="num">{formatNaira(TARGET)}</span> · <AnimatedNumber value={percent} format="percent" />
          </>
        )}
      </p>
    </div>
  );

  return (
    <div
      ref={wrap}
      className="stage"
      onPointerDown={(e) => {
        lastTouch.current = Date.now();
        drag.current = { x: e.clientX, t: performance.now() };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const now = performance.now();
        const dx = e.clientX - drag.current.x;
        spin.current = Math.max(-6, Math.min(6, (dx / Math.max(1, now - drag.current.t)) * 2.2));
        drag.current = { x: e.clientX, t: now };
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <div className="stage__blobs" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      {webgl ? (
        <Suspense fallback={<div className="stage__loading">{center}</div>}>
          <PaymentScene
            friends={friends}
            percent={percent}
            payments={inflight}
            onArrive={arrive}
            onTapFriend={(i) => {
              lastTouch.current = Date.now();
              send(i, 25_000);
            }}
            center={center}
            running={running}
            reduced={reduce}
            compact={compact}
            spin={spin}
          />
        </Suspense>
      ) : (
        <div className="stage__loading">{center}</div>
      )}

      <div className="stage__feed" aria-live="polite">
        <p className="stage__feed-title">
          <span className={`live-dot ${running ? '' : 'is-paused'}`} aria-hidden /> {showcaseMembers.length} friends · {showcase.title}
        </p>
        <ul>
          <AnimatePresence initial={false}>
            {(feed.length ? feed : [{ id: 0, userId: 'david', amount: 40_000 }]).map((f) => (
              <motion.li key={f.id} layout initial={{ opacity: 0, y: -10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0 } }} transition={spring.snappy}>
                <span className="stage__feed-avatar" style={{ ['--c' as string]: friendColor[f.userId] }}>
                  <Avatar userId={f.userId} size="sm" label={false} />
                </span>
                <span>
                  <strong>{getUser(f.userId).name}</strong> sent <strong className="num">{formatNaira(f.amount)}</strong>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <div className="stage__controls">
        <span className="stage__hint">
          <Hand aria-hidden /> Drag to spin · tap a friend to send ₦25,000
        </span>
        {!reduce && (
          <button type="button" className="stage__pause" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            <span className="visually-hidden">{paused ? 'Play' : 'Pause'} live demo</span>
          </button>
        )}
      </div>
      <p className="visually-hidden">
        Live demo: {showcaseMembers.length} friends paying into {showcase.title}. {formatNaira(raised)} of {formatNaira(TARGET)} raised
        {pending ? `, ${formatNaira(pending)} on the way` : ''}.
      </p>
    </div>
  );
}
