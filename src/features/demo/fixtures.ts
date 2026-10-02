import type { Activity, BudgetLine, Pact, PactCategory, Task } from '../../data/types';

/**
 * Sample Pacts for showing what PACT is for, before someone has made one. They are fixed data in the app: nothing here
 * is ever read from or written to the server, and every screen that shows one says it is a demo. They are explicitly
 * not customers or testimonials. The story is the lifecycle: create, invite, contribute, organise, execute, complete.
 */

export type DemoId = 'sarahs_birthday' | 'december_trip' | 'graduation_gift';

export interface DemoPact {
  id: DemoId;
  /** The Pact in the same shape the app uses for real ones, so the real components can draw it. */
  pact: Pact;
  activities: Activity[];
  /** The day of the story each activity happened on, so the demo never says "a year ago". */
  days: Record<string, number>;
  dateLabel: string;
  purpose: string;
  organizerNote: string;
  /** What was paid to whom, for the Execute step. */
  spent: { name: string; amount: number }[];
  remaining: number;
  outcome: string;
  /** Short ticks for the card. */
  milestones: string[];
  /** One line for the card: what finished. */
  summary: string;
  goalLabel: string;
  /** Used for "run it again". */
  category: PactCategory;
}

const iso = (day: number) => `2025-10-${String(day).padStart(2, '0')}T10:00:00.000Z`;
let n = 0;
const act = (pactId: string, type: Activity['type'], userId: string, extra: Partial<Activity> = {}): Activity => ({ id: `${pactId}-a${++n}`, pactId, type, userId, at: iso(1), ...extra });

function build(d: {
  id: DemoId;
  title: string;
  category: PactCategory;
  date: string;
  organizer: string;
  note: string;
  people: [string, number][];
  tasks: [string, string][];
  spent: [string, number, string][];
  outcome: string;
  summary: string;
  milestones: string[];
  purpose: string;
  organizerNote: string;
}): DemoPact {
  const pactId = `demo-${d.id}`;
  const target = d.people.reduce((s, [, a]) => s + a, 0);
  const spentTotal = d.spent.reduce((s, [, a]) => s + a, 0);
  const lines: BudgetLine[] = d.spent.map(([name, amount], i) => ({ id: `${pactId}-b${i}`, name, amount, funded: amount, paid: amount, pending: 0, waiting: 0 }));
  const tasks: Task[] = d.tasks.map(([title, who], i) => ({ id: `${pactId}-t${i}`, title, budgetItemId: null, assigneeId: who, status: 'done', createdBy: d.organizer, completedAt: iso(10 + i) }));
  const pact: Pact = {
    id: pactId,
    slug: pactId,
    title: d.title,
    category: d.category,
    target,
    deadline: d.date,
    createdAt: '2025-10-01',
    organizerId: d.organizer,
    status: 'released',
    completedAt: iso(20),
    raised: target,
    poolBalance: 0,
    members: d.people.map(([userId, contributed]) => ({ userId, contributed, status: 'joined' as const, role: userId === d.organizer ? ('organizer' as const) : ('member' as const), participation: 'both' as const })),
    budget: lines,
    tasks,
    note: d.note,
    viewer: { role: null, status: null, suggestedShare: 0 },
  };
  const days: Record<string, number> = {};
  const list: Activity[] = [];
  const add = (a: Activity, day: number) => {
    days[a.id] = day;
    list.push(a);
  };
  add(act(pactId, 'created', d.organizer), 1);
  d.people.forEach(([id], i) => id !== d.organizer && add(act(pactId, 'join', id), 1 + Math.floor(i / 3)));
  d.people.forEach(([id, amount], i) => add(act(pactId, 'contribution', id, { amount }), 3 + Math.floor(i / 2)));
  add(act(pactId, 'completed', d.organizer), 8);
  d.tasks.forEach(([title, who], i) => add(act(pactId, 'task_done', who, { detail: title }), 10 + i));
  d.spent.forEach(([name, amount, payee], i) => add(act(pactId, 'vendor_paid', d.organizer, { amount, detail: `${name} to ${payee}` }), 12 + i));
  add(act(pactId, 'pact_completed', d.organizer), 20);
  return {
    id: d.id,
    pact,
    activities: list,
    days,
    dateLabel: new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
    purpose: d.purpose,
    organizerNote: d.organizerNote,
    spent: d.spent.map(([name, amount]) => ({ name, amount })),
    remaining: target - spentTotal,
    outcome: d.outcome,
    milestones: d.milestones,
    summary: d.summary,
    goalLabel: d.id === 'sarahs_birthday' ? '₦500,000 goal' : d.id === 'december_trip' ? '₦780,000 contributed' : '₦220,000 raised',
    category: d.category,
  };
}

