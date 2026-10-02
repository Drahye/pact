import { Download, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { api } from '../../api/client';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { onPwaEvent } from '../../lib/pwaInstall';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import './install.css';

/** The three steps on iPhone and iPad. We cannot open this dialog for them, so we show how. */
function IosSteps() {
  return (
    <ol className="install__steps">
      <li>
        <span className="install__step-icon" aria-hidden>
          <Share />
        </span>
        <span>
          Tap <strong>Share</strong> in Safari
        </span>
      </li>
      <li>
        <span className="install__step-icon" aria-hidden>
          <SquarePlus />
        </span>
        <span>
          Choose <strong>Add to Home Screen</strong>
        </span>
      </li>
      <li>
        <span className="install__step-icon" aria-hidden>
          <Download />
        </span>
        <span>
          Tap <strong>Add</strong>
        </span>
      </li>
    </ol>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** `auto` is the polite prompt (with "Not now"); `manual` is someone asking how, from /download or Profile. */
  kind?: 'auto' | 'manual';
}

/** The iPhone and iPad "Add to Home Screen" instructions. */
export function IosInstallSheet({ open, onClose, kind = 'manual' }: SheetProps) {
  const { snooze } = usePwaInstall();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === 'auto' ? 'Add PACT to your Home Screen' : 'Install PACT'}
      description={kind === 'auto' ? 'Use PACT like an app and keep your Pacts one tap away.' : 'Keep your Pacts one tap away and get the full app experience from your Home Screen.'}
      footer={
        <div className="install__footer">
          <Button fullWidth onClick={onClose}>
            Got it
          </Button>
          {kind === 'auto' && (
            <Button
              fullWidth
              variant="ghost"
              onClick={() => {
                snooze();
                onClose();
              }}
            >
              Not now
            </Button>
          )}
        </div>
      }
    >
      <IosSteps />
    </Modal>
  );
}

/** Pages where an unprompted offer would be noise: the app itself, the download page (it has its own button), tools. */
const QUIET = (p: string) => p.startsWith('/app') || p.startsWith('/download') || p.startsWith('/styleguide') || p.startsWith('/dev');
const AFTER_MS = 8000;
const AFTER_SCROLL = 600;

/**
 * The polite, once-in-a-while offer on the public website. It waits for a useful moment (8 seconds, or
 * a real scroll), never shows over another dialog or the cookie notice, never shows inside the installed
 * app, and stays away for a week after "Not now".
 */
export function InstallPactPrompt() {
  const { pathname } = useLocation();
  const pwa = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const eligible = pwa.available && !QUIET(pathname);

  // A useful moment: some time on the page, or a meaningful scroll. Whichever comes first.
  useEffect(() => {
    if (!eligible || pwa.snoozed()) return;
    const go = () => setReady(true);
    if (window.scrollY > AFTER_SCROLL) go();
    const t = window.setTimeout(go, AFTER_MS);
    const onScroll = () => window.scrollY > AFTER_SCROLL && go();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, pathname]);

  // Once ready, wait out anything else asking for attention. Checked again every few seconds.
  useEffect(() => {
    if (!ready || !eligible || open) return;
    const busy = () => !!document.querySelector('[role="dialog"], [aria-modal="true"], .cookie');
    const try_ = () => {
      if (!busy() && !pwa.snoozed()) setOpen(true);
    };
    try_();
    const i = window.setInterval(try_, 4000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, eligible, open]);

  // Installed (or the app was added another way): close at once.
  useEffect(() => {
    if (!eligible) setOpen(false);
  }, [eligible]);

  const close = () => setOpen(false);
  if (!open) return null;

  if (pwa.needsIosSteps && !pwa.canInstall) return <IosInstallSheet open onClose={close} kind="auto" />;

  return (
    <Modal
      open
      onClose={() => {
        pwa.snooze();
        close();
      }}
      title="Take PACT with you"
      description="Your Pacts stay one tap away from your Home Screen."
      footer={
        <div className="install__footer">
          <Button
            fullWidth
            iconLeft={<Download />}
            onClick={async () => {
              const outcome = await pwa.install();
              if (outcome === 'dismissed') pwa.snooze();
              close();
            }}
          >
            Install PACT
          </Button>
          <Button
            fullWidth
            variant="ghost"
            onClick={() => {
              pwa.snooze();
              close();
            }}
          >
            Not now
          </Button>
        </div>
      }
    >
      <p className="install__note">Opens full screen, like any app. No app store needed.</p>
    </Modal>
  );
}

/**
 * Tells the server a signed-in person started or finished installing. Nothing identifying: the server keeps a
 * pseudonym and the event name. People who are not signed in are not recorded at all.
 */
export function PwaInstallTracker() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'signedIn') return;
    return onPwaEvent((e) => {
      void api('POST', '/me/onboarding-event', { name: e === 'started' ? 'pwa_install_started' : 'pwa_install_completed' }).catch(() => undefined);
    });
  }, [status]);
  return null;
}
