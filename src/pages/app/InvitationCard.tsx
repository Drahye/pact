import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { usePactCommand } from '../../api/hooks';
import { CategoryIcon } from '../../components/pact/category';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import type { Pact } from '../../data/types';
import { getUser } from '../../data/users';
import { formatDaysLeft, formatNaira } from '../../lib/format';
import { summarize } from '../../lib/pact';
import './invitation.css';

export function InvitationCard({ pact }: { pact: Pact }) {
  const { accept, leave } = usePactCommand(pact.id);
  const toast = useToast();
  const navigate = useNavigate();
  const s = summarize(pact);
  const onAccept = async () => {
    try {
      await accept.mutateAsync();
      toast(`You joined ${pact.title}`);
      navigate(`/app/pact/${pact.id}`);
    } catch (err) {
      toast((err as ApiError).message, 'neutral');
    }
  };
  return (
    <article className="invitation">
      <div className="invitation__top">
        <CategoryIcon category={pact.category} />
        <div>
          <p className="invitation__title">{pact.title}</p>
          <p className="invitation__meta num">
            {getUser(pact.organizerId).name} · {formatNaira(s.target)} · {formatDaysLeft(s.daysLeft)}
          </p>
        </div>
      </div>
      <div className="invitation__actions">
        <Button size="md" variant="secondary" onClick={() => leave.mutate()} loading={leave.isPending}>
          Decline
        </Button>
        <Button size="md" onClick={onAccept} loading={accept.isPending}>
          Join
        </Button>
      </div>
    </article>
  );
}
