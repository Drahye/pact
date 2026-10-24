import { Camera, Check } from 'lucide-react';
import { useRef } from 'react';
import { coversFor, coverUrl } from '../../lib/covers';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import './cover-sheet.css';

/**
 * Choose what a Pact looks like: twenty photographs, the ones that suit this kind of occasion first. Picking one applies it at once; "Use the
 * usual one" goes back to the default for its kind.
 */
export function CoverSheet({ open, onClose, category, current, onPick, onUpload, who = 'Pact', busy }: { open: boolean; onClose: () => void; category: string; current: string | null | undefined; onPick: (key: string | null) => void; /** When given, the person can use a photo of their own. */ onUpload?: (file: File) => void; /** Who will see an upload: "Pact" or "Circle". */ who?: string; busy?: boolean }) {
  const list = coversFor(category);
  const file = useRef<HTMLInputElement>(null);
  return (
    <Modal open={open} onClose={onClose} title="Choose a cover" description={`A photograph for this ${who}. Everyone in it sees it.`} footer={<Button variant="secondary" fullWidth onClick={() => onPick(null)} disabled={busy || !current}>Use the usual one</Button>}>
      {onUpload && (
        <>
          <button type="button" className="cover-upload" disabled={busy} onClick={() => file.current?.click()}>
            <Camera aria-hidden />
            <span>
              <strong>Use your own photo</strong>
              <small>Only people in the {who} will see it.</small>
            </span>
          </button>
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Choose a photo from your device"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onUpload(f);
            }}
          />
        </>
      )}
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
