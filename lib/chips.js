// THE CHIP (2026-10-20, Donovan: "all our chips ... the very tiny ... ones ... so it fits well on the screen"; SHAPE 2026-10-22,
// the chip audit (scripts/check-chips.mjs): "whichever best matches the world and the cards we post on X" -- the X cards' chip
// (lib/cards/posterKit.js Chip) is an OVAL, so this is the small even oval). One look for every small choice on the site (a view,
// a lens, a filter, a 3D camera): a flat oval, 10px capitals, about 22px tall. On a touch screen the thumb still gets 44px: give the button className={FLAT_CHIP_CLASS}
// (app/globals.css .tap-box draws an invisible 44px-tall hit area around it). The accent and the theme come from the caller.
import { alpha } from './scales'

export const FLAT_CHIP_CLASS = 'tap-box'
export function flatChip(on, accent, theme, numFont, { disabled = false } = {}) {
  return {
    minHeight: 0, padding: '5px 10px', borderRadius: 999, cursor: disabled ? 'default' : 'pointer', flex: '0 0 auto',
    border: `1px solid ${on ? accent : theme.border2 || theme.border}`, background: on ? alpha(accent, 0.14) : 'transparent',
    color: on ? accent : theme.text2, font: `800 10px/1.1 ${numFont}`, letterSpacing: '.07em', textTransform: 'uppercase',
    whiteSpace: 'nowrap', opacity: disabled ? 0.45 : 1, display: 'inline-flex', alignItems: 'center', gap: 5,
  }
}

/** A <select> drawn as the same chip (a long list -- 30 clubs, a night's games -- that would be too many chips). Put the ▾ in a
 *  sibling: chipCaret(on, accent, theme). Same 44px tap through FLAT_CHIP_CLASS. */
export function chipSelect(on, accent, theme, numFont) {
  return { ...flatChip(on, accent, theme, numFont), appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 22, outline: 'none', maxWidth: '100%', textOverflow: 'ellipsis', overflow: 'hidden' }
}
export const chipCaret = (on, accent, theme) => ({ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: on ? accent : theme.text3, pointerEvents: 'none' })
