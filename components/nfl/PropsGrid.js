'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import HitRate from './HitRate'

// 🎯 THE PROPS GRID, FOOTBALL EDITION.
//
// 2026-08-15, Donovan: "Prop grid need to be used in nfl as well. Also i dont
// like the grid you used on the nfl they look like a copy of prop finder and
// its needs to be click able sortable."
//
// This is the MLB matrix ported, not PropFinder imitated: every market this
// player has a log for × every window, one heat grid, nothing behind a click.
// Click a row and the bar chart underneath re-points at that market; click a
// line chip and the WHOLE matrix re-grades in the browser — the bot ships raw
// game logs precisely so this doesn't need another bot run.
//
// What makes it ours rather than theirs:
//   · the matrix leads and the chart follows — compare 3+ rec L5 to 40+ rush
//     yards L5 in one glance, then open the one you care about
//   · streaks are SIGNED — a cold run is information, not blank space
//   · cells carry their fraction on hover, and thin windows dim instead of
//     asserting (3 games is a story, not a rate)
//   · column headers sort — click L5 and the rows rank by it; click again to
//     flip. The market column restores the natural order.

const MARKETS = [
  ['REC', 'Rec', 'g_rec', [2.5, 3.5, 4.5, 6.5]],
  ['REC_YDS', 'Rec yds', 'g_recyd', [24.5, 39.5, 59.5]],
  ['RUSH_YDS', 'Rush yds', 'g_ruyd', [39.5, 49.5, 79.5]],
  ['RUSH_ATT', 'Carries', 'g_car', [9.5, 11.5, 14.5]],
  ['PASS_YDS', 'Pass yds', 'g_payd', [199.5, 224.5, 274.5]],
  ['TD', 'TD', 'g_td', [0.5]],
  ['KICK_PTS', 'Kick pts', 'g_kick', [5.5, 8.5]],
]
const WINDOWS = [['L5', 5], ['L10', 10], ['L20', 20], ['All', 9999]]

const rateCol = (pct) => (pct >= 60 ? C.green : pct >= 45 ? C.yellow : pct >= 25 ? C.orange || '#f97316' : C.red)
const cellBg = (pct) => (pct == null ? 'transparent'
  : pct >= 60 ? `${C.green}21` : pct >= 45 ? `${C.yellow}1a` : pct >= 25 ? 'rgba(249,115,22,.12)' : `${C.red}12`)

