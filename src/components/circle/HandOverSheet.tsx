import { useCircle } from '../../api/circles';
import { getUser } from '../../data/users';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';

/** Pick who runs it from here. Only people still in the Circle are offered. */
export function HandOverSheet({ open, onClose, circleId, currentId, onPick, busy }: { open: boolean; onClose: () => void; circleId: string; currentId: string; onPick: (userId: string) => void; busy?: boolean }) {
  const circle = useCircle(open ? circleId : undefined);
  const people = (circle.data?.members ?? []).filter((m) => m.userId !== currentId);
  return (
    <Modal open={open} onClose={onClose} title="Hand over" description="They’ll be able to edit this and run it. You’ll still be in the Circle.">
      <div className="menu" role="list">
        {people.map((m) => (
          <button key={m.userId} type="button" className="menu__row" disabled={busy} onClick={() => onPick(m.userId)}>
            <Avatar userId={m.userId} size="sm" label={false} />
            <span className="menu__text"><span className="menu__title">{getUser(m.userId).name}</span></span>
          </button>
        ))}
        {!people.length && <p>There’s nobody else in this Circle yet.</p>}
      </div>
    </Modal>
  );
}
