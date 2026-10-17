'use client'
// ONE ADD-TO-SLIP CONTROL (2026-10-17), the row MLB's player modal wears ('Add to slip' + a + button per bet) made shared, with the slip bar's
// 44px taps. It adds `leg` to the sport's one slip (lib/slip/store.js). Hidden when there is no real book price or line to add: a leg is
// never given a price the books did not post. It adds by hand, so it is not the 'called' shortcut and reveals nothing about who is called.
import { useSlip } from '../lib/slip/store'
import { fmtOdds } from '../lib/odds'

export default function SlipAdd({ sport, leg = null, legs = null, C, NUM_FONT, accent, style = null }) {
  const { has, toggle } = useSlip(sport)
  const list = (legs || [leg]).filter((l) => l && l.key && (l.price != null || l.line != null))
  if (!list.length) return null
  return (
    <div data-pm="slip-add" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 8px', ...style }}>
      <span style={{ fontSize: 12, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: NUM_FONT }}>Add to slip</span>
      {list.map((leg) => { const on = has(leg.key); return (
  <button key={leg.key} type="button" onClick={() => toggle({ ...leg, sport, source: leg.source || 'player' })} aria-pressed={on}
          aria-label={`${on ? 'Take' : 'Add'} ${leg.name} ${leg.market}${on ? ' off' : ' to'} the slip`}
          style={{ minHeight: 44, padding: '0 14px', fontSize: 13, fontWeight: 800, borderRadius: 10, cursor: 'pointer', fontFamily: NUM_FONT,
            border: `1px solid ${on ? accent : C.border}`, background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'transparent', color: on ? accent : C.text2 }}>
          {on ? '✓ On slip' : '+ slip'} · {leg.market}{leg.price != null ? ` ${fmtOdds(leg.price)}` : ''}
        </button>
      ) })}
    </div>
  )
}
