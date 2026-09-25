import { Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';
import './footer.css';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Logo size="md" />
          <p>Money works better together.</p>
        </div>
        <nav aria-label="Footer" className="footer__links">
          <a href="/#how">How it works</a>
          <a href="/#plans">Plans</a>
          <a href="/#faq">FAQ</a>
          <Link to="/download">Download</Link>
          <Link to="/app">Open the web app</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
        <p className="footer__note">
          PACT is not a bank. Before real money moves, balances will be held with a licensed banking or payment partner.
          Until then, the web app runs in sandbox mode and no real money moves.
        </p>
        <p className="footer__copy">© 2026 PACT</p>
      </div>
    </footer>
  );
}
