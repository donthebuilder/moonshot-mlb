'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { pitcherSlotDamage } from '../lib/situational'
import { divChip, divTone, sampleDim } from '../lib/scales'

// LEAGUE OPS-AGAINST, the anchor this chart was missing. An OPS bar with no
// zero on it is a magnitude; an OPS bar with league on it is a verdict, and a
// verdict is what "does he bleed to the 4-hole" is asking for.
const LG_OPS_AGAINST = 0.715

// SLOT DAMAGE, OCCUPIED — PropFinder shows a pitcher's line against each
// batting-order slot as a generic table. This shows the same season damage
// as bars, then does the thing PF can't: names WHO IS STANDING IN EACH SLOT
// TONIGHT, with his weak-spot star. "He bleeds to the 4-hole" is trivia;
// "he bleeds to the 4-hole and Olson is hitting fourth" is a bet.
export default function SlotDamage({ pitcher }) {
  const [rows, setRows] = useState(null)
  const pid = pitcher?.pitcher_id
  useEffect(() => {
    let alive = true
    setRows(null)
    pitcherSlotDamage(pid).then((r) => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [pid])

  if (!rows || !rows.length) return null
  const bySlot = new Map()
  ;(pitcher?.lineup || []).forEach((b) => {
    const sp = Number(b?.raw?.lineup_spot ?? b?.lineup_spot)
    if (sp >= 1 && sp <= 9 && !bySlot.has(sp)) bySlot.set(sp, b?.raw || b)
  })
  const max = Math.max(...rows.map((r) => r.ops), 0.8)

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800 }}>🎯 Damage by lineup slot — occupied</span>
        <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
          season OPS-against per batting slot · with who's in that slot tonight
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((r) => {
          const occ = bySlot.get(r.slot)
          // ── ONE SCALE, WITH A ZERO ON IT (2026-08-22) ──────────────────
          // The bar used to be a three-step ladder — #f97316 at .800,
          // #FCD34D at .700, rgba(255,255,255,.16) below — which is three
          // hard cuts standing in for a continuous number, and the bottom
          // step was white-alpha, so on a light theme the COLD half of the
          // chart disappeared entirely. It now runs on the diverging scale
          // against league OPS-against, so the bar says which side of
          // average this slot is on and by how much, and the arrow carries
          // the sign for anyone who cannot separate the hues.
          const d = divTone(r.ops, { anchor: LG_OPS_AGAINST, ceiling: 0.30, deadband: 0.08 })
          const col = divChip(r.ops, { anchor: LG_OPS_AGAINST, ceiling: 0.30, deadband: 0.08 })
          const hot = r.ops >= LG_OPS_AGAINST
          // The sample is the AB count the API returned. A .950 OPS over 12
          // at-bats and one over 180 are not the same claim, and this chart
          // used to draw them identically.
          const samp = sampleDim(r.ab, 40)
          return (
            <div key={r.slot} title={`Slot ${r.slot}: ${r.ops.toFixed(3)} OPS allowed over ${r.ab} at-bats, ${r.hr} HR. League-average pitching allows about ${LG_OPS_AGAINST.toFixed(3)}.`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, opacity: samp.opacity }}>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3, width: 12, textAlign: 'right' }}>{r.slot}</span>
              <div style={{ position: 'relative', flex: '0 0 42%', height: 11, background: C.bg3, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${(100 * r.ops) / max}%`, height: '100%', borderRadius: 4,
                  background: col,
                }} />
                {/* League, drawn on the axis rather than described under it. */}
                <span style={{
                  position: 'absolute', left: `${Math.min(100, (100 * LG_OPS_AGAINST) / max)}%`,
                  top: 0, bottom: 0, width: 1, background: C.text2, opacity: 0.75,
                }} />
              </div>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, color: hot ? col : C.text2, width: 52 }}>
                {r.ops.toFixed(3)}<span style={{ fontSize: 7.5, marginLeft: 1 }}>{d.glyph}</span>
              </span>
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 56 }}>{r.hr} HR · {r.ab}AB</span>
              {occ && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: hot ? C.text : C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                  {occ.name}{occ.weak_spot_flag ? ' ⭐' : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
        Live from the MLB StatsAPI. Bars run against league OPS-against ({LG_OPS_AGAINST.toFixed(3)}), marked on the axis —
        warm ▲ means this slot has hurt him more than league, cool ▼ less, and a bar close to the
        line means neither. Slots on under 40 at-bats are dimmed rather than hidden: the number is
        real, the sample is thin. The name beside each bar is who bats there tonight, so a warm bar
        with a ⭐ name is the same claim from two directions.
      </div>
    </div>
  )
}
