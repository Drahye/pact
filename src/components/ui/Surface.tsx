import type { CircleTint } from '../../../shared/contracts';
import type { ElementType, ReactNode } from 'react';
import '../pact/category.css';

type Level = 'quiet' | 'interactive' | 'focused';

/**
 * A surface for a meaningful object (a Circle, Ask, Plan, Split, Pact, recap). Quiet is soft context, interactive is something
 * you can act on, focused is chosen or high priority. `tint` lends the object its identity colour. Not for sections or lists:
 * those sit on the page.
 */
export function Surface({ level = 'interactive', tint, as: Tag = 'div', className = '', children, ...rest }: { level?: Level; tint?: CircleTint | 'sun'; as?: ElementType; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Tag className={`surface surface--${level} ${tint ? `tint--${tint}` : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
