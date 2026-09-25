import { ArrowRight, Check, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Footer } from '../../components/site/Footer';
import { SiteNav } from '../../components/site/SiteNav';
import { StoreButtons, type Platform } from '../../components/site/StoreButtons';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Segmented } from '../../components/ui/Segmented';
import { gsap, MQ, useGSAP } from '../../lib/gsap';
import '../site/landing.css';
import './download.css';
import { setFixedClock } from '../../lib/clock';

const detectPlatform = (): Platform => (/android/i.test(navigator.userAgent) ? 'android' : 'ios');

const perks = ['Create a Pact in three details', 'Invite anyone with one link', 'Everyone sees every naira land'];

export function DownloadPage() {
  // Showcase numbers stay pinned to the launch date.
  setFixedClock(true);
  const [params] = useSearchParams();
  const [platform, setPlatform] = useState<Platform>(() => (params.get('platform') as Platform) || detectPlatform());
  const [open, setOpen] = useState<Platform | null>(null);
  const [qr, setQr] = useState('');
  const root = useRef<HTMLElement>(null);
  const stack = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Get PACT for iOS and Android';
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
              <h1 className="dl__title dl__reveal">Get PACT on your phone.</h1>
              <p className="dl__lede dl__reveal">Create a Pact, invite your people and watch the goal fill up, on iPhone or Android.</p>

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

              <div className="dl__reveal">
                <StoreButtons onSelect={setOpen} highlight={platform} />
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
                <div className="dl__phone dl__phone--back phone">
                  <img src="/snapshots/detail.webp" alt="" />
                </div>
                <div className="dl__phone dl__phone--front phone">
                  <img src="/snapshots/home.webp" alt="" />
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

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={`PACT for ${open === 'android' ? 'Android' : 'iPhone'} is on the way`}
        description="The native apps for the App Store and Google Play are coming soon. Everything already works in the web app: sign up with your number and start a Pact today."
        footer={
          <Button to="/app" fullWidth iconRight={<ArrowRight />}>
            Open the web app
          </Button>
        }
      >
        <ul className="dl__modal-list">
          {perks.map((p) => (
            <li key={p}>
              <Check aria-hidden strokeWidth={3} /> {p}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
