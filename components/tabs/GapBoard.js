'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, nameOf, teamOf, oppOf } from '../../lib/player'
import { fmtOdds, impliedPct, normName } from '../../lib/odds'
import { gapDepth, TRIPLES_MIN_PA } from '../../lib/triples'
import DenseTable from '../DenseTable'
import { boardRow, boardRowContext, withBoardColumns, placeAfter } from '../../lib/boardColumns'
import { useGameNav } from '../../lib/teamNav'

// ══ THE GAP BOARD — doubles and triples ═════════════════════════════════════
//
// Donovan, 2026-09-03: "can we add like triple page and triples score kind
// alike how we did the steals and such" → then the model spec: "best people
// for triples are people already hitting them then park factors ... and
// pitcher triples and xbh given plus team errors allowed or xbh given babip."
//
// THE PAGE IS HERE. THE SCORE IS NOT, AND THAT IS A MEASURED DECISION.
//
// The plan was to score this on DOUBLES, because triples had 27 graded events
// and doubles had 385 — fourteen times the sample, same construction, same
// published fields. So it was built and tested against 2,297 graded
// player-nights before any of it shipped:
//
//     doubles composite, top decile    0.76x base   (z = -1.46)
//       first half 0.86x · second half 0.59x  — consistently BELOW random
//     best single term, recent_ld_rate  1.22x       (z = +1.34)
//     a RANDOM score's top decile lands 0.78x - 1.25x, 95% of the time
//
// The best term on the board sits INSIDE the noise band and the composite is
// worse than a coin. The event count was never the problem; the signal is not
// in these fields. `lib/triples.js` carries the full result and is wired to
// nothing.
//
// So this board does what the steal board did on the day it shipped: it ranks
// on counts and rates the bot published, prints the denominator beside every
// rate, and makes no claim it cannot support.
//
// ── THE THREE REFUSALS ──────────────────────────────────────────────────────
//
//   1. NO SCORE, for either market. See above. This is not "not yet" pending
//      more nights — more nights of the same fields will not help. It is
//      pending a feature nobody has tried.
//   2. NO PARK TRIPLES FACTOR. The slate carries park factors for HR, hits,
//      distance, barrels, hard-hit and K — and none for extra-base hits. What
//      it does carry is real outfield dimensions, so the Gaps column is
//      (LCF+RCF)/2 minus (LF+RF)/2 in feet, labelled as the geometry it is.
//      It ranks tonight's parks Fenway +94, PNC +60, Kauffman +57, Dodger +55,
//      which is the real triples leaderboard — but it is a proxy and says so.
//   3. NO PITCHER XBH RATE. `pitcher_xbh_vs_lhb` / `_vs_rhb` are on the row
//      and they are raw COUNTS running 0-43, with no batters-faced field
//      anywhere in the payload. Ranking by them ranks innings pitched, not
//      vulnerability, so the pitcher column shows his line-drive rate and ISO
//      against — both already rates.
//
// WHAT IT IS FOR, stated so it cannot drift: an extra-base hit needs a man who
// hits the ball on a line and a place for it to land. The board ranks on the
// bat but always prints the park beside it, because the same swing is a double
// in one yard and an out in another.

const per600 = (v, pa) => (pa >= TRIPLES_MIN_PA ? (n(v, 0) / pa) * 600 : null)
const xbhOf = (p) => n(p?.season_doubles, 0) + n(p?.season_triples, 0) + n(p?.season_hr, 0)

// The over on 0.5 — "a double tonight", "a triple tonight" — and only that
// line. A book sitting on 1.5 is a different bet and is shown as such rather
// than being quietly ranked alongside.
export function gapPriceFor(odds, p, market) {
  if (!odds || !p) return null
  const byId = odds.by_player_id?.[String(p.player_id ?? p.id)]
  const byName = odds.by_name?.[normName(p.name || p.player_name)]
  const q = (byId || byName)?.[market]
  if (!q || q.over == null) return null
  const line = Number(q.line)
  return {
    over: q.over, implied: q.implied ?? impliedPct(q.over), line,
    matches: Math.abs(line - 0.5) < 1e-9,
    book: q.best_book || null,
    // The movement history is on every triples quote tonight (122 of 122), so
    // the arrow is real rather than a placeholder waiting for a feed.
    move: q.movement?.from_open_pp ?? null,
  }
}

