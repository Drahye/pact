import { AirplaneIcon, CakeIcon, ConfettiIcon, ForkKnifeIcon, GiftIcon, HeartIcon, HouseIcon, ShieldPlusIcon, SparkleIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { PactCategory } from '../../data/types';
import { categoryLabel } from '../../lib/pact';
import './category.css';

export const categoryMeta: Record<PactCategory, { tint: string; icon: ReactNode }> = {
  birthday: { tint: 'coral', icon: <CakeIcon /> },
  gift: { tint: 'pink', icon: <GiftIcon /> },
  dinner: { tint: 'sun', icon: <ForkKnifeIcon /> },
  trip: { tint: 'sky', icon: <AirplaneIcon /> },
  event: { tint: 'lilac', icon: <ConfettiIcon /> },
  household: { tint: 'sun', icon: <HouseIcon /> },
  wedding: { tint: 'pink', icon: <HeartIcon /> },
  fund: { tint: 'mint', icon: <ShieldPlusIcon /> },
  other: { tint: 'mint', icon: <SparkleIcon /> },
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
