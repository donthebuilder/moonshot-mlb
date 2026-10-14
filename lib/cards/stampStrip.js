// THE STAMP STRIP (server only, JSX): up to two small situation-stamp chips (lib/cards/situations.js) on the card FRONT, laid over the bottom-left of the portrait.
// Type is fitted with lib/cards/stampLayout.js (22px floor, real font metrics). Chips are plain facts ("Goal in 5 straight", "Division Series"); the status word, the
// score and the rank on the card are never touched by them.
import { alpha, INK, CHASSIS } from './cardKit'
import { layoutStamps, CHIP } from './stampLayout'

/** The strip as an element, absolutely placed at the portrait's bottom-left; null when there are no stamps. */
export function StampStrip({ stamps, maxW = 940, left = 26, bottom = 16, accent, flow = false, compact = false }) {
  const chips = layoutStamps(stamps, { maxW, maxSize: compact ? 24 : Infinity, id: compact ? 'shared-stamp' : 'stamps' })
  if (!chips.length) return null
  return (
    <div style={flow ? { display: 'flex', gap: CHIP.gap } : { display: 'flex', position: 'absolute', left, bottom, gap: CHIP.gap }}>
      {chips.map((c) => (
        <span key={c.text} style={{ display: 'flex', fontSize: c.size, fontWeight: 800, letterSpacing: CHIP.ls, color: INK, background: alpha(CHASSIS.bg, 0.78), borderStyle: 'solid', borderWidth: '2px 2px 2px 6px', borderColor: `${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${accent}`, padding: compact ? '2px 14px' : '6px 14px', whiteSpace: 'nowrap' }}>{c.text}</span>
      ))}
    </div>
  )
}

/** The height a shared stamp line takes in a card's flow: the chip (22px type, 2px padding and 2px borders) and the room above it. */
export const SHARED_H = 40

/** THE SHARED STAMP LINE of a two-man / N-man card: one chip, in flow, under the title (lib/cards/situations.js sharedStampOf). null when there is no text. */
export function SharedStamp({ text, accent, maxW }) {
  const t = String(text || '').trim()
  if (!t) return null
  return (
    <div style={{ display: 'flex', height: SHARED_H, alignItems: 'flex-end' }}>
      <StampStrip stamps={[t]} accent={accent} maxW={maxW} flow compact />
    </div>
  )
}
