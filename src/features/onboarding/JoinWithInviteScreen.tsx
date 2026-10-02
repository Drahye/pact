import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { TopBar } from '../../components/ui/TopBar';
import { Screen } from '../../pages/app/Screen';
import { parseInvite } from './invite';

/** For someone who has an invite but not the link open: paste the link or type the code. A real link skips this screen. */
export function JoinWithInviteScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = parseInvite(value);
    if (!code) return setError('That doesn’t look like an invite link or code. Check it and try again.');
    navigate(`/app/join/${code}`, { state: location.state });
  };

  return (
    <Screen
      topBar={<TopBar backTo="/app/home" title="Join a Pact" />}
      footer={
        <Button type="submit" form="join-invite" fullWidth disabled={!value.trim()}>
          Find my Pact
        </Button>
      }
    >
      <form id="join-invite" className="gs" onSubmit={submit} noValidate>
        <h1 className="gs__title">Paste your invite</h1>
        <p className="gs__hint">Paste the link you were sent, or type the invite code. You’ll see what the Pact is for before you join.</p>
        <Input
          label="Invite link or code"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          error={error}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          placeholder="pact.app/join/ABC123"
        />
      </form>
    </Screen>
  );
}
