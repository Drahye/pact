/**
 * JS mirror of the tokens in src/styles/tokens.css.
 * Used where CSS variables can't reach: Framer Motion transitions,
 * matchMedia breakpoints and SVG maths.
 */

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

/** The motion scale (seconds), mirroring --motion-* in tokens.css. */
export const motion = {
  micro: 0.14,
  state: 0.22,
  nav: 0.32,
  sheet: 0.38,
  celebrate: 0.55,
} as const;

export const duration = {
  fast: 0.15,
  base: 0.25,
  slow: 0.45,
  slower: 0.8,
  count: 1.1, // number transitions
};

export const spring = {
  /** Cards settling, lists reordering. */
  soft: { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as const,
  /** A press and its release. */
  press: { type: 'spring', stiffness: 520, damping: 30 } as const,
  /** A sheet rising from its control. */
  sheet: { type: 'spring', stiffness: 360, damping: 36, mass: 0.95 } as const,
  gentle: { type: 'spring', stiffness: 260, damping: 30 } as const,
  snappy: { type: 'spring', stiffness: 420, damping: 32 } as const,
  pop: { type: 'spring', stiffness: 500, damping: 22 } as const,
};

export const transition = {
  micro: { duration: motion.micro, ease: ease.out },
  state: { duration: motion.state, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
  progress: { duration: duration.slower, ease: ease.out },
};

export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1440,
} as const;

/** A fade-and-rise reveal shared by the marketing site. */
export const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: ease.out } },
};

/** Vivid friend palette (mirrors --*-400 tokens). Order matters: index = person. */
export const friendColors = ['#3dd68c', '#ff7a5c', '#4da3ff', '#9b7bff', '#ffc53d', '#ff6fb5', '#22b8a6', '#ff9f43'] as const;

export const palette = {
  ink: '#0f1713',
  paper: '#f6f4ef',
  track: '#e7e3da',
  green: '#3dd68c',
  greenDeep: '#137a4a',
};
