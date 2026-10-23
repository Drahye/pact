import './burst.css';

const COLORS = ['var(--brand)', 'var(--sun-400)', 'var(--pink-400)', 'var(--sky-400)', 'var(--coral-400)', 'var(--lilac-400)'];
const PIECES = 18;

/**
 * A short burst of confetti for a moment worth marking (a quarter, half or all of the goal reached). Pure CSS, decorative, gone in about a second,
 * and not drawn at all for anyone who asks for less motion.
 */
export function Burst() {
  return (
    <span className="burst" aria-hidden>
      {Array.from({ length: PIECES }, (_, i) => {
        const angle = (i / PIECES) * 360 + (i % 2 ? 9 : -9);
        const dist = 90 + (i % 4) * 26;
        return (
          <i
            key={i}
            style={{
              ['--a' as string]: `${angle}deg`,
              ['--d' as string]: `${dist}px`,
              ['--c' as string]: COLORS[i % COLORS.length],
              ['--r' as string]: `${(i * 47) % 360}deg`,
              animationDelay: `${(i % 5) * 30}ms`,
            }}
          />
        );
      })}
    </span>
  );
}
