import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { PactLogo } from '../brand/PactLogo';
import { EmptyState, type ObjectKind } from '../objects';
import { Button } from '../ui/Button';
import './shared.css';

/** The PACT mark, small, for a shared page that has not (or cannot) show its object: loading, or gone. */
export function SharedBrand() {
  return (
    <div className="sp-brand">
      <PactLogo size="sm" />
    </div>
  );
}

/**
 * The foot of every shared page: PACT is there, quietly, with a way to learn what it is. The shared thing is the hero; this is the
 * signature under it.
 */
export function SharedFooter() {
  return (
    <footer className="sp-foot">
      <p>
        Made with <strong>PACT</strong>. Plans, decisions, splits and commitments with your people.
      </p>
      <Link to="/" className="sp-foot__link">
        What is PACT?
      </Link>
    </footer>
  );
}

const WHAT: Record<string, { gone: string; off: string }> = {
  ask: { gone: 'This question isn’t available anymore.', off: 'This question link is no longer active.' },
  plan: { gone: 'This plan isn’t available anymore.', off: 'This plan link is no longer active.' },
  split: { gone: 'This split isn’t available anymore.', off: 'This split link is no longer active.' },
  circle: { gone: 'This invite doesn’t work.', off: 'This invite is no longer active.' },
  pact: { gone: 'This recap isn’t available anymore.', off: 'This recap link is no longer active.' },
};

/** A link that does not lead anywhere: said in a sentence, with the one useful thing to do about it. Never a code. */
export function SharedUnavailable({ kind, error, onRetry }: { kind: ObjectKind; error?: unknown; onRetry?: () => void }) {
  const status = (error as ApiError | undefined)?.status;
  const words = WHAT[kind] ?? WHAT.ask;
  const network = !status || status >= 500;
  return (
    <div className="sp-gone">
      <EmptyState
        as="h1"
        kind={kind}
        title={network ? 'We couldn’t load this.' : status === 410 ? words.off : words.gone}
        body={network ? 'Check your connection and try again.' : kind === 'circle' ? 'Ask the person who sent it for a fresh invite link.' : 'Ask the person who sent it to share it again.'}
        action={
          network && onRetry ? (
            <Button onClick={onRetry}>Try again</Button>
          ) : (
            <Button variant="secondary" to="/">
              What is PACT?
            </Button>
          )
        }
      />
    </div>
  );
}

/**
 * Joining the Circle, offered after what the person came to do is done, never before and never automatically. Once joined, it says so
 * and opens the Circle.
 */
export function ShareJoin({ circle, tint, joined, loading, onJoin, onOpen, why }: { circle: string; tint: string; joined?: boolean; loading?: boolean; onJoin: () => void; onOpen?: () => void; why: string }) {
  if (joined) {
    return (
      <section className={`sp-join sp-join--done tint--${tint}`} role="status">
        <strong>You’re in {circle}.</strong>
        <p>Everything they’re planning is one tap away.</p>
        <Button onClick={onOpen}>Open {circle}</Button>
      </section>
    );
  }
  return (
    <section className={`sp-join tint--${tint}`} aria-label={`Join ${circle}`}>
      <strong>Stay in the loop with {circle}</strong>
      <p>{why}</p>
      <Button variant="secondary" loading={loading} onClick={onJoin}>
        Join {circle}
      </Button>
    </section>
  );
}
