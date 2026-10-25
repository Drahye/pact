import { ArrowRightIcon } from '@phosphor-icons/react';
import { Button } from '../ui/Button';
import type { Cta } from './model';

/** One clear next step, and at most one quieter alternative. Both are real links, so they work with a keyboard. */
export function CommunicationCta({ primary, secondary }: { primary: Cta; secondary?: Cta }) {
  return (
    <div className="comm__cta">
      <Button to={primary.to} fullWidth iconRight={<ArrowRightIcon />}>
        {primary.label}
      </Button>
      {secondary && (
        <Button to={secondary.to} variant="secondary" fullWidth>
          {secondary.label}
        </Button>
      )}
    </div>
  );
}
