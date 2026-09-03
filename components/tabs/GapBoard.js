'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, nameOf, teamOf, oppOf } from '../../lib/player'
import { fmtOdds, impliedPct, normName } from '../../lib/odds'
import { gapDepth, TRIPLES_MIN_PA } from '../../lib/triples'

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

const SORTS = [
  ['d2', 'Doubles', (p) => n(p?.season_doubles, 0)],
  ['d2r', '2B per 600', (p) => per600(p?.season_doubles, n(p?.season_pa, 0)) ?? -1],
  ['t3', 'Triples', (p) => n(p?.season_triples, 0)],
  ['t3r', '3B per 600', (p) => per600(p?.season_triples, n(p?.season_pa, 0)) ?? -1],
  ['xbh', 'Extra-base hits', (p) => xbhOf(p)],
  ['ld', 'Line drives', (p) => n(p?.recent_ld_rate, n(p?.l25pa_ld_rate, -1))],
  ['legs', 'Legs', (p) => n(p?.season_sb_attempt_rate, -1)],
  ['gap', 'Deep gaps', (p) => gapDepth(p) ?? -1e4],
  ['p3', 'Longest 3B price', (p) => { const q = p.__p3; return q && q.matches ? (q.over > 0 ? q.over : -1e6 - q.over) : -1e7 }],
  ['p2', 'Longest 2B price', (p) => { const q = p.__p2; return q && q.matches ? (q.over > 0 ? q.over : -1e6 - q.over) : -1e7 }],
]