// The two markets, switched rather than merged. They share every context
// column — the same park, the same line-drive shape, the same arm — because a
// gapper is a gapper; what differs is which count leads, which price you are
// shopping, and how many of them there are. Doubles opens by default: they land
// on 16.8% of graded player-nights against a triple's 1.2%, so a board that
// opens on triples opens on the market you will bet least often.
const MARKETS = [
  ['d2', 'Doubles', '__p2', C.blue],
  ['t3', 'Triples', '__p3', C.purple],
]

// ── A DENSE TABLE (2026-10-07, Donovan: "gap boards: not dense, redo as a dense table") ──
// The same hitters, counts, rates and prices; the header sorts (the Sort chips are gone), the best fifth of
// each column glows and the worst recedes, and the rest of the Rankings board's columns follow the gap
// columns (lib/boardColumns.js). The market switch (Doubles / Triples) and the "real gap bats" toggle stay.
const GAP_GROUP = { key: 'gap', label: 'The gap bat', order: 1 }
const GAP_PARK = { key: 'gapark', label: 'The yard and the arm', order: 1.2 }
const GAP_PRICE = { key: 'gapprice', label: 'The price', order: 1.4 }

export default function GapBoard({ players = [], odds = null, onPlayerClick }) {
  const [market, setMarket] = useState('d2')
  const [realOnly, setRealOnly] = useState(true)
  const mk = MARKETS.find(([k]) => k === market) || MARKETS[0]
  const accent = mk[3]
  const openGame = useGameNav()
  const ctx = useMemo(() => boardRowContext(players || []), [players])

  const rows = useMemo(() => {
    const list = (players || [])
      // "Real gap bats only" -- a hitter with no extra-base hit all season is
      // not tonight's double, and leaving him in pads the board with names
      // that can only ever be noise. Off by one click; the count is stated.
      .filter((p) => (realOnly ? xbhOf(p) >= 10 : true))
    return list.map((p, i) => {
      const pa = n(p?.season_pa, 0)
      const gd = gapDepth(p)
      const ld = n(p?.recent_ld_rate, n(p?.l25pa_ld_rate, null))
      const q2 = gapPriceFor(odds, p, 'batter_doubles')
      const q3 = gapPriceFor(odds, p, 'batter_triples')
      return {
        ...boardRow(p, i, ctx),
        _key: `${p.player_id ?? p.id ?? nameOf(p)}-${p.game_pk ?? ''}`,
        _raw: p,
        d2: n(p?.season_doubles, 0),
        d2r: per600(p?.season_doubles, pa),
        t3: n(p?.season_triples, 0),
        t3r: per600(p?.season_triples, pa),
        xbh: xbhOf(p),
        ld: ld == null ? null : ld * 100,
        legs: p?.season_sb_attempt_rate == null ? null : n(p.season_sb_attempt_rate, 0) * 100,
        gap: gd,
        venue: p?.venue_name || '',
        armLd: p?.pitcher_ld_rate == null ? null : n(p.pitcher_ld_rate, 0) * 100,
        armIso: p?.pitcher_iso_against == null ? null : n(p.pitcher_iso_against, 0),
        p2: q2 && q2.matches ? q2.over : null, q2,
        p3: q3 && q3.matches ? q3.over : null, q3,
        pa,
      }
    })
  }, [players, odds, realOnly, ctx])

  const hidden = (players || []).length - rows.length
  const anyPrice = rows.some((r) => r.q2 || r.q3)
  const priceCell = (qk) => (v, r) => {
    const q = r[qk]
    if (!q) return '—'
    if (!q.matches) return <span style={{ fontSize: 9 }} title={`${q.book || 'book'} — line ${q.line}, not 0.5`}>@{q.line}</span>
    return <span title={`${q.book || 'book'}${q.move != null ? ` · ${q.move > 0 ? '+' : ''}${q.move.toFixed(1)}pp from open` : ''}`}><b>{fmtOdds(q.over)}</b></span>
  }
  const columns = useMemo(() => placeAfter(withBoardColumns([
    { key: 'opp', label: 'Vs', heat: false, w: 40, mono: true, dim: true, link: (p) => (openGame && p?.game_pk ? () => openGame(p.game_pk) : null) },
    { key: 'd2', group: GAP_GROUP, label: '2B', w: 40, dp: 0, title: 'Doubles on the season.' },
    { key: 'd2r', group: GAP_GROUP, label: '2B/600', w: 56, dp: 1, title: `Doubles per 600 plate appearances. Blank under ${TRIPLES_MIN_PA} PA, the same floor the triples rate uses.` },
    { key: 't3', group: GAP_GROUP, label: '3B', w: 40, dp: 0, title: 'Triples on the season.' },
    { key: 't3r', group: GAP_GROUP, label: '3B/600', w: 56, dp: 1, title: `Triples per 600 plate appearances. Blank under ${TRIPLES_MIN_PA} PA — at 80 trips one extra triple moves this by eight, which is wider than the whole column.` },
    { key: 'xbh', group: GAP_GROUP, label: 'XBH', w: 44, dp: 0, title: 'Doubles + triples + homers.' },
    { key: 'ld', group: GAP_GROUP, label: 'LD%', w: 46, dp: 0, fmt: (v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`), title: 'Line-drive rate over his recent window. A triple is a ball on a line, not in the air.' },
    { key: 'legs', group: GAP_GROUP, label: 'Legs', w: 48, dp: 0, fmt: (v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`), title: 'Stolen-base attempt rate — a PROXY for speed. Sprint speed is not published on the slate.' },
    { key: 'gap', group: GAP_PARK, label: 'Gaps', w: 48, dp: 0, fmt: (v) => (v == null ? '—' : `+${Number(v).toFixed(0)}`), title: 'Outfield geometry: (LCF+RCF)/2 minus (LF+RF)/2, in feet. Deeper gaps against shorter corners is where a triple lives. A proxy — the slate publishes no park triples factor.' },
    { key: 'armLd', group: GAP_PARK, label: 'Arm LD%', w: 56, dp: 0, fmt: (v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`), title: 'The opposing starter’s line-drive rate allowed.' },
    { key: 'armIso', group: GAP_PARK, label: 'Arm ISO', w: 56, dp: 3, fmt: (v) => (v == null ? '—' : `.${String(Math.round(Number(v) * 1000)).padStart(3, '0')}`), title: 'The opposing starter’s ISO against.' },
    { key: 'p2', group: GAP_PRICE, label: '2B ¢', w: 60, standout: false, fmt: priceCell('q2'), title: 'Over 0.5 doubles.' },
    { key: 'p3', group: GAP_PRICE, label: '3B ¢', w: 60, standout: false, fmt: priceCell('q3'), title: 'Over 0.5 triples.' },
  ], {}), 'opp', 'team'), [openGame])

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        {MARKETS.map(([k, label, , col]) => (
          <button key={k} onClick={() => setMarket(k)} style={{
            padding: '7px 18px', minHeight: 44, borderRadius: 10, cursor: 'pointer', fontSize: 12,
            fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${market === k ? col : C.border}`,
            background: market === k ? `${col}22` : 'transparent',
            color: market === k ? col : C.text3,
          }}>{label}</button>
        ))}
        <button onClick={() => setRealOnly((v) => !v)} style={{
          padding: '5px 11px', minHeight: 44, borderRadius: 999, cursor: 'pointer',
          fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
          border: `1px solid ${realOnly ? C.cyan : C.border}`,
          background: realOnly ? 'rgba(34,211,238,.12)' : 'transparent',
          color: realOnly ? C.cyan : C.text3,
        }}>{realOnly ? `Real gap bats (${hidden} hidden)` : 'Everyone'}</button>
        <span style={{ fontSize: 10, color: C.text3, marginLeft: 4 }}>
          {market === 'd2'
            ? 'A double lands on 16.8% of graded player-nights.'
            : 'A triple lands on 1.2% — fourteen times rarer.'}
        </span>
      </div>

      {/* A board with no score, beside boards that have one, reads as a board whose score has not loaded
          unless it says otherwise in words. */}
      <div style={{ borderLeft: `3px solid ${accent}`, padding: '1px 0 1px 10px', marginBottom: 10, fontSize: 10.5, color: C.text2, lineHeight: 1.55, maxWidth: 760 }}>
        <b style={{ color: C.text }}>No score on this board, on purpose.</b>{' '}
        A doubles model built from these fields was tested against 2,297 graded
        player-nights: its top decile hit <b>0.76x</b> the base rate — worse
        than random, which lands between 0.78x and 1.25x. The events are there;
        the signal is not. Every column is a count or a rate MOONSHOT published.
        {!anyPrice && ' Prices are absent from tonight’s odds file for both markets.'}
      </div>

      <DenseTable
        key={market}
        rows={rows}
        columns={columns}
        onRowClick={onPlayerClick}
        initialSort={market}
        maxHeight={560}
        maxRows={Math.max(rows.length, 1)}
        caption="Ranked by the market you picked. Gaps is outfield geometry, not a park factor — the slate publishes none for extra-base hits. Legs is stolen-base attempt rate standing in for sprint speed, which is not published either. Arm is the opposing starter's line-drive rate and ISO against. Tap a row for his full card."
      />
    </div>
  )
}
