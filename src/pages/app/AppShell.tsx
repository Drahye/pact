import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useOutlet } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { setFixedClock } from '../../lib/clock';
import { clearReturnTo } from './auth/flow';
import { Logo } from '../../components/ui/Logo';
import { OverlayRootContext } from '../../components/ui/overlay';
import { ToastProvider } from '../../components/ui/Toast';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { ease } from '../../tokens/tokens';
import './app.css';

/** Navigation depth per route decides whether a transition pushes, pops or presents. */
function depthOf(path: string) {
  if (path === '/app' || path === '/app/') return 0;
  if (/^\/app\/(home|pacts|wallet|profile)$/.test(path)) return 1;
  if (/^\/app\/auth\//.test(path)) return 2 + ['phone', 'code', 'profile', 'pin'].findIndex((s) => path.endsWith(s));
  if (/^\/app\/(pact\/[^/]+|activity|notifications|profile\/\w+|wallet\/withdraw)$/.test(path)) return 2;
  return 3; // create, invite, contribute, top up
}
const isModal = (path: string) => /\/(create|contribute|topup|checkout\/[^/]+)$/.test(path);
const isTab = (path: string) => depthOf(path) === 1;

function useTransitionDirection(path: string) {
  const prev = useRef(path);
  const dir = useRef<'push' | 'pop' | 'fade' | 'present' | 'dismiss'>('fade');
  if (prev.current !== path) {
    const from = prev.current;
    if (isTab(from) && isTab(path)) dir.current = 'fade';
    else if (isModal(path)) dir.current = 'present';
    else if (isModal(from)) dir.current = 'dismiss';
    else dir.current = depthOf(path) >= depthOf(from) ? 'push' : 'pop';
    prev.current = path;
  }
  return dir.current;
}

const variants = {
  initial: (d: string) =>
    d === 'push' ? { x: '28%', opacity: 0 } : d === 'pop' ? { x: '-12%', opacity: 0 } : d === 'present' ? { y: '8%', opacity: 0 } : { opacity: 0 },
  animate: { x: 0, y: 0, opacity: 1 },
  exit: (d: string) =>
    d === 'push' ? { x: '-12%', opacity: 0 } : d === 'pop' ? { x: '28%', opacity: 0 } : d === 'dismiss' ? { y: '8%', opacity: 0 } : { opacity: 0 },
};

const DEMO_PEOPLE = [
  { name: 'Abraham', phone: '0801 000 0001', note: 'Organises Sarah’s Birthday' },
  { name: 'Sarah', phone: '0801 000 0002', note: 'Verified, has a balance' },
  { name: 'David', phone: '0801 000 0003', note: 'Starter tier' },
];

/** Desktop-only side panel: how to try the product end to end in the sandbox. */
function DemoPanel() {
  const { config, status, user } = useAuth();
  return (
    <aside className="proto-panel" aria-label="About this demo">
      <Link to="/" className="proto-panel__back">
        <ArrowLeft aria-hidden /> Website
      </Link>
      <div className="proto-panel__intro">
        <Logo size="md" />
        <p>The full PACT app, running against the live API. Sign up with any Nigerian number, or use a demo account below.</p>
        {config?.sandbox && (
          <span className="sandbox-tag">
            <FlaskConical aria-hidden /> Sandbox payments: no real money moves
          </span>
        )}
      </div>
      <div className="proto-panel__nav">
        <p className="proto-panel__label">Demo accounts</p>
        <ul className="demo-list">
          {DEMO_PEOPLE.map((p) => (
            <li key={p.phone}>
              <strong>{p.name}</strong>
              <span className="num">{p.phone}</span>
              <small>{p.note}</small>
            </li>
          ))}
        </ul>
        <p className="demo-hint">
          The SMS code appears on screen in the sandbox. Demo PIN <strong className="num">1357</strong>.
        </p>
        <p className="proto-panel__label">Try this</p>
        <ol className="demo-steps">
          <li>Top up your wallet by card or transfer</li>
          <li>Contribute to Sarah’s Birthday with your PIN</li>
          <li>Create a Pact and share its invite link</li>
          <li>Withdraw to a bank account in your name</li>
        </ol>
      </div>
      {status === 'signedIn' && user && (
        <p className="demo-hint demo-hint--end">
          Signed in as <strong>{user.firstName}</strong>
        </p>
      )}
    </aside>
  );
}

function StatusBar() {
  return (
    <div className="status-bar" aria-hidden>
      <span className="num">9:41</span>
      <span className="status-bar__icons">
        <svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg viewBox="0 0 26 12" width="26" height="12"><rect x="0.5" y="0.5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" /><rect x="2" y="2" width="17" height="8" rx="2" /><rect x="24" y="4" width="1.6" height="4" rx="0.8" opacity="0.4" /></svg>
      </span>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const outlet = useOutlet();
  const framed = useMediaQuery('(min-width: 600px)');
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const direction = useTransitionDirection(location.pathname);

  setFixedClock(false);
  const { status } = useAuth();
  // Once a signed-in person has landed somewhere real, the pending return path is spent.
  useEffect(() => {
    if (status === 'signedIn' && !location.pathname.startsWith('/app/auth')) clearReturnTo();
  }, [status, location.pathname]);
  useEffect(() => {
    document.title = 'PACT';
  }, []);

  const screens = (
    <AnimatePresence initial={false} custom={direction} mode="popLayout">
      <motion.div
        key={location.pathname}
        className="app-page"
        custom={direction}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.38, ease: ease.out }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <ToastProviderWithRoot root={framed ? overlayRoot : null}>
      <div className={`proto ${framed ? 'proto--framed' : 'proto--native'}`}>
        <a href="#app-main" className="skip-link">
          Skip to app
        </a>
        {framed && <DemoPanel />}
        <div className="proto__stage">
          <div className="device">
            {framed && <StatusBar />}
            <main id="app-main" className="device__screen">
              {screens}
            </main>
            <div ref={setOverlayRoot} className="device__overlay" />
            {framed && <span className="device__home" aria-hidden />}
          </div>
        </div>
      </div>
    </ToastProviderWithRoot>
  );
}

function ToastProviderWithRoot({ root, children }: { root: HTMLElement | null; children: ReactNode }) {
  return (
    <OverlayRootContext.Provider value={root}>
      <ToastProvider>{children}</ToastProvider>
    </OverlayRootContext.Provider>
  );
}
