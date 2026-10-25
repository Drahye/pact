import { CIRCLE_TINTS, type CircleTint } from '../../../shared/contracts';
import { Glyph } from '../ui/Glyph';
import './circle.css';

export const SUGGESTED_EMOJI = ['🍻', '❤️', '💐', '⚡', '🏠', '⚽', '🎓', '✈️', '🎉', '💼', '🍕', '🌍', '🙏🏾', '🎶', '👑', '🔥'];
const ICON_NAME: Record<string, string> = { '🍻': 'Drinks', '❤️': 'Heart', '💐': 'Flowers', '⚡': 'Lightning', '🏠': 'Home', '⚽': 'Football', '🎓': 'Graduation', '✈️': 'Travel', '🎉': 'Celebration', '💼': 'Work', '🍕': 'Pizza', '🌍': 'World', '🙏🏾': 'Prayer', '🎶': 'Music', '👑': 'Crown', '🔥': 'Fire', '🙂': 'Smile' };
const TINT_NAME: Record<CircleTint, string> = { mint: 'Green', sun: 'Yellow', sky: 'Blue', lilac: 'Purple', pink: 'Pink', coral: 'Orange' };

/** Pick what the Circle looks like from a short list of icons. */
export function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="idpick">
      <div role="radiogroup" aria-label="Icon" className="idpick__grid">
        {SUGGESTED_EMOJI.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={value === e} aria-label={ICON_NAME[e] ?? 'Icon'} className={`idpick__emoji ${value === e ? 'is-on' : ''}`} onClick={() => onChange(e)}>
            <Glyph emoji={e} />
          </button>
        ))}
      </div>
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
