'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { pitcherSlotDamage } from '../lib/situational'

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
          const hot = r.ops >= 0.800
          return (
            <div key={r.slot} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3, width: 12, textAlign: 'right' }}>{r.slot}</span>
              <div style={{ flex: '0 0 42%', height: 11, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${(100 * r.ops) / max}%`, height: '100%', borderRadius: 4,
                  background: hot ? '#f97316' : r.ops >= 0.700 ? '#FCD34D' : 'rgba(255,255,255,.16)',
                  boxShadow: hot ? '0 0 8px rgba(249,115,22,.5)' : 'none',
                }} />
              </div>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, color: hot ? C.orange : C.text2, width: 44 }}>
                {r.ops.toFixed(3)}
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
        Live from the MLB StatsAPI. Orange = .800+ OPS allowed to that slot — and the name beside it
        is who bats there tonight. A bright bar with a ⭐ name is the same claim from two directions.
      </div>
    </div>
  )
}
