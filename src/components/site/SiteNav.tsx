import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../ui/Button';
import { PactLogo } from '../brand/PactLogo';
import './site-nav.css';

const links = [
  { href: '/#how', label: 'How it works' },
  { href: '/#app', label: 'The app' },
  { href: '/#plans', label: 'Plans' },
  { href: '/#faq', label: 'FAQ' },
];

/** Floating pill navigation. One conversion: get the app. */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`site-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="site-nav__pill">
        <Link to="/" className="site-nav__logo" aria-label="PACT home">
          <PactLogo size="md" />
        </Link>
        <nav aria-label="Main" className="site-nav__links">
          {links.map((l) => (
            <a key={l.href} href={pathname === '/' ? l.href.slice(1) : l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <Button to="/download" size="sm" className="site-nav__cta" iconRight={<ArrowRight />}>
          Get the app
        </Button>
      </div>
    </header>
  );
}
