import { useEffect } from 'react';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import { Faq } from './sections/Faq';
import { FinalCta } from './sections/FinalCta';
import { Hero } from './sections/Hero';
import { Execution, HowItWorks } from './sections/ProductStory';
import { UseCases } from './sections/UseCases';
import { WhatIsPact } from './sections/WhatIsPact';
import './landing.css';
import { setFixedClock } from '../../lib/clock';

/**
 * Six sections that alternate on purpose: hero (asymmetric, energetic), what PACT is (centred, calm),
 * how it works (phone right), funded is not finished (phone left), the plans people use it for
 * (centred), and a centred close. The FAQ stays compact for the money questions.
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
        <WhatIsPact />
        <HowItWorks />
        <Execution />
        <UseCases />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
