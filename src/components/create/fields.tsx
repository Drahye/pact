import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CircleSummaryDTO } from '../../../shared/contracts';
import { addDaysIso, isoDay } from '../../lib/dates';
import { CircleBadge } from '../circle/CircleBadge';
import { AvatarStack } from '../objects';
import { Avatar } from '../ui/Avatar';
import { Input } from '../ui/Input';
import './create-fields.css';

/**
 * The few pieces every create flow is built from, said once: pick a Circle, pick people, pick a date, and say what is missing in
 * a sentence. Each flow keeps its own steps and its own wording; these only keep the parts that look and behave the same.
 */

/** A short, human line under a field when something is missing. Quiet until it matters, never red. */
export function StepHint({ show = true, children, id }: { show?: boolean; children: ReactNode; id?: string }) {
  if (!show) return null;
  return (
    <p className="cf__hint" id={id} role="status">
      {children}
    </p>
  );
}

/** Which Circle: one row each, with its faces. The chosen row is ringed and ticked; arrows are not needed, each row is a radio. */
export function CirclePicker({ circles, value, onChange }: { circles: CircleSummaryDTO[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="cp" role="radiogroup" aria-label="Circle">
      {circles.map((c) => {
        const on = value === c.id;
        return (
          <button key={c.id} type="button" role="radio" aria-checked={on} className={`cp__row tint--${c.tint} ${on ? 'is-on' : ''}`} onClick={() => onChange(c.id)}>
            <CircleBadge emoji={c.emoji} tint={c.tint} size="md" />
            <span className="cp__text">
              <strong>{c.name}</strong>
              <span>{c.memberCount} {c.memberCount === 1 ? 'person' : 'people'}</span>
            </span>
            <AvatarStack userIds={c.memberIds} total={c.memberCount} size="xs" max={3} />
            <span className="cp__mark" aria-hidden>
              <Check strokeWidth={3} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** People as rows with their faces: tick the ones who are in. `tag` says something short beside a name ("Paid"). */
export function PeoplePicker({ ids, selected, onToggle, nameOf, tag, label, single }: { ids: string[]; selected: string[]; onToggle: (id: string) => void; nameOf: (id: string) => string; tag?: (id: string) => string | undefined; label: string; /** Exactly one person (who paid): rows are radios. */ single?: boolean }) {
  return (
    <ul className="pp" aria-label={label} role={single ? 'radiogroup' : undefined}>
      {ids.map((id) => {
        const on = selected.includes(id);
        const t = tag?.(id);
        return (
          <li key={id} role={single ? 'none' : undefined}>
            <button type="button" role={single ? 'radio' : 'checkbox'} aria-checked={on} className={`pp__row ${on ? 'is-on' : ''}`} onClick={() => onToggle(id)}>
              <Avatar userId={id} size="md" label={false} />
              <span className="pp__name">
                {nameOf(id)}
                {t && <small>{t}</small>}
              </span>
              <span className="pp__mark" aria-hidden>
                <Check strokeWidth={3} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return isoDay(d);
};

/** The ways people actually say a plan date, as quick picks. */
export const planDates = () => {
  const today = isoDay(new Date());
  return [
    { label: 'Tomorrow', value: addDaysIso(today, 1) },
    { label: 'This weekend', value: nextSaturday() },
    { label: 'Next week', value: addDaysIso(today, 7) },
    { label: 'In a month', value: addDaysIso(today, 30) },
  ];
};

/** A date as a few quick picks and the phone's own date control for anything else. */
export function DateField({ label, value, onChange, min, quick, hint, error, disabled }: { label: string; value: string; onChange: (v: string) => void; min?: string; quick?: { label: string; value: string }[]; hint?: ReactNode; error?: string; disabled?: boolean }) {
  return (
    <div className="df">
      {quick && (
        <div className="suggest" role="group" aria-label="Quick dates">
          {quick.map((q) => (
            <button key={q.label} type="button" className={`suggest__chip ${value === q.value ? 'is-on' : ''}`} aria-pressed={value === q.value} onClick={() => onChange(value === q.value ? '' : q.value)}>
              {value === q.value && <Check aria-hidden />} {q.label}
            </button>
          ))}
        </div>
      )}
      <Input label={label} type="date" min={min} value={value} disabled={disabled} hint={hint} error={error} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
