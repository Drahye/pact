import { Activity, House, Plus, UserRound, UsersRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';
import { useCreateSheet } from '../create/CreateSheet';
import { spring } from '../../tokens/tokens';
import './nav.css';

/**
 * Home, Circles, a create button, Activity, Me. Pacts and Wallet are not tabs: they live under Home and Me
 * (a Pact is reached from Home, Circles and Me; the wallet from Home and Me), and stay highlighted there.
 */
const left = [
  { to: '/app/home', label: 'Home', icon: <House />, also: ['/app/pacts'] },
  { to: '/app/circles', label: 'Circles', icon: <UsersRound />, also: [] },
];
const right = [
  { to: '/app/activity', label: 'Activity', icon: <Activity />, also: [] },
  { to: '/app/profile', label: 'Me', icon: <UserRound />, also: ['/app/wallet'] },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const create = useCreateSheet();
  const renderTab = (t: (typeof left)[number]) => {
    const active = pathname === t.to || pathname.startsWith(`${t.to}/`) || t.also.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    return (
      <NavLink key={t.to} to={t.to} className={() => `tabbar__item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
        {() => (
          <>
            {active && <motion.span layoutId="tab-active" className="tabbar__active" transition={spring.soft} />}
            <span className="tabbar__icon" aria-hidden>
              {t.icon}
            </span>
            <span className="tabbar__label">{t.label}</span>
          </>
        )}
      </NavLink>
    );
  };
  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar__pill">
        {left.map(renderTab)}
        <motion.button
          type="button"
          className={`tabbar__create ${create.isOpen ? 'is-open' : ''}`}
          aria-label="Create"
          aria-haspopup="dialog"
          aria-expanded={create.isOpen}
          onClick={() => create.open({ from: 'nav' })}
          whileTap={{ scale: 0.92 }}
          transition={spring.press}
        >
          <Plus aria-hidden />
        </motion.button>
        {right.map(renderTab)}
      </div>
    </nav>
  );
}
