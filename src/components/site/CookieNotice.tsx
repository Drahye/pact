import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { onOpenCookieSettings, openCookieSettings, useConsent, writeConsent } from '../../lib/consent';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import '../app/push-prompt.css';
import './cookie-notice.css';

/**
 * Cookie preferences for the public pages: a small banner until a choice is made, and a settings sheet the footer can
 * reopen. It never traps focus and never covers the page's main actions for long: both buttons dismiss it.
 * Essential cookies are not part of the choice: they are what keep PACT secure and a person signed in.
 */
export function CookieNotice() {
  const consent = useConsent();
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  // Server rendering and the first paint never show the banner: it appears after the page has loaded.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    return onOpenCookieSettings(() => setOpen(true));
  }, []);
  useEffect(() => {
    if (open) setAnalytics(consent?.analytics ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (a: boolean) => {
    writeConsent({ analytics: a });
    setOpen(false);
  };

  return (
    <>
      {ready && !consent && (
        <section className="cookie" role="region" aria-labelledby="cookie-title">
          <h2 id="cookie-title" className="cookie__title">
            Cookies on PACT
          </h2>
          <p className="cookie__text">
            We use one essential cookie to keep PACT secure and keep you signed in. Optional analytics would help us improve PACT. Right now we set none, and we’d only use them if you accept.{' '}
            <Link to="/cookies">Cookie policy</Link>
          </p>
          <div className="cookie__actions">
            <Button size="md" onClick={() => choose(true)}>
              Accept optional cookies
            </Button>
            <Button size="md" variant="secondary" onClick={() => choose(false)}>
              Essential only
            </Button>
            <button type="button" className="cookie__link" onClick={openCookieSettings}>
              Cookie settings
            </button>
          </div>
        </section>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cookie settings"
        description="Choose what PACT may store in your browser. You can change this any time from the footer."
        footer={
          <Button fullWidth onClick={() => choose(analytics)}>
            Save choices
          </Button>
        }
      >
        <ul className="cookie-prefs">
          <li className="cookie-prefs__row">
            <div className="cookie-prefs__text">
              <span id="pref-necessary" className="cookie-prefs__title">
                Essential
              </span>
              <span className="cookie-prefs__hint">Keeps PACT secure and keeps you signed in. Always on, because PACT can’t work without it.</span>
            </div>
            <span className="switch is-on is-locked" role="switch" aria-checked="true" aria-disabled="true" aria-labelledby="pref-necessary" tabIndex={0}>
              <span className="switch__thumb" aria-hidden />
              <span className="visually-hidden">Always on</span>
            </span>
          </li>
          <li className="cookie-prefs__row">
            <div className="cookie-prefs__text">
              <span id="pref-analytics" className="cookie-prefs__title">
                Optional analytics
              </span>
              <span className="cookie-prefs__hint">Today PACT sets no analytics cookies. If we add any, this choice decides whether they run.</span>
            </div>
            <button type="button" role="switch" aria-checked={analytics} aria-labelledby="pref-analytics" className={`switch ${analytics ? 'is-on' : ''}`} onClick={() => setAnalytics((a) => !a)}>
              <span className="switch__thumb" aria-hidden />
              <span className="visually-hidden">{analytics ? 'On' : 'Off'}</span>
            </button>
          </li>
        </ul>
      </Modal>
    </>
  );
}
