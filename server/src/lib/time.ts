/** Lagos has no DST, so a fixed offset gives the correct local calendar day. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

export const lagosToday = (now = new Date()) => new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

export const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Start of the current Lagos day as a UTC instant, for daily limits. */
export const lagosDayStart = (now = new Date()) => new Date(`${lagosToday(now)}T00:00:00+01:00`);
