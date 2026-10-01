import type { ReactionKey } from '../data/types';

/** The whole set. No picker: four, so a reaction is a tap, not a decision. */
export const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: 'thumbs_up', emoji: '👍', label: 'Thumbs up' },
  { key: 'heart', emoji: '❤️', label: 'Love' },
  { key: 'celebrate', emoji: '🎉', label: 'Celebrate' },
  { key: 'raised_hands', emoji: '🙌', label: 'Raised hands' },
];

export const COMMENT_MAX = 500;
