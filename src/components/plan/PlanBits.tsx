import type { PlanStatus } from '../../../shared/contracts';

export const statusLabel: Record<PlanStatus, string> = { planning: 'Planning', confirmed: 'Confirmed', done: 'Done', cancelled: 'Cancelled' };
