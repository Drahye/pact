import { ArrowRight, Check, Download, Share, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import type { Platform } from '../../components/site/StoreButtons';
import { IosInstallSheet } from '../../components/pwa/InstallPactPrompt';
import { Button } from '../../components/ui/Button';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { isIos } from '../../lib/pwaInstallRules';
import { Segmented } from '../../components/ui/Segmented';
import { gsap, MQ, useGSAP } from '../../lib/gsap';
import '../site/landing.css';
import { CompleteDemo } from '../site/mockups/CompleteDemo';
import { ExecuteDemo } from '../site/mockups/ExecuteDemo';
import { PhoneFrame } from '../site/mockups/PhoneFrame';
import './download.css';
import { setFixedClock } from '../../lib/clock';

const detectPlatform = (): Platform => (isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints) ? 'ios' : 'android');

const perks = ['Start a plan in three details', 'Everyone brings money, a task, or both', 'Pay for the plan straight from the Pact'];

export function DownloadPage() {
  // Showcase numbers stay pinned to the launch date.
  setFixedClock(true);
  const [params] = useSearchParams();
  const [platform, setPlatform] = useState<Platform>(() => (params.get('platform') as Platform) || detectPlatform());
  const [iosOpen, setIosOpen] = useState(false);
  const [asked, setAsked] = useState<'dismissed' | null>(null);
  const pwa = usePwaInstall();
  const [qr, setQr] = useState('');
  const root = useRef<HTMLElement>(null);
  const stack = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'PACT · Install the app';
    window.scrollTo(0, 0);
    QRCode.toDataURL(`${window.location.origin}/app`, { margin: 0, width: 240, color: { dark: '#0f1713', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        gsap.from('.dl__reveal', { y: 30, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', delay: 0.1 });
        gsap.from('.dl__phone', { y: 120, rotateX: 25, opacity: 0, stagger: 0.15, duration: 1.4, ease: 'expo.out', delay: 0.2 });
        gsap.to('.dl__shape', { y: -18, rotate: '+=20', duration: 3, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.6 });

        // Gesture: the phones tilt toward the pointer (or finger).
        const el = stack.current!;
        const rx = gsap.quickTo(el, 'rotateX', { duration: 0.8, ease: 'power3.out' });
        const ry = gsap.quickTo(el, 'rotateY', { duration: 0.8, ease: 'power3.out' });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - (r.left + r.width / 2)) / r.width;
          const y = (e.clientY - (r.top + r.height / 2)) / r.height;
          ry(Math.max(-1, Math.min(1, x)) * 18);
          rx(Math.max(-1, Math.min(1, y)) * -12);
        };
        const reset = () => {
          rx(0);
          ry(0);
        };
        window.addEventListener('pointermove', move);
        document.addEventListener('pointerleave', reset);
        return () => {
          window.removeEventListener('pointermove', move);
          document.removeEventListener('pointerleave', reset);
        };
      });
    },
    { scope: root },
  );

  return (
    <>
      <SiteNav />
      <main className="landing dl" ref={root}>
        <section className="dl__hero">
          <div className="container dl__grid">
            <div className="dl__copy">
              <h1 className="dl__title dl__reveal">
                <span>Install PACT</span> <span>on your phone.</span>
              </h1>
              <p className="dl__lede dl__reveal">Add PACT to your Home Screen for a full-screen app experience. No app store required.</p>

              <div className="dl__platform dl__reveal">
                <Segmented<Platform>
                  label="Your phone"
                  value={platform}
                  onChange={setPlatform}
                  options={[
                    { value: 'ios', label: 'iPhone' },
                    { value: 'android', label: 'Android' },
                  ]}
                />
              </div>

              <div className="dl__install dl__reveal">
                {pwa.installed ? (
                  <p className="dl__install-note">PACT is installed on this device. Open it from your Home Screen.</p>
                ) : platform === 'ios' ? (
                  <>
                    <Button iconLeft={<Share />} onClick={() => setIosOpen(true)}>
                      Add to Home Screen
                    </Button>
                    {!pwa.needsIosSteps && <p className="dl__install-note">Open this page on your iPhone to add it. Scan the code below.</p>}
                  </>
                ) : pwa.canInstall ? (
                  <Button
                    iconLeft={<Download />}
                    onClick={async () => setAsked((await pwa.install()) === 'dismissed' ? 'dismissed' : null)}
                  >
                    Install PACT
                  </Button>
                ) : (
                  <p className="dl__install-note">Open PACT in Chrome, then choose <strong>Install app</strong> or <strong>Add to Home Screen</strong> from the browser menu.</p>
                )}
                {asked === 'dismissed' && <p className="dl__install-note">No problem. You can install any time from here, or from Profile in the app.</p>}
              </div>

              <ul className="dl__perks dl__reveal">
                {perks.map((p) => (
                  <li key={p}>
                    <span aria-hidden>
                      <Check strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>

              <div className="dl__qr dl__reveal">
                {qr ? <img src={qr} alt="QR code that opens PACT on your phone" width={120} height={120} /> : <Smartphone aria-hidden />}
                <div>
                  <p className="dl__qr-title">On a computer?</p>
                  <p className="dl__qr-body">Scan with your phone’s camera to open PACT there.</p>
                </div>
              </div>
            </div>

            <div className="dl__visual" aria-hidden>
              <span className="dl__shape dl__shape--sun" />
              <span className="dl__shape dl__shape--sky" />
              <span className="dl__shape dl__shape--pink" />
              <div className="dl__stack" ref={stack}>
                <div className="dl__phone dl__phone--back">
                  <PhoneFrame label="PACT using the Pact's money: the venue is paid and the cake payment is pending.">
                    <ExecuteDemo t={0.62} />
                  </PhoneFrame>
                </div>
                <div className="dl__phone dl__phone--front">
                  <PhoneFrame label="PACT showing a completed Pact: We made it happen.">
                    <CompleteDemo t={1} />
                  </PhoneFrame>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="dl__try">
          <div className="container dl__try-inner">
            <p>
              <strong>Want to see it first?</strong> The full app runs in your browser, with the same screens and the same flow.
            </p>
            <Button to="/app" variant="inverse" iconRight={<ArrowRight />}>
              Open the web app
            </Button>
          </div>
        </section>
      </main>
      <Footer />

      <IosInstallSheet open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}
