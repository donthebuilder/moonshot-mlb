// THE FLAT CHIP (2026-10-20, Donovan: "all our chips ... the very tiny square ones ... so it fits well on the screen").
// One look for every small choice on the site (a view, a lens, a filter, a 3D camera): a flat, square-cornered chip, 10px
// capitals, about 22px tall. On a touch screen the thumb still gets 44px: give the button className={FLAT_CHIP_CLASS}
// (app/globals.css .tap-box draws an invisible 44px-tall hit area around it). The accent and the theme come from the caller.
import { alpha } from './scales'

export const FLAT_CHIP_CLASS = 'tap-box'
// THE CHIP MARK (2026-10-21, chips batch): '--chip' rides in the inline style so app/globals.css can give every flat chip button
// its 44px thumb target on a touch screen without the caller adding a class. It used to key on "border-radius: 999px", which
// only the round pills had; the flat chip is square, so it needs a mark of its own. It sets nothing visible.
export const CHIP_MARK = { '--chip': '1' }
export function flatChip(on, accent, theme, numFont, { disabled = false } = {}) {
  return {
    ...CHIP_MARK,
    minHeight: 0, padding: '5px 8px', borderRadius: 3, cursor: disabled ? 'default' : 'pointer', flex: '0 0 auto',
    border: `1px solid ${on ? accent : theme.border2 || theme.border}`, background: on ? alpha(accent, 0.14) : 'transparent',
    color: on ? accent : theme.text2, font: `800 10px/1.1 ${numFont}`, letterSpacing: '.07em', textTransform: 'uppercase',
    whiteSpace: 'nowrap', opacity: disabled ? 0.45 : 1, display: 'inline-flex', alignItems: 'center', gap: 5,
  }
}
