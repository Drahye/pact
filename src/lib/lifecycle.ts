import type { Pact } from '../data/types';

/**
 * Where a Pact is in its life, from the person's point of view.
 * - active: still going, or funded and waiting for its money to be released or spent (status open, funded)
 * - completed: ran to the end, the funds were released (status released)
 * - closed: ended without the goal being met (status cancelled, refunded)
 * Funded is not completed: the organiser still has to release or pay out. A Pact with no status
 * (the website's showcase data) counts as active.
 */
export type Lifecycle = 'active' | 'completed' | 'closed';

export const lifecycleOf = (p: Pact): Lifecycle => {
  switch (p.status) {
    case 'released':
      return 'completed';
    case 'cancelled':
    case 'refunded':
      return 'closed';
    default:
      return 'active';
  }
};

export type PactTab = 'all' | 'active' | 'completed' | 'closed';
export const PACT_TABS: PactTab[] = ['all', 'active', 'completed', 'closed'];
export const tabLabel: Record<PactTab, string> = { all: 'All', active: 'Active', completed: 'Completed', closed: 'Closed' };

export const MAX_SEARCH = 60;

/** Trim, collapse repeated spaces, lower-case, and cap the length. Search matches titles only. */
export const normalizeQuery = (raw: string) => raw.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_SEARCH);
export const matchesTitle = (p: Pact, normalized: string) => normalized === '' || p.title.replace(/\s+/g, ' ').toLowerCase().includes(normalized);

export interface PactCounts {
  all: number;
  active: number;
  completed: number;
  closed: number;
}

export const countByTab = (pacts: Pact[]): PactCounts => {
  const c: PactCounts = { all: pacts.length, active: 0, completed: 0, closed: 0 };
  for (const p of pacts) c[lifecycleOf(p)]++;
  return c;
};

/** Soonest deadline first for active Pacts; the rest newest deadline first. Funded Pacts sit after those still collecting. */
export const sortForTab = (pacts: Pact[]) => {
  const rank = (p: Pact) => ({ active: p.status === 'funded' ? 1 : 0, completed: 2, closed: 3 })[lifecycleOf(p)];
  return [...pacts].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const byDate = a.deadline.localeCompare(b.deadline);
    return rank(a) === 0 ? byDate : -byDate;
  });
};

/** Which tab to show when there is no usable remembered one: everything, in one list. */
export const defaultTab = (): PactTab => 'all';

const KEY = 'pact.pactsView';
export interface PactsView {
  tab: PactTab | null;
  query: string;
}

/** What the person was looking at, remembered for this browser session. Anything unexpected is ignored. */
export function readView(): PactsView {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { tab?: unknown; query?: unknown } | null;
    const tab = typeof raw?.tab === 'string' && (PACT_TABS as string[]).includes(raw.tab) ? (raw.tab as PactTab) : null;
    const query = typeof raw?.query === 'string' ? raw.query.slice(0, MAX_SEARCH) : '';
    return { tab, query };
  } catch {
    return { tab: null, query: '' };
  }
}

export function writeView(view: PactsView) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    /* storage unavailable: the screen still works */
  }
}
