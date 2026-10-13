// THE STAMP STRIP (server only, JSX): up to two small situation-stamp chips (lib/cards/situations.js) on the card FRONT, laid over the bottom-left of the portrait.
// Type is fitted with lib/cards/stampLayout.js (22px floor, real font metrics). Chips are plain facts ("Goal in 5 straight", "Division Series"); the status word, the
// score and the rank on the card are never touched by them.
import { alpha, INK, CHASSIS } from './cardKit'
import { layoutStamps, CHIP } from './stampLayout'

/** The strip as an element, absolutely placed at the portrait's bottom-left; null when there are no stamps. */
export function StampStrip({ stamps, maxW = 940, left = 26, bottom = 16, accent }) {
  const chips = layoutStamps(stamps, { maxW })
  if (!chips.length) return null
  return (
    <div style={{ display: 'flex', position: 'absolute', left, bottom, gap: CHIP.gap }}>
      {chips.map((c) => (
        <span key={c.text} style={{ display: 'flex', fontSize: c.size, fontWeight: 800, letterSpacing: CHIP.ls, color: INK, background: alpha(CHASSIS.bg, 0.78), borderStyle: 'solid', borderWidth: '2px 2px 2px 6px', borderColor: `${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${accent}`, padding: '6px 14px', whiteSpace: 'nowrap' }}>{c.text}</span>
      ))}
    </div>
  )
}
