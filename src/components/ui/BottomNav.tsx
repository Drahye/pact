import { HouseIcon, PlusIcon, PulseIcon, UserCircleIcon, UsersThreeIcon, type Icon } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';
import { useCreateSheet } from '../create/CreateSheet';
import { spring } from '../../tokens/tokens';
import './nav.css';

/**
 * Four tabs in a capsule (Home, Circles, Activity, Me) and Create as its own round button beside it: navigation and the one
 * verb are different kinds of control, so they are different shapes. Pacts and Wallet are not tabs: they live under Home and Me
 * (a Pact is reached from Home, Circles and Me; the wallet from Home and Me), and stay highlighted there.
 */
const tabs: { to: string; label: string; Icon: Icon; also: string[] }[] = [
  { to: '/app/home', label: 'Home', Icon: HouseIcon, also: ['/app/pacts'] },
  { to: '/app/circles', label: 'Circles', Icon: UsersThreeIcon, also: [] },
  { to: '/app/activity', label: 'Activity', Icon: PulseIcon, also: [] },
  { to: '/app/profile', label: 'Me', Icon: UserCircleIcon, also: ['/app/wallet'] },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const create = useCreateSheet();
  const renderTab = (t: (typeof tabs)[number]) => {
    const active = pathname === t.to || pathname.startsWith(`${t.to}/`) || t.also.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    return (
      <NavLink key={t.to} to={t.to} className={() => `tabbar__item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
        {() => (
          <>
            <span className="tabbar__icon" aria-hidden>
              <t.Icon weight={active ? 'fill' : 'regular'} />
            </span>
            <span className="tabbar__label">{t.label}</span>
          </>
        )}
      </NavLink>
    );
  };
  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar__pill">{tabs.map(renderTab)}</div>
      <motion.button
        type="button"
        className={`tabbar__create ${create.isOpen ? 'is-open' : ''}`}
        aria-label="Create"
        aria-haspopup="dialog"
        aria-expanded={create.isOpen}
        onClick={(e) => create.open({ from: 'nav', origin: e.currentTarget.getBoundingClientRect() })}
        whileTap={{ scale: 0.92 }}
        transition={spring.press}
      >
        <PlusIcon weight="bold" aria-hidden />
      </motion.button>
    </nav>
  );
}
