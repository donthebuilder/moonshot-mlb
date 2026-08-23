'use client'
import React, { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { thresholdRates, lastSeasonRates, staffQuality, teamAbbrs, starterHands, MARKETS } from '../lib/gamelogs'
import { gridQuote, fairOdds, fmtOdds } from '../lib/odds'
import { verdictInk, verdictWash } from '../lib/scales'

// PROP GRID v5 — PATTERNS, not furniture.
//
// v4 had every feature and no opinion: pills, tiles, chips — a dashboard you
// had to interrogate. v5 leads with the two things a bettor actually wants:
//
//   1. THE MATRIX — every market × every window on one heat grid. Nothing
//      hides behind a click; comparing 1+ Hit L10 to 2+ TB L10 is a glance.
//      Click a row to open it; click a column header to set the chart span.
//
//   2. PATTERNS — the site reads his log so you don't have to: venue splits
//      that actually split, feasting on soft staffs, live streaks, surges,
//      what he does the game AFTER a big one, arm splits once loaded. Every
//      pattern fires only past a real gap (25+ points) on a real sample
//      (stated on the card), ranked by strength, max four. When nothing
//      fires, it says THAT — stability is a finding too.
//
// The value chart, line chips, venue/arm filters and pinnable bars carry
// over underneath. Live game logs; context lane, feeds no score.

// THE VERDICT PAIR, SITE-WIDE (2026-08-23, Donovan's call): warm = the good
// side, cool = the bad side — the same one-direction read the pitcher
// modal's split tiles carry. Rate strength maps onto the warm/cool axis by
// intensity instead of a four-hue green/amber/orange/red ladder.
const rateCol = (pct) => pct == null ? C.text3
  : pct >= 40 ? C.orange : pct >= 25 ? C.text2 : C.blue
const cellBg = (pct) => pct == null ? 'transparent'
  : pct >= 60 ? verdictWash(true, 0.16) : pct >= 40 ? verdictWash(true, 0.09)
  : pct >= 25 ? 'transparent' : verdictWash(false, 0.08)

// The book's price against his own: green when they're paying MORE than his
// rate says the bet is worth. Only ever fires when the book is on this row's
// exact number — otherwise it would be scoring a different bet.
const priceTone = (row) => {
  if (!row.quote?.matches || row.seasonPct == null) {
    return { fg: row.quote?.matches ? C.text : C.text3, bg: 'transparent' }
  }
  const d = row.seasonPct - row.quote.implied
  if (d >= 5) return { fg: verdictInk(true).color, bg: verdictWash(true) }
  if (d <= -5) return { fg: verdictInk(false).color, bg: verdictWash(false) }
  return { fg: C.text, bg: 'transparent' }
}

const LINES = { hit: [1, 2], tb2: [2, 3, 4], hr: [1, 2], hrr: [1, 2, 3], run: [1, 2], rbi: [1, 2], bb: [1, 2], k1: [1, 2] }
const SHORT = { hit: 'Hit', tb2: 'TB', hr: 'HR', hrr: 'HRR', run: 'Run', rbi: 'RBI', bb: 'BB', k1: 'K' }
const VAL = {
  hit: (g) => g.h, tb2: (g) => g.tb, hr: (g) => g.hr,
  run: (g) => g.r, rbi: (g) => g.rbi, hrr: (g) => g.h + g.r + g.rbi,
  // Walks (2026-08-12): reads the same as every non-K lane — higher is
  // better for the bat. bb rides the gameLog fetch lib/gamelogs.js already
  // makes; no new data for this grid to show it.
  bb: (g) => g.bb,
  // K reads INVERTED from every other lane: a high K rate is the pitcher's
  // prop, not the hitter's — the grid shades it the same, the read flips.
  k1: (g) => g.k,
}

export default function ThresholdGrid({ playerId, odds }) {
  const [data, setData] = useState(null)
  const [ls, setLs] = useState(null)
  const [staff, setStaff] = useState(null)
  const [abbrs, setAbbrs] = useState(null)
  const [hands, setHands] = useState(null)
  const [handsState, setHandsState] = useState('idle')
  const [mkt, setMkt] = useState('hr')
  const [line, setLine] = useState(1)
  const [venue, setVenue] = useState('all')
  const [arm, setArm] = useState('all')
  // 🎛 THE SITUATION BUILDER (2026-08-15, Donovan: "really would like to latch
  // the splits thing on how the props grid lets you pick different situations
  // like away or vs left ... I'd like to be able to filter the splits to see
  // what the hit rate is in certain situations.")
  //
  // The grid already recomputed the WHOLE matrix under venue and arm side —
  // that mechanism was the good part and only had two dimensions. These four
  // more come out of the same game log with no new fetch, and they stack: the
  // matrix under "on the road, vs righties, after a blank" is a question no
  // splits page can answer, because a splits page is pre-aggregated one
  // dimension at a time and this is per-game.
  const [staffQ, setStaffQ] = useState('all')   // soft / tough opposing staff
  const [rest, setRest] = useState('all')       // day off before, or not
  const [after, setAfter] = useState('all')     // the game after a blank / a big one
  const [span, setSpan] = useState('L20')
  const [selGame, setSelGame] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null); setHands(null); setHandsState('idle'); setArm('all'); setSelGame(null)
    setVenue('all'); setStaffQ('all'); setRest('all'); setAfter('all')
    thresholdRates(playerId).then((d) => { if (alive) setData(d) })
    lastSeasonRates(playerId).then((d) => { if (alive) setLs(d) })
    staffQuality().then((d) => { if (alive) setStaff(d) })
    teamAbbrs().then((d) => { if (alive) setAbbrs(d) })
    return () => { alive = false }
  }, [playerId])

  const wantArm = (k) => {
    setArm(k); setSelGame(null)
    if (k !== 'all' && handsState === 'idle') {
      setHandsState('loading')
      starterHands(playerId).then((h) => { setHands(h); setHandsState(h ? 'done' : 'none') })
    }
  }

  if (data === null) return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading game log…</div>
  if (!data) return null

  const m = MARKETS.find((x) => x.key === mkt) || MARKETS[0]
  const lines = LINES[m.key] || [1]
  const thr = lines.includes(line) ? line : lines[0]
  const valFor = VAL[m.key]
  const clears = (g) => valFor(g) >= thr
  const dynLabel = `${thr}+ ${SHORT[m.key]}`

  const full = data.logAll || data.log || []
  const armReady = arm === 'all' || (handsState === 'done' && hands)

  // TWO OF THESE ARE ABOUT THE GAME BEFORE, so they need the index, not the
  // row. The log is newest-first, so the game that came BEFORE full[i] is
  // full[i + 1] — the same off-by-one the Patterns section below gets right
  // and which is worth stating twice, because getting it backwards produces a
  // pattern that reads perfectly and means the opposite.
  const prevOf = (i) => full[i + 1] || null
  const daysOff = (i) => {
    const a = full[i]?.iso
    const b = prevOf(i)?.iso
    if (!a || !b) return null
    const d = (new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000
    return Number.isFinite(d) ? Math.round(d) - 1 : null
  }
  // Market-neutral on purpose. "After a blank" has to mean the same thing on
  // every row of the matrix or the rows stop being comparable — and it is the
  // cold case's own definition, so the two panels agree.
  const BLANK = (g) => g && (g.h + g.r + g.rbi) === 0 && (g.ab > 0 || g.bb > 0)
  const BIG = (g) => g && (g.h >= 2 || g.hr >= 1)

  const pool = full
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => (venue === 'all' ? true : venue === 'home' ? g.home : !g.home))
    .filter(({ g }) => ((arm === 'all' || !armReady) ? true : hands[g.gamePk] === arm))
    .filter(({ g }) => {
      if (staffQ === 'all' || !staff) return true
      const soft = staff[g.oppId]?.soft
      if (soft == null) return false
      return staffQ === 'soft' ? soft >= 0.6 : soft <= 0.4
    })
    .filter(({ i }) => {
      if (rest === 'all') return true
      const d = daysOff(i)
      if (d == null) return false          // his first logged game — unknowable
      return rest === 'rested' ? d >= 1 : d === 0
    })
    .filter(({ i }) => {
      if (after === 'all') return true
      const prev = prevOf(i)
      if (!prev) return false
      return after === 'blank' ? BLANK(prev) : BIG(prev)
    })
    .map(({ g }) => g)

  const anyFilter = venue !== 'all' || arm !== 'all' || staffQ !== 'all' || rest !== 'all' || after !== 'all'
  // WHAT A FILTERED RATE IS WORTH. "62% on the road vs righties after a blank"
  // is meaningless on its own — the only question is whether it differs from
  // what he does normally, and by more than a sample that small can produce.
  // So the read-out under the chips always carries three things: the filtered
  // rate, his unfiltered one, and the error bar on the gap.
  const baseRate = full.length
    ? (100 * full.filter(clears).length) / full.length : null
  const cutRate = pool.length
    ? (100 * pool.filter(clears).length) / pool.length : null
  const cutGap = (cutRate != null && baseRate != null) ? cutRate - baseRate : null
  const cutSe = (cutRate != null && pool.length)
    ? 100 * Math.sqrt(Math.max((baseRate / 100) * (1 - baseRate / 100), 1e-6) / pool.length)
    : null
  const cutReal = cutGap != null && cutSe != null && Math.abs(cutGap) >= 2 * cutSe

  const SPAN_N = { L5: 5, L10: 10, L20: 20, Szn: 40 }
  const filteredLog = pool.slice(0, SPAN_N[span] || 20)
  const lsGames = ls?._games || null

  // ── THE MATRIX ─────────────────────────────────────────────────────────────
  // Every market at its ACTIVE line (selected market honors the line chips).
  const WINDOWS = [['L5', 5], ['L10', 10], ['L20', 20], ['Szn', 9999]]
  const matrix = MARKETS.map((mk) => {
    const t = mk.key === m.key ? thr : (LINES[mk.key] || [1])[0]
    const v = VAL[mk.key]
    const clr = (g) => v(g) >= t
    const cells = WINDOWS.map(([w, size]) => {
      const seg = pool.slice(0, size)
      return seg.length ? { pct: (100 * seg.filter(clr).length) / seg.length, ok: seg.filter(clr).length, n: seg.length } : null
    })
    const lsCell = lsGames?.length ? { pct: (100 * lsGames.filter(clr).length) / lsGames.length, ok: lsGames.filter(clr).length, n: lsGames.length } : null
    let stk = 0
    if (pool.length) {
      const first = clr(pool[0]); let k = 0
      for (const g of pool) { if (clr(g) === first) k++; else break }
      stk = first ? k : -k
    }
    // THE PRICE, AND ONLY WHEN IT IS THE SAME BET. `t` is this row's threshold;
    // gridQuote returns matches=false when the book is at a different number,
    // and pairing that price with this row's rate would be confidently wrong.
    const q = gridQuote(odds, { player_id: playerId }, mk.key, t)
    // His own break-even: the price at which THIS rate is exactly fair. That's
    // the "true price" — everything longer is value, everything shorter isn't.
    const seasonPct = cells[3]?.pct ?? cells[2]?.pct ?? null
    return { key: mk.key, label: `${t}+ ${SHORT[mk.key]}`, cells, lsCell, stk,
             quote: q, fair: fairOdds(seasonPct), seasonPct }
  })

  // ── PATTERNS — mined from the UNfiltered log at the active line ────────────
  const rate = (gs) => (gs.length ? { ok: gs.filter(clears).length, n: gs.length, pct: (100 * gs.filter(clears).length) / gs.length } : null)
  const patterns = []
  const push = (icon, claim, a, b, extra) => {
    if (!a || !b) return
    const gap = Math.abs(a.pct - b.pct)
    if (gap < 25) return
    patterns.push({
      icon, claim,
      detail: `${a.pct.toFixed(0)}% (${a.ok}/${a.n}) vs ${b.pct.toFixed(0)}% (${b.ok}/${b.n})${extra ? ` — ${extra}` : ''}`,
      strength: gap * Math.sqrt(Math.min(a.n, b.n)),
    })
  }
  const home = rate(full.filter((g) => g.home)), away = rate(full.filter((g) => !g.home))
  if (home?.n >= 8 && away?.n >= 8) {
    if (home.pct > away.pct) push('🏠', `Home hitter on ${dynLabel}`, home, away, 'venue is real for him')
    else push('✈️', `Road hitter on ${dynLabel}`, away, home, 'travels well')
  }
  if (staff) {
    const soft = rate(full.filter((g) => staff[g.oppId]?.soft >= 0.67))
    const tough = rate(full.filter((g) => staff[g.oppId]?.soft <= 0.33))
    if (soft?.n >= 6 && tough?.n >= 6) {
      if (soft.pct > tough.pct) push('🍰', 'Feasts on soft staffs', soft, tough, 'check tonight’s staff rank')
      else push('🛡', 'Shows up against GOOD arms', tough, soft, 'the rarer kind of split')
    }
  }
  if (armReady && hands && arm === 'all') {
    const vsR = rate(full.filter((g) => hands[g.gamePk] === 'R'))
    const vsL = rate(full.filter((g) => hands[g.gamePk] === 'L'))
    if (vsR?.n >= 5 && vsL?.n >= 5) {
      if (vsL.pct > vsR.pct) push('🫲', 'Lefty killer', vsL, vsR, 'starter-arm basis')
      else push('🫱', 'Better vs righties', vsR, vsL, 'starter-arm basis')
    }
  }
  const l5r = rate(full.slice(0, 5)), prior15 = rate(full.slice(5, 20))
  if (l5r?.n >= 5 && prior15?.n >= 10) {
    if (l5r.pct > prior15.pct) push('📈', 'Surging right now', l5r, prior15, 'last 5 vs the 15 before')
    else push('📉', 'Fading right now', prior15, l5r, 'last 5 vs the 15 before')
  }
  // the game AFTER a big one (log is newest-first: the next game is i-1)
  const afterBig = [], baselineIdx = []
  full.forEach((g, i) => {
    if (i === 0) return
    if (valFor(full[i]) >= thr + 1) afterBig.push(full[i - 1])
    else baselineIdx.push(full[i - 1])
  })
  const ab = rate(afterBig), bl = rate(baselineIdx)
  if (ab?.n >= 5 && bl?.n >= 10) {
    if (ab.pct > bl.pct) push('🔥', 'Carries momentum', ab, bl, 'the game after a big one vs otherwise')
    else push('🧊', 'Cools off after big games', bl, ab, 'fade the encore')
  }
  let stkAll = 0
  if (full.length) {
    const first = clears(full[0]); let k = 0
    for (const g of full) { if (clears(g) === first) k++; else break }
    stkAll = first ? k : -k
  }
  if (Math.abs(stkAll) >= 4) {
    patterns.push({
      icon: stkAll > 0 ? '⚡' : '🥶',
      claim: stkAll > 0 ? `Cleared ${dynLabel} ${stkAll} straight` : `Missed ${dynLabel} ${-stkAll} straight`,
      detail: stkAll > 0 ? 'live streak, newest games' : 'live cold run, newest games',
      strength: Math.abs(stkAll) * 12,
    })
  }
  patterns.sort((a, b) => b.strength - a.strength)
  const topPatterns = patterns.slice(0, 4)

  // chart scaffolding
  const avgVal = filteredLog.length ? filteredLog.reduce((a, g) => a + valFor(g), 0) / filteredLog.length : null
  const maxVal = Math.max(thr + 1, ...filteredLog.map(valFor), 1)
  const unit = 42 / maxVal
  const showNums = filteredLog.length <= 28

  const chip = (on) => ({
    padding: '2px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
    fontWeight: 700, fontFamily: NUM_FONT,
    border: `1px solid ${on ? C.orange : C.border}`,
    background: on ? 'rgba(249,115,22,.14)' : 'transparent',
    color: on ? C.orange : C.text3,
  })

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>🎯 Props</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>every market, every window — click a row to open it</span>
      </div>

      <div style={{
        background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
        border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 15px',
      }}>
        {/* ══ THE MATRIX ══ */}
        {/* .dense-scroll (2026-08-10 phone pass): this was a bare
            overflowX:auto, so on a phone it scrolled with a stock scrollbar, no
            momentum, and at full desktop cell padding — the one dense table on
            the site that wasn't wearing the treatment every other one has. */}
        <div className="dense-scroll rail" style={{ overflowX: 'auto' }}>
          {/* Tightened 2026-08-08: spacing and padding trimmed so the whole
              matrix sits above the fold in the modal — the grid's value is
              seeing every market at once, which a scroll defeats. */}
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '2px 2px', fontFamily: NUM_FONT }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: 8.5, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', padding: '0 6px' }}>Market</th>
                {WINDOWS.map(([w]) => (
                  <th key={w} onClick={() => { setSpan(w); setSelGame(null) }}
                    title="Click — the chart below shows this window"
                    style={{
                      fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em',
                      color: span === w ? C.orange : C.text3, cursor: 'pointer', padding: '0 4px',
                      borderBottom: span === w ? `2px solid ${C.orange}` : '2px solid transparent',
                    }}>{w === 'Szn' ? 'Season' : w}</th>
                ))}
                <th style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, padding: '0 4px' }}>{new Date().getFullYear() - 1}</th>
                <th style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, padding: '0 4px' }}>STK</th>
                <th title="What the book pays for this exact bet. Green means it pays more than his own rate says it should."
                    style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, padding: '0 4px' }}>PRICE</th>
                <th title="His TRUE price — the number at which his own rate for this row breaks even. The book paying longer than this is value; shorter is not."
                    style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, padding: '0 4px' }}>TRUE</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => {
                const on = row.key === m.key
                return (
                  <tr key={row.key} onClick={() => { setMkt(row.key); setLine((LINES[row.key] || [1])[0]); setSelGame(null) }}
                    style={{ cursor: 'pointer' }}>
                    <td style={{
                      fontSize: 11, fontWeight: on ? 900 : 700, whiteSpace: 'nowrap',
                      color: on ? C.orange : C.text, padding: '3px 6px',
                      borderLeft: `3px solid ${on ? C.orange : 'transparent'}`, borderRadius: 4,
                    }}>{row.label}</td>
                    {row.cells.map((c, ci) => (
                      <td key={ci} title={c ? `cleared ${c.ok} of ${c.n}` : 'no games in this window'} style={{
                        textAlign: 'center', fontSize: 12, fontWeight: 800, padding: '3px 4px',
                        borderRadius: 6, background: cellBg(c?.pct),
                        color: c ? rateCol(c.pct) : C.text3,
                        outline: on ? '1px solid rgba(249,115,22,.25)' : 'none',
                      }}>{c ? `${c.pct.toFixed(0)}` : '—'}</td>
                    ))}
                    <td title={row.lsCell ? `${row.lsCell.ok}/${row.lsCell.n} last season` : ''} style={{
                      textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '3px 4px',
                      borderRadius: 6, color: row.lsCell ? rateCol(row.lsCell.pct) : C.text3, opacity: 0.75,
                    }}>{row.lsCell ? row.lsCell.pct.toFixed(0) : '—'}</td>
                    <td style={{
                      textAlign: 'center', fontSize: 11, fontWeight: 900, padding: '3px 4px',
                      color: row.stk > 0 ? verdictInk(true).color : row.stk < 0 ? verdictInk(false).color : C.text3,
                    }}>{row.stk > 0 ? `W${row.stk}` : row.stk < 0 ? `L${-row.stk}` : '—'}</td>
                    {/* PRICE and TRUE are BOTH American odds, on purpose.
                        The first draft put a percentage-point edge in the
                        second column and fell back to a fair PRICE when there
                        was no quote — so one column carried "+12" (points) and
                        "+675" (odds) with nothing to tell them apart. A +675
                        reading as a 675-point edge is exactly the kind of
                        confident nonsense this file exists to prevent. Two
                        columns, one unit each, directly comparable: what
                        they pay vs what he's worth. The gap in points lives in
                        the tooltip, where it can be labelled. */}
                    <td title={
                      !row.quote ? 'No price published for this market.'
                        : !row.quote.matches
                          ? `The book is at ${row.quote.line} (${row.quote.threshold}+), not ${row.label} — a different bet, so its price isn't shown here.`
                          : `${fmtOdds(row.quote.over)} · needs ${row.quote.implied}% to break even`
                            + (row.quote.best_over ? ` · best ${fmtOdds(row.quote.best_over)} at ${row.quote.best_book}` : '')
                            + (row.quote.lines_seen > 1 ? `\n⚠ books disagree on the line (${row.quote.lines_seen} seen)` : '')
                            + (row.seasonPct != null
                              ? `\nhe clears it ${row.seasonPct.toFixed(0)}% → ${(row.seasonPct - row.quote.implied) > 0 ? '+' : ''}${(row.seasonPct - row.quote.implied).toFixed(0)}pp vs the price`
                              : '')
                    } style={{
                      textAlign: 'center', fontSize: 11, fontWeight: 800, padding: '3px 4px',
                      borderRadius: 6, whiteSpace: 'nowrap',
                      color: priceTone(row).fg, background: priceTone(row).bg,
                    }}>
                      {row.quote?.matches ? fmtOdds(row.quote.over)
                        : row.quote ? <span style={{ fontSize: 9 }}>@{row.quote.threshold}+</span>
                          : '—'}
                    </td>
                    {/* HIS TRUE PRICE. Independent of any book — it's just his
                        own rate for THIS row expressed as odds, so it still
                        answers "what is he worth here" on the rows nobody
                        prices (walks, strikeouts) and on the nights no board
                        publishes at all. */}
                    <td title={row.fair
                      ? `He clears ${row.label} in ${row.seasonPct.toFixed(0)}% of the games in view, which is exactly fair at ${fmtOdds(row.fair)}. Longer than that is value; shorter is paying for the privilege.`
                      : 'Not enough games in view to price him.'} style={{
                      textAlign: 'center', fontSize: 10.5, fontWeight: 700, padding: '3px 4px',
                      color: C.text2, whiteSpace: 'nowrap',
                    }}>{row.fair ? fmtOdds(row.fair) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Legend with the actual thresholds (2026-08-08): the four tiers
            existed only as unexplained colors — now the cut-offs are stated
            in the colors they produce, so the grid teaches its own key. */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline',
          fontSize: 8.5, color: C.text3, margin: '5px 6px 0', fontFamily: NUM_FONT,
        }}>
          <span>% of games cleared:</span>
          <b style={{ color: C.orange }}>60%+</b>
          <b style={{ color: '#FCD34D' }}>40–59</b>
          <b style={{ color: C.orange }}>25–39</b>
          <b style={{ color: C.blue }}>under 25</b>
          <span>· hover any cell for the fraction · {new Date().getFullYear() - 1} = all last season · STK = current streak</span>
          <span style={{ width: '100%', height: 0 }} />
          <span><b style={{ color: C.text2 }}>PRICE</b> = what the book pays ·{' '}
            <b style={{ color: C.text2 }}>TRUE</b> = the price his own rate deserves ·{' '}
            <b style={{ color: C.orange }}>warm</b> = they&apos;re paying more than he&apos;s worth ·{' '}
            <b>@3+</b> = the book is on a different number</span>
        </div>

        {/* ══ PATTERNS ══ */}
        <div style={{ marginTop: 13, paddingTop: 11, borderTop: `1px dashed ${C.border2}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 7 }}>
            <span style={{ fontSize: 11.5, fontWeight: 900 }}>🧭 What repeats</span>
            <span style={{ fontSize: 9, color: C.text3 }}>
              what actually repeats in his log for <b style={{ color: C.text2 }}>{dynLabel}</b> — 25+ point gaps on real samples only
            </span>
          </div>
          {topPatterns.length ? (
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
              {topPatterns.map((pt, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
                  borderRadius: 9, padding: '7px 11px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800 }}>{pt.icon} {pt.claim}</div>
                  <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>{pt.detail}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.5 }}>
              No strong pattern on {dynLabel} — his rate holds across venue, opponent quality and recent form.
              Stability is a finding: what you see in the matrix is what you should expect.
            </div>
          )}
          {handsState === 'idle' && (
            <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5 }}>
              arm-side patterns appear after the vs RHP / vs LHP filter below loads the starters (tap it once)
            </div>
          )}
        </div>

        {/* ══ CHART + FILTERS ══ */}
        <div style={{ marginTop: 13, paddingTop: 11, borderTop: `1px dashed ${C.border2}` }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            {lines.length > 1 && (
              <>
                <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Line</span>
                {lines.map((v) => (
                  <button key={v} onClick={() => { setLine(v); setSelGame(null) }} style={chip(thr === v)}
                    title={`Over ${v - 0.5} — needs ${v}+ to cash`}>{v}+</button>
                ))}
                <span style={{ width: 6 }} />
              </>
            )}
            {[['all', 'All'], ['home', 'Home'], ['away', 'Away']].map(([k, label]) => (
              <button key={k} onClick={() => { setVenue(k); setSelGame(null) }} style={chip(venue === k)}>{label}</button>
            ))}
            <span style={{ width: 6 }} />
            {[['all', 'Any arm'], ['R', 'vs RHP'], ['L', 'vs LHP']].map(([k, label]) => (
              <button key={k} onClick={() => wantArm(k)} style={chip(arm === k)}
                title="Games where the opposing STARTER threw from this side">{label}</button>
            ))}
            <span style={{ width: 6 }} />
            {[['all', 'Any staff'], ['soft', 'vs soft staffs'], ['tough', 'vs good staffs']].map(([k, label]) => (
              <button key={k} onClick={() => { setStaffQ(k); setSelGame(null) }} style={chip(staffQ === k)}
                title="Where the opponent's whole staff sits in the league's OPS-against range that season — not just the starter.">{label}</button>
            ))}
            <span style={{ width: 6 }} />
            {[['all', 'Any rest'], ['b2b', 'no day off'], ['rested', 'after a day off']].map(([k, label]) => (
              <button key={k} onClick={() => { setRest(k); setSelGame(null) }} style={chip(rest === k)}
                title="Days between this game and his previous one, from the log's own dates. His first logged game has no answer and drops out of both.">{label}</button>
            ))}
            <span style={{ width: 6 }} />
            {[['all', 'Any lead-in'], ['blank', 'after a blank'], ['big', 'after a big one']].map(([k, label]) => (
              <button key={k} onClick={() => { setAfter(k); setSelGame(null) }} style={chip(after === k)}
                title="What he did in his PREVIOUS game. A blank is no hit, no run, no RBI — the cold case's definition, so the two panels agree. A big one is 2+ hits or a homer.">{label}</button>
            ))}
            {arm !== 'all' && handsState === 'loading' && (
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>checking who started each game…</span>
            )}
            {arm !== 'all' && handsState === 'none' && (
              <span style={{ fontSize: 9, color: C.orange, fontFamily: NUM_FONT }}>couldn&apos;t resolve starters — showing all</span>
            )}
            {anyFilter && (
              <button onClick={() => { setVenue('all'); setArm('all'); setStaffQ('all'); setRest('all'); setAfter('all'); setSelGame(null) }}
                style={{ ...chip(false), borderStyle: 'dashed' }}
                title="Back to every game">clear</button>
            )}
          </div>

          {/* THE SITUATION READ-OUT. One sentence, and it refuses to call a
              gap real until it beats two standard errors — the same bar the
              True Price page and the cold case use. */}
          {anyFilter && (
            <div style={{
              fontSize: 10.5, lineHeight: 1.6, marginBottom: 9, padding: '7px 10px',
              borderRadius: 9, background: 'rgba(255,255,255,.03)',
              border: `1px solid ${cutReal ? (cutGap > 0 ? 'rgba(74,222,128,.35)' : 'rgba(248,113,113,.35)') : C.border}`,
              color: C.text2,
            }}>
              {pool.length === 0 ? (
                <>No games match that situation this season — the matrix above is empty, not zero.</>
              ) : (
                <>
                  <b style={{ color: C.text }}>{pool.length}</b> game{pool.length === 1 ? '' : 's'} match.
                  He clears <b style={{ color: C.text }}>{dynLabel}</b> in{' '}
                  <b style={{ color: cutReal ? verdictInk(cutGap > 0).color : C.text }}>
                    {cutRate.toFixed(0)}%
                  </b>{' '}of them against <b style={{ color: C.text }}>{baseRate.toFixed(0)}%</b> overall
                  {cutGap != null && <> — <b style={{ color: C.text }}>{cutGap > 0 ? '+' : ''}{cutGap.toFixed(0)}</b> points</>}.
                  {' '}
                  {cutReal
                    ? <span style={{ color: verdictInk(cutGap > 0).color }}>
                        That clears the error bar (±{cutSe.toFixed(0)}) on this many games.
                      </span>
                    : <span style={{ color: C.text3 }}>
                        {pool.length < 6
                          ? 'Far too few games to read anything into that.'
                          : `Inside the error bar (±${cutSe.toFixed(0)}) at ${pool.length} games — treat it as the same rate.`}
                      </span>}
                </>
              )}
            </div>
          )}

          {filteredLog.length > 0 && (
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, right: 0,
                bottom: 10 + Math.min(46, (thr - 0.5) * unit), height: 1,
                background: 'rgba(255,255,255,.35)', pointerEvents: 'none', zIndex: 2,
              }} title={`the ${thr - 0.5} line`} />
              {avgVal != null && (
                <div style={{
                  position: 'absolute', left: 0, right: 0,
                  bottom: 10 + Math.min(46, avgVal * unit), height: 0,
                  borderTop: '1px dashed rgba(249,115,22,.6)', pointerEvents: 'none', zIndex: 2,
                }} title={`his average: ${avgVal.toFixed(1)} per game in view`} />
              )}
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                {[...filteredLog].reverse().map((g, gi) => {
                  const val = valFor(g)
                  const ok = val >= thr
                  const q = staff?.[g.oppId]
                  const ab2 = abbrs?.[g.oppId] || g.opp
                  const oppCol = q ? `rgba(249,115,22,${(0.18 + q.soft * 0.72).toFixed(2)})` : 'rgba(255,255,255,.08)'
                  const oppNote = q ? ` · ${ab2} staff: OPS-against ${q.ops.toFixed(3)}, #${q.rank}/30 toughest` : ''
                  const isSel = selGame === `${g.date}${gi}`
                  const hgt = Math.max(5, Math.min(48, 5 + val * unit))
                  return (
                    <div key={gi} title={`${g.date} ${g.home ? 'vs' : '@'} ${ab2} — ${val} (${g.h}H ${g.tb}TB ${g.hr}HR)${oppNote}`}
                      onClick={() => setSelGame(isSel ? null : `${g.date}${gi}`)}
                      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'pointer' }}>
                      {showNums && val > 0 && (
                        <div style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, color: ok ? verdictInk(true).color : verdictInk(false).color, textAlign: 'center', marginBottom: 1 }}>{val}</div>
                      )}
                      <div style={{
                        height: hgt, borderRadius: '3px 3px 1px 1px',
                        background: ok
                          ? `linear-gradient(180deg, ${verdictWash(true, 0.85)}, ${verdictInk(true).color})`
                          : val > 0 ? 'linear-gradient(180deg, rgba(248,113,113,.6), rgba(248,113,113,.35))' : 'rgba(248,113,113,.22)',
                        boxShadow: isSel ? '0 0 0 1.5px #fff' : ok && val >= thr + 1 ? '0 0 9px rgba(74,222,128,.45)' : 'none',
                      }} />
                      <div style={{ height: 4, borderRadius: 2, marginTop: 3, background: isSel ? '#fff' : oppCol }} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {selGame && (() => {
            const rev = [...filteredLog].reverse()
            const idx = rev.findIndex((g, gi) => `${g.date}${gi}` === selGame)
            if (idx < 0) return null
            const g = rev[idx]
            const q = staff?.[g.oppId]
            const ab2 = abbrs?.[g.oppId] || g.opp
            const hand = hands?.[g.gamePk]
            return (
              <div style={{
                marginTop: 7, padding: '6px 10px', borderRadius: 8, fontSize: 10.5,
                fontFamily: NUM_FONT, color: C.text2, background: 'rgba(255,255,255,.04)',
                border: `1px solid ${C.border2}`, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline',
              }}>
                <b style={{ color: C.text }}>{g.date} {g.home ? 'vs' : '@'} {ab2}</b>
                <span>{g.h} H</span><span>{g.tb} TB</span>
                <span style={{ color: g.hr > 0 ? verdictInk(true).color : undefined, fontWeight: g.hr > 0 ? 800 : 400 }}>{g.hr} HR</span>
                <span>{g.r} R</span><span>{g.rbi} RBI</span><span style={{ color: C.text3 }}>{g.ab} AB</span>
                {hand && <span style={{ color: C.text3 }}>{hand}HP started</span>}
                {q && <span style={{ color: C.text3 }}>staff #{q.rank}/30 · OPS-ag {q.ops.toFixed(3)}</span>}
                <button onClick={() => setSelGame(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            )
          })()}

          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8, lineHeight: 1.55 }}>
            {filteredLog.length} games of <b style={{ color: C.text2 }}>{dynLabel}</b>, newest right — bar height is the
            count, <span style={{ color: C.orange }}>warm clears the {thr - 0.5} line</span> (white rule), the dashed
            orange rule is his average{staff && <>; the strip under each bar is the opposing staff —{' '}
            <span style={{ color: C.orange }}>brighter = softer arms</span></>}. Tap a bar to pin that game.
          </div>
        </div>
      </div>
    </div>
  )
}
