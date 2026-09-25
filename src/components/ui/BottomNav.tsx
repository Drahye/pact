import { House, UserRound, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { spring } from '../../tokens/tokens';
import './nav.css';

/** Small progress-ring glyph so the Pacts tab echoes the product's core object. */
function RingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" opacity="0.35" />
      <path d="M12 3.5a8.5 8.5 0 1 1-8.1 11.1" />
    </svg>
  );
}

const tabs = [
  { to: '/app/home', label: 'Home', icon: <House /> },
  { to: '/app/pacts', label: 'Pacts', icon: <RingIcon /> },
  { to: '/app/wallet', label: 'Wallet', icon: <Wallet /> },
  { to: '/app/profile', label: 'Profile', icon: <UserRound /> },
];

export function BottomNav() {
  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar__pill">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `tabbar__item ${isActive ? 'is-active' : ''}`}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tab-active" className="tabbar__active" transition={spring.snappy} />}
                <span className="tabbar__icon" aria-hidden>
                  {t.icon}
                </span>
                <span className="tabbar__label">{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
