/**
 * Normalises Nigerian mobile numbers to E.164 (+234XXXXXXXXXX).
 * Accepts 08012345678, 8012345678, 2348012345678 and +234 801 234 5678.
 */
export function normalizeNgPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
  let local: string;
  if (/^234\d{10}$/.test(digits)) local = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) local = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) local = digits;
  else return null;
  // Nigerian mobile prefixes start with 7, 8 or 9.
  if (!/^[789][01]\d{8}$/.test(local)) return null;
  return `+234${local}`;
}

export const maskPhone = (e164: string) => `${e164.slice(0, 7)}•••${e164.slice(-3)}`;
