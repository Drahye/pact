import type { RecapDTO } from '../../../shared/contracts';
import { PactLogo } from '../brand/PactLogo';
import { AvatarGroup } from '../ui/AvatarGroup';
import { CircleBadge } from '../circle/CircleBadge';
import './recap.css';

/**
 * The celebratory page for something that finished. Strong type, the completion mark, a few labelled numbers. One gentle rise
 * on arrival, none under reduced motion. Never confetti, never a debt.
 */
export function RecapView({ recap }: { recap: RecapDTO }) {
  const done = recap.kind === 'split';
  return (
    <article className="recap" aria-labelledby="recap-title">
      <div className="recap__brand" aria-hidden>
        <PactLogo size="sm" />
      </div>
      <p className="recap__emoji" aria-hidden>
        {recap.emoji}
      </p>
      <h1 id="recap-title" className="recap__title">
        {recap.title}
      </h1>
      <p className="recap__headline">
        <span className="recap__mark" aria-hidden>
          ✓
        </span>
        {recap.headline}
      </p>
      {done && <p className="recap__sub">Everyone is square.</p>}
      <dl className="recap__metrics" aria-label="What happened">
        {recap.metrics.map((m) => (
          <div key={m.label} className="recap__metric">
            <dd className="num">{m.value}</dd>
            <dt>{m.label}</dt>
          </div>
        ))}
      </dl>
      {recap.when && <p className="recap__when">{recap.when}</p>}
      {recap.personIds.length > 0 && <AvatarGroup userIds={recap.personIds} size="md" max={6} />}
      {recap.circle && (
        <p className="recap__circle">
          <CircleBadge emoji={recap.circle.emoji} tint={recap.circle.tint} size="sm" />
          <span>{recap.circle.name}</span>
        </p>
      )}
    </article>
  );
}
