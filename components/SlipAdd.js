'use client'
// ONE ADD-TO-SLIP CONTROL (2026-10-17), the row MLB's player modal wears ('Add to slip' + a + button per bet) made shared, with the slip bar's
// 44px taps. It adds `leg` to the sport's one slip (lib/slip/store.js). Hidden when there is no real book price or line to add: a leg is
// never given a price the books did not post. It adds by hand, so it is not the 'called' shortcut and reveals nothing about who is called.
import { useSlip } from '../lib/slip/store'
import { fmtOdds } from '../lib/odds'
import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'

// EVEN (2026-10-22, Donovan on the player cards: the watch / slip row "taking a whole row with it not being symmetrical"):
//   even      one grid of equal cells, no "Add to slip" label (the + says it); five or fewer cells is one row, more is two
//   lead      the first cell (the card's Watch button), so Watch and the slip sit in the same even row
//   pickCode  the market code the product called him in ('TD', 'GOAL', 'pts'): that cell wears a ★
//   pickLine  the product's pick sentence, shown small under the row ONLY when no cell carries the star (a pass night, or
//             the called market has no price to add)
export default function SlipAdd({ sport, leg = null, legs = null, C, NUM_FONT, accent, style = null, compact = false,
  even = false, lead = null, pickCode = null, pickLine = null }) {   // compact (2026-10-17, the NHL card): '+ Goal +320' for '+ slip · Goal +320', so three markets fit two lines on a phone
  const { has, toggle } = useSlip(sport)
  const list = (legs || [leg]).filter((l) => l && l.key && (l.price != null || l.line != null))
  if (even) {
    const cells = list.length + (lead ? 1 : 0)
    const starred = pickCode ? list.find((l) => String(l.key).endsWith(`|${pickCode}`)) || null : null
    if (!cells) return pickLine ? <div style={{ fontSize: 12, color: C.text3, margin: '4px 0 8px', ...style }}>{pickLine}</div> : null
    const cols = cells === 1 ? 'minmax(0, 160px)' : `repeat(${cells <= 5 ? cells : Math.ceil(cells / 2)}, minmax(0, 1fr))`
    return (
      <div data-pm="slip-add" style={{ margin: '4px 0 8px', ...style }}>
        {/* equal cells, but never wider than a chip needs: a desktop row of two doesn't stretch into two 600px bars */}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'stretch', maxWidth: Math.min(cells, 5) * 150 }}>
          {lead}
          {list.map((leg) => {
            const on = has(leg.key)
            const isPick = starred === leg
            return (
              <button key={leg.key} type="button" onClick={() => toggle({ ...leg, sport, source: leg.source || 'player' })} aria-pressed={on}
                aria-label={`${on ? 'Take' : 'Add'} ${leg.name} ${leg.market}${on ? ' off' : ' to'} the slip${isPick ? ' (the pick)' : ''}`}
                title={isPick ? 'The pick tonight' : undefined}
                className={FLAT_CHIP_CLASS}
                style={{ ...flatChip(on, accent, C, NUM_FONT), justifyContent: 'center', flexDirection: 'column', gap: 1, padding: '5px 4px', minWidth: 0,
                  ...(isPick && !on ? { color: accent, borderColor: accent } : null) }}>
                <span style={{ maxWidth: '100%', overflow: 'hidden' }}>{on ? '✓' : '+'} {leg.market}{isPick ? ' ★' : ''}</span>
                {leg.price != null ? <span style={{ fontSize: 9.5, letterSpacing: 0, opacity: 0.8 }}>{fmtOdds(leg.price)}</span> : null}
              </button>
            )
          })}
        </div>
        {pickLine && !starred ? <div style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>{pickLine}</div> : null}
      </div>
    )
  }
  if (!list.length) return null
  return (
    <div data-pm="slip-add" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 8px', ...style }}>
      <span style={{ fontSize: 12, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: NUM_FONT }}>Add to slip</span>
      {list.map((leg) => { const on = has(leg.key); return (
  <button key={leg.key} type="button" onClick={() => toggle({ ...leg, sport, source: leg.source || 'player' })} aria-pressed={on}
          aria-label={`${on ? 'Take' : 'Add'} ${leg.name} ${leg.market}${on ? ' off' : ' to'} the slip`}
          style={{ minHeight: 44, padding: '0 14px', fontSize: 13, fontWeight: 800, borderRadius: 10, cursor: 'pointer', fontFamily: NUM_FONT,
            border: `1px solid ${on ? accent : C.border}`, background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'transparent', color: on ? accent : C.text2 }}>
          {compact ? (on ? '✓' : '+') : (on ? '✓ On slip' : '+ slip') + ' ·'} {leg.market}{!(compact && on) && leg.price != null ? ` ${fmtOdds(leg.price)}` : ''}
        </button>
      ) })}
    </div>
  )
}
