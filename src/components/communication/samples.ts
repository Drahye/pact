import type { CommunicationData, CommunicationKind } from './model';

/**
 * Realistic sample data for every template: the gallery draws from it, and the tests check every template against it.
 * It is Sarah's Birthday, the same Pact the website tells its story with.
 */
const base: CommunicationData = {
  pactId: 'sample-pact',
  pactName: 'Sarah’s Birthday',
  recipientName: 'Abraham',
  organizerName: 'Abraham',
  purpose: 'A surprise birthday dinner for Sarah, with the whole group',
  targetAmount: 500_000,
  raisedAmount: 320_000,
  peopleCount: 8,
  people: ['abraham', 'sarah', 'david', 'maya', 'daniel', 'kemi', 'femi', 'tolu'],
  deadline: '2026-10-24',
  occurredAt: '2026-10-02',
};

export const samples: Record<CommunicationKind, CommunicationData> = {
  welcome: { pactName: '', recipientName: 'Abraham' },
  invite: { ...base, organizerName: 'Sarah', recipientName: 'David', raisedAmount: 120_000, peopleCount: 4, people: ['sarah', 'maya', 'kemi', 'femi'], inviteCode: 'SARAH123' },
  joined: { ...base, recipientName: 'David', organizerName: 'Abraham', raisedAmount: 120_000, peopleCount: 5 },
  member_joined: { ...base, actorName: 'David', raisedAmount: 200_000, peopleCount: 6 },
  contribution: { ...base, actorName: 'Ada', amount: 25_000, raisedAmount: 345_000, people: ['sarah', 'david', 'maya', 'daniel'] },
  task_assigned: { ...base, actorName: 'Abraham', taskName: 'Order the cake', assigneeName: 'Tolu', taskStatus: 'assigned', tasksDone: 1, tasksTotal: 3 },
  task_completed: { ...base, taskName: 'Book the venue', assigneeName: 'Daniel', taskStatus: 'done', tasksDone: 2, tasksTotal: 3 },
  funded: { ...base, raisedAmount: 500_000, availableAmount: 500_000 },
  execute: {
    ...base,
    raisedAmount: 500_000,
    availableAmount: 300_000,
    usedAmount: 200_000,
    budgetLines: [
      { name: 'Venue', amount: 200_000, status: 'paid' },
      { name: 'Cake', amount: 80_000, status: 'pending' },
      { name: 'Transport', amount: 120_000, status: 'not_paid' },
    ],
  },
  payment_approval: { ...base, raisedAmount: 500_000, actorName: 'Abraham', recipientName: 'Sarah', amount: 250_000, paymentPurpose: 'Hotel', payee: 'Eko Suites' },
  payment_success: { ...base, raisedAmount: 500_000, amount: 200_000, paymentPurpose: 'Venue', payee: 'The Garden Hall', availableAmount: 300_000 },
  payment_failed: { ...base, raisedAmount: 500_000, amount: 80_000, paymentPurpose: 'Cake', payee: 'Sweet Crumbs Bakery', failureReason: 'The bank returned the transfer.' },
  organizer_update: { ...base, actorName: 'Abraham', pinned: true, updateBody: 'Venue confirmed for Saturday. Please arrive by 5pm and bring your ID for the gate.' },
  completed: { ...base, recipientName: 'Abraham', actorName: 'Abraham', raisedAmount: 500_000, usedAmount: 400_000, releasedAmount: 100_000, tasksDone: 3, tasksTotal: 3 },
  balance_released: { ...base, raisedAmount: 500_000, usedAmount: 400_000, releasedAmount: 100_000, amount: 100_000 },
  reply: { ...base, actorName: 'David', about: 'the venue update', replyPreview: 'On my way! Will the gate need a printed ticket as well, or is the booking name enough?' },
};
