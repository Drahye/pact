import './objects.css';

type Tone = 'live' | 'done' | 'waiting' | 'attention' | 'quiet';

/**
 * A small state mark: a dot that breathes while something is live, settles when it is done. `tint` inherits the nearest
 * `.tint--*` colour so it belongs to the object it sits on. Give it a label and it reads as a status line; without one it is decoration.
 */
export function StatusIndicator({ tone = 'live', label, className = '' }: { tone?: Tone; label?: string; className?: string }) {
  return (
    <span className={`status status--${tone} ${className}`} role={label ? 'status' : undefined}>
      <span className="status__dot" aria-hidden />
      {label && <span className="status__label">{label}</span>}
    </span>
  );
}
