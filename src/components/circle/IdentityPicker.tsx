import { useId, useState } from 'react';
import { CIRCLE_TINTS, type CircleTint } from '../../../shared/contracts';
import './circle.css';

export const SUGGESTED_EMOJI = ['🍻', '❤️', '💐', '⚡', '🏠', '⚽', '🎓', '✈️', '🎉', '💼', '🍕', '🌍', '🙏🏾', '🎶', '👑', '🔥'];
const TINT_NAME: Record<CircleTint, string> = { mint: 'Green', sun: 'Yellow', sky: 'Blue', lilac: 'Purple', pink: 'Pink', coral: 'Orange' };

const isEmoji = (v: string) => /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(v) && !/[A-Za-z0-9<>]/.test(v);

/** Pick an emoji from a short list, or type your own. */
export function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [custom, setCustom] = useState('');
  return (
    <div className="idpick">
      <div role="radiogroup" aria-label="Emoji" className="idpick__grid">
        {SUGGESTED_EMOJI.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={value === e} aria-label={`Use ${e}`} className={`idpick__emoji ${value === e ? 'is-on' : ''}`} onClick={() => onChange(e)}>
            <span aria-hidden>{e}</span>
          </button>
        ))}
      </div>
      <label htmlFor={id} className="idpick__label">
        Or type your own
      </label>
      <input
        id={id}
        className="idpick__input"
        value={custom}
        maxLength={8}
        inputMode="text"
        placeholder="🙂"
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value.trim();
          setCustom(e.target.value);
          if (v && isEmoji(v)) onChange(v);
        }}
      />
    </div>
  );
}

/** Colour is never the only signal: each swatch carries its name for screen readers. */
export function TintPicker({ value, onChange }: { value: CircleTint; onChange: (v: CircleTint) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour" className="idpick__tints">
      {CIRCLE_TINTS.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={value === t} aria-label={TINT_NAME[t]} className={`idpick__tint tint--${t} ${value === t ? 'is-on' : ''}`} onClick={() => onChange(t)}>
          <span aria-hidden />
        </button>
      ))}
    </div>
  );
}
