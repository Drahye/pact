import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../ui/Button';
import { PactLogo } from '../brand/PactLogo';
import './site-nav.css';

const links = [
  { href: '/#story', label: 'How it works' },
  { href: '/#what', label: 'What is PACT?' },
  { href: '/#plans', label: 'Plans' },
  { href: '/#faq', label: 'FAQ' },
];

/** Floating pill navigation. One conversion: start a Pact. */
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
        <Button to="/app" size="sm" className="site-nav__cta" iconRight={<ArrowRight />}>
          Start a Pact
        </Button>
      </div>
    </header>
  );
}
