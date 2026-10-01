import type { BudgetLine, Pact, PactPayout } from '../data/types';

/**
 * Funded is not finished. Reaching the target means the group has the money (`status: 'funded'`).
 * The Pact is completed when the organiser says the plan actually happened (`completedAt`).
 * Everything here is derived from what the server already sends: no extra state.
 */

/** The outcome happened. A Pact released before completion existed (status 'released') counts as completed. */
export const isOutcomeComplete = (pact: Pact) => !!pact.completedAt || pact.status === 'released';

/** The target was reached and the money is (or was) in the Pact. */
export const isFunded = (pact: Pact) => pact.status === 'funded' || pact.status === 'released';

/** Funded, and the outcome has not been completed yet: this is where the plan gets carried out. */
export const isExecuting = (pact: Pact) => pact.status === 'funded' && !pact.completedAt;

/** A payment still on its way: it decides what is left, so it has to land before the Pact can complete. */
export const paymentsInFlight = (pact: Pact): PactPayout[] =>
  (pact.payouts ?? []).filter((p) => p.kind === 'vendor' && ['awaiting_approval', 'pending', 'processing'].includes(p.status));

const spends = (p: PactPayout) => p.kind === 'vendor' && ['awaiting_approval', 'pending', 'processing', 'succeeded'].includes(p.status);

export type Phase = 'planning' | 'funding' | 'ready' | 'in_progress' | 'completed' | 'closed';

/**
 * Where the Pact is in its life, in the words people use.
 * planning: nothing in yet. funding: money still coming in. ready: target reached, nothing used yet.
 * in_progress: money is being paid out and/or tasks are being done. completed. closed: called off or refunded.
 */
export function phaseOf(pact: Pact): Phase {
  if (pact.status === 'cancelled' || pact.status === 'refunded') return 'closed';
  if (isOutcomeComplete(pact)) return 'completed';
  if (pact.status === 'funded') {
    const started = (pact.payouts ?? []).some(spends) || (pact.tasks ?? []).some((t) => t.status === 'done');
    return started ? 'in_progress' : 'ready';
  }
  const raised = pact.raised ?? pact.members.reduce((s, m) => s + m.contributed, 0);
  return raised > 0 ? 'funding' : 'planning';
}

export const phaseLabel: Record<Phase, string> = {
  planning: 'Planning',
  funding: 'Funding',
  ready: 'Ready to use',
  in_progress: 'Making it happen',
  completed: 'Completed',
  closed: 'Closed',
};

export interface Money {
  /** Everything paid in. */
  raised: number;
  /** What left the Pact for the plan, transfer fees included. */
  used: number;
  /** Still in the Pact and available to use. */
  left: number;
  /** What the organiser moved to their wallet after the plan (nothing until they release). */
  released: number;
}

/** The Pact's money as one story: raised = used + left (+ released, once it has been). The server's pool is the truth. */
export function moneyOf(pact: Pact): Money {
  const raised = pact.raised ?? 0;
  const used = (pact.payouts ?? []).filter(spends).reduce((s, p) => s + p.amount + p.fee, 0);
  const left = pact.status === 'open' || pact.status === 'funded' ? Math.max(0, pact.poolBalance ?? Math.max(0, raised - used)) : 0;
  const released = pact.status === 'released' ? Math.max(0, raised - used) : 0;
  return { raised, used, left, released };
}

export type LineState = 'not_paid' | 'partly_paid' | 'paid' | 'waiting' | 'sending';

/** A budget line's payment state. A payment only makes a line "paid" once the bank has confirmed it. */
export function lineState(line: BudgetLine): LineState {
  const paid = line.paid ?? 0;
  if (paid >= line.amount) return 'paid';
  if ((line.waiting ?? 0) > 0) return 'waiting';
  if ((line.pending ?? 0) > 0) return 'sending';
  return paid > 0 ? 'partly_paid' : 'not_paid';
}

export const lineStateLabel: Record<LineState, string> = {
  not_paid: 'Not paid',
  partly_paid: 'Partly paid',
  paid: 'Paid',
  waiting: 'Waiting for approval',
  sending: 'Sending',
};

/** What is still to pay on a line, never negative. */
export const lineLeftToPay = (line: BudgetLine) => Math.max(0, line.amount - (line.paid ?? 0) - (line.pending ?? 0));

export interface Progress {
  /** Planned costs fully paid, of all planned costs. */
  lines: { done: number; total: number };
  tasks: { done: number; total: number };
}

export function progressOf(pact: Pact): Progress {
  const lines = pact.budget ?? [];
  const tasks = pact.tasks ?? [];
  return {
    lines: { done: lines.filter((l) => lineState(l) === 'paid').length, total: lines.length },
    tasks: { done: tasks.filter((t) => t.status === 'done').length, total: tasks.length },
  };
}

/** The next planned cost still to pay: unpaid first, then partly paid. Lines already on their way are skipped. */
export function nextLineToPay(pact: Pact): BudgetLine | null {
  const open = (pact.budget ?? []).filter((l) => lineLeftToPay(l) > 0);
  return open.find((l) => lineState(l) === 'not_paid') ?? open.find((l) => lineState(l) === 'partly_paid') ?? null;
}

/** Everything planned looks handled: all lines paid (if any) and all tasks done (if any). */
export const looksHandled = (pact: Pact) => {
  const p = progressOf(pact);
  return p.lines.done === p.lines.total && p.tasks.done === p.tasks.total && paymentsInFlight(pact).length === 0;
};

/**
 * The words on a Pact card. Funding shows the deadline; a funded Pact says what comes next, so
 * 100% reads as "ready", not "done". One badge at most, and only when it adds something.
 */
export function cardStatus(pact: Pact, deadlineText: string): { line: string; badge: { text: string; tone: 'accent' | 'neutral' } | null } {
  switch (phaseOf(pact)) {
    case 'ready':
      return { line: 'Funded · Ready to use', badge: { text: 'Funded', tone: 'accent' } };
    case 'in_progress':
      return { line: 'Making it happen', badge: null };
    case 'completed':
      return { line: 'Completed', badge: { text: 'Done', tone: 'accent' } };
    case 'closed':
      return { line: pact.status === 'refunded' ? 'Refunded' : 'Closed', badge: { text: 'Closed', tone: 'neutral' } };
    default:
      return { line: deadlineText, badge: null };
  }
}
