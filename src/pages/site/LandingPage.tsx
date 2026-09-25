import { useEffect } from 'react';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import { Anatomy } from './sections/Anatomy';
import { AppSnapshots } from './sections/AppSnapshots';
import { Clarity } from './sections/Clarity';
import { CompletedShowcase } from './sections/CompletedShowcase';
import { ContributeDemo } from './sections/ContributeDemo';
import { Faq } from './sections/Faq';
import { FinalCta } from './sections/FinalCta';
import { Hero } from './sections/Hero';
import { Manifesto } from './sections/Manifesto';
import { PlanMarquee } from './sections/PlanMarquee';
import { Scenarios } from './sections/Scenarios';
import './landing.css';
import { setFixedClock } from '../../lib/clock';

/**
 * One Pact, told as a story: friends pay into it live (hero), the app that runs it,
 * how it's built, what it adapts to, a contribution you make yourself,
 * and the finish: a ring made of everyone's money.
 */
export function LandingPage() {
  // Showcase numbers stay pinned to the launch date.
  setFixedClock(true);
  useEffect(() => {
    document.title = 'PACT · Plan it together. Fund it together.';
  }, []);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteNav />
      <main id="main" className="landing">
        <Hero />
        <PlanMarquee />
        <Manifesto />
        <AppSnapshots />
        <Anatomy />
        <Scenarios />
        <ContributeDemo />
        <CompletedShowcase />
        <Clarity />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
