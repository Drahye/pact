import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import { setFixedClock } from '../../lib/clock';
import { gsap, ScrollTrigger } from '../../lib/gsap';
import { Faq } from './sections/Faq';
import { PvBand } from './home/sections/PvBand';
import { PvFinal } from './home/sections/PvFinal';
import { PvHero } from './home/sections/PvHero';
import { PvMoments } from './home/sections/PvMoments';
import { PvShould } from './home/sections/PvShould';
import { PvStory } from './home/sections/PvStory';
import './landing.css';
import './home/home.css';

/**
 * The landing page, told as a walk through a few rooms: a full-screen hero that the next section slides over, a headline that reads itself,
 * a dark room of four moments you walk through sideways, the product held in a pinned scene with a small phone, a calm band of three promises,
 * the questions, and a wall of memories. Motion comes from GSAP (SplitText, ScrollTrigger, the scrubbed phone demos) plus Lenis for smooth wheel scrolling.
 */
export function LandingPage() {
  setFixedClock(true);
  const cta = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    document.title = 'PACT · Make group plans happen together';
    ScrollTrigger.config({ ignoreMobileResize: true });

    // Smooth wheel scrolling (touch stays native). Everything scrubbed on the page reads the same eased scroll position.
    let lenis: Lenis | null = null;
    let tick: ((t: number) => void) | null = null;
    // `?native` turns the smoothing off, for comparing the feel or for automated checks that set the scroll position directly.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !new URLSearchParams(window.location.search).has('native')) {
      lenis = new Lenis({ lerp: 0.1, anchors: true });
      lenis.on('scroll', ScrollTrigger.update);
      tick = (t) => lenis?.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    // On a phone a bar with the one action appears once the first screen has gone, and leaves for the final invitation.
    let on = false;
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: () => {
        const final = document.querySelector('.lp2-final')?.getBoundingClientRect().top ?? Infinity;
        const show = window.scrollY > window.innerHeight * 0.9 && final > window.innerHeight * 0.7;
        if (show !== on) {
          on = show;
          cta.current?.classList.toggle('is-on', show);
        }
      },
    });

    // Layout settles when fonts and photos arrive; every pinned and scrubbed section re-measures then.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh).catch(() => undefined);

    // A link from another page (/#faq) lands on the section once the pinned rooms above it have measured themselves, which the browser's own
    // jump cannot wait for.
    const hash = window.location.hash;
    const jump = window.setTimeout(() => {
      ScrollTrigger.refresh();
      const target = hash.length > 1 ? document.querySelector<HTMLElement>(hash) : null;
      if (!target) return;
      if (lenis) lenis.scrollTo(target, { immediate: true });
      else target.scrollIntoView();
    }, 700);
    return () => {
      st.kill();
      window.clearTimeout(jump);
      window.removeEventListener('load', refresh);
      if (tick) gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis?.destroy();
    };
  }, []);

  return (
    <>
      <a href="#lp2-main" className="skip-link">
        Skip to content
      </a>
      <SiteNav />

      <main id="lp2-main" className="lp2">
        <div className="lp2-curtain">
          <PvHero />
          <PvShould />
        </div>
        <PvMoments />
        <PvStory />
        <PvBand />
        <Faq />
        <PvFinal />
      </main>
      <Footer />

      <Link to="/app" className="lp2-sticky-cta" ref={cta} aria-label="Start a Pact">
        Start a Pact <ArrowRightIcon aria-hidden />
      </Link>
    </>
  );
}
