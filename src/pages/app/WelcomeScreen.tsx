import { FlaskConical, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../api/auth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Logo } from '../../components/ui/Logo';
import { Modal } from '../../components/ui/Modal';
import { setReturnTo } from './auth/flow';
import { Screen } from './Screen';
import { WelcomeVisual } from './WelcomeVisual';
import './welcome.css';

/** Accepts a full invite link, a path, or just the code. */
export const parseInviteCode = (raw: string) => {
  const m = raw.trim().match(/(?:join\/)?([A-Za-z0-9]{6,12})\/?$/);
  return m ? m[1].toUpperCase() : null;
};

export function WelcomeScreen() {
  const { config } = useAuth();
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
      className="welcome"
      footer={
        <>
          <Button to="/app/auth/phone" fullWidth>
            Get started
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setJoinOpen(true)}>
            Join with invite
          </Button>
        </>
      }
    >
      <div className="welcome__top">
        <Logo size="sm" />
        <Button variant="ghost" size="sm" to="/app/auth/phone">
          Sign in
        </Button>
      </div>
      <div className="welcome__visual">
        <WelcomeVisual />
      </div>
      <div className="welcome__copy">
        <h1 className="welcome__title">
          Money works <span className="welcome__pill">better</span> together.
        </h1>
        <p className="welcome__lede">Create a shared goal, invite your people, and watch everyone move closer to the finish line.</p>
        {config?.deployEnv === 'staging' && (
          <span className="sandbox-tag">
            <FlaskConical aria-hidden /> Sandbox beta: no real money moves
          </span>
        )}
      </div>

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
          hint="Or just the 8-character code"
          autoComplete="off"
          spellCheck={false}
        />
      </Modal>
    </Screen>
  );
}