function Cell({ children, w, mono = true, color, title, right, bold }) {
  return (
    <span title={title} style={{
      width: w, flexShrink: 0, minWidth: 0, textAlign: right ? 'right' : 'left',
      fontFamily: mono ? NUM_FONT : undefined, fontSize: 11,
      fontWeight: bold ? 800 : 600, color: color || C.text2,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>{children}</span>
  )
}

const HEAD = [
  ['2B', 34, 'Doubles on the season.'],
  ['/600', 44, `Doubles per 600 plate appearances. Blank under ${TRIPLES_MIN_PA} PA, the same floor the triples rate uses.`],
  ['3B', 34, 'Triples on the season.'],
  ['/600', 44, `Triples per 600 plate appearances. Blank under ${TRIPLES_MIN_PA} PA — at 80 trips one extra triple moves this by eight, which is wider than the whole column.`],
  ['XBH', 40, 'Doubles + triples + homers.'],
  ['LD%', 40, 'Line-drive rate over his recent window. A triple is a ball on a line, not in the air.'],
  ['LEGS', 44, 'Stolen-base attempt rate — a PROXY for speed. Sprint speed is not published on the slate.'],
  ['GAPS', 44, 'Outfield geometry: (LCF+RCF)/2 minus (LF+RF)/2, in feet. Deeper gaps against shorter corners is where a triple lives. A proxy — the slate publishes no park triples factor.'],
  ['ARM', 62, 'The opposing starter: line-drive rate allowed, and ISO against.'],
  ['2B ¢', 60, 'Over 0.5 doubles.'],
  ['3B ¢', 60, 'Over 0.5 triples.'],
]

export default function GapBoard({ players = [], odds = null, onPlayerClick }) {
  const [market, setMarket] = useState('d2')
  const [sort, setSort] = useState('d2')
  const [realOnly, setRealOnly] = useState(true)
  const mk = MARKETS.find(([k]) => k === market) || MARKETS[0]
  const accent = mk[3]
  // Switching market moves the sort with it. Landing on the Triples board
  // still ranked by doubles is the kind of quiet mismatch nobody notices and
  // everybody misreads.
  const pickMarket = (k) => { setMarket(k); setSort(k) }

  const rows = useMemo(() => {
    const list = (players || [])
      .map((p) => ({ ...p, __p2: gapPriceFor(odds, p, 'batter_doubles'), __p3: gapPriceFor(odds, p, 'batter_triples') }))
      // "Real gap bats only" — a hitter with no extra-base hit all season is
      // not tonight's double, and leaving him in pads the board with names
      // that can only ever be noise. Off by one click; the count is stated.
      .filter((p) => (realOnly ? xbhOf(p) >= 10 : true))
    const key = (SORTS.find(([k]) => k === sort) || SORTS[0])[2]
    return list.sort((a, b) => key(b) - key(a))
  }, [players, odds, sort, realOnly])

  const hidden = (players || []).length - rows.length
  const anyPrice = rows.some((p) => p.__p3 || p.__p2)

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        {MARKETS.map(([k, label, , col]) => (
          <button key={k} onClick={() => pickMarket(k)} style={{
            padding: '7px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 12,
            fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${market === k ? col : C.border}`,
            background: market === k ? `${col}22` : 'transparent',
            color: market === k ? col : C.text3,
          }}>{label}</button>
        ))}
        <span style={{ fontSize: 10, color: C.text3, marginLeft: 4 }}>
          {market === 'd2'
            ? 'A double lands on 16.8% of graded player-nights.'
            : 'A triple lands on 1.2% — fourteen times rarer.'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {SORTS.map(([k, label]) => (
          <button key={k} onClick={() => setSort(k)} style={{
            padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 10,
            fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
            border: `1px solid ${sort === k ? accent : C.border}`,
            background: sort === k ? `${accent}22` : 'transparent',
            color: sort === k ? accent : C.text3,
          }}>{label}</button>
        ))}
        <button onClick={() => setRealOnly((v) => !v)} style={{
          marginLeft: 'auto', padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
          fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
          border: `1px solid ${realOnly ? C.cyan : C.border}`,
          background: realOnly ? 'rgba(34,211,238,.12)' : 'transparent',
          color: realOnly ? C.cyan : C.text3,
        }}>{realOnly ? `Real gap bats (${hidden} hidden)` : 'Everyone'}</button>
      </div>

      {/* The banner is not decoration. A board with no score, sitting beside
          four boards that have one, will be read as a board whose score has
          not loaded unless it says otherwise in words. */}
      <div style={{
        border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`,
        borderRadius: 10, padding: '8px 11px', marginBottom: 10,
        fontSize: 10.5, color: C.text2, lineHeight: 1.55,
      }}>
        <b style={{ color: C.text }}>No score on this board, on purpose.</b>{' '}
        A doubles model built from these fields was tested against 2,297 graded
        player-nights: its top decile hit <b>0.76×</b> the base rate — worse
        than random, which lands between 0.78× and 1.25×. The events are there;
        the signal is not. Every column below is a count or a rate the bot
        published, with its denominator beside it — for
        {market === 'd2' ? ' doubles' : ' triples'}, and in the columns beside
        it for the other one.
        {!anyPrice && ' Prices are absent from tonight’s odds file for both markets.'}
      </div>

      <div style={{
        display: 'flex', gap: 6, padding: '0 8px 5px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <Cell w={150} mono={false} color={C.text3}>BATTER</Cell>
        {HEAD.map(([h, w, title], i) => (
          <Cell key={`${h}${i}`} w={w} right color={C.text3} title={title}>{h}</Cell>
        ))}
      </div>

      {rows.map((p) => {
        const pa = n(p.season_pa, 0)
        const r6 = per600(p.season_triples, pa)
        const d6 = per600(p.season_doubles, pa)
        const gd = gapDepth(p)
        const ld = n(p.recent_ld_rate, n(p.l25pa_ld_rate, null))
        return (
          <div
            key={p.player_id ?? p.id ?? nameOf(p)}
            onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
            style={{
              display: 'flex', gap: 6, alignItems: 'center', padding: '5px 8px',
              borderBottom: `1px solid ${C.border}`,
              cursor: onPlayerClick ? 'pointer' : 'default',
            }}>
            <span style={{ width: 150, flexShrink: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{nameOf(p)}</span>
              <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {teamOf(p)}/{oppOf(p)}</span>
            </span>
            <Cell w={34} right bold={market === 'd2'}
              color={n(p.season_doubles, 0) ? (market === 'd2' ? C.blue : C.text2) : C.text3}>
              {n(p.season_doubles, 0)}
            </Cell>
            {/* The rate is blank, not zero, under the PA floor — a blank cell
                is a true statement and a small number is a false one. */}
            <Cell w={44} right color={d6 == null ? C.text3 : undefined}
              title={d6 == null ? `${pa} PA — needs ${TRIPLES_MIN_PA}` : undefined}>
              {d6 == null ? '—' : d6.toFixed(1)}
            </Cell>
            <Cell w={34} right bold={market === 't3'}
              color={n(p.season_triples, 0) ? (market === 't3' ? C.purple : C.text2) : C.text3}>
              {n(p.season_triples, 0)}
            </Cell>
            <Cell w={44} right color={r6 == null ? C.text3 : undefined}
              title={r6 == null ? `${pa} PA — needs ${TRIPLES_MIN_PA}` : undefined}>
              {r6 == null ? '—' : r6.toFixed(1)}
            </Cell>
            <Cell w={40} right bold>{xbhOf(p)}</Cell>
            <Cell w={40} right color={ld != null && ld >= 0.28 ? C.cyan : undefined}>
              {ld == null ? '—' : `${(ld * 100).toFixed(0)}%`}
            </Cell>
            <Cell w={44} right>{p.season_sb_attempt_rate == null ? '—' : `${(n(p.season_sb_attempt_rate, 0) * 100).toFixed(0)}%`}</Cell>
            <Cell w={44} right color={gd != null && gd >= 55 ? C.green : undefined}
              title={p.venue_name || undefined}>
              {gd == null ? '—' : `+${gd.toFixed(0)}`}
            </Cell>
            <Cell w={62} right color={C.text3}>
              {p.pitcher_ld_rate == null ? '—' : `${(n(p.pitcher_ld_rate, 0) * 100).toFixed(0)}%`}
              {p.pitcher_iso_against == null ? '' : ` .${String(Math.round(n(p.pitcher_iso_against, 0) * 1000)).padStart(3, '0')}`}
            </Cell>
            {['__p2', '__p3'].map((k) => {
              const q = p[k]
              // Only the market you are actually shopping gets the live
              // colour. Two lit price columns side by side is two calls to
              // action, and the board answers one question at a time.
              const lead = k === mk[2]
              return (
                <Cell key={k} w={60} right bold={lead && !!q}
                  color={!q ? C.text3 : q.matches && lead ? C.yellow : C.text3}
                  title={q ? `${q.book || 'book'}${q.matches ? '' : ` — line ${q.line}, not 0.5`}${q.move != null ? ` · ${q.move > 0 ? '+' : ''}${q.move.toFixed(1)}pp from open` : ''}` : 'not priced'}>
                  {!q ? '—' : q.matches ? fmtOdds(q.over) : `${q.line}`}
                </Cell>
              )
            })}
          </div>
        )
      })}

      <div style={{ marginTop: 9, fontSize: 9.5, color: C.text3, lineHeight: 1.55 }}>
        GAPS is outfield geometry, not a park factor — the slate publishes none
        for extra-base hits. LEGS is stolen-base attempt rate standing in for
        sprint speed, which is not published either. ARM is the opposing
        starter&apos;s line-drive rate and ISO against; his raw XBH counts are on
        the row but have no batters-faced denominator, so they are not used.
      </div>
    </div>
  )
}
