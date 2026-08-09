'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { dataUrl } from '../lib/dataSource'

const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`
import { fetchWalls, pullWallFor } from '../lib/walls'

// 🧱🚀 FENCE RIDERS (2026-08-08, Donovan: "I like people who pull in the
// direction and have hit it out or ON THE FENCE LINE in the last 5–15
// games"). Two verified sources, zero invention:
//   fence_board.json   spray_cache's measured landing data — every ball a
//                      hitter put over 375, and every PULLED ball that died
//                      320–374 (the wall-scraper zone), last 15 game dates
//   fieldInfo          the league's own wall dimensions for tonight's park
// The read: a guy stacking 350-ft pulled outs walks into a 315-ft pull
// porch — those same swings clear tonight. All stats, no feel.

export default function FenceBoard({ onPlayerClick, players = [] }) {
  const [board, setBoard] = useState(null)
  const [walls, setWalls] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch(bust(dataUrl('current/fence_board.json')))
      .then((r) => (r.ok ? r.json() : null)).then(setBoard).catch(() => {})
    fetchWalls().then(setWalls).catch(() => {})
  }, [])

  const slateIds = useMemo(() => new Set(players.map((p) => String(p?.player_id ?? p?.id))), [players])
  const rowFor = useMemo(() => {
    const m = new Map()
    players.forEach((p) => m.set(String(p?.player_id ?? p?.id), p))
    return m
  }, [players])

  const [rows, setRows] = useState([])
  useEffect(() => {
    let alive = true
    if (!board?.rows) return undefined
    ;(async () => {
      const out = []
      for (const r of board.rows.slice(0, 40)) {
        if (slateIds.size && !slateIds.has(String(r.player_id))) continue
        const w = await pullWallFor(r.bats, r.venue)
        // fit: fence-line contact weighted by how short tonight's pull wall is
        const shortPorch = w?.linePct != null && w.linePct <= 25
        const fit = r.deep_pull_ct * 3 + r.fence_ct * 1.5 + r.over_ct
          + (shortPorch ? (r.deep_pull_ct + r.fence_ct) * 1.5 : 0)
        out.push({ ...r, w, shortPorch, fit })
      }
      if (alive) setRows(out.sort((a, b) => b.fit - a.fit).slice(0, 10))
    })()
    return () => { alive = false }
  }, [board, slateIds])

  if (!board?.rows?.length || !rows.length) return null

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      <div onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🧱 Fence riders {open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          pulled balls dying at the wall, last 15 games — vs the wall they actually face tonight
        </span>
        {!open && rows[0] && (
          <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.orange, fontWeight: 800 }}>
            #1 {rows[0].name.split(' ').slice(-1)[0]}{rows[0].shortPorch ? ' → short porch tonight' : ''}
          </span>
        )}
      </div>

      {open && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {rows.map((r, i) => (
              <div key={r.player_id} onClick={() => { const p = rowFor.get(String(r.player_id)); if (p) onPlayerClick?.(p) }}
                style={{
                  display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap', cursor: 'pointer',
                  background: r.shortPorch ? 'rgba(249,115,22,.07)' : C.bg2,
                  border: `1px solid ${r.shortPorch ? 'rgba(249,115,22,.4)' : C.border}`,
                  borderRadius: 9, padding: '6px 11px',
                }}>
                <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 16 }}>{i + 1}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800 }}>{r.name}</span>
                <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{r.team}</span>
                <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text2 }}
                  title={`Last ${r.games} games (${r.bbe} tracked balls): ${r.over_ct} over 375ft, ${r.fence_ct} PULLED into the 320–374 wall-scraper zone, ${r.deep_pull_ct} pulled 350+, ${r.hr_ct} actual HR. Longest ${r.longest.toFixed(0)}ft. All measured Statcast landing data.`}>
                  <b style={{ color: '#4ade80' }}>{r.over_ct}</b> over ·{' '}
                  <b style={{ color: C.orange }}>{r.fence_ct}</b> at the wall ·{' '}
                  <b style={{ color: '#22d3ee' }}>{r.deep_pull_ct}</b> deep pull
                </span>
                {r.w && (
                  <span style={{ marginLeft: 'auto', fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 800, color: r.shortPorch ? C.orange : C.text3 }}
                    title={`His pull side tonight: ${r.w.side} ${r.w.line}ft line${r.w.gap ? ` / ${r.w.gap}ft gap` : ''} — ${r.w.linePct}% of parks are shorter. ${r.shortPorch ? 'SHORT PORCH: his wall-scrapers clear this one.' : ''}`}>
                    {r.w.side} {r.w.line}′{r.shortPorch ? ' 🎯 SHORT' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
            Distances are Statcast landing measurements, pull is Savant&apos;s own pull-air flag, wall
            dimensions are the league&apos;s fieldInfo. &quot;At the wall&quot; = pulled 320–374 ft — outs in
            most parks, homers over a short porch. 🎯 marks a hitter whose pull side tonight is a
            bottom-25% wall. Window: his last 15 game dates. <b style={{ color: C.text2 }}>Stats and
            analysis only — not financial or betting advice.</b>
          </div>
        </>
      )}
    </div>
  )
}
