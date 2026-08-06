'use client'
import React, { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { thresholdRates, lastSeasonRates, staffQuality, teamAbbrs, MARKETS } from '../lib/gamelogs'

// PROP GRID v2 — the table version read like a spreadsheet bolted onto a
// card UI. Now it's the site's own language: market pills on top, one hero
// panel below — four big window tiles, the streak as a stamp, and the
// 20-game timeline always visible for the selected market instead of hiding
// behind a row click. Live game logs; context lane, feeds no score.

const rateCol = (pct) => pct >= 60 ? '#4ade80' : pct >= 40 ? '#FCD34D' : pct >= 25 ? C.orange : '#f87171'

export default function ThresholdGrid({ playerId }) {
  const [data, setData] = useState(null)
  const [ls, setLs] = useState(null)
  const [staff, setStaff] = useState(null)
  const [abbrs, setAbbrs] = useState(null)
  const [mkt, setMkt] = useState('hr')
  // PF's filter row, the part worth taking: slice every window by venue and
  // watch the tiles recompute. 'all' | 'home' | 'away'.
  const [venue, setVenue] = useState('all')

  useEffect(() => {
    let alive = true
    setData(null)
    thresholdRates(playerId).then((d) => { if (alive) setData(d) })
    lastSeasonRates(playerId).then((d) => { if (alive) setLs(d) })
    staffQuality().then((d) => { if (alive) setStaff(d) })
    teamAbbrs().then((d) => { if (alive) setAbbrs(d) })
    return () => { alive = false }
  }, [playerId])

  if (data === null) return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading game log…</div>
  if (!data) return null

  const m = MARKETS.find((x) => x.key === mkt) || MARKETS[0]
  // Windows recomputed live from the filtered log, so Home/Away isn't a
  // different page — it's the same tiles telling a different truth.
  const pool = (data.logAll || data.log || []).filter((g) =>
    venue === 'all' ? true : venue === 'home' ? g.home : !g.home)
  const win = (size) => {
    const seg = pool.slice(0, size)
    return { ok: seg.filter(m.test).length, n: seg.length }
  }
  const r = { L5: win(5), L10: win(10), L20: win(20), Szn: win(pool.length) }
  let stk = 0
  if (pool.length) {
    const first = m.test(pool[0]); let k = 0
    for (const g of pool) { if (m.test(g) === first) k++; else break }
    stk = first ? k : -k
  }
  const filteredLog = pool.slice(0, 20)

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>🎯 Props</span>
        {MARKETS.map((x) => {
          const rr = data.markets[x.key]
          const p10 = rr?.L10?.n ? (100 * rr.L10.ok) / rr.L10.n : null
          return (
            <button key={x.key} onClick={() => setMkt(x.key)} style={{
              padding: '4px 11px', borderRadius: 999, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 700, fontFamily: NUM_FONT,
              border: `1px solid ${mkt === x.key ? C.orange : C.border}`,
              background: mkt === x.key ? 'rgba(249,115,22,.14)' : 'transparent',
              color: mkt === x.key ? C.orange : C.text2,
            }}>
              {x.label}
              {p10 != null && <span style={{ marginLeft: 5, fontSize: 9, color: mkt === x.key ? C.orange : rateCol(p10) }}>{p10.toFixed(0)}%</span>}
            </button>
          )
        })}
      </div>

      <div style={{
        background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
        border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px',
      }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {[['all', 'All'], ['home', 'Home'], ['away', 'Away']].map(([k, label]) => (
            <button key={k} onClick={() => setVenue(k)} style={{
              padding: '2px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
              fontWeight: 700, fontFamily: NUM_FONT,
              border: `1px solid ${venue === k ? C.orange : C.border}`,
              background: venue === k ? 'rgba(249,115,22,.14)' : 'transparent',
              color: venue === k ? C.orange : C.text3,
            }}>{label}</button>
          ))}
          {venue !== 'all' && (
            <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, alignSelf: 'center' }}>
              every tile and the timeline below recomputed for {venue} games only
            </span>
          )}
        </div>
        {/* ONE grid, equal cells (2026-08-06). The old flex row let tiles
            wrap at odd widths and dumped the streak onto its own orphan line
            — six loose boxes instead of one instrument panel. */}
        <div style={{
          display: 'grid', gap: 6, marginBottom: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(62px, 1fr))',
        }}>
          {[['L5', 'Last 5'], ['L10', 'Last 10'], ['L20', 'Last 20'], ['Szn', 'Season']].map(([w, label]) => {
            const { ok, n } = r[w]
            const pct = n ? (100 * ok) / n : null
            return (
              <div key={w} style={{ textAlign: 'center', background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 4px 6px' }}>
                <div style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{label}</div>
                <div style={{ fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, lineHeight: 1.2, color: pct != null ? rateCol(pct) : C.text3 }}>
                  {pct != null ? `${pct.toFixed(0)}%` : '—'}
                </div>
                <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3 }}>{n ? `${ok}/${n}` : ' '}</div>
              </div>
            )
          })}
          {ls?.[m.key]?.n > 0 && (
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.02)', border: `1px dashed ${C.border2}`, borderRadius: 9, padding: '7px 4px 6px' }}
              title="Last season, full year — the long-memory anchor the recent windows swing around">
              <div style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{new Date().getFullYear() - 1}</div>
              <div style={{ fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, lineHeight: 1.2, color: rateCol((100 * ls[m.key].ok) / ls[m.key].n) }}>
                {((100 * ls[m.key].ok) / ls[m.key].n).toFixed(0)}%
              </div>
              <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3 }}>{ls[m.key].ok}/{ls[m.key].n}</div>
            </div>
          )}
          <div style={{
            textAlign: 'center', borderRadius: 9, padding: '7px 4px 6px',
            background: stk > 0 ? 'rgba(74,222,128,.10)' : stk < 0 ? 'rgba(248,113,113,.08)' : 'rgba(255,255,255,.03)',
            border: `1px solid ${stk > 0 ? '#4ade8055' : stk < 0 ? '#f8717144' : C.border}`,
          }}>
            <div style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>Streak</div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, lineHeight: 1.2, color: stk > 0 ? '#4ade80' : stk < 0 ? '#f87171' : C.text3 }}>
              {stk > 0 ? `W${stk}` : stk < 0 ? `L${-stk}` : '—'}
            </div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3 }}>{m.label}</div>
          </div>
        </div>

        {/* TIMELINE v2 (2026-08-06). v1 printed a truncated team NAME under
            every bar — "Athle Athle Chica" garbage, because the gameLog API
            carries no abbreviation. The words are gone: each bar now stands
            on a small tint block that IS the opponent read (brighter orange =
            softer staff, league OPS-against), abbreviations live in the
            tooltip via a proper id→abbr map, and multis wear their number. */}
        {filteredLog.length > 0 && (
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
            {[...filteredLog].reverse().map((g, gi) => {
              const val = m.key === 'hit' ? g.h : m.key === 'tb2' ? g.tb : m.key === 'hr' ? g.hr : m.key === 'run' ? g.r : g.rbi
              const ok = m.test(g)
              const extra = m.key === 'tb2' ? val >= 4 : val >= 2
              const q = staff?.[g.oppId]
              const ab = abbrs?.[g.oppId] || g.opp
              const oppCol = q ? `rgba(249,115,22,${(0.18 + q.soft * 0.72).toFixed(2)})` : 'rgba(255,255,255,.08)'
              const oppNote = q ? ` · ${ab} staff: OPS-against ${q.ops.toFixed(3)}, #${q.rank}/30 toughest` : ''
              return (
                <div key={gi} title={`${g.date} ${g.home ? 'vs' : '@'} ${ab} — ${val} (${g.h}H ${g.tb}TB ${g.hr}HR)${oppNote}`}
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  {extra && (
                    <div style={{ fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900, color: '#4ade80', textAlign: 'center', marginBottom: 1 }}>{val}</div>
                  )}
                  <div style={{
                    height: ok ? (extra ? 34 : 22) : 6, borderRadius: '3px 3px 1px 1px',
                    background: ok
                      ? (extra ? 'linear-gradient(180deg, #86efac, #4ade80)' : 'linear-gradient(180deg, rgba(74,222,128,.75), rgba(74,222,128,.45))')
                      : 'rgba(248,113,113,.28)',
                    boxShadow: extra ? '0 0 9px rgba(74,222,128,.45)' : 'none',
                  }} />
                  <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: oppCol }} />
                </div>
              )
            })}
          </div>
        )}
        <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
          Last {Math.min(20, filteredLog.length)} games, newest right. Tall bright green = multi
          ({m.key === 'tb2' ? '4+ TB' : '2+'}, its number on top){staff && <>; the strip under each bar is the
          opposing staff — <span style={{ color: C.orange }}>brighter orange = softer arms</span>, so greens
          over dark strips came against real pitching</>}. Hover any bar for the game.
        </div>
      </div>
    </div>
  )
}
