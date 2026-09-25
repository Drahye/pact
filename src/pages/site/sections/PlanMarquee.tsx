import { planTypes } from '../../../data/landing';

const tints = ['sun', 'sky', 'coral', 'lilac', 'mint', 'pink'];

/** Two rows of plan types drifting in opposite directions. Pauses on hover and for reduced motion. */
export function PlanMarquee() {
  const rows = [planTypes, [...planTypes].reverse()];
  return (
    <section className="marquee" aria-label="What people make Pacts for">
      <p className="visually-hidden">People make Pacts for: {planTypes.join(', ')}.</p>
      {rows.map((row, r) => (
        <div key={r} className={`marquee__row ${r ? 'marquee__row--reverse' : ''}`} aria-hidden>
          <div className="marquee__track">
            {[...row, ...row].map((label, i) => (
              <span key={i} className={`marquee__chip marquee__chip--${tints[(i + r * 2) % tints.length]}`}>
                <span className="marquee__dot" />
                {label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
