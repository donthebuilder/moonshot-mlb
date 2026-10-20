// THE FLAT CHIP (2026-10-20, Donovan: "all our chips ... the very tiny square ones ... so it fits well on the screen").
// One look for every small choice on the site (a view, a lens, a filter, a 3D camera): a flat, square-cornered chip, 10px
// capitals, about 22px tall. On a touch screen the thumb still gets 44px: give the button className={FLAT_CHIP_CLASS}
// (app/globals.css .tap-box draws an invisible 44px-tall hit area around it). The accent and the theme come from the caller.
import { alpha } from './scales'

export const FLAT_CHIP_CLASS = 'tap-box'
export function flatChip(on, accent, theme, numFont, { disabled = false } = {}) {
  return {
    minHeight: 0, padding: '5px 8px', borderRadius: 3, cursor: disabled ? 'default' : 'pointer', flex: '0 0 auto',
    border: `1px solid ${on ? accent : theme.border2 || theme.border}`, background: on ? alpha(accent, 0.14) : 'transparent',
    color: on ? accent : theme.text2, font: `800 10px/1.1 ${numFont}`, letterSpacing: '.07em', textTransform: 'uppercase',
    whiteSpace: 'nowrap', opacity: disabled ? 0.45 : 1, display: 'inline-flex', alignItems: 'center', gap: 5,
  }
}
