import type { Queryable } from '../db/index.js';
import { AppError } from '../lib/errors.js';

/**
 * Ways to sign in. One user, any number of verified identities (at most one of each kind per account is surfaced in the UI).
 * Service-only table: nothing here is reachable from a person-scoped request, and raw provider subjects never reach a client.
 */
export type Provider = 'google' | 'email' | 'phone';

export interface IdentityRow {
  id: string;
  user_id: string;
  provider: Provider;
  provider_subject: string;
  email: string | null;
  phone: string | null;
  verified_at: Date;
}

/** Conservative: trim, lowercase the domain. The local part is the mailbox owner's business (no dot or +tag rewriting). */
export function normalizeEmail(raw: string): string | null {
  const s = raw.trim();
  const at = s.lastIndexOf('@');
  if (at < 1 || at === s.length - 1 || s.length > 254) return null;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1).toLowerCase();
  if (/\s/.test(local) || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return null;
  if (local.length > 64 || local.includes('@') && !/^".*"$/.test(local)) return null;
  return `${local}@${domain}`;
}

/** a•••@gmail.com: enough to recognise, not enough to expose. */
export const maskEmail = (email: string) => {
  const at = email.lastIndexOf('@');
  return `${email[0]}${'•'.repeat(Math.min(3, Math.max(1, at - 1)))}${email.slice(at)}`;
};

export async function findIdentity(q: Queryable, provider: Provider, subject: string): Promise<IdentityRow | null> {
  const r = await q.query<IdentityRow>('SELECT * FROM user_identities WHERE provider = $1 AND provider_subject = $2', [provider, subject]);
  return r.rows[0] ?? null;
}

export async function userIdentities(q: Queryable, userId: string): Promise<IdentityRow[]> {
  return (await q.query<IdentityRow>('SELECT * FROM user_identities WHERE user_id = $1 ORDER BY created_at', [userId])).rows;
}

/** Attaches a verified identity to a user. A subject that already belongs to someone else is a conflict, never a move. */
export async function addIdentity(q: Queryable, userId: string, provider: Provider, subject: string, extra: { email?: string; phone?: string } = {}) {
  const r = await q.query<{ user_id: string }>(
    `INSERT INTO user_identities (user_id, provider, provider_subject, email, phone, verified_at)
     VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (provider, provider_subject) DO NOTHING RETURNING user_id`,
    [userId, provider, subject, extra.email ?? null, extra.phone ?? null],
  );
  if (r.rowCount) return;
  const existing = await findIdentity(q, provider, subject);
  if (existing?.user_id === userId) return; // already theirs: linking twice is fine
  throw new AppError(409, 'identity_taken', 'This sign-in method is already connected to another PACT account.');
}
