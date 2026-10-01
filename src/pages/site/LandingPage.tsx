import { useEffect } from 'react';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import { Difference } from './sections/Difference';
import { Faq } from './sections/Faq';
import { FinalCta } from './sections/FinalCta';
import { Hero } from './sections/Hero';
import { HowItWorks } from './sections/HowItWorks';
import { UseCases } from './sections/UseCases';
import { WhyPact } from './sections/WhyPact';
import './landing.css';
import { setFixedClock } from '../../lib/clock';

/**
 * One idea, told in six beats: PACT helps groups turn shared plans into completed outcomes.
 * Hero (what it is), why it exists, how it works, what makes it different (funded is not
 * finished), the plans people use it for, and the close. The FAQ answers the money questions.
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
        <WhyPact />
        <HowItWorks />
        <Difference />
        <UseCases />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
