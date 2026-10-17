'use client'
// THE ROW'S ADD-TO-SLIP TAP (2026-10-17): an icon-sized '+' (a 44px target) for a list row or card foot, the small sibling of components/SlipAdd.js.
// It adds `leg` (lib/slip/rowLegs.js: a real book price on the board's own bar) to the sport's one slip, and a second tap takes it off. The tap
// stops here, so it never opens the row's own link or card. No leg (no real price), no control: nothing is drawn.
import { useSlip } from '../lib/slip/store'

export default function SlipPlus({ sport, leg, C, NUM_FONT, accent, style = null }) {
  const { has, toggle } = useSlip(sport)
  if (!leg || !leg.key || leg.price == null) return null
  const on = has(leg.key)
  return (
    <button type="button" data-pm="slip-plus" aria-pressed={on} aria-label={on ? 'Take off the slip' : 'Add to slip'}
      title={`${on ? 'Take off the slip' : 'Add to slip'}: ${leg.name} ${leg.market}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle({ ...leg, sport, source: 'player' }) }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ flex: 'none', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 10, cursor: 'pointer',
        fontFamily: NUM_FONT, fontSize: 18, fontWeight: 800, lineHeight: 1,
        border: `1px solid ${on ? accent : 'transparent'}`, background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'transparent', color: on ? accent : C.text3, ...style }}>
      {on ? '✓' : '+'}
    </button>
  )
}
