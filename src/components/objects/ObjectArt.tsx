import { useId } from 'react';

export type ArtKind = 'plan' | 'ask' | 'split' | 'pact';

/**
 * A solid-looking object for each thing PACT makes: a calendar, a poll, a receipt with a coin, a ring. Drawn in SVG with a lit top edge
 * and a soft shadow so it sits on the hero like a thing you could pick up. Decorative: always hidden from assistive technology.
 */
export function ObjectArt({ kind, className = '' }: { kind: ArtKind; className?: string }) {
  const id = useId().replace(/:/g, '');
  const defs = (
    <defs>
      <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#ebe7dc" />
      </linearGradient>
      <linearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#25342c" />
        <stop offset="1" stopColor="#0d1612" />
      </linearGradient>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#62eaa9" />
        <stop offset="1" stopColor="#1fb872" />
      </linearGradient>
      <linearGradient id={`${id}y`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe37d" />
        <stop offset="1" stopColor="#ffb41f" />
      </linearGradient>
      <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8cc6ff" />
        <stop offset="1" stopColor="#3b8cf0" />
      </linearGradient>
      <filter id={`${id}s`} x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="9" stdDeviation="8" floodColor="#000" floodOpacity="0.26" />
      </filter>
    </defs>
  );
  const w = `url(#${id}w)`;
  const k = `url(#${id}k)`;
  const g = `url(#${id}g)`;
  const y = `url(#${id}y)`;
  const b = `url(#${id}b)`;
  const sh = `url(#${id}s)`;
  let body;
  if (kind === 'plan') {
    body = (
      <>
        <g filter={sh}>
          <rect x="30" y="42" width="140" height="128" rx="28" fill={w} />
          <path d="M30 70a28 28 0 0 1 28-28h84a28 28 0 0 1 28 28v16H30z" fill={k} />
          <rect x="62" y="26" width="16" height="36" rx="8" fill="#fff" stroke="#0d1612" strokeWidth="3" />
          <rect x="122" y="26" width="16" height="36" rx="8" fill="#fff" stroke="#0d1612" strokeWidth="3" />
        </g>
        {[110, 132, 154].map((cy, r) =>
          [58, 84, 110, 136].map((cx, c) => <circle key={`${r}${c}`} cx={cx} cy={cy} r="7" fill={r === 1 && c === 2 ? y : '#d8d3c4'} />),
        )}
        <g filter={sh}>
          <circle cx="152" cy="152" r="27" fill={g} />
          <path d="M140 152l9 9 16-18" fill="none" stroke="#0d1612" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </>
    );
  } else if (kind === 'ask') {
    body = (
      <>
        <g filter={sh}>
          <path d="M44 34h104a26 26 0 0 1 26 26v52a26 26 0 0 1-26 26H92l-30 26v-26H44a26 26 0 0 1-26-26V60a26 26 0 0 1 26-26z" fill={w} />
        </g>
        <rect x="36" y="54" width="100" height="16" rx="8" fill="#e8e3d6" />
        <rect x="36" y="54" width="72" height="16" rx="8" fill={b} />
        <rect x="36" y="80" width="100" height="16" rx="8" fill="#e8e3d6" />
        <rect x="36" y="80" width="40" height="16" rx="8" fill="#ffd25a" />
        <rect x="36" y="106" width="100" height="16" rx="8" fill="#e8e3d6" />
        <rect x="36" y="106" width="22" height="16" rx="8" fill="#ff8f70" />
        <g filter={sh}>
          <circle cx="156" cy="132" r="26" fill={k} />
          <path d="M146 123.500c0-6 4.500-9.500 10-9.500s10 3.500 10 8.500c0 6-8 6.500-8 12" fill="none" stroke="#fff" strokeWidth="5.500" strokeLinecap="round" />
          <circle cx="158" cy="146" r="3.500" fill="#fff" />
        </g>
      </>
    );
  } else if (kind === 'split') {
    body = (
      <>
        <g filter={sh} transform="rotate(-7 90 100)">
          <path d="M40 22h104v140l-13-9-13 9-13-9-13 9-13-9-13 9-13-9-13 9z" fill={w} />
        </g>
        <g transform="rotate(-7 90 100)">
          <rect x="58" y="42" width="52" height="9" rx="4.500" fill="#d8d3c4" />
          <rect x="58" y="64" width="68" height="9" rx="4.500" fill="#e5e0d2" />
          <rect x="58" y="84" width="60" height="9" rx="4.500" fill="#e5e0d2" />
          <rect x="58" y="112" width="68" height="14" rx="7" fill={k} />
        </g>
        <g filter={sh}>
          <circle cx="146" cy="138" r="36" fill={y} />
          <circle cx="146" cy="138" r="28" fill="none" stroke="#c98200" strokeOpacity="0.5" strokeWidth="3" />
          <text x="146" y="151" textAnchor="middle" fontSize="38" fontWeight="800" fill="#7a4d00" fontFamily="inherit">
            ₦
          </text>
        </g>
      </>
    );
  } else {
    body = (
      <>
        <g filter={sh}>
          <circle cx="100" cy="100" r="62" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="26" />
          <circle cx="100" cy="100" r="62" fill="none" stroke="#1fb872" strokeWidth="26" strokeLinecap="round" strokeDasharray="120 400" transform="rotate(-90 100 100)" />
          <circle cx="100" cy="100" r="62" fill="none" stroke="#ff6fb5" strokeWidth="26" strokeLinecap="round" strokeDasharray="60 400" strokeDashoffset="-132" transform="rotate(-90 100 100)" />
          <circle cx="100" cy="100" r="62" fill="none" stroke="#4da3ff" strokeWidth="26" strokeLinecap="round" strokeDasharray="44 400" strokeDashoffset="-206" transform="rotate(-90 100 100)" />
        </g>
        <g filter={sh}>
          <circle cx="100" cy="100" r="34" fill={w} />
          <path d="M84 100l12 12 22-24" fill="none" stroke="#1fb872" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </>
    );
  }
  return (
    <svg className={`obj-art obj-art--${kind} ${className}`} viewBox="0 0 200 200" aria-hidden focusable="false">
      {defs}
      {body}
    </svg>
  );
}
