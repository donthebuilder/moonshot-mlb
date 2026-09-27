'use client'
import { useEffect, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'

// 📜 HISTORY WATCH (milestones plan step 2, 2026-09-26). One line per player
// one step short of a history rung -- "Drake Baldwin · 24 HR · one more =
// first Braves catcher to 25 since Javy Lopez in 2003" -- three rows, then
// "+N more". Tap a row for its proof: every player since who did it, and the
// source. Nothing here is written by hand: /api/history/watch returns each
// claim with the query result behind it. Shared by all three products;
// theme and number font come in as props.
// `reach` / `step` are the words for the window ("one more tonight" / "one
// more"); TUDDY's week passes its own.
export default function HistoryWatch({ sport = 'mlb', theme = null, numFont = null, onPlayerClick = null, unit = 'HR', max = 3, reach = 'one more tonight', step = 'one more' }) {
  const C = theme || MLB_C
  const NUM_FONT = numFont || MLB_NUM
  const [data, setData] = useState(null)
  const [openKey, setOpenKey] = useState(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/history/watch?sport=${sport}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  const items = data?.items || []
  if (!items.length) return null
  const shown = all ? items : items.slice(0, max)
  return (
    <div style={{ margin: '6px 0 8px', padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg3 || C.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.12em', fontFamily: NUM_FONT, color: C.text }}>📜 HISTORY WATCH</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{reach} · tap for the proof</span>
      </div>
      {shown.map((i) => {
        const k = `${i.player_id}:${i.rung}`
        const open = openKey === k
        return (
          <div key={k} style={{ borderTop: `1px solid ${C.border}` }}>
            <button type="button" onClick={() => setOpenKey(open ? null : k)} aria-expanded={open}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 0', background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', font: 'inherit', fontSize: 12, lineHeight: 1.4 }}>
              {/* A postseason club drought is about the club, not a hitter (lib/history/mlbPost.js). */}
              {i.kind === 'DROUGHT'
                ? <><b>{i.team}</b> <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10.5 }}>no postseason HR yet</span><span style={{ color: C.text2 }}> · a homer tonight = {i.claim}</span></>
                : <><b>{i.name}</b> <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10.5 }}>{i.team} · {i.hr} {i.unit || unit}</span><span style={{ color: C.text2 }}> · {step} = {i.claim}</span></>}
            </button>
            {open && (
              <div style={{ padding: '0 0 8px 8px', fontSize: 10.5, color: C.text2, lineHeight: 1.5 }}>
                {i.proof.title ? <>{i.proof.title}</> : i.proof.lastSeason
                  ? <>Every {i.proof.who} with {i.rung}+ {i.unit || unit} before this season, newest first:</>
                  : <>Nobody in the data has done it for this club (data from {i.proof.coverageFrom}).</>}
                {i.proof.allSince?.length ? (
                  <ul style={{ margin: '4px 0 4px 16px', padding: 0, fontFamily: NUM_FONT, fontSize: 10.5 }}>
                    {i.proof.allSince.slice(0, 8).map((r) => <li key={`${r.season}${r.name}`}>{r.season} · {r.name} · {r.value}</li>)}
                    {i.proof.hits > 8 ? <li style={{ listStyle: 'none', color: C.text3 }}>…and {i.proof.hits - 8} more</li> : null}
                  </ul>
                ) : null}
                {onPlayerClick && i.kind !== 'DROUGHT' && <button type="button" onClick={() => onPlayerClick({ player_id: i.player_id, name: i.name, team: i.team })} style={{ background: 'none', border: 'none', color: C.text2, padding: 0, cursor: 'pointer', textDecoration: 'underline dotted', fontSize: 10.5 }}>open {i.name.split(' ').pop()}’s card</button>}
                <div style={{ color: C.text3, fontSize: 9.5, marginTop: 4 }}>{data.credit}</div>
              </div>
            )}
          </div>
        )
      })}
      {items.length > max && (
        <button type="button" onClick={() => setAll((v) => !v)} style={{ marginTop: 4, background: 'none', border: 'none', padding: 0, color: C.text3, cursor: 'pointer', fontFamily: NUM_FONT, fontSize: 10 }}>
          {all ? 'show fewer' : `+${items.length - max} more`}
        </button>
      )}
    </div>
  )
}
