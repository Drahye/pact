import { Check } from 'lucide-react';
import { OBJECT_KINDS } from '../../../components/objects/kinds';
import { handoffWords, readHandoff, type Handoff } from './handoff';
import './handoff.css';

/** The shared thing the person came for, kept in sight while they sign in: what it is, who sent it, and what they chose. */
export function HandoffNote() {
  const h = readHandoff();
  return h ? <HandoffChip h={h} /> : null;
}

export function HandoffChip({ h }: { h: Pick<Handoff, 'kind' | 'title' | 'from' | 'choice'> }) {
  const k = OBJECT_KINDS[h.kind];
  return (
    <div className={`handoff tint--${k.tint}`}>
      <span className="handoff__icon" aria-hidden>
        {k.icon}
      </span>
      <span className="handoff__text">
        <strong>{h.title}</strong>
        <span>{h.from ? `from ${h.from}` : k.label}</span>
      </span>
      {h.choice && (
        <span className="handoff__choice">
          <Check aria-hidden strokeWidth={3} /> {h.choice}
        </span>
      )}
    </div>
  );
}

/** Heading and sentence for the sign-in screens, in the words of what the person was doing; null when they came the plain way. */
export const useHandoffWords = () => {
  const h = readHandoff();
  return h ? handoffWords(h) : null;
};
