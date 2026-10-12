'use client'
// THE POSTSEASON EDITION ROW of an open MLB game (2026-10-12). For a PLAYOFF game only (the schedule's gameType F / D / L / W), ONE folded line
// ("NLCS Game 2: postseason editions, 8 players") that opens a small table of the key players on each side with their postseason line: the three hitters
// with the most postseason home runs and the probable starter. One tap on a name opens that player's card on its POSTSEASON edition
// (components/player/CardFlip.js CardSheet), the depth. For any other game, in any other month, it draws NOTHING (returns null: no wrapper, no height), so
// the regular-season game is DOM-identical. Folded by default so the playoff game's first useful row (the lineups table) moves down by one 44px line, not a table.
// The data is /api/postseason/game (MLB StatsAPI gameType=P). Asked only when the slate's own date is in September-November and the game is open.
import { useEffect, useState } from 'react'
import { useSportTheme } from '../SportTheme'
import { TYPE } from '../../lib/theme'
import TeamMark from '../TeamMark'
import { CardSheet } from '../player/CardFlip'

const monthOk = (d) => /^\d{4}-(09|10|11)-/.test(String(d || ''))

export default function PostseasonRow({ gamePk, day = '' }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [fold, setFold] = useState(false)
  useEffect(() => {
    if (!gamePk || !monthOk(day)) return undefined
    let live = true
    fetch(`/api/postseason/game?pk=${encodeURIComponent(String(gamePk))}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.ok && j.postseason) setData(j) }).catch(() => {})
    return () => { live = false }
  }, [gamePk, day])
  if (!data) return null
  const rows = []
  for (const s of [data.away, data.home]) {
    for (const h of s.hitters) rows.push({ id: h.id, name: h.name, team: s.code, line: `${h.avg} AVG · ${h.hr} HR · ${h.rbi} RBI · ${h.games} G` })
    if (s.pitcher) rows.push({ id: s.pitcher.id, name: s.pitcher.name, team: s.code, tag: 'SP', line: s.pitcher.line ? `${s.pitcher.line.ip} IP · ${s.pitcher.line.era} ERA · ${s.pitcher.line.k} K · ${s.pitcher.line.games} G` : 'no postseason line yet', none: !s.pitcher.line })
  }
  if (!rows.length) return null
  const head = `${data.round || 'Postseason'}${data.gameNo ? ` Game ${data.gameNo}` : ''}: postseason editions`
  return (
    <div id={`gp-postseason-${gamePk}`} style={{ borderTop: `1px solid ${C.border}`, marginTop: 14, paddingTop: 4 }}>
      <button type="button" onClick={() => setFold((v) => !v)} aria-expanded={fold}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minHeight: 44, padding: '0 2px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: C.text }}>
        <span style={{ fontSize: TYPE.name, fontWeight: 800 }}>{head}</span>
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{`${rows.length} players ${fold ? '▾' : '▸'}`}</span>
      </button>
      {fold ? (
        <>
          <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, margin: '0 2px 4px' }}>this postseason only · tap a name for his card</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.team}-${r.id}`} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: 0 }}>
                    <button type="button" onClick={() => setOpen(r)} aria-label={`Open ${r.name}'s postseason card`}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', width: '100%', minHeight: 52, padding: '4px 6px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ color: accent, fontSize: TYPE.body, fontWeight: 800 }}>{r.name}{r.tag ? <span style={{ color: C.text3, fontSize: TYPE.micro, fontFamily: NUM_FONT, marginLeft: 6 }}>{r.tag}</span> : null}</span>
                      <span style={{ color: r.none ? C.text3 : C.text2, fontSize: TYPE.micro, fontFamily: NUM_FONT }}>{r.line}</span>
                    </button>
                  </td>
                  <td style={{ padding: '0 6px', width: 34, textAlign: 'right' }}><TeamMark sport="mlb" abbr={r.team} variant="logo" px={24} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {open ? <CardSheet sport="mlb" id={String(open.id)} name={open.name} initialEdition="post" onClose={() => setOpen(null)} /> : null}
    </div>
  )
}
