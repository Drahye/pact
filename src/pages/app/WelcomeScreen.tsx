import { Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PactLogo } from '../../components/brand/PactLogo';
import { Modal } from '../../components/ui/Modal';
import { setReturnTo } from './auth/flow';
import { IntroVisual } from './auth/IntroVisual';
import { Hero, Sheet } from '../../components/objects';
import { coverUrl } from '../../lib/covers';
import { Screen } from './Screen';
import './welcome.css';

/** The moments people start with, one after another behind the hero. */
const WELCOME_PHOTOS = ['wedding-aso-ebi', 'trip-beach', 'dinner-women'] as const;

/** Accepts a full invite link, a path, or just the code. */
export const parseInviteCode = (raw: string) => {
  const m = raw.trim().match(/(?:join\/)?([A-Za-z0-9]{6,12})\/?$/);
  return m ? m[1].toUpperCase() : null;
};

/**
 * The first moment: what PACT is, before anything is asked of anyone. Get started and Sign in both lead to the same two doors.
 */
export function WelcomeScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [joinOpen, setJoinOpen] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string>();

  // Came here from a protected screen: go back there after signing in.
  useEffect(() => {
    setReturnTo((location.state as { from?: string } | null)?.from);
  }, [location.state]);

  const join = () => {
    const code = parseInviteCode(link);
    if (!code) return setError('That doesn’t look like a PACT invite. Paste the whole link.');
    setJoinOpen(false);
    navigate(`/app/join/${code}`);
  };

  return (
    <Screen
      className="welcome welcome--intro xhero xhero--home"
      footer={
        <div className="intro-actions">
          <Button to="/app/auth/start" fullWidth size="lg">
            Get started
          </Button>
          <p className="intro-actions__signin">
            Already have an account? <Link to="/app/auth/signin">Sign in</Link>
          </p>
        </div>
      }
    >
      <Hero
        className="xh--home xh--welcome"
        backdrop={
          <div className="welcome__bgs" aria-hidden>
            {WELCOME_PHOTOS.map((name, i) => (
              <img key={name} className="welcome__bg" style={{ animationDelay: `${i * 6 - 1}s` }} src={coverUrl(name)} alt="" decoding="async" />
            ))}
          </div>
        }
      >
        <div className="welcome__top">
          <PactLogo size="md" tone="light" />
        </div>
        <IntroVisual />
      </Hero>
      <Sheet className="intro">
        <h1 className="intro__title">
          Life is better when <span className="welcome__pill">everyone</span> shows up.
        </h1>
        <p className="intro__lede">Plan the trip, the owambe, the gift and the dinner with your people, and actually make it happen.</p>
        <p className="intro__invite">
          <button type="button" className="link" onClick={() => setJoinOpen(true)}>
            Have an invite link?
          </button>
        </p>
      </Sheet>

      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join with invite"
        description="Paste the link someone shared with you."
        footer={
          <Button fullWidth onClick={join}>
            Continue
          </Button>
        }
      >
        <Input
          label="Invite link"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(undefined);
          }}
          leading={<Link2 />}
          error={error}
          placeholder="pact.app/app/join/K7M2Q9XR"
          hint="Or just the invite code"
          autoComplete="off"
          spellCheck={false}
        />
      </Modal>
    </Screen>
  );
}
