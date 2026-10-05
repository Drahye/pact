import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Attendance, NeedsDetail, NeedsYouItem } from '../../../shared/contracts';
import { trackHome } from '../../api/home';
import { useRespond } from '../../api/asks';
import { useRsvp } from '../../api/plans';
import { daysUntil } from '../../lib/format';
import { AskObject, OBJECT_KINDS, PactObject, PlanObject, SplitObject } from '../objects';
import './needs-objects.css';

/**
 * Needs you, on the Phase A objects. Each thing that needs the viewer is drawn by the object that is that kind of thing, at compact
 * density. This file only maps a Needs You item onto an object's props and keeps the handlers (answer, RSVP, analytics) that were
 * always here; what each object looks like lives in the object.
 */

/** "You’re handling “Menu”." becomes a small lead and the thing itself, large. Anything else is shown whole. */
const splitContext = (context: string): { lead: string; main: string } => {
  const m = /^(.*?)\s*[“"](.+)[”"]\.?$/.exec(context);
  return m && m[1] ? { lead: m[1], main: m[2] } : { lead: '', main: context.replace(/\.$/, '') };
};

type Common = { n: NeedsYouItem; onAnswered: () => void; memberIds?: string[] };
const track = (n: NeedsYouItem) => () => trackHome('home_needs_you_actioned', { object_type: n.objectType, section: 'needs_you' });
const apiMessage = (e: unknown) => (e as { message?: string }).message ?? 'Couldn’t save that. Try again.';

const ATTENDANCE: { id: Attendance; label: string }[] = [
  { id: 'in', label: 'I’m in' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'out', label: 'Can’t' },
];

function AskNeed({ n, d, onAnswered }: Common & { d: Extract<NeedsDetail, { kind: 'ask' }> }) {
  const respond = useRespond(n.sourceId);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const options = d.type === 'choice' ? d.options.map((o) => ({ id: o.id, label: o.label, count: o.votes + (picked === o.id ? 1 : 0) })) : ATTENDANCE.map((a) => ({ id: a.id, label: a.label }));
  const answered = d.answered + (picked ? 1 : 0);
  const choose = async (id: string) => {
    if (respond.isPending || picked) return;
    setPicked(id);
    setError(undefined);
    try {
      await respond.mutateAsync(d.type === 'choice' ? { optionId: id } : { attendance: id as Attendance });
      onAnswered();
    } catch (e) {
      setPicked(null);
      setError(apiMessage(e));
    }
  };
  return (
    <>
      <AskObject
        density="compact"
        question={n.title}
        kicker={n.circle ? `Question · ${n.circle.name}` : 'Question'}
        tint={n.circle?.tint ?? 'sky'}
        options={options}
        selectedId={picked}
        onSelect={choose}
        disabled={respond.isPending}
        href={n.actionUrl}
        onOpen={track(n)}
        statusText={picked ? 'Counted' : d.of > 1 ? `${answered} of ${d.of} answered` : 'Waiting on your answer'}
        answered={answered}
        of={d.of}
      />
      {error && (
        <p className="nd-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function PlanNeed({ n, d, onAnswered }: Common & { d: Extract<NeedsDetail, { kind: 'plan' }> }) {
  const rsvp = useRsvp(n.sourceId);
  const [picked, setPicked] = useState<Attendance | null>(null);
  const [error, setError] = useState<string>();
  const inline = n.type === 'plan_rsvp';
  const many = n.parts.length > 1;
  const choose = async (a: Attendance) => {
    if (rsvp.isPending || picked) return;
    setPicked(a);
    setError(undefined);
    try {
      await rsvp.mutateAsync(a);
      onAnswered();
    } catch (e) {
      setPicked(null);
      setError(apiMessage(e));
    }
  };
  return (
    <>
      <PlanObject
        density="compact"
        title={n.title}
        date={d.date}
        endDate={d.endDate}
        location={d.location}
        goingIds={d.goingIds}
        going={d.going + (picked === 'in' ? 1 : 0)}
        maybe={d.maybe + (picked === 'maybe' ? 1 : 0)}
        circleName={n.circle?.name}
        need={many ? `${n.parts.length} things need you · ${n.parts.join(' · ')}` : n.context.replace(/\.$/, '')}
        rsvp={picked}
        onRsvp={inline ? choose : undefined}
        disabled={rsvp.isPending}
        action={inline ? undefined : { label: n.actionLabel, to: n.actionUrl }}
        href={n.actionUrl}
        onOpen={track(n)}
      />
      {error && (
        <p className="nd-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function SplitNeed({ n, d }: Common & { d: Extract<NeedsDetail, { kind: 'split' }> }) {
  return (
    <SplitObject
      density="compact"
      title={n.title}
      payerId={d.payerId}
      summary={{ amount: d.amount, owe: d.owe, settled: d.settled, count: d.shares }}
      circleName={n.circle?.name}
      href={n.actionUrl}
      onOpen={track(n)}
      action={{ label: n.actionLabel, to: n.actionUrl }}
    />
  );
}

function PactNeed({ n, d }: Common & { d: Extract<NeedsDetail, { kind: 'pact' }> }) {
  const task = n.type === 'pact_task' || n.type === 'plan_task';
  const { lead, main } = splitContext(n.context);
  return (
    <PactObject
      density="compact"
      title={n.title}
      tint={n.circle?.tint ?? 'mint'}
      raised={d.raised}
      target={d.target}
      daysLeft={daysUntil(d.deadline)}
      circleName={n.circle?.name}
      assignment={task ? { label: main, assigneeId: '', lead } : undefined}
      need={task ? undefined : n.context.replace(/\.$/, '')}
      href={n.actionUrl}
      onOpen={track(n)}
      action={{ label: n.actionLabel, to: n.actionUrl }}
    />
  );
}

/** Which object a Needs You item is drawn as. Anything without detail is a plain row. */
export const needsShape = (n: NeedsYouItem): 'ask' | 'plan' | 'split' | 'pact' | 'row' => (n.detail ? n.detail.kind : 'row');

export function NeedItem({ n, memberIds, onAnswered }: { n: NeedsYouItem; memberIds?: string[]; onAnswered: () => void }) {
  const d = n.detail;
  if (d?.kind === 'ask') return <AskNeed n={n} d={d} onAnswered={onAnswered} memberIds={memberIds} />;
  if (d?.kind === 'plan') return <PlanNeed n={n} d={d} onAnswered={onAnswered} memberIds={memberIds} />;
  if (d?.kind === 'split') return <SplitNeed n={n} d={d} onAnswered={onAnswered} />;
  if (d?.kind === 'pact') return <PactNeed n={n} d={d} onAnswered={onAnswered} />;
  return <FallbackNeed n={n} />;
}

/** No detail came with it: a plain, honest row. */
function FallbackNeed({ n }: { n: NeedsYouItem }) {
  const kind = OBJECT_KINDS[n.objectType];
  return (
    <Link to={n.actionUrl} className={`nd-row tint--${n.circle?.tint ?? kind.tint}`} aria-label={`${n.actionLabel}: ${n.title}. ${n.context}`} onClick={track(n)} data-object={n.objectType}>
      <span className="icon-tile">{kind.icon}</span>
      <span className="nd-row__main">
        <strong>{n.title}</strong>
        <span>{n.context}</span>
      </span>
      <span className="act act--text">
        {n.actionLabel}
        <ChevronRight aria-hidden />
      </span>
    </Link>
  );
}
