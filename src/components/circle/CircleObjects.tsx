import { useState } from 'react';
import type { Attendance, AskSummaryDTO, PlanSummaryDTO, SplitSummaryDTO } from '../../../shared/contracts';
import { useRsvp } from '../../api/plans';
import type { Pact } from '../../data/types';
import { cardStatus } from '../../lib/execution';
import { daysUntil, formatDaysLeft } from '../../lib/format';
import { summarize } from '../../lib/pact';
import { AskObject, PactObject, PlanObject, SplitObject } from '../objects';
import { useToast } from '../ui/Toast';

/**
 * What is happening in a Circle, on the Phase A objects at compact density. Like Needs You on Home, this file only maps what the
 * Circle's lists know (a summary of each thing) onto an object's props; what each one looks like lives in the object. An Ask here has
 * no options to show (the list does not carry them), so it is the question, where it stands, and the way in.
 */

export function CircleAsk({ ask }: { ask: AskSummaryDTO }) {
  const open = ask.status === 'open';
  const of = Math.max(ask.memberCount, ask.responseCount, 1);
  const waiting = open && !ask.answered;
  return (
    <AskObject
      density="compact"
      question={ask.title}
      tint={ask.circle.tint}
      options={[]}
      closed={!open}
      kicker={waiting ? 'Question · needs your answer' : 'Question'}
      href={`/app/asks/${ask.id}?from=circle`}
      statusText={ask.responseCount ? `${ask.headline} · ${ask.responseCount} of ${of} answered` : 'No one has answered yet.'}
      action={{ label: !open ? 'See result' : ask.answered ? 'See results' : ask.type === 'attendance' ? 'Respond' : 'Vote', to: `/app/asks/${ask.id}?from=circle` }}
    />
  );
}

export function CirclePlan({ plan }: { plan: PlanSummaryDTO }) {
  const rsvp = useRsvp(plan.id);
  const toast = useToast();
  const [picked, setPicked] = useState<Attendance | null>(null);
  const live = plan.status === 'planning' || plan.status === 'confirmed';
  const needs = live && !plan.mine && !plan.pactId;
  const mine = picked ?? plan.mine;
  const choose = async (a: Attendance) => {
    if (rsvp.isPending) return;
    setPicked(a);
    try {
      await rsvp.mutateAsync(a);
    } catch (e) {
      setPicked(null);
      toast((e as { message?: string }).message ?? 'Couldn’t save that. Try again.', 'neutral');
    }
  };
  const to = `/app/plans/${plan.id}?from=circle`;
  return (
    <PlanObject
      density="compact"
      title={plan.title}
      date={plan.date}
      endDate={plan.endDate}
      location={plan.location}
      goingIds={[]}
      going={plan.counts.in + (picked === 'in' && plan.mine !== 'in' ? 1 : 0)}
      maybe={plan.counts.maybe + (picked === 'maybe' && plan.mine !== 'maybe' ? 1 : 0)}
      done={plan.status === 'done'}
      need={needs ? 'You haven’t RSVP’d' : plan.pactId ? 'Now a Pact' : plan.undecided ? `${plan.undecided} to decide` : mine === 'in' ? 'You’re in' : mine === 'maybe' ? 'You said maybe' : mine === 'out' ? 'You can’t make it' : undefined}
      rsvp={mine}
      onRsvp={live && !plan.pactId ? choose : undefined}
      action={!live || plan.pactId ? { label: plan.pactId ? 'Open' : 'See', to } : undefined}
      disabled={rsvp.isPending}
      href={to}
    />
  );
}

export function CircleSplit({ split }: { split: SplitSummaryDTO }) {
  const owe = !!split.mine && !split.mine.isPayer && split.mine.status === 'owed';
  return (
    <SplitObject
      density="compact"
      kobo
      title={split.title}
      total={split.total}
      payerId={split.paidBy}
      summary={{ amount: owe ? split.mine!.amount : split.unsettled, owe, settled: split.settledCount, count: split.owedCount }}
      href={`/app/splits/${split.id}?from=circle`}
      action={owe ? { label: 'View split', to: `/app/splits/${split.id}?from=circle` } : undefined}
    />
  );
}

export function CirclePact({ pact }: { pact: Pact }) {
  const s = summarize(pact);
  const { line } = cardStatus(pact, formatDaysLeft(s.daysLeft));
  // The days left already sit on the object; only a different state (funded, making it happen) is worth saying again.
  const state = line === formatDaysLeft(s.daysLeft) ? undefined : line;
  return <PactObject density="compact" title={pact.title} raised={s.raised} target={s.target} daysLeft={daysUntil(pact.deadline)} need={state} href={`/app/pact/${pact.id}`} />;
}
