import { Link } from 'react-router-dom';
import './store-buttons.css';

export type Platform = 'ios' | 'android';

/** Apple logo (App Store). */
function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  );
}

/** Google Play logo, in its four colours. */
function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z" />
      <path fill="#34A853" d="M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z" />
      <path fill="#FBBC04" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z" />
      <path fill="#EA4335" d="M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
    </svg>
  );
}

const meta = {
  ios: { small: 'Download on the', big: 'App Store', glyph: <AppleGlyph /> },
  android: { small: 'GET IT ON', big: 'Google Play', glyph: <PlayGlyph /> },
};

interface Props {
  tone?: 'dark' | 'light';
  compact?: boolean;
  /** When set, buttons act in place (download page); otherwise they link to /download. */
  onSelect?: (p: Platform) => void;
  highlight?: Platform | null;
}

/** App store buttons. Until the native apps are live they lead to the download page, which hands off to the web app. */
export function StoreButtons({ tone = 'dark', compact, onSelect, highlight }: Props) {
  return (
    <div className={`stores stores--${tone} ${compact ? 'stores--compact' : ''}`}>
      {(['ios', 'android'] as Platform[]).map((p) => {
        const m = meta[p];
        const body = (
          <>
            <span className="store__glyph">{m.glyph}</span>
            <span className="store__text">
              <span className="store__small">{m.small}</span>
              <span className="store__big">{m.big}</span>
            </span>
          </>
        );
        const cls = `store ${highlight === p ? 'is-highlight' : ''}`;
        return onSelect ? (
          <button key={p} type="button" className={cls} onClick={() => onSelect(p)}>
            {body}
          </button>
        ) : (
          <Link key={p} to={`/download?platform=${p}`} className={cls}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}
