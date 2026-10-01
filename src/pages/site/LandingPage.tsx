import { useEffect } from 'react';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import { Faq } from './sections/Faq';
import { FinalCta } from './sections/FinalCta';
import { Hero } from './sections/Hero';
import { ProductStory } from './sections/ProductStory';
import { UseCases } from './sections/UseCases';
import { WhyPact } from './sections/WhyPact';
import './landing.css';
import { setFixedClock } from '../../lib/clock';

/**
 * A live product demo that unfolds as you scroll: one phone, one Pact, from the first idea to a
 * finished plan. Then why it beats the group chat, the plans people use it for, the money
 * questions, and the close.
 */
export function LandingPage() {
  // Showcase numbers stay pinned to the launch date.
  setFixedClock(true);
  useEffect(() => {
    document.title = 'PACT · Make group plans happen together';
  }, []);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteNav />
      <main id="main" className="landing">
        <Hero />
        <ProductStory />
        <WhyPact />
        <UseCases />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
