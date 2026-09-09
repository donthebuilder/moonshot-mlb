'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, surname } from '../lib/player'
import { pitcherSlotDamage } from '../lib/situational'

// SLOT-BY-SLOT MATCHUP (2026-08-06) — what clicking a game bubble earns in
// Lineups mode: the depth read for the selected game only.
//
// Two lanes braided per batting-order slot:
//   ARM SIDE:  what tonight's starter allows to each SLOT, season-long, live
//              from the API (sitCodes b1–b9) — his structural weaknesses.
//   BAT SIDE:  what the hitter STANDING in that slot does against this arm's
//              side (published vs-L/vs-R splits) and lately (L5).
// The braid is the point — badges fire only when both sides agree:
//   💥 SLOT   the slot bleeds (.800+ OPS-against, or his worst two)
//   ⭐ SIDE   the batter hits from the side this arm is weak against
//   🔥 BOTH   slot AND side — the lineup-built mismatch
// API lane, context only, fetched when the panel opens.

const effSide = (bats, throws) => {
  const b = String(bats || '').toUpperCase().slice(0, 1)
  if (b === 'S') return String(throws || '').toUpperCase() === 'R' ? 'L' : 'R'
  return b === 'L' || b === 'R' ? b : ''
}

export default function LineupSlotMatchup({ team, lineup = [], onPlayerClick }) {
  const pitcherId = lineup[0]?.pitcher_id
  const pitcherName = clean(lineup[0]?.pitcher_name, 'TBD')
  const throws = String(lineup[0]?.pitcher_throws || '?').toUpperCase()
  const weakSide = String(lineup[0]?.pitcher_weak_side || '').toUpperCase() // 'LHB'|'RHB'|''
  const [slots, setSlots] = useState(undefined)

  useEffect(() => {
    let alive = true
    setSlots(undefined)
    if (!pitcherId) { setSlots(null); return }
    pitcherSlotDamage(pitcherId).then((d) => { if (alive) setSlots(d && d.length ? d : null) })
    return () => { alive = false }
  }, [pitcherId])

  const bySlot = {}
  ;(slots || []).forEach((s) => { bySlot[s.slot] = s })
  const opsMax = Math.max(0.8, ...(slots || []).map((s) => s.ops))
  // his two most-damaged slots, for the 💥 badge
  const worst = new Set([...(slots || [])].sort((a, b) => b.ops - a.ops).slice(0, 2).map((s) => s.slot))

  return (
    // 300px basis so the two team panels stack on phones instead of
    // squeezing into unreadable halves.
    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 900, fontFamily: NUM_FONT }}>{team}</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          vs {String(pitcherName).split(' ').slice(-1)[0]} ({throws}HP)
          {weakSide && <> · weak vs <b style={{ color: C.yellow }}>{weakSide}</b></>}
        </span>
      </div>

      {slots === undefined && (
        <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, padding: '4px 0' }}>
          Pulling his slot-by-slot damage from the league…
        </div>
      )}
      {slots === null && (
        <div style={{ fontSize: 9.5, color: C.text3, padding: '4px 0' }}>
          The API has no per-slot sample for this arm — side matches still shown below.
        </div>
      )}

      {/* EDGE per row (2026-08-06, "go a little harder"): one 0–100 number
          braiding the three reads — how hard the arm bleeds to THIS slot,
          how hard this batter hits THIS side, and the side match. The panel
          names its own biggest mismatch up top. */}
      {(() => {
        const rows9 = lineup.slice(0, 9).map((p) => {
          const spot = Number(p?.lineup_spot) || 0
          const sd = bySlot[spot]
          const es = effSide(p?.bats, throws)
          const sideMatch = weakSide && es && weakSide === `${es}HB`
          const slotMatch = sd && (sd.ops >= 0.8 || worst.has(spot))
          const vsAvg = throws === 'L' ? n(p?.avg_vs_lhp, 0) : n(p?.avg_vs_rhp, 0)
          const vsIso = throws === 'L' ? n(p?.iso_vs_lhp, 0) : n(p?.iso_vs_rhp, 0)
          const edge = Math.round(
            (sd ? Math.max(0, Math.min(1, (sd.ops - 0.55) / 0.5)) : 0) * 55
            + Math.min(1, vsIso / 0.28) * 30
            + (sideMatch ? 15 : 0),
          )
          return { p, spot, sd, sideMatch, slotMatch, both: sideMatch && slotMatch, vsAvg, vsIso, edge }
        })
        const top = [...rows9].sort((a, b) => b.edge - a.edge)[0]
        return (
          <>
            {top && top.edge >= 55 && (
              <div style={{ fontSize: 9.5, color: C.orange, fontFamily: NUM_FONT, marginBottom: 4 }}>
                🔥 biggest mismatch: <b>#{top.spot} {top.p?.name}</b> · edge {top.edge}
              </div>
            )}
            {/* CLEANED (2026-08-08): one labeled header per team instead of a
                long legend sentence — the columns explain themselves */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '0 4px 2px', fontFamily: NUM_FONT, fontSize: 7.5, fontWeight: 900, letterSpacing: '.07em', color: C.text3, borderLeft: '2px solid transparent' }}>
              <span style={{ width: 11, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>BATTER</span>
              <span style={{ flex: '0 0 52px', textAlign: 'center' }} title="What this arm allows to that batting-order slot, season OPS-against, live">ARM→SLOT</span>
              <span style={{ width: 30, textAlign: 'right' }}>OPS</span>
              <span style={{ width: 62, textAlign: 'right' }} title="The batter vs this arm's side">AVG/ISO</span>
              <span className="l5col" style={{ width: 44, textAlign: 'right' }}>L5</span>
              <span style={{ width: 26, textAlign: 'right' }}>EDGE</span>
              <span style={{ width: 20 }} />
            </div>
            {rows9.map(({ p, spot, sd, sideMatch, slotMatch, both, vsAvg, vsIso, edge }) => (
          <div key={`${spot}-${p?.player_id}`} onClick={() => onPlayerClick?.(p)}
            title={sd ? `Slot ${spot}: he allows ${sd.ops.toFixed(3)} OPS · ${sd.hr} HR in ${sd.ab} AB to this spot` : undefined}
            style={{
              // subtler mismatch mark (owner 2026-08-08): thin ember spine
              // instead of a full row tint — highlights without the noise
              display: 'flex', gap: 6, alignItems: 'center', padding: '3px 4px', cursor: 'pointer',
              minWidth: 0, borderRadius: 6, minHeight: 23,
              borderLeft: both ? `2px solid ${C.orange}` : sideMatch || slotMatch ? '2px solid rgba(252,211,77,.45)' : '2px solid transparent',
              background: both ? 'rgba(249,115,22,.05)' : 'transparent',
            }}>
            <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3, width: 11, flexShrink: 0 }}>{spot || '·'}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
              {p?.name}
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, marginLeft: 4 }}>{p?.bats}</span>
            </span>
            {/* what the ARM gives this slot */}
            <div style={{ flex: '0 0 52px', height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
              {sd && (
                <div style={{
                  width: `${Math.min(100, (100 * sd.ops) / opsMax)}%`, height: '100%', borderRadius: 3,
                  background: sd.ops >= 0.8 ? '#f97316' : sd.ops >= 0.7 ? '#FCD34D' : 'rgba(255,255,255,.22)',
                }} />
              )}
            </div>
            <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800, width: 30, textAlign: 'right', flexShrink: 0,
              color: sd ? (sd.ops >= 0.8 ? C.orange : sd.ops >= 0.7 ? '#FCD34D' : C.text3) : C.text3 }}>
              {sd ? sd.ops.toFixed(3).replace(/^0/, '') : '—'}
            </span>
            {/* what the BAT does vs this side */}
            <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: vsIso >= 0.2 ? C.orange : C.text3, width: 62, textAlign: 'right', flexShrink: 0 }}>
              {vsAvg > 0 ? `${vsAvg.toFixed(3).replace(/^0/, '')}/${vsIso.toFixed(3).replace(/^0/, '')}` : '—'}
            </span>
            {/* L5 form + the edge number (L5 yields on narrow screens) */}
            <span className="l5col" style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: n(p?.last5_hr, 0) > 0 ? C.orange : C.text3, width: 44, textAlign: 'right', flexShrink: 0 }}
              title="Last 5 games: hits / homers">
              L5 {n(p?.last5_hits, 0)}H{n(p?.last5_hr, 0) > 0 ? `/${n(p?.last5_hr, 0)}HR` : ''}
            </span>
            <span style={{
              fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 900, width: 26, textAlign: 'right', flexShrink: 0,
              color: edge >= 70 ? C.orange : edge >= 50 ? '#FCD34D' : C.text3,
            }} title="Edge 0–100: slot damage (55) + his ISO vs this side (30) + side match (15)">{edge}</span>
            <span style={{ width: 20, textAlign: 'right', fontSize: 10, flexShrink: 0 }}>
              {both ? '🔥' : slotMatch ? '💥' : sideMatch ? '⭐' : ''}
            </span>
          </div>
            ))}
          </>
        )
      })()}
    </div>
  )
}
