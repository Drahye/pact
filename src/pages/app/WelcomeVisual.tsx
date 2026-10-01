import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { friendColor } from '../../data/landing';
import { getUser } from '../../data/users';
import { formatNaira } from '../../lib/format';
import { useAnimatedNumber } from '../../lib/useAnimatedNumber';
import { showcase, showcaseMembers, showcaseSummary } from '../site/sections/pactFixtures';
import './welcome-visual.css';

const R = 80;
const STEP = 25_000;

/**
 * The app's first screen: the showcase Pact as a living ring. Friends (with their photos) drift
 * around it, a payment drops in every few seconds and the ring fills. It is CSS and a little
 * state, no WebGL and no three.js download, so it stays light on low-end phones.
 * Reduced motion gets a still picture.
 */
export function WelcomeVisual() {
  const reduce = !!useReducedMotion();
  const n = showcaseMembers.length;
  const base = showcaseSummary.raised;
  // Each tick someone pays in; after a few the demo starts again from where it began.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 3200);
    return () => window.clearInterval(id);
  }, [reduce]);
  const round = tick % 5;
  const raised = Math.min(showcase.target, base + round * STEP);
  const shown = useAnimatedNumber(raised, { from: reduce ? raised : 0, seconds: round === 0 && tick > 0 ? 0.6 : 0.9 });
  const percent = Math.min(100, (raised / showcase.target) * 100);
  const payer = showcaseMembers[tick % n];
  const payerIndex = tick % n;

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
            pathLength={100}
            className="welcome-visual__arc"
            stroke="url(#welcome-arc)"
            strokeDasharray={`${percent} 100`}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="welcome-visual__center">
          <p className="welcome-visual__title">{showcase.title}</p>
          <p className="welcome-visual__amount num">{formatNaira(Math.round(shown / 100) * 100)}</p>
          <p className="welcome-visual__meta">
            of <span className="num">{formatNaira(showcase.target)}</span> · {Math.round(percent)}%
          </p>
        </div>

        <div className="welcome-visual__orbit">
          {showcaseMembers.map((id, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.35;
            const user = getUser(id);
            return (
              <span
                key={id}
                className={`welcome-visual__slot ${i === payerIndex && tick > 0 ? 'is-paying' : ''}`}
                style={{ left: `${50 + Math.cos(a) * 45}%`, top: `${50 + Math.sin(a) * 45}%` }}
              >
                <span className="welcome-visual__orb" style={{ ['--c' as string]: friendColor[id], animationDelay: `${-i * 0.7}s` }}>
                  {user.photo ? <img src={user.photo} alt="" draggable={false} /> : user.name[0]}
                </span>
              </span>
            );
          })}
        </div>
        {tick > 0 && !reduce && (
          <span key={tick} className="welcome-visual__coin num">
            +{formatNaira(STEP)} <small>{getUser(payer).name}</small>
          </span>
        )}
      </div>
      <p className="visually-hidden">
        Example: {n} friends paying into {showcase.title}. {formatNaira(base)} of {formatNaira(showcase.target)} raised.
      </p>
    </div>
  );
}
