import { CalendarClock, MessagesSquare, Receipt } from 'lucide-react';

const people = [
  { i: 'A', c: 'var(--coral-400)' },
  { i: 'T', c: 'var(--sky-400)' },
  { i: 'M', c: 'var(--lilac-400)' },
];

/**
 * Three of PACT's own objects, overlapping: a plan, a question, a split. They are drawn here rather than shown as a screenshot so they
 * can drift a little, and they stay still for anyone who asks for less motion.
 */
export function IntroVisual() {
  return (
    <div className="intro-visual" aria-hidden>
      <span className="intro-visual__glow" />
      <div className="intro-obj intro-obj--plan tint--sun">
        <span className="intro-obj__kicker">
          <CalendarClock /> Plan
        </span>
        <strong>Ghana in December ✨</strong>
        <span className="intro-obj__meta">Oct 3 to Dec 20 · 4 in</span>
        <span className="intro-obj__people">
          {people.map((p) => (
            <span key={p.i} style={{ background: p.c }}>
              {p.i}
            </span>
          ))}
          <span className="intro-obj__more">+1</span>
        </span>
      </div>
      <div className="intro-obj intro-obj--ask tint--sky">
        <span className="intro-obj__kicker">
          <MessagesSquare /> Question
        </span>
        <strong>Which date works?</strong>
        <span className="intro-obj__bars">
          <i style={{ width: '78%' }} />
          <i style={{ width: '46%' }} />
        </span>
      </div>
      <div className="intro-obj intro-obj--split tint--lilac">
        <span className="intro-obj__kicker">
          <Receipt /> Split
        </span>
        <strong>Dinner, settled</strong>
        <span className="intro-obj__meta">Everyone’s in</span>
      </div>
    </div>
  );
}