export default function PropsGrid({ log, market: initialMarket, defaultBar }) {
  const [mkt, setMkt] = useState(initialMarket || 'REC')
  const [lines, setLines] = useState({})          // per-market line override
  const [sort, setSort] = useState(null)          // {w, dir} or null

  // Only markets this player actually produces in — a kicker gets one row,
  // not seven rows of zeros wearing percentages.
  const live = useMemo(() => {
    const all = log || []
    return MARKETS.filter(([, , key]) => all.some((g) => Number(g[key]) > 0))
  }, [log])

  const active = live.find(([k]) => k === mkt) || live[0]
  if (!log?.length || !active) return null

  const lineFor = ([key, , , presets]) => lines[key]
    ?? (key === (initialMarket || '') && Number.isFinite(defaultBar) && presets.includes(defaultBar - 0.5)
      ? defaultBar - 0.5
      : presets[Math.floor(presets.length / 2)])

  const rows = live.map((m) => {
    const [key, label, statKey, presets] = m
    const line = lineFor(m)
    const over = (g) => Number(g[statKey]) > line
    const cells = WINDOWS.map(([, n]) => {
      const seg = (log || []).slice(-n)
      return seg.length ? { ok: seg.filter(over).length, n: seg.length, pct: (100 * seg.filter(over).length) / seg.length } : null
    })
    // signed streak from the newest game backward
    let stk = 0
    const newest = [...log].reverse()
    if (newest.length) {
      const first = over(newest[0])
      let k = 0
      for (const g of newest) { if (over(g) === first) k += 1; else break }
      stk = first ? k : -k
    }
    return { key, label, statKey, presets, line, cells, stk }
  })

  const shown = sort
    ? [...rows].sort((a, b) => {
      const av = a.cells[sort.w]?.pct ?? -1
      const bv = b.cells[sort.w]?.pct ?? -1
      return sort.dir === 'desc' ? bv - av : av - bv
    })
    : rows

  const th = {
    fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, letterSpacing: '.07em',
    color: C.text3, padding: '0 4px 4px', textTransform: 'uppercase', cursor: 'pointer',
    whiteSpace: 'nowrap', textAlign: 'center', userSelect: 'none',
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em' }}>
          🎯 PROPS — EVERY MARKET, EVERY WINDOW
        </span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          click a row to chart it · a column header to rank by that window · a chip to move the line
        </span>
      </div>

      <div className="dense-scroll rail" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '2px 2px', fontFamily: NUM_FONT }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }} onClick={() => setSort(null)}
                title="Restore the natural market order">Market</th>
              {WINDOWS.map(([w], wi) => (
                <th key={w} style={{
                  ...th,
                  color: sort?.w === wi ? C.green : C.text3,
                  borderBottom: sort?.w === wi ? `2px solid ${C.green}` : '2px solid transparent',
                }}
                  onClick={() => setSort(sort?.w === wi && sort.dir === 'desc' ? { w: wi, dir: 'asc' } : { w: wi, dir: 'desc' })}
                  title="Click to rank the rows by this window; click again to flip">
                  {w}{sort?.w === wi ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
              <th style={{ ...th, cursor: 'default' }} title="Current streak — consecutive newest games over (W) or under (L) this line">STK</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const on = r.key === active[0]
              return (
                <tr key={r.key} style={{ cursor: 'pointer' }} onClick={() => setMkt(r.key)}>
                  <td style={{
                    fontSize: 11, fontWeight: on ? 900 : 700, whiteSpace: 'nowrap',
                    color: on ? C.green : C.text, padding: '3px 6px',
                    borderLeft: `3px solid ${on ? C.green : 'transparent'}`, borderRadius: 4,
                  }}>
                    {r.line + 0.5}+ {r.label}
                  </td>
                  {r.cells.map((c, ci) => (
                    <td key={ci}
                      title={c ? `${c.ok} of ${c.n} over ${r.line}` : 'no games in this window'}
                      style={{
                        textAlign: 'center', fontSize: 12, fontWeight: 800, padding: '3px 5px',
                        borderRadius: 6, background: cellBg(c?.pct),
                        color: c ? rateCol(c.pct) : C.text3,
                        // A window with under 4 games asserts less.
                        opacity: c && c.n < 4 ? 0.55 : 1,
                        outline: on ? `1px solid ${C.green}40` : 'none',
                      }}>
                      {c ? c.pct.toFixed(0) : '—'}
                    </td>
                  ))}
                  <td style={{
                    textAlign: 'center', fontSize: 11, fontWeight: 900, padding: '3px 4px',
                    color: r.stk > 0 ? C.green : r.stk < 0 ? C.red : C.text3,
                  }}>
                    {r.stk > 0 ? `W${r.stk}` : r.stk < 0 ? `L${-r.stk}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* the active market's line chips re-grade the matrix row AND the chart */}
      {active[3].length > 1 && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', margin: '7px 0 0' }}>
          <span style={{ fontSize: 8, color: C.text3, fontWeight: 800, letterSpacing: '.08em', fontFamily: NUM_FONT }}>
            {active[1].toUpperCase()} LINE
          </span>
          {active[3].map((l) => (
            <button key={l} onClick={() => setLines((s) => ({ ...s, [active[0]]: l }))} style={{
              fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, cursor: 'pointer',
              padding: '2px 8px', borderRadius: 6,
              border: `1px solid ${lineFor(active) === l ? C.green : C.border}`,
              background: lineFor(active) === l ? `${C.green}1c` : 'transparent',
              color: lineFor(active) === l ? C.green : C.text3,
            }}>{l + 0.5}+</button>
          ))}
        </div>
      )}

      {/* the bars — the same HitRate chart, following the matrix. The KEY
          carries the LINE as well as the market: HitRate seeds its line from
          defaultBar in useState only, so without the line in the key a chip
          click re-graded the matrix row while the chart kept answering the
          OLD line — two chip rows, one screen, two different answers (the
          audit's find). Remounting on either change keeps them in step. */}
      <HitRate key={`${active[0]}-${lineFor(active)}`} log={log} market={active[0]} defaultBar={lineFor(active) + 0.5} />

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        % of games over the line, from his own log — re-graded in the browser when you move a chip,
        which is why the bot ships raw games instead of frozen rates. Dim cells sit on fewer than
        four games. STK is signed: <b style={{ color: C.green }}>W4</b> is four straight overs,{' '}
        <b style={{ color: C.red }}>L4</b> four straight unders — a cold run is information too.
      </div>
    </div>
  )
}
