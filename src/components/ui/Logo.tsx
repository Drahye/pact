import './logo.css';

interface Props {
  tone?: 'ink' | 'inverse';
  size?: 'sm' | 'md' | 'lg';
  wordmark?: boolean;
}

/** The mark is a progress ring three-quarters full: the product's core object. */
export function Logo({ tone = 'ink', size = 'md', wordmark = true }: Props) {
  return (
    <span className={`logo logo--${tone} logo--${size}`}>
      <svg className="logo__mark" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="11" fill="none" className="logo__track" strokeWidth="5" />
        <path d="M16 5a11 11 0 1 1-10.46 14.4" fill="none" className="logo__arc" strokeWidth="5" strokeLinecap="round" />
      </svg>
      {wordmark && <span className="logo__word">pact</span>}
      <span className="visually-hidden">PACT</span>
    </span>
  );
}
