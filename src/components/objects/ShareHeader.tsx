import { PactLogo } from '../brand/PactLogo';
import { Avatar } from '../ui/Avatar';
import { OBJECT_KINDS, type ObjectKind } from './kinds';
import './objects.css';

/**
 * The top of every shared page: PACT's mark, and who it came from. A shared link is an introduction by a person, so the person comes
 * first ("Sarah asked the group"), not the product. `byId` shows their face when we know it; `byName` alone shows their initial.
 */
export function ShareHeader({ kind, byId, byName, verb, circleName, tint }: { kind: ObjectKind; byId?: string | null; byName?: string; verb: string; circleName?: string; tint?: string }) {
  const k = OBJECT_KINDS[kind];
  return (
    <header className={`sh tint--${tint ?? k.tint}`}>
      <span className="sh__brand" aria-hidden>
        <PactLogo size="sm" />
      </span>
      {(byId || byName) && (
        <p className="sh__from">
          {byId ? <Avatar userId={byId} size="sm" label={false} /> : <span className="sh__initial" aria-hidden>{(byName ?? '?').slice(0, 1)}</span>}
          <span>
            <strong>{byName ?? ''}</strong> {verb}
            {circleName ? <span className="sh__circle"> · {circleName}</span> : null}
          </span>
        </p>
      )}
    </header>
  );
}
