'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, BARS } from '../../lib/nfl/theme'
import HitRate from './HitRate'
import ValueBars from '../ValueBars'
import { alpha } from '../../lib/scales'

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

// THE RATE CELLS (2026-10-07, the visual audit: red / green semantics are banned). ONE accent, TUDDY's:
// the more of his games over the line, the brighter the cell, white number on it (dark enough under it
// to read at 4.5:1). A window on under four games is a flat grey slab that makes no claim. Every cell
// prints its sample, `4/5`, so the size of the sample is never a colour.
const THIN = 4
const cellBg = (c) => (c == null ? 'transparent' : c.n < THIN ? BARS.thin : alpha(C.green, 0.06 + 0.4 * (c.pct / 100)))
// the look the bars wear (lib/nfl/theme BARS + the page's inks)
const LOOK = { clear: BARS.clear, miss: BARS.miss, missInk: BARS.missInk, rule: BARS.rule, ink: C.text, ink2: C.text2, bg: C.bg }

export default function PropsGrid({ log, market: initialMarket, defaultBar, scores }) {
  const [mkt, setMkt] = useState(initialMarket || 'REC')
  const [lines, setLines] = useState({})          // per-market line override
  const [sort, setSort] = useState(null)          // {w, dir} or null
  const [pin, setPin] = useState(null)            // the pinned bar's game

  // Only markets this player actually plays.
  //
  // 2026-09-07. The old test was "has he ever recorded a non-zero value here",
  // and it is far too weak. Ten of the league's sixty-five quarterbacks have
  // caught a pass at some point in their log, so ten quarterbacks were handed a
  // "5+ Rec" row reading 0 / 0 / 0 / 0 with an L34 cold streak stamped on the
  // end of it. Same for the kicker with one career carry and the nine wide
  // receivers with a trick-play completion. A row that can only ever say zero
  // is not information, and the signed-streak column made it read as a finding.
  //
  // A market earns its row three ways, cheapest test first:
  //   · it is the market you opened him from — never hide the row you came for
  //   · the bot scores him in it — the model has already ruled him eligible
  //   · he has cleared the market's EASIEST line at least once, which is
  //     precisely the question "could this row ever show a number but zero"
  //
  // Checked against the live Week 1 payload: 259 all-zero rows disappear across
  // 219 players. Goff drops from six rows to three (rush yds, pass yds, TD);
  // Chase keeps rec / rec yds / TD and loses the phantom carries; Barkley, who
  // genuinely does all five, keeps all five; Dicker keeps his one.
  const live = useMemo(() => {
    const all = log || []
    return MARKETS.filter(([key, , statKey, presets]) => {
      if (key === initialMarket) return true
      if (Number.isFinite(scores?.[key])) return true
      return all.some((g) => Number(g[statKey]) > presets[0])
    })
  }, [log, initialMarket, scores])

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
    fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, letterSpacing: '.07em',
    color: C.text2, padding: '0 4px 6px', textTransform: 'uppercase', cursor: 'pointer',
    whiteSpace: 'nowrap', textAlign: 'center', userSelect: 'none',
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: C.text2, letterSpacing: '.1em' }}>
          🎯 PROPS — EVERY MARKET, EVERY WINDOW
        </span>
        <span style={{ fontSize: 12, color: C.text2 }}>
          tap a row to open it · tap L5, L10 or L20 to rank by it
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
                  color: sort?.w === wi ? C.green : C.text2,
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
                    fontSize: 15, fontWeight: on ? 900 : 700, whiteSpace: 'nowrap',
                    color: on ? C.green : C.text, padding: '3px 6px',
                    borderLeft: `3px solid ${on ? C.green : 'transparent'}`, borderRadius: 4,
                  }}>
                    {r.line + 0.5}+ {r.label}
                  </td>
                  {r.cells.map((c, ci) => (
                    <td key={ci}
                      title={c ? `${c.ok} of ${c.n} over ${r.line}${c.n < THIN ? ' (too few games to lean on)' : ''}` : 'no games in this window'}
                      style={{
                        textAlign: 'center', padding: '5px 4px', borderRadius: 8, background: cellBg(c),
                        color: c ? (c.n < THIN ? C.text2 : C.text) : C.text3, lineHeight: 1.05,
                        outline: on ? `1px solid ${alpha(C.green, 0.4)}` : 'none',
                      }}>
                      {c ? (
                        <>
                          <div style={{ fontSize: 17, fontWeight: 900 }}>{c.pct.toFixed(0)}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, marginTop: 2 }}>{c.ok}/{c.n}</div>
                        </>
                      ) : '—'}
                    </td>
                  ))}
                  <td style={{
                    textAlign: 'center', fontSize: 13, fontWeight: 900, padding: '3px 4px',
                    color: r.stk > 0 ? C.green : C.text2,
                  }}>
                    {r.stk > 0 ? `W${r.stk}` : r.stk < 0 ? `L${-r.stk}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* the active market's line chips re-grade the matrix row AND the chart: 44px pills */}
      {active[3].length > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.text2, fontWeight: 800, letterSpacing: '.08em', fontFamily: NUM_FONT }}>
            {active[1].toUpperCase()} LINE
          </span>
          {active[3].map((l) => {
            const on = lineFor(active) === l
            return (
              <button key={l} onClick={() => setLines((s) => ({ ...s, [active[0]]: l }))} aria-pressed={on} style={{
                fontFamily: NUM_FONT, fontSize: 16, fontWeight: 900, cursor: 'pointer',
                minHeight: 44, minWidth: 56, padding: '0 16px', borderRadius: 999,
                border: `2px solid ${on ? C.green : C.border2}`,
                background: on ? C.green : 'transparent',
                color: on ? C.bg : C.text,
              }}>{l + 0.5}+</button>
            )
          })}
        </div>
      )}

      {/* THE BARS (2026-10-05, Donovan: "not showing all the bars like on mlb"): MOONSHOT's value
          chart (components/ValueBars) for the active market and line, over the window the matrix is
          sorted by (L10 until a header is tapped) -- one bar a game, oldest left, warm over the line,
          the dashed rule his average, the streak band under it. Tap a bar for that game's line. */}
      {(() => {
        const span = WINDOWS[sort?.w ?? 1]
        const seg = (log || []).slice(-span[1])
        const thr = lineFor(active) + 0.5
        const games = seg.map((g, i) => ({ key: `${g.s}-${g.w}-${i}`, val: Number(g[active[2]]) || 0, opp: g.opp || null, week: g.w ?? null, season: g.s ?? null,
          title: `${g.w != null ? `wk ${g.w}` : ''}${g.s ? ` '${String(g.s).slice(-2)}` : ''}${g.opp ? ` ${g.opp}` : ''} — ${Number(g[active[2]]) || 0} ${active[1].toLowerCase()}`, g }))
        const p = games.find((x) => x.key === pin)
        if (!games.length) return null
        return (
          <div style={{ marginTop: 14 }}>
            {/* the headline: HitRate's one sentence, over the games it was counted from (same window) */}
            <HitRate key={`${active[0]}-${lineFor(active)}-${span[1]}`} log={log} market={active[0]} defaultBar={thr} label={active[1]} span={span[1]} big />
            <div style={{ fontSize: 12, color: C.text2, fontFamily: NUM_FONT, margin: '12px 0 8px' }}>
              {span[0] === 'All' ? `All ${games.length}` : `Last ${games.length}`} games · newest on the right
            </div>
            <ValueBars variant="broadcast" look={LOOK} sport="nfl" games={games} thr={thr} numFont={NUM_FONT} selected={pin} onSelect={setPin} />
            {p && (
              <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, fontSize: 13, fontFamily: NUM_FONT, color: C.text2, background: 'rgba(255,255,255,.04)', border: `1px solid ${C.border}`, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <b style={{ color: C.text }}>{p.title.split(' — ')[0]}</b>
                {MARKETS.filter(([, , k]) => Number(p.g[k]) > 0).map(([key, label, k]) => <span key={key}>{Number(p.g[k])} {label.toLowerCase()}</span>)}
                <button onClick={() => setPin(null)} aria-label="Unpin this game" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.text2, cursor: 'pointer', fontSize: 14, minHeight: 44, minWidth: 44 }}>✕</button>
              </div>
            )}
          </div>
        )
      })()}

      <div style={{ fontSize: 12, color: C.text2, marginTop: 10, lineHeight: 1.5 }}>
        % of his games over the line, with the games it was counted from under it. Move a line chip and every number
        re-counts. Grey cells sit on fewer than four games. <b style={{ color: C.green }}>W4</b> is four straight overs;
        a cold run just shows as <b style={{ color: C.text }}>L4</b>.
      </div>
    </div>
  )
}