export const DEMOS: Record<DemoId, DemoPact> = {
  sarahs_birthday: build({
    id: 'sarahs_birthday',
    title: 'Sarah’s Birthday',
    category: 'birthday',
    date: '2025-10-18',
    organizer: 'abraham',
    note: 'A surprise dinner for Sarah, with everyone there.',
    purpose: 'A surprise birthday dinner for Sarah, with the whole group.',
    organizerNote: 'Abraham started it and kept everyone posted.',
    people: [['abraham', 120_000], ['david', 80_000], ['maya', 70_000], ['daniel', 60_000], ['kemi', 50_000], ['femi', 50_000], ['tolu', 40_000], ['zara', 30_000]],
    tasks: [['Book venue', 'david'], ['Order cake', 'tolu'], ['Decorations', 'kemi'], ['Photographer', 'maya']],
    spent: [['Venue', 250_000, 'The Garden Hall'], ['Cake', 80_000, 'Sweet Crumbs'], ['Decorations', 90_000, 'Bloom & Co'], ['Photography', 62_000, 'Frame Studio']],
    outcome: 'Birthday completed. What was left, ₦18,000, was released back to the organiser.',
    summary: 'Birthday completed',
    milestones: ['Venue paid', 'Cake sorted', 'Decorations completed', 'Pact completed'],
  }),
  december_trip: build({
    id: 'december_trip',
    title: 'December Trip',
    category: 'trip',
    date: '2025-12-20',
    organizer: 'david',
    note: 'Six friends, one long weekend in Cape Town.',
    purpose: 'A long weekend away for six friends.',
    organizerNote: 'David booked and tracked everything.',
    people: [['david', 130_000], ['maya', 130_000], ['kemi', 130_000], ['femi', 130_000], ['zara', 130_000], ['daniel', 130_000]],
    tasks: [['Book the hotel', 'maya'], ['Book transport', 'femi'], ['Plan the days', 'kemi']],
    spent: [['Hotel', 520_000, 'Harbour View Hotel'], ['Transport', 210_000, 'Cape Rides']],
    outcome: 'Trip completed. What was left, ₦50,000, was released to the organiser for the group’s food.',
    summary: 'Hotel and transport paid',
    milestones: ['Hotel paid', 'Transport paid', 'Plans made', 'Pact completed'],
  }),
  graduation_gift: build({
    id: 'graduation_gift',
    title: 'Graduation Gift',
    category: 'gift',
    date: '2025-11-08',
    organizer: 'sarah',
    note: 'A gift from the whole class for Tobi.',
    purpose: 'A graduation gift from eleven classmates.',
    organizerNote: 'Sarah collected the money and sorted delivery.',
    people: [['sarah', 30_000], ['abraham', 20_000], ['david', 20_000], ['maya', 20_000], ['tolu', 20_000], ['kemi', 20_000], ['femi', 20_000], ['zara', 20_000], ['daniel', 20_000], ['james', 15_000], ['chidi', 15_000]],
    tasks: [['Choose the gift', 'maya'], ['Write the card', 'kemi']],
    spent: [['The gift', 195_000, 'Tech Hub'], ['Card and wrapping', 15_000, 'Paper & Pine'], ['Delivery', 10_000, 'QuickDrop']],
    outcome: 'Gift delivered. Every naira was used for the plan.',
    summary: 'Gift delivered',
    milestones: ['Gift bought', 'Card signed by everyone', 'Gift delivered', 'Pact completed'],
  }),
};

export const DEMO_ORDER: DemoId[] = ['sarahs_birthday', 'december_trip', 'graduation_gift'];
export const isDemoId = (v: string | undefined): v is DemoId => !!v && v in DEMOS;
