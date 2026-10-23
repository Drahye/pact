import { Check } from 'lucide-react';
import { coversFor, coverUrl } from '../../lib/covers';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import './cover-sheet.css';

/**
 * Choose what a Pact looks like: twenty photographs, the ones that suit this kind of occasion first. Picking one applies it at once; "Use the
 * usual one" goes back to the default for its kind.
 */
export function CoverSheet({ open, onClose, category, current, onPick, busy }: { open: boolean; onClose: () => void; category: string; current: string | null | undefined; onPick: (key: string | null) => void; busy?: boolean }) {
  const list = coversFor(category);
  return (
    <Modal open={open} onClose={onClose} title="Choose a cover" description="A photograph for this Pact. Everyone in it sees it." footer={<Button variant="secondary" fullWidth onClick={() => onPick(null)} disabled={busy || !current}>Use the usual one</Button>}>
      <ul className="cover-grid" aria-label="Cover photographs">
        {list.map((c) => (
          <li key={c.key}>
            <button type="button" className={`cover-grid__item ${current === c.key ? 'is-on' : ''}`} aria-pressed={current === c.key} disabled={busy} onClick={() => onPick(c.key)}>
              <img src={coverUrl(c.key)} alt="" loading="lazy" decoding="async" />
              <span>{c.label}</span>
              {current === c.key && (
                <i aria-hidden>
                  <Check strokeWidth={3} />
                </i>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
