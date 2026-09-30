import { Camera, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { usePhoto, usePlan } from '../../api/hooks';
import type { Pact } from '../../data/types';
import { getUser } from '../../data/users';
import { isoDay } from '../../lib/dates';
import { formatDate } from '../../lib/format';
import { Button } from '../ui/Button';
import { clearDraft, readDraft, useSaveDraft } from '../../lib/drafts';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import './memory.css';

const MAX_PHOTOS = 6;
const ACCEPT = 'image/jpeg,image/png,image/webp';

function Photo({ pactId, photoId, onOpen }: { pactId: string; photoId: string; onOpen?: () => void }) {
  const q = usePhoto(pactId, photoId);
  return (
    <button type="button" className="memory__photo" onClick={onOpen} aria-label="Open photo">
      {q.data ? <img src={q.data} alt="" loading="lazy" /> : <span className="skeleton memory__skeleton" />}
    </button>
  );
}

/** The record of what the group did: a note, the day, and up to six private photos. */
export function MemorySection({ pact, meId }: { pact: Pact; meId: string }) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const plan = usePlan(pact.id);
  const toast = useToast();
  const isOrganizer = pact.organizerId === meId;
  const m = pact.memory;
  const viewUrl = usePhoto(pact.id, viewing ?? '').data;

  if (!m && !isOrganizer) {
    return (
      <section className="memory memory--empty" aria-label="Memory">
        <Camera aria-hidden />
        <p>{getUser(pact.organizerId).name} can add photos and a note once it happens.</p>
      </section>
    );
  }

  return (
    <section className="memory" aria-labelledby="memory-title">
      <div className="memory__head">
        <h2 id="memory-title" className="section-heading__title">
          The memory
        </h2>
        {isOrganizer && m && (
          <button type="button" className="memory__edit" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Edit
          </button>
        )}
      </div>
      {m ? (
        <>
          {m.happenedOn && <p className="memory__date">It happened on {formatDate(m.happenedOn, { weekday: 'long', month: 'long', day: 'numeric' })}.</p>}
          {m.note && <p className="memory__note">{m.note}</p>}
          {m.photoIds.length > 0 && (
            <div className="memory__grid">
              {m.photoIds.map((id) => (
                <Photo key={id} pactId={pact.id} photoId={id} onOpen={() => setViewing(id)} />
              ))}
            </div>
          )}
        </>
      ) : (
        <button type="button" className="memory__add" onClick={() => setEditing(true)}>
          <ImagePlus aria-hidden />
          <span>
            <strong>Add the memory</strong>
            <span>A few photos and a line about how it went. Only people in this Pact can see it.</span>
          </span>
        </button>
      )}

      <MemorySheet pact={pact} open={editing} onClose={() => setEditing(false)} />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={pact.title} description={m?.happenedOn ? formatDate(m.happenedOn) : undefined}>
        {viewing && (
          <div className="memory__view">
            {viewUrl ? <img src={viewUrl} alt="" /> : <span className="skeleton memory__skeleton" />}
            {isOrganizer && (
              <Button
                variant="secondary"
                size="md"
                iconLeft={<Trash2 />}
                onClick={async () => {
                  try {
                    await plan.deletePhoto.mutateAsync(viewing);
                    setViewing(null);
                    toast('Photo removed');
                  } catch (err) {
                    toast((err as ApiError).message, 'neutral');
                  }
                }}
              >
                Remove photo
              </Button>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

function MemorySheet({ pact, open, onClose }: { pact: Pact; open: boolean; onClose: () => void }) {
  const plan = usePlan(pact.id);
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [day, setDay] = useState('');
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string>();
  const photos = pact.memory?.photoIds ?? [];
  // Words typed but not saved come back if the sheet is closed or the page reloads.
  const draftKey = `memory.${pact.id}`;
  useEffect(() => {
    if (open) {
      const d = readDraft<{ note: string; day: string }>(draftKey);
      setNote(d?.note ?? pact.memory?.note ?? '');
      setDay(d?.day ?? pact.memory?.happenedOn ?? '');
      setError(undefined);
    }
  }, [open, pact.memory, draftKey]);
  useSaveDraft(draftKey, { note, day }, note === (pact.memory?.note ?? '') && day === (pact.memory?.happenedOn ?? ''), open);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(undefined);
    const room = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Only ${MAX_PHOTOS} photos fit. The first ${room} were added.`);
    for (const f of list) {
      // Checked properly on the server; this just saves a wasted upload.
      if (!ACCEPT.split(',').includes(f.type)) {
        setError('Use JPEG, PNG or WebP photos.');
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        setError('Each photo needs to be under 8 MB.');
        continue;
      }
      setUploading((n) => n + 1);
      try {
        await plan.addPhoto.mutateAsync(f);
      } catch (err) {
        setError((err as ApiError).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (file.current) file.current.value = '';
  };

  const save = async () => {
    try {
      await plan.saveMemory.mutateAsync({ note: note.trim() || null, happenedOn: day || null });
      clearDraft(draftKey);
      toast('Memory saved');
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="The memory"
      description="Only people in this Pact can see it."
      footer={
        <Button fullWidth onClick={save} loading={plan.saveMemory.isPending} disabled={uploading > 0}>
          {uploading ? 'Uploading…' : 'Save'}
        </Button>
      }
    >
      <div className="sheet-form">
        <Input label="When did it happen?" autoComplete="off" type="date" max={isoDay(new Date())} value={day} onChange={(e) => setDay(e.target.value)} />
        <div className="field">
          <label className="field__label" htmlFor="memory-note">
            How did it go?
          </label>
          <textarea
            id="memory-note"
            className="memory__textarea"
            maxLength={500}
            rows={3}
            placeholder="Sarah cried twice. The cake survived the drive."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="field__hint">{500 - note.length} characters left</p>
        </div>
        <div className="field">
          <span className="field__label">
            Photos · {photos.length}/{MAX_PHOTOS}
          </span>
          <div className="memory__grid memory__grid--edit">
            {photos.map((id) => (
              <Photo key={id} pactId={pact.id} photoId={id} />
            ))}
            {Array.from({ length: uploading }, (_, i) => (
              <span key={`u${i}`} className="memory__photo">
                <span className="skeleton memory__skeleton" />
              </span>
            ))}
            {photos.length + uploading < MAX_PHOTOS && (
              <button type="button" className="memory__photo memory__photo--add" onClick={() => file.current?.click()}>
                <ImagePlus aria-hidden />
                <span>Add</span>
              </button>
            )}
          </div>
          <input ref={file} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void pick(e.target.files)} />
          <p className="field__hint">JPEG, PNG or WebP. Location data is removed from every photo.</p>
        </div>
        {error && <p className="field__error">{error}</p>}
      </div>
    </Modal>
  );
}
