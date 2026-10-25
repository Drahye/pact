import { AirplaneTiltIcon, BeerSteinIcon, BriefcaseIcon, ConfettiIcon, CrownIcon, DiamondIcon, FireIcon, FlowerIcon, ForkKnifeIcon, GiftIcon, GlobeIcon, GraduationCapIcon, HandCoinsIcon, HandsClappingIcon, HandsPrayingIcon, HeartIcon, HouseIcon, LightningIcon, MusicNotesIcon, PizzaIcon, ReceiptIcon, SmileyIcon, SoccerBallIcon, SparkleIcon, ThumbsUpIcon, UsersThreeIcon, type Icon, type IconWeight } from '@phosphor-icons/react';

/**
 * What a stored emoji looks like in the app. People and the server keep saving the same small set of emoji (a Circle's face, a Pact's kind);
 * the app draws each one as the icon that means the same thing, so nothing in the interface is a platform emoji that looks different on every phone.
 * Anything outside the set (an old custom emoji) falls back to a neutral icon rather than showing a stray emoji.
 */
const GLYPHS: Record<string, Icon> = {
  '🍻': BeerSteinIcon,
  '❤': HeartIcon,
  '💐': FlowerIcon,
  '⚡': LightningIcon,
  '🏠': HouseIcon,
  '🏡': HouseIcon,
  '⚽': SoccerBallIcon,
  '🎓': GraduationCapIcon,
  '✈': AirplaneTiltIcon,
  '🎉': ConfettiIcon,
  '🎊': ConfettiIcon,
  '💼': BriefcaseIcon,
  '🍕': PizzaIcon,
  '🌍': GlobeIcon,
  '🙏🏾': HandsPrayingIcon,
  '🎶': MusicNotesIcon,
  '👑': CrownIcon,
  '🔥': FireIcon,
  '🙂': SmileyIcon,
  '💍': DiamondIcon,
  '🎁': GiftIcon,
  '🍽': ForkKnifeIcon,
  '💰': HandCoinsIcon,
  '✨': SparkleIcon,
  '🧾': ReceiptIcon,
  '🙌': HandsClappingIcon,
  '👍': ThumbsUpIcon,
};

/** Without the invisible "draw as a picture" selector, so ❤ and ❤️ are the same key. */
const key = (emoji: string) => emoji.replace(/️/g, '');

export const hasGlyph = (emoji: string) => key(emoji) in GLYPHS;

/** The icon for an emoji, sized by the surrounding font size. Decorative: the thing it stands for is always named beside it. */
export function Glyph({ emoji, weight = 'regular', className }: { emoji: string; weight?: IconWeight; className?: string }) {
  const G = GLYPHS[key(emoji)] ?? UsersThreeIcon;
  return <G size="1em" weight={weight} className={className} aria-hidden />;
}
