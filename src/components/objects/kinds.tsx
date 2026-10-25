import { CalendarDotsIcon, ChatsIcon, HandshakeIcon, ReceiptIcon, UsersIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { HomeObject } from '../../../shared/contracts';

export type ObjectKind = HomeObject | 'circle';

/**
 * What each kind of thing is, said once: its words, its icon, its tint and its silhouette (`--shape-*` in tokens.css).
 * Every place that names a Plan, an Ask, a Split, a Pact or a Circle takes it from here, so they stay recognisable everywhere.
 */
export const OBJECT_KINDS: Record<ObjectKind, { label: string; noun: string; icon: ReactNode; tint: 'sun' | 'sky' | 'lilac' | 'mint' | 'coral'; blurb: string; weight: 'light' | 'medium' | 'heavy' }> = {
  ask: { label: 'Question', noun: 'Ask', icon: <ChatsIcon aria-hidden />, tint: 'sky', blurb: 'Make a quick decision.', weight: 'light' },
  plan: { label: 'Plan', noun: 'Plan', icon: <CalendarDotsIcon aria-hidden />, tint: 'sun', blurb: 'Something you’re thinking of doing together.', weight: 'medium' },
  split: { label: 'Split', noun: 'Split', icon: <ReceiptIcon aria-hidden />, tint: 'lilac', blurb: 'Work out who owes what.', weight: 'medium' },
  pact: { label: 'Pact', noun: 'Pact', icon: <HandshakeIcon aria-hidden />, tint: 'mint', blurb: 'Everyone is ready to commit.', weight: 'heavy' },
  circle: { label: 'Circle', noun: 'Circle', icon: <UsersIcon aria-hidden />, tint: 'coral', blurb: 'The people you do things with.', weight: 'light' },
};
