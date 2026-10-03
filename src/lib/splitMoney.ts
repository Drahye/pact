/** Split amounts are integer kobo. These only format and preview; the server does the real arithmetic. */

/** ₦15,625 or ₦3,333.34 */
export const koboText = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "12,500" or "12500.50" to kobo. Empty or unreadable is 0. */
export function parseKobo(input: string): number {
  const n = Number.parseFloat(input.replace(/[₦,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** The same rule as the server: leftover kobo go one each to the first people, in order. Used only to show a preview. */
export function equalPreview(total: number, count: number): number[] {
  if (count < 1) return [];
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

export const koboInput = (kobo: number) => (kobo ? String(kobo / 100) : '');
