import { Cake, Gift, Heart, House, PartyPopper, Plane, ShieldPlus, Sparkles, UtensilsCrossed } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PactCategory } from '../../data/types';
import { categoryLabel } from '../../lib/pact';
import './category.css';

export const categoryMeta: Record<PactCategory, { tint: string; icon: ReactNode }> = {
  birthday: { tint: 'coral', icon: <Cake /> },
  gift: { tint: 'pink', icon: <Gift /> },
  dinner: { tint: 'sun', icon: <UtensilsCrossed /> },
  trip: { tint: 'sky', icon: <Plane /> },
  event: { tint: 'lilac', icon: <PartyPopper /> },
  household: { tint: 'sun', icon: <House /> },
  wedding: { tint: 'pink', icon: <Heart /> },
  fund: { tint: 'mint', icon: <ShieldPlus /> },
  other: { tint: 'mint', icon: <Sparkles /> },
};

/** Tinted icon tile for a Pact's category. */
export function CategoryIcon({ category, size = 'md' }: { category: PactCategory; size?: 'sm' | 'md' | 'lg' }) {
  const m = categoryMeta[category];
  return (
    <span className={`cat-icon cat-icon--${size} tint--${m.tint}`} aria-hidden>
      {m.icon}
    </span>
  );
}

/** Tinted pill with icon + label. */
export function CategoryChip({ category, suffix }: { category: PactCategory; suffix?: string }) {
  const m = categoryMeta[category];
  return (
    <span className={`cat-chip tint--${m.tint}`}>
      {m.icon}
      {categoryLabel[category]}
      {suffix && <span className="cat-chip__suffix">· {suffix}</span>}
    </span>
  );
}
