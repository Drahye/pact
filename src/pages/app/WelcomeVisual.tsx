import { friendColor } from '../../data/landing';
import { getUser } from '../../data/users';
import { formatNaira } from '../../lib/format';
import { showcase, showcaseMembers, showcaseSummary } from '../site/sections/pactFixtures';
import './welcome-visual.css';

const R = 80;
const C = 2 * Math.PI * R;

/**
 * The app's first screen: the showcase Pact as a still ring with friends around it.
 * The website keeps the 3D scene; this stays light enough for low-end phones
 * (no WebGL, no three.js download, only a gentle CSS float).
 */
export function WelcomeVisual() {
  const percent = Math.min(100, Math.round((showcaseSummary.raised / showcase.target) * 100));
  const n = showcaseMembers.length;
  return (
    <div className="welcome-visual">
      <div className="welcome-visual__blobs" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="welcome-visual__dial" aria-hidden>
        <svg viewBox="0 0 200 200" className="welcome-visual__ring">
          <defs>
            <linearGradient id="welcome-arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6fe3a8" />
              <stop offset="1" stopColor="#23b56f" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r={R} className="welcome-visual__track" />
          <circle
            cx="100"
            cy="100"
            r={R}
            className="welcome-visual__arc"
            stroke="url(#welcome-arc)"
            strokeDasharray={`${(C * percent) / 100} ${C}`}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="welcome-visual__center">
          <p className="welcome-visual__title">{showcase.title}</p>
          <p className="welcome-visual__amount num">{formatNaira(showcaseSummary.raised)}</p>
          <p className="welcome-visual__meta">
            of <span className="num">{formatNaira(showcase.target)}</span> · {percent}%
          </p>
        </div>
        {showcaseMembers.map((id, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.35;
          return (
            <span
              key={id}
              className="welcome-visual__orb"
              style={{
                left: `${50 + Math.cos(a) * 45}%`,
                top: `${50 + Math.sin(a) * 45}%`,
                ['--c' as string]: friendColor[id],
                animationDelay: `${-i * 0.7}s`,
              }}
            >
              {getUser(id).name[0]}
            </span>
          );
        })}
      </div>
      <p className="visually-hidden">
        Example: {n} friends paying into {showcase.title}. {formatNaira(showcaseSummary.raised)} of {formatNaira(showcase.target)} raised.
      </p>
    </div>
  );
}
