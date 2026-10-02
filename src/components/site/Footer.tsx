import { Link } from 'react-router-dom';
import { openCookieSettings } from '../../lib/consent';
import { PactLogo } from '../brand/PactLogo';
import { CookieNotice } from './CookieNotice';
import './footer.css';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <PactLogo size="md" />
          <p>Money works better together.</p>
        </div>
        <nav aria-label="Footer" className="footer__links">
          <a href="/#story">How it works</a>
          <a href="/#plans">Plans</a>
          <a href="/#faq">FAQ</a>
          <Link to="/download">Download</Link>
          <Link to="/app">Open the web app</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/refunds">Refunds</Link>
          <Link to="/cookies">Cookies</Link>
          <button type="button" onClick={openCookieSettings}>
            Cookie settings
          </button>
        </nav>
        <p className="footer__note">
          PACT is not a bank. Before real money moves, balances will be held with a licensed banking or payment partner.
          Until then, the web app runs in sandbox mode and no real money moves.
        </p>
        <p className="footer__copy">© 2026 PACT</p>
      </div>
      <CookieNotice />
    </footer>
  );
}
