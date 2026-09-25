import { now } from './clock';

const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** ₦320,000 */
export const formatNaira = (value: number) => `₦${naira.format(Math.round(value))}`;

/** ₦25k, ₦1.2m: for chips and compact labels */
export const formatNairaCompact = (value: number) => {
  if (value >= 1_000_000) return `₦${+(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `₦${+(value / 1_000).toFixed(value % 1000 ? 1 : 0)}k`;
  return formatNaira(value);
};

export const formatPercent = (value: number) => `${Math.round(value)}%`;

const DAY = 86_400_000;

export const daysUntil = (iso: string) => {
  const today = now();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY));
};

export const formatDaysLeft = (days: number) =>
  days === 0 ? 'Due today' : `${days} ${days === 1 ? 'day' : 'days'} left`;

export const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', opts);

export const formatRelative = (iso: string) => {
  const diff = now().getTime() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(iso, { month: 'short', day: 'numeric' });
};

export const greeting = (date = now()) => {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/** Keeps digits only and parses to a number. */
export const parseAmount = (raw: string) => Number(raw.replace(/[^\d]/g, '')) || 0;

export const formatAmountInput = (value: number) => (value ? naira.format(value) : '');

export const joinNames = (names: string[], max = 3) => {
  if (names.length <= max) {
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
  }
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
};

/** Kobo from the API to naira for display, and back. */
export const fromKobo = (kobo: number) => kobo / 100;
export const toKobo = (naira: number) => Math.round(naira * 100);

export const formatNairaKobo = (kobo: number) => {
  const n = kobo / 100;
  return `₦${new Intl.NumberFormat('en-NG', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n)}`;
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const formatPhone = (e164: string) => e164.replace(/^\+234(\d{3})(\d{3})(\d{4})$/, '0$1 $2 $3');
