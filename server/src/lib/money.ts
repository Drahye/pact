/** Money is integer kobo everywhere on the server. */
export const KOBO = 100;
export const naira = (n: number) => Math.round(n * KOBO);
export const formatNgn = (kobo: number) => `₦${(kobo / KOBO).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
