import { TODAY } from '../data/pacts';

/**
 * The marketing site and style guide pin "today" so their showcase numbers never
 * drift. The app runs on the real clock. Each surface sets this as it renders.
 */
let fixed: Date | null = TODAY;

export const now = () => fixed ?? new Date();
export const setFixedClock = (on: boolean) => {
  fixed = on ? TODAY : null;
};
