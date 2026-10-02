import { House, UserRound, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { useNotifications } from '../../api/hooks';
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
  // Notifications are reached from Home, so Home carries the count. It sits over the icon and never moves the layout.
  const unread = useNotifications().data?.unread ?? 0;
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
                  {t.to === '/app/home' && unread > 0 && <span className="tabbar__badge num">{unread > 9 ? '9+' : unread}</span>}
                </span>
                <span className="tabbar__label">{t.label}</span>
                {t.to === '/app/home' && unread > 0 && <span className="visually-hidden">, {unread > 99 ? 'more than 99' : unread} unread notifications</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
