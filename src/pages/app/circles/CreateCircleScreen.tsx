import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CircleTint } from '../../../../shared/contracts';
import { ApiError } from '../../../api/client';
import { useCreateCircle, useEnsureInvite } from '../../../api/circles';
import { CircleBadge } from '../../../components/circle/CircleBadge';
import { EmojiPicker, TintPicker } from '../../../components/circle/IdentityPicker';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { TopBar } from '../../../components/ui/TopBar';
import { useToast } from '../../../components/ui/Toast';
import { shareCircle } from '../../../lib/circleShare';
import { Screen } from '../Screen';
import '../../../components/circle/circle.css';

type Step = 'name' | 'emoji' | 'color' | 'invite';
const ORDER: Step[] = ['name', 'emoji', 'color', 'invite'];

/** Four light steps. The Circle exists after the third; inviting is the fourth and never forced. */
export function CreateCircleScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateCircle();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🍻');
  const [tint, setTint] = useState<CircleTint>('mint');
  const [made, setMade] = useState<{ id: string; token: string | null } | null>(null);
  const [error, setError] = useState<string>();
  const ensure = useEnsureInvite(made?.id ?? '');

  const idx = ORDER.indexOf(step);
  const trimmed = name.trim();
  const back = () => (idx === 0 || step === 'invite' ? navigate(made ? `/app/circles/${made.id}` : '/app/circles') : setStep(ORDER[idx - 1]));

  const next = async () => {
    setError(undefined);
    if (step === 'name' && !trimmed) return setError('Give your Circle a name.');
    if (step === 'color') {
      try {
        const r = await create.mutateAsync({ name: trimmed, emoji, tint });
        setMade({ id: r.data.id, token: r.data.invite?.token ?? null });
        setStep('invite');
      } catch (e) {
        setError((e as ApiError).message);
      }
      return;
    }
    setStep(ORDER[idx + 1]);
  };

  const share = async () => {
    if (!made) return;
    let token = made.token;
    if (!token) {
      try {
        token = (await ensure.mutateAsync()).data.invite?.token ?? null;
        setMade({ ...made, token });
      } catch (e) {
        return toast((e as ApiError).message, 'neutral');
      }
    }
    if (!token) return;
    const r = await shareCircle(token, trimmed);
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Couldn’t share. Try again.', 'neutral');
  };

  const heading = { name: 'Name your Circle', emoji: 'Pick an emoji', color: 'Pick a colour', invite: 'Invite your people' }[step];
  const sub = {
    name: 'The group you plan things with. Like “The Boys” or “Family”.',
    emoji: 'It’s how the Circle shows up everywhere.',
    color: 'Just for fun. Pick the one that feels like them.',
    invite: 'Share the link in your group chat. Anyone with it can join.',
  }[step];

  return (
    <Screen
      topBar={<TopBar leading={step === 'invite' ? 'close' : 'back'} onBack={back} title={`Step ${idx + 1} of 4`} />}
      footer={
        step === 'invite' ? (
          <>
            <Button fullWidth iconLeft={<Share2 />} onClick={share} loading={ensure.isPending}>
              Share invite link
            </Button>
            <Button fullWidth variant="ghost" onClick={() => navigate(`/app/circles/${made!.id}`, { replace: true })}>
              Skip for now
            </Button>
          </>
        ) : (
          <Button fullWidth onClick={next} loading={create.isPending} disabled={step === 'name' && !trimmed}>
            {step === 'color' ? 'Create Circle' : 'Next'}
          </Button>
        )
      }
    >
      <div className="cc">
        <div className="cc__preview" aria-live="polite">
          <CircleBadge emoji={emoji} tint={tint} size="xl" />
          <p className="cc__name">{trimmed || 'Your Circle'}</p>
        </div>
        <h1 className="large-title cc__title">{heading}</h1>
        <p className="cc__sub">{sub}</p>

        {step === 'name' && (
          <Input
            label="Circle name"
            value={name}
            maxLength={40}
            autoFocus
            placeholder="The Boys"
            autoComplete="off"
            enterKeyHint="next"
            error={error}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void next()}
          />
        )}
        {step === 'emoji' && <EmojiPicker value={emoji} onChange={setEmoji} />}
        {step === 'color' && <TintPicker value={tint} onChange={setTint} />}
        {step === 'invite' && (
          <div className="cc__ready">
            <p className="cc__ready-title">
              <Check aria-hidden /> Your Circle is ready.
            </p>
            {made?.token && (
              <Button variant="secondary" fullWidth iconLeft={<Copy />} onClick={async () => (await shareCircle(made.token!, trimmed)) === 'copied' && toast('Link copied')}>
                Copy link
              </Button>
            )}
          </div>
        )}
        {error && step !== 'name' && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Screen>
  );
}
