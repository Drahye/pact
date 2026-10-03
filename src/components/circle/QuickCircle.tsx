import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useCreateCircle } from '../../api/circles';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

/**
 * For someone with no Circle yet, inside a create flow: name one right here and carry on, so what they typed is never lost.
 * (The full Circle screen, with emoji, colour and invites, stays one tap away from Circles.)
 */
export function QuickCircle({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useCreateCircle();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const make = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Give your Circle a name.');
    setError(undefined);
    try {
      const r = await create.mutateAsync({ name: trimmed, emoji: '🙌', tint: 'mint' });
      onCreated(r.data.id);
    } catch (e) {
      setError((e as ApiError).message);
    }
  };
  return (
    <div className="ca__opts">
      <p>A Circle is the group this is for. Name yours and carry on. You can invite people after.</p>
      <Input label="Circle name" value={name} maxLength={40} autoComplete="off" placeholder="The Boys" onChange={(e) => setName(e.target.value)} error={error} />
      <Button variant="secondary" loading={create.isPending} onClick={make}>
        Create Circle
      </Button>
    </div>
  );
}
