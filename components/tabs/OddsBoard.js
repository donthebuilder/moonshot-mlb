'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, n, clean, hrScore, hitScore, prodScore, tbScore } from '../../lib/player'
import { fmtOdds, impliedPct, fairOdds, hrPerGame, edgeOf, normName } from '../../lib/odds'
import { verdictInk } from '../../lib/scales'
import { hrGameBand, edgeBand } from '../../lib/hrRateBand'
import { CalibrationScatter } from '../OddsChart'
import DenseTable from '../DenseTable'
import OddsStatus, { useOddsStatus } from '../OddsStatus'
import { oddsAgeHours, oddsExpired } from '../../lib/oddsFreshness'
import TruePrice from './TruePrice'
import OddsDiscrepancies from './OddsDiscrepancies'
import OddsSignals from './OddsSignals'
import { btnStyle } from '../ui'

// 💵 THE ODDS PAGE (2026-08-15, Donovan: "we need to see the line the book has
// them for, esp if it's at like 1.5 or like a plus-money look for the hit.
// then maybe like a page to see all the odds.")
//
// Every price the bot pulled, in one table, with the thing the rest of the
// site could never show him: THE BOOK'S ACTUAL NUMBER. Every other surface
// assumes the default bar — 1+ hit, 1+ homer — and quietly reports a hit rate
// against a bar nobody is offering. Here the line is a column, and when it
// isn't the standard one it says so out loud, because "76% to get a hit" and
// "76% to get TWO hits" are different bets wearing the same percentage.
//
// PLUS MONEY IS ITS OWN LENS. A hit prop at +150 is the shape he asked for by
// name: the book thinks it's unlikely, and if his own board disagrees that's
// where the money is. One toggle isolates every plus-money quote on the slate.
//
// NOTHING HERE IS A VERDICT EXCEPT ON HOME RUNS. hr_per_pa is the only real
// per-game probability the slate publishes, so it is the only market where an
// edge number appears. Everywhere else the price and the score sit side by
// side and the reader draws his own line — a 0-100 score is not a probability
// and multiplying it against a break-even would be the most confident wrong
// number on the site.
//
// ── 2026-08-15, ROUND TWO — "the odds page need to be turnt" ─────────────────
//
// It shipped as one flat table of 184 rows under a paragraph of instructions,
// and it bored him. Fair. This is the one page on the site showing LIVE MONEY
// and it opened by explaining a column header.
//
// THE PAGE NOW LEADS WITH THE NIGHT AND KEEPS THE TABLE AS ITS SECOND HALF.
// Three named calls in sentences — the widest gap, the longest number the
// model still clears, and the one you're being asked to overpay for — then
// one paragraph for every market that CANNOT carry a verdict, then the board.
// Not a tile row: tiles have lost to sentences five separate times on this
// project ("i dont like the tile style id rather text just like the
// storylines section"), and a row of stat boxes on top of a table would be
// the same page with a hat on. There are no boxes, borders or backgrounds in
// the lead at all — the energy is type size, the market's own colour, one
// comparison rail and a live dot, all of it sitting on published numbers.
//
// THREE HONESTY FIXES CAME WITH IT, and two were real bugs:
//
//   1. THE EDGE COLUMN WAS COMPARING TWO DIFFERENT BETS. hrPerGame() is the
//      probability of ONE homer — the over on 0.5. The old row builder handed
//      it to every HR quote including the ones where the book had moved to
//      1.5, which is a MULTI-HOMER bet. Live payload, tonight: Alec Burleson,
//      HR line 1.5 at +7000, printed "+14.7 EDGE" — a 1+ homer rate measured
//      against a 2+ homer price. lib/odds.js's quoteFor() has guarded exactly
//      this since the day it was written ("a book sitting on 1.5 is selling a
//      multi-homer game"); this file simply never asked. Off the standard bar
//      there is now no rate, no fair price and no edge — the price and the ≠
//      flag stand alone, which is the whole point of the ≠ flag.
//   2. A RATE OFF FORTY PLATE APPEARANCES LED THE PAGE. Sorted by edge, the
//      top of tonight's board was a hitter with 4 homers in 40 PA, whose
//      hr_per_pa of .100 projects to a 35% per-game homer rate — noise with a
//      decimal point. The TABLE still shows him (nothing is removed, he just
//      renders dimmed), but no call in the lead can be made on fewer than 150
//      plate appearances, because a named call is the loudest claim the page
//      makes.
//   3. ONE BOOK IS ONE OPINION, said out loud in the lead rather than left in
//      a BKS column tooltip. Tonight's board is a single book, and a +5000
//      homer price from one shop is a different object than a consensus.
//
// AND WHAT THE LEAD DELIBERATELY DOES NOT SAY: "the prices that moved." The
// published payload (bots/odds_fetch.py) carries no opening price and no
// history — line, over, under, implied, best_over, best_book, books,
// lines_seen, and nothing with a timestamp on it. Every honest version of
// "moved" that the data does support is in the opening sentence instead: the
// bar the books moved OFF the standard number, and the gap between the median
// price and the best one on the board. Inventing a delta from a field that
// doesn't exist would be the second most confident wrong thing on this page.

const MARKETS = [
  { key: 'batter_home_runs', label: 'HR', std: 0.5, color: '#FB923C', verb: 'to go deep' },
  { key: 'batter_hits', label: 'Hits', std: 0.5, color: '#60A5FA', verb: 'for a hit' },
  { key: 'batter_hits_runs_rbis', label: 'H+R+RBI', std: 1.5, color: '#4ade80', verb: 'for two of hits / runs / RBI' },
  { key: 'batter_total_bases', label: 'Bases', std: 1.5, color: '#FCD34D', verb: 'for two total bases' },
  { key: 'batter_runs_scored', label: 'Runs', std: 0.5, color: '#c084fc', verb: 'to score' },
  { key: 'batter_rbis', label: 'RBI', std: 0.5, color: '#f87171', verb: 'to drive one in' },
  { key: 'batter_doubles', label: '2B', std: 0.5, color: '#38bdf8', verb: 'for a double' },
  { key: 'batter_triples', label: '3B', std: 0.5, color: '#a78bfa', verb: 'for a triple' },
]
const MK = Object.fromEntries(MARKETS.map((m) => [m.key, m]))

// Only four markets have a score on this site. Runs, RBI, doubles and
// triples have none — and a column of 0.0 (2026-08-15, straight off his
// screenshot) reads as "the model rates every one of these zero", which is a
// claim, and a false one. No score, no column.
const HAS_SCORE = new Set([
  'batter_home_runs', 'batter_hits', 'batter_hits_runs_rbis', 'batter_total_bases',
])
const scoreFor = (p, mk) => (
  mk === 'batter_home_runs' ? hrScore(p)
    : mk === 'batter_hits' ? hitScore(p)
    : mk === 'batter_hits_runs_rbis' ? prodScore(p)
    : mk === 'batter_total_bases' ? tbScore(p)
    : 0
)

// The bar a named call has to clear to be allowed to lead. hr_per_pa is a
// season rate and it is only as good as the trips it was measured over; at 40
// PA one extra swing moves it by two and a half points, which is larger than
// most of the edges on this board. The table is unfiltered — this gate only
// decides who gets to be a SENTENCE.
const LEAD_MIN_PA = 150
// edgeOf()'s own thresholds, restated so the prose and the verdict agree.
const CALL_EDGE = 5
// A HOMER PRICE SHORTER THAN THIS IS A BAD QUOTE, NOT AN OFFER.
//
// Tonight's payload prices Seiya Suzuki to go deep at +101 — a break-even of
// 49.8%, meaning the book is claiming he homers in half his games. Nobody in
// the history of the sport has done that over a season; the best per-game
// homer rate on this slate is 26%. It is a provider parse, and sorted by edge
// it was the single most extreme row on the board, so it would have LED the
// "paying up" call — a named hitter attached to a price no book is offering.
//
// This is a constraint on the MARKET, not a judgement on the model: 1+ HR
// cannot be a coin flip. It gates who may be named in a sentence and nothing
// else — the row is still in the table at +101 with its −30.5 edge, because
// a quote the page won't headline is still a quote the page must show.
const LEAD_MAX_NEED = 40

const one = (v) => (Number.isFinite(v) ? (Math.round(10 * v) / 10).toFixed(1) : '—')

// ── 2026-08-16, TRUE PRICE MOVES IN ─────────────────────────────────────────
//
// The tab consolidation gave True Price ONE home, and it is this page: both
// views answer "what does the book charge" — tonight's board is the live
// quote, True Price is the same quote's season-long archive — while Results
// answers "was the bot right". It had been living twice, as its own top-level
// tab AND as a third mode inside Results, which meant two routes to the same
// table and neither next to the live prices it exists to sanity-check.
//
// Same pill idiom as Bot.js's VIEWS row. `initialView` exists so the old
// #tab=trueprice deep link can open this tab already switched — optional,
// defaulting to the board, so the current Dashboard mount renders unchanged
// until routing is rewired.
const PAGE_VIEWS = [
  // "Tonight's board" was a lie whenever the fetch was old (see the
  // freshness gate below) — the label now claims nothing about when.
  ['board', '💵 Odds board'],
  ['signals', '⚡ Moves & gaps'],
  ['shop', '🛒 Line shop'],
  ['trueprice', '🏷 True Price'],
]

export default function OddsBoard({ players = [], odds = null, onPlayerClick, initialView = 'board' }) {
  const [view, setView] = useState(
    initialView === 'trueprice' ? 'trueprice' : initialView === 'signals' ? 'signals' : initialView === 'shop' ? 'shop' : 'board'
  )
  const [market, setMarket] = useState('batter_home_runs')
  const [plusOnly, setPlusOnly] = useState(false)
  const [offStd, setOffStd] = useState(false)
  const [need, setNeed] = useState('any')   // 1+ / 2+ / 3+

  const status = useOddsStatus()
  const live = MK[market] || MARKETS[0]

  // ── FRESHNESS GATE (2026-08-29) ─────────────────────────────────────────
  // The 08-29 outside review caught this page presenting an Aug-17 board as
  // "tonight's" on Aug 29 — twelve-day-old prices next to current players,
  // which is worse than no prices at all. A quote is a statement about a
  // market that existed when it was pulled; past STALE_HOURS it is history,
  // and history belongs in the archive views, not on a board implying you
  // could still shop it. fetched_at is the bot's ISO stamp (odds_fetch.py
  // publishes it alongside fetched_at_human); if it's missing we fall back
  // to parsing the human string, and if NOTHING parses we fail open (an
  // unparseable stamp on a fresh fetch shouldn't blank the board).
  // Shared clock since pass 5 — lib/oddsFreshness.js is the single
  // definition of "too old"; the dashboards use the same one to null the
  // payload for every OTHER consumer. This tab keeps the raw payload so the
  // panel below can say when the board was pulled.
  const boardAgeHours = oddsAgeHours(odds)
  const boardExpired = oddsExpired(odds)

  // ── THE NIGHT ───────────────────────────────────────────────────────────
  //
  // One pass over every player × every market, independent of the pills, so
  // the lead is about TONIGHT rather than about whichever tab is selected.
  // Everything it collects is a published field; nothing is modelled here.
  const night = useMemo(() => {
    const byId = odds?.by_player_id || {}
    const byName = odds?.by_name || {}
    if (!Object.keys(byId).length && !Object.keys(byName).length) return null

    const hr = []            // HR quotes ON the 0.5 bar, with a real rate behind them
    const topScore = {}      // market -> the site's best score in it, and its price
    const longest = {}       // market -> the longest plus-money price in it
    const seen = new Set()   // markets with at least one price
    let priced = 0, plus = 0, offBar = 0, maxBooks = 0
    const bookNames = new Set()
    let shop = null          // biggest median → best-available improvement

    players.forEach((p) => {
      const quotes = byId[String(p?.player_id ?? p?.id)] || byName[normName(nameOf(p))]
      if (!quotes) return
      MARKETS.forEach((m) => {
        const q = quotes[m.key]
        if (!q) return
        const over = n(q.over, NaN)
        if (!Number.isFinite(over)) return
        const line = n(q.line, NaN)
        const onBar = Number.isFinite(line) && Math.abs(line - m.std) < 1e-9

        priced += 1
        seen.add(m.key)
        if (over > 0) plus += 1
        if (Number.isFinite(line) && !onBar) offBar += 1
        maxBooks = Math.max(maxBooks, n(q.books, 0))
        if (clean(q.best_book, '')) bookNames.add(clean(q.best_book, ''))

        // The only "movement" the payload actually supports: the median price
        // at the consensus line versus the best one anybody is offering.
        const best = n(q.best_over, NaN)
        if (Number.isFinite(best) && best !== over) {
          const gain = (impliedPct(over) ?? 0) - (impliedPct(best) ?? 0)
          if (gain > 0 && (!shop || gain > shop.gain)) {
            shop = { gain, p, m, over, best, book: clean(q.best_book, '') }
          }
        }

        // Longest plus-money number in each market — a fact about the price,
        // which needs no model to be true.
        if (over > 0 && (!longest[m.key] || over > longest[m.key].over)) {
          longest[m.key] = { p, m, q, over, line, onBar, need: q.implied ?? impliedPct(over) }
        }

        // The site's own favourite in each scored market, and what it costs.
        // Two facts printed side by side — NOT a comparison, and never an edge.
        if (HAS_SCORE.has(m.key) && onBar) {
          const sc = scoreFor(p, m.key)
          if (sc > 0 && (!topScore[m.key] || sc > topScore[m.key].score)) {
            topScore[m.key] = { p, m, score: sc, over, need: q.implied ?? impliedPct(over) }
          }
        }

        // ── THE ONLY MARKET THAT MAY CARRY A VERDICT ──────────────────────
        // hrPerGame() is the chance of ONE homer, so it may only be set
        // against the over on 0.5. A book on 1.5 is selling a multi-homer
        // game and its price answers a different question entirely.
        if (m.key === 'batter_home_runs' && onBar) {
          const rate = hrPerGame(p)
          const pa = n(p?.season_pa, 0)
          if (rate != null && pa >= LEAD_MIN_PA) {
            const e = edgeOf(q, rate)   // takes a RATE, never a score
            if (e && e.need <= LEAD_MAX_NEED) hr.push({ p, m, q, over, rate, pa, ...e, fair: fairOdds(rate) })
          }
        }
      })
    })

    if (!priced) return null
    const byEdge = [...hr].sort((a, b) => b.diff - a.diff)
    const widest = byEdge[0] && byEdge[0].diff >= CALL_EDGE ? byEdge[0] : null
    // The longest number his own rate still clears. Deliberately a different
    // question from "the biggest gap": the biggest gap is often a short price
    // on a slugger, and he asked for the long plus-money shots by name.
    const longshot = [...hr]
      .filter((x) => x.over >= 200 && x.diff >= CALL_EDGE && x !== widest)
      .sort((a, b) => b.over - a.over)[0] || null
    const fade = byEdge.length && byEdge[byEdge.length - 1].diff <= -CALL_EDGE
      ? byEdge[byEdge.length - 1] : null

    return {
      priced, plus, offBar, markets: seen.size, maxBooks,
      books: [...bookNames], shop,
      rated: hr.length, widest, longshot, fade,
      topScore, longest,
      when: clean(odds?.fetched_at_human, ''),
    }
  }, [players, odds])

  // Join the published board to tonight's slate. by_player_id is the honest
  // key; by_name is the fallback for a hitter the bot's join missed, and a
  // priced player who isn't on the slate at all simply can't be shown here —
  // he has no score to sit next to.
  const rows = useMemo(() => {
    const byId = odds?.by_player_id || {}
    const byName = odds?.by_name || {}
    if (!Object.keys(byId).length && !Object.keys(byName).length) return []
    const out = []
    players.forEach((p) => {
      const q = (byId[String(p?.player_id ?? p?.id)] || byName[normName(nameOf(p))] || {})[market]
      if (!q) return
      const over = n(q.over, NaN)
      const line = n(q.line, NaN)
      if (!Number.isFinite(over)) return
      const need = q.implied ?? impliedPct(over)
      // OFF THE BAR, NO RATE (2026-08-15 fix). hrPerGame is the chance of ONE
      // homer; against a 1.5 line the book is pricing TWO, and the old code
      // printed the difference as an EDGE anyway — +14.7 on a 1.5 HR line
      // tonight. A blank here is the truthful cell.
      const onBar = Number.isFinite(line) && Math.abs(line - live.std) < 1e-9
      const rate = market === 'batter_home_runs' && onBar ? hrPerGame(p) : null
      const edge = rate != null && need != null ? rate - need : null
      // ── THE EDGE'S OWN ERROR BAR (2026-08-30) ─────────────────────────
      // EDGE has printed to one decimal since the day this table shipped,
      // and a tenth of a point is a resolution the underlying sample almost
      // never has: 12 homers in 480 trips and 4 in 160 both render as
      // "+7.1". lib/hrRateBand.js puts a 95% Wilson band on the season
      // counts and pushes it through hrPerGame()'s own per-game transform,
      // so the column can say which of those two it is. It is a floor on
      // the uncertainty and nothing more — park, weather and the arm are
      // all outside it, and the tooltip says so.
      const band = rate != null ? hrGameBand(p) : null
      const eb = band ? edgeBand(need, band) : null
      out.push({
        _key: `${p?.player_id}-${p?.game_pk}`,
        _raw: p,
        _pa: n(p?.season_pa, 0),
        player: nameOf(p),
        tm: teamOf(p),
        opp: oppOf(p),
        line,
        over,
        need: need != null ? Math.round(10 * need) / 10 : null,
        score: HAS_SCORE.has(market) ? (Math.round(10 * scoreFor(p, market)) / 10 || null) : null,
        rate: rate != null ? Math.round(10 * rate) / 10 : null,
        edge: edge != null ? Math.round(10 * edge) / 10 : null,
        // THE BAND IS NOT SYMMETRIC AND MUST NOT BE PRINTED AS IF IT WERE.
        // Caught in render, 2026-08-30: the first cut showed "±7.8" beside
        // "+7.1", which reads as "-0.7 to +14.9" — and the actual interval
        // was +4.2 to +19.7. Wilson is skewed at small counts by design (that
        // is why it is used), so the two bounds are the only honest form.
        edgeLo: eb?.lo != null ? Math.round(10 * eb.lo) / 10 : null,
        edgeHi: eb?.hi != null ? Math.round(10 * eb.hi) / 10 : null,
        edgeClears: eb?.clears ? 1 : 0,
        rateLo: band?.lo != null ? Math.round(10 * band.lo) / 10 : null,
        rateHi: band?.hi != null ? Math.round(10 * band.hi) / 10 : null,
        rateThin: band?.thin ? 1 : 0,
        rateWhy: band?.why || '',
        fair: rate != null ? fairOdds(rate) : null,
        frozen: q.frozen ? 1 : 0,
        books: n(q.books, 0),
        best: n(q.best_over, over),
        bestBook: clean(q.best_book, ''),
        // 2026-08-30, Donovan: "bump upgrades" -- the real intraday-move
        // fields (movement.from_open_pp etc.) already fed the Moves & gaps
        // tab but never showed up on the main board, so you had to switch
        // tabs to see if a price you were looking at had actually moved.
        // Same field the signals tab reads, surfaced here as the arrow.
        moveOpen: q.movement?.from_open_pp != null && Number.isFinite(Number(q.movement.from_open_pp))
          ? Number(q.movement.from_open_pp) : null,
        lineChanged: !!q.movement?.line_changed,
      })
    })
    return out
  }, [players, odds, market, live.std])

  const shown = useMemo(() => {
    let r = rows
    if (plusOnly) r = r.filter((x) => x.over > 0)
    if (offStd) r = r.filter((x) => Number.isFinite(x.line) && Math.abs(x.line - live.std) > 1e-9)
    // 1+ / 2+ / 3+ (2026-08-15, Donovan: "more filters to see like 1+ 2+ 3").
    // A book's 0.5 line IS the 1+ bet, 1.5 is 2+, 2.5 is 3+ — the half-point
    // exists so the bet can't push, and reading it as "one and a half hits"
    // is how people misread every prop board there is. Filter in his units.
    if (need !== 'any') r = r.filter((x) => Number.isFinite(x.line) && Math.round(x.line + 0.5) === Number(need))
    return r
  }, [rows, plusOnly, offStd, live.std, need])

  const offCount = rows.filter((x) => Number.isFinite(x.line) && Math.abs(x.line - live.std) > 1e-9).length
  const plusCount = rows.filter((x) => x.over > 0).length

  const pill = (on, col = C.orange) => ({
    padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 999,
    border: `1px solid ${on ? col : C.border}`,
    background: on ? `${col}22` : 'transparent',
    color: on ? col : C.text3, whiteSpace: 'nowrap',
  })

  // Jump from a sentence into the board that proves it. A named call the
  // reader can't go verify is an assertion; one click away it's a claim with
  // its working shown.
  const jump = (mk, opts = {}) => () => {
    setMarket(mk)
    setPlusOnly(Boolean(opts.plus))
    setOffStd(Boolean(opts.off))
    setNeed(opts.need || 'any')
  }

  const Name = ({ p, size = 15 }) => (
    <b
      onClick={() => onPlayerClick?.(p)}
      style={{ color: C.text, fontSize: size, fontWeight: 900, cursor: onPlayerClick ? 'pointer' : 'default', letterSpacing: '-.01em' }}
    >{nameOf(p)}</b>
  )
  const Num = ({ children, color = C.text, size = 13 }) => (
    <b style={{ fontFamily: NUM_FONT, fontSize: size, color, fontWeight: 900 }}>{children}</b>
  )
  const Link = ({ onClick, children, color = C.text3, title }) => (
    <span onClick={onClick} title={title} style={{ color, cursor: 'pointer', borderBottom: `1px dotted ${color}66` }}>{children}</span>
  )
  const Kicker = ({ color, children, onClick, title }) => (
    <div onClick={onClick} title={title} style={{
      fontSize: 9.5, fontWeight: 900, letterSpacing: '.15em', textTransform: 'uppercase',
      color, marginBottom: 4, cursor: onClick ? 'pointer' : 'default',
    }}>{children} {onClick && <span style={{ opacity: 0.5 }}>→</span>}</div>
  )

  // THE RAIL — the two percentages, drawn. Precedent: TheRead's MoveBar, and
  // the argument is the same one. "26.2 against 6.7" is a fact you have to do
  // arithmetic on; two bars on a shared scale is a glance. Both ends are real
  // published percentages, so the picture cannot say more than the numbers do.
  const Rail = ({ needPct, ratePct, color }) => {
    const max = Math.max(needPct, ratePct, 1)
    const bar = (w, col, sub) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 74, fontSize: 9, color: C.text3, textAlign: 'right', flexShrink: 0 }}>{sub}</span>
        <div style={{ flex: 1, maxWidth: 320, height: 7, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(1.5, (w / max) * 100)}%`, height: 7, background: col, borderRadius: 4 }} />
        </div>
        <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 900, color: col, width: 42 }}>{one(w)}%</span>
      </div>
    )
    return (
      <div style={{ display: 'grid', gap: 4, margin: '8px 0 2px' }}>
        {bar(needPct, C.text3, 'the price needs')}
        {bar(ratePct, color, 'his own rate')}
      </div>
    )
  }

  const Para = ({ children }) => (
    <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.7, color: C.text2, maxWidth: 640 }}>{children}</p>
  )

  const w = night?.widest
  const ls = night?.longshot
  const fd = night?.fade

  // The one row of navigation this tab owns: tonight's live quote, or the
  // archive of what those quotes have been. It sits ABOVE the page's own
  // header so the lead — three named calls, then the board — is untouched.
  const viewBar = (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
      {PAGE_VIEWS.map(([k, label]) => (
        <button key={k} onClick={() => setView(k)} style={btnStyle(C.orange, view === k)}>
          {label}
        </button>
      ))}
    </div>
  )

  // TruePrice fetches its own season-scale payload on open and wears its own
  // header, so this branch mounts it whole and adds nothing but the way back.
  // Sits after every hook above — a conditional return before a hook is the
  // blank-page class of bug the Results tab already hit once with this exact
  // component.
  if (view === 'trueprice') {
    return (
      <div>
        {viewBar}
        <TruePrice onPlayerClick={onPlayerClick} players={players} odds={odds} />
      </div>
    )
  }

  // ── EXPIRED BOARD ───────────────────────────────────────────────────────
  // Covers the quote board AND signals (both read the stale payload); True
  // Price is untouched because it fetches season-scale data of its own.
  // Nothing is deleted — the board comes back the moment a fresh fetch
  // publishes. Until then, showing the pull date and the reason beats
  // showing a dead market as if it were live.
  if (boardExpired && view !== 'trueprice') {
    return (
      <div>
        {viewBar}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>💵 The odds</h2>
          <span style={{ fontSize: 10, color: C.red, fontFamily: NUM_FONT }}>
            ● board pulled {night?.when || 'a while ago'} · EXPIRED
          </span>
        </div>
        <OddsStatus status={status} />
        <div style={{
          border: `1px solid ${C.border2}`, borderRadius: 12, padding: '22px 20px',
          marginTop: 10, maxWidth: 640, lineHeight: 1.65, fontSize: 12, color: C.text2,
        }}>
          <b style={{ color: C.text, display: 'block', marginBottom: 6 }}>
            This board expired {Math.floor(boardAgeHours / 24) >= 1
              ? `${Math.floor(boardAgeHours / 24)} day${Math.floor(boardAgeHours / 24) === 1 ? '' : 's'} ago`
              : `${Math.floor(boardAgeHours)} hours after it was pulled`}.
          </b>
          Prices were pulled {night?.when || 'on an earlier slate'} — a quote that old
          describes a market that no longer exists, so it is not shown next to
          today&apos;s players. The board returns automatically with the next
          successful odds fetch.
          <span style={{ display: 'block', marginTop: 8, color: C.text3, fontSize: 11 }}>
            True Price still works — it reads season-scale history, not live quotes.
          </span>
        </div>
      </div>
    )
  }

  if (view === 'signals') {
    return (
      <div>
        {viewBar}
        <OddsSignals players={players} odds={odds} onPlayerClick={onPlayerClick} />
      </div>
    )
  }

  if (view === 'shop') {
    return (
      <div>
        {viewBar}
        <OddsDiscrepancies players={players} odds={odds} onPlayerClick={onPlayerClick} />
      </div>
    )
  }

  return (
    <div>
      <style>{'@keyframes oddsIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}@keyframes oddsDot{0%,100%{opacity:1}50%{opacity:.25}}'}</style>

      {viewBar}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>💵 The odds</h2>
        {night?.when && (
          <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green, animation: 'oddsDot 2.2s ease-in-out infinite' }} />
            board pulled {night.when}
          </span>
        )}
      </div>

      <OddsStatus status={status} />

      {/* ── THE LEAD ─────────────────────────────────────────────────────────
          Sentences, not tiles. Every number in here is published: the price
          off the board, the break-even off the price, the rate off hr_per_pa
          and the lineup spot. The only thing the page adds is the subtraction,
          and it only performs it where a real rate exists. */}
      {/* ── FOLDED BY DEFAULT (2026-08-17) ──────────────────────────────────
          Donovan: "ODDDSS PAGE HAS THIS BIG READ on the top its dumb i dont
          like" — and separately, repeatedly: too many words site-wide.
          He is right that this was the wrong default. The lead is four prose
          blocks and it stood between the reader and the board they came for.
          NOTHING IS DELETED — every sentence, link and number is still here,
          one tap away, per the house rule that information is never removed and
          only the FORM is condensed. The summary line carries the two figures
          worth seeing without opening anything: how many prices, and the widest
          shopping gap. The board is now the first thing on the page. */}
      {night && (
        <details style={{ margin: '12px 0 18px' }}>
          <summary style={{
            cursor: 'pointer', fontSize: 11.5, color: C.text3, lineHeight: 1.6,
            listStyle: 'revert',
          }}>
            <b style={{ color: C.text2 }}>{night.priced} prices</b> across {night.markets} market
            {night.markets === 1 ? '' : 's'}, {night.plus} paying plus money
            {night.shop ? <> · widest shopping gap {one(night.shop.gain)} pts on {nameOf(night.shop.p)}</> : null}
            {' '}— <span style={{ color: C.orange }}>the full read</span>
          </summary>
        <div style={{ margin: '10px 0 8px', animation: 'oddsIn .35s ease both' }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: C.text2, maxWidth: 660 }}>
            <Num size={14} color={C.text}>{night.priced}</Num> prices on tonight&apos;s hitters across{' '}
            <Num size={14} color={C.text}>{night.markets}</Num> market{night.markets === 1 ? '' : 's'},{' '}
            <Link color={C.green} onClick={jump(market, { plus: true })}
              title={`${night.plus} plus-money quotes across every market. Clicking turns the plus-money lens on for the ${live.label} board below — the count there is that market's share of this one.`}>
              <Num size={14} color={C.green}>{night.plus}</Num> of them paying plus money
            </Link>
            {night.books.length === 1
              ? <> — all of it <b style={{ color: C.text2 }}>{night.books[0]}</b>&apos;s number, so read every long price below as one shop&apos;s opinion rather than a market.</>
              : night.books.length > 1
                ? <> across <Num size={14} color={C.text}>{night.books.length}</Num> books
                  {night.maxBooks > 1
                    ? '.'
                    : ' — though every individual number below came from a single one of them, so none of these is a consensus.'}</>
                : '.'}
            {night.offBar > 0 && (
              <> The books moved off the standard bar on{' '}
                <Link color={C.yellow} onClick={jump(market, { off: true })}
                  title={`${night.offBar} quotes across every market sit on a line other than the standard one. Clicking isolates them on the ${live.label} board below.`}>
                  <Num size={14} color={C.yellow}>{night.offBar}</Num> of them
                </Link> — those are a different bet than every rate on this site is measured against.</>
            )}
            {night.shop && (
              <> The widest gap between the median price and the best one available is{' '}
                <b style={{ color: C.text }}>{nameOf(night.shop.p)}</b>&apos;s {night.shop.m.label} at{' '}
                <Num color={C.text2}>{fmtOdds(night.shop.over)}</Num> against{' '}
                <Num color={C.green}>{fmtOdds(night.shop.best)}</Num>
                {night.shop.book ? ` at ${night.shop.book}` : ''} — {one(night.shop.gain)} points of break-even for shopping it.</>
            )}
          </p>

          {/* THE WIDEST GAP — the hero. HR only, on the 0.5 bar only, and only
              off a rate with real trips behind it. */}
          {w && (
            <div style={{ marginTop: 22, animation: 'oddsIn .4s .05s ease both' }}>
              <Kicker color={MK.batter_home_runs.color} onClick={jump('batter_home_runs')}
                title="Sorted by his own per-game homer rate minus what the price has to hit to break even. Home runs only — it is the one market where the slate publishes a real rate.">
                the widest gap on the board
              </Kicker>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <Name p={w.p} size={22} />
                <span style={{ fontFamily: NUM_FONT, fontSize: 30, fontWeight: 900, color: w.over > 0 ? C.green : C.text, letterSpacing: '-.02em', lineHeight: 1 }}>
                  {fmtOdds(w.over)}
                </span>
                <span style={{ fontSize: 12, color: C.text3 }}>
                  {teamOf(w.p)} vs {oppOf(w.p)} · {MK.batter_home_runs.verb}
                </span>
              </div>
              <Para>
                That price only has to be right <Num color={C.text}>{one(w.need)}%</Num> of the time. His own
                per-game homer rate — <span style={{ fontFamily: NUM_FONT }}>hr_per_pa</span> over the plate
                appearances his lineup spot gets — is <Num color={MK.batter_home_runs.color}>{one(w.rate)}%</Num>,
                which is <Num color={C.green}>{w.diff > 0 ? '+' : ''}{one(w.diff)}</Num> points clear of the
                break-even and the widest of the <Num color={C.text2}>{night.rated}</Num> homer quotes with a real
                rate behind them tonight.
                {w.fair != null && <> His true price is <Num color={C.text}>{fmtOdds(w.fair)}</Num>; the book is at <Num color={C.text}>{fmtOdds(w.over)}</Num>.</>}
                {' '}Measured over <Num color={C.text2}>{w.pa}</Num> plate appearances.
              </Para>
              <Rail needPct={w.need} ratePct={w.rate} color={MK.batter_home_runs.color} />
            </div>
          )}

          {/* THE LONG SHOT HE ASKS FOR BY NAME — the longest number the model
              still clears, which is a different question from the biggest gap. */}
          {ls && (
            <div style={{ marginTop: 20, animation: 'oddsIn .4s .1s ease both' }}>
              <Kicker color={C.green} onClick={jump('batter_home_runs', { plus: true })}
                title="The longest plus-money homer price whose own per-game rate still clears the break-even by 5 points or more.">
                the longest number the model still clears
              </Kicker>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <Name p={ls.p} size={17} />
                <span style={{ fontFamily: NUM_FONT, fontSize: 22, fontWeight: 900, color: C.green, lineHeight: 1 }}>{fmtOdds(ls.over)}</span>
                <span style={{ fontSize: 11, color: C.text3 }}>{teamOf(ls.p)} vs {oppOf(ls.p)}</span>
              </div>
              <Para>
                <Num color={C.text}>{fmtOdds(ls.over)}</Num> needs it to happen <Num color={C.text}>{one(ls.need)}%</Num> of
                the time; he runs <Num color={C.green}>{one(ls.rate)}%</Num> —{' '}
                <Num color={C.green}>{ls.diff > 0 ? '+' : ''}{one(ls.diff)}</Num> points the right way, off{' '}
                <Num color={C.text2}>{n(ls.p?.season_hr, 0)}</Num> homers in <Num color={C.text2}>{ls.pa}</Num> plate
                appearances. Long is not the same as wrong, and long with his own season behind it is the shape
                worth writing down.
              </Para>
            </div>
          )}

          {/* THE OTHER HALF. A page that prints only the flattering side of its
              own model is advertising — the same argument TheRead's "Against
              it:" clause is built on. */}
          {fd && (
            <div style={{ marginTop: 20, animation: 'oddsIn .4s .15s ease both' }}>
              <Kicker color={C.red} onClick={jump('batter_home_runs')}
                title="The homer price furthest SHORT of the man taking it — his own rate is well behind what the number demands.">
                where you&apos;re being asked to pay up
              </Kicker>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <Name p={fd.p} size={17} />
                <span style={{ fontFamily: NUM_FONT, fontSize: 22, fontWeight: 900, color: C.red, lineHeight: 1 }}>{fmtOdds(fd.over)}</span>
                <span style={{ fontSize: 11, color: C.text3 }}>{teamOf(fd.p)} vs {oppOf(fd.p)}</span>
              </div>
              <Para>
                The board&apos;s shortest homer price relative to the man taking it:{' '}
                <Num color={C.text}>{fmtOdds(fd.over)}</Num> demands <Num color={C.text}>{one(fd.need)}%</Num> and
                his rate is <Num color={C.red}>{one(fd.rate)}%</Num> —{' '}
                <Num color={C.red}>{one(Math.abs(fd.diff))}</Num> points the wrong way.
                {fd.fair != null && <> His true price here is <Num color={C.text}>{fmtOdds(fd.fair)}</Num>.</>}
                {' '}That is the site&apos;s <b style={{ color: C.red }}>priced out</b> verdict, and it is deliberately
                coarse — anything inside five points is called fair, because at these samples a 1.5-point edge is
                noise wearing a costume.
              </Para>
            </div>
          )}

          {!w && !ls && !fd && night.rated === 0 && (
            <Para>
              No homer quote tonight has a rate behind it that this page will stand on: every priced hitter is
              off the standard <span style={{ fontFamily: NUM_FONT }}>0.5</span> bar, under{' '}
              <Num color={C.text2}>{LEAD_MIN_PA}</Num> plate appearances, or carrying a price so short it is a bad
              quote rather than an offer. A homer rate off forty trips is noise with a decimal point, so nothing
              gets named on one. The full board is below and it hides none of them.
            </Para>
          )}

          {/* EVERY OTHER MARKET — present, loud, and carrying no verdict. This
              paragraph is the reason the page can be energetic without lying:
              it says the quiet part out loud instead of filling the gap with a
              green chip. */}
          <div style={{ marginTop: 22, animation: 'oddsIn .4s .2s ease both' }}>
            <Kicker color={C.blue}>everywhere else, a price and no verdict</Kicker>
            <Para>
              {['batter_hits', 'batter_hits_runs_rbis', 'batter_total_bases']
                .map((k) => night.topScore[k]).filter(Boolean).length > 0 ? (
                  <>
                    The site&apos;s highest score in each of the other scored markets, with what it costs:{' '}
                    {['batter_hits', 'batter_hits_runs_rbis', 'batter_total_bases'].map((k) => {
                      const t = night.topScore[k]
                      if (!t) return null
                      return (
                        <span key={k}>
                          <Link color={t.m.color} onClick={jump(k)}>{t.m.label}</Link>{' '}
                          <b style={{ color: C.text }} onClick={() => onPlayerClick?.(t.p)}>{nameOf(t.p)}</b>{' '}
                          at <Num color={t.over > 0 ? C.green : C.text2}>{fmtOdds(t.over)}</Num>{' '}
                          <span style={{ color: C.text3 }}>(score {one(t.score)}, needs {one(t.need)}%)</span>
                          {k === 'batter_total_bases' ? '. ' : '; '}
                        </span>
                      )
                    })}
                  </>
                ) : null}
              Those two numbers are printed <i>beside</i> each other and never subtracted. A 0-100 score is not a
              probability — it has no units in common with a break-even percentage — so there is no edge column on
              those markets and no green chip anywhere near them. Home runs are the exception because{' '}
              <span style={{ fontFamily: NUM_FONT }}>hr_per_pa</span> is a real per-game rate, and it is the only
              one the slate publishes.
              {['batter_runs_scored', 'batter_rbis', 'batter_doubles', 'batter_triples'].filter((k) => night.longest[k]).length > 0 && (
                <>
                  {' '}
                  {['batter_runs_scored', 'batter_rbis', 'batter_doubles', 'batter_triples']
                    .filter((k) => night.longest[k]).map((k) => MK[k].label).join(', ')}{' '}
                  carry a price and nothing else: this site publishes no score for them, so no column is invented
                  for them either.
                </>
              )}
            </Para>
          </div>
        </div>
        </details>
      )}

      {/* ── THE BOARD ────────────────────────────────────────────────────────
          The second half of the page. Every column, filter and tooltip that
          has ever been here is still here — the lead sits on top of it, it
          does not replace it. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, paddingTop: 14, marginBottom: 6 }}>
        <h3 style={{ fontSize: 14, fontWeight: 900, margin: 0, letterSpacing: '-.01em' }}>The full board</h3>
        <span style={{ fontSize: 11, color: C.text3 }}>
          every price the bot pulled tonight — with the number the book is actually offering
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, maxWidth: 760, marginBottom: 10 }}>
        <b style={{ color: C.text }}>LINE is the bar the book set.</b> Everywhere else this site
        assumes the standard one ({live.label} at {live.std}); when a book moves it — a hit line at
        1.5, bases at 2.5 — a rate measured against the standard bar is answering a different
        question. <b style={{ color: C.text }}>NEED</b> is what the price has to hit to break even.
        On home runs only, and only on the standard {MK.batter_home_runs.std} bar,
        the slate publishes a real per-game rate, so <b style={{ color: C.text }}>EDGE</b> is
        his rate minus that break-even; every other market shows the score beside the price and
        leaves the judgement to you.
      </div>

      {/* market picker */}
      <div className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 8px' }}>
        {MARKETS.map((m) => {
          const cnt = (() => {
            const byId = odds?.by_player_id || {}
            const byName = odds?.by_name || {}
            let k = 0
            players.forEach((p) => {
              if ((byId[String(p?.player_id ?? p?.id)] || byName[normName(nameOf(p))] || {})[m.key]) k++
            })
            return k
          })()
          return (
            <button key={m.key} onClick={() => setMarket(m.key)}
              disabled={!cnt}
              style={{ ...pill(market === m.key, m.color), opacity: cnt ? 1 : 0.35 }}>
              {m.label}
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, marginLeft: 5, opacity: 0.75 }}>{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* the two lenses he asked for by name */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <button onClick={() => setPlusOnly((v) => !v)} style={pill(plusOnly, '#4ade80')}
          title="Only quotes paying plus money — the book says unlikely. If your board disagrees, this is where the value is.">
          ＋ Plus money only <span style={{ fontFamily: NUM_FONT, fontSize: 9 }}>{plusCount}</span>
        </button>
        <button onClick={() => setOffStd((v) => !v)} style={pill(offStd, '#FCD34D')}
          title={`Only quotes where the book moved OFF the standard ${live.std} bar — the ones where a normal hit-rate column is answering the wrong question.`}>
          ≠ Off the standard line <span style={{ fontFamily: NUM_FONT, fontSize: 9 }}>{offCount}</span>
        </button>
        <span style={{ width: 1, height: 18, background: C.border, margin: '0 2px' }} />
        {['any', '1', '2', '3'].map((k) => {
          const cnt = k === 'any' ? rows.length
            : rows.filter((x) => Number.isFinite(x.line) && Math.round(x.line + 0.5) === Number(k)).length
          return (
            <button key={k} onClick={() => setNeed(k)} disabled={!cnt && k !== 'any'}
              title={k === 'any' ? 'Every line the books posted' : `Only the ${k}+ bet — the book's ${Number(k) - 0.5} line`}
              style={{ ...pill(need === k, '#60a5fa'), opacity: cnt || k === 'any' ? 1 : 0.35 }}>
              {k === 'any' ? 'Any line' : `${k}+`}
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, marginLeft: 4, opacity: 0.75 }}>{cnt}</span>
            </button>
          )
        })}
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {shown.length} of {rows.length} shown
        </span>
      </div>

      {/* ── THE BOARD'S SHAPE, BEFORE ITS ROWS (2026-08-30) ─────────────────
          Donovan: "make these pages more precise and better stats and chart
          wise." EDGE is a subtraction between two columns three cells apart,
          and reading the board means performing it sixty times in your head.
          Plotted, the subtraction IS the distance from the diagonal — and the
          thing sixty subtractions never showed is the SHAPE: whether the model
          disagrees with the book everywhere or only on the longshots, and
          whether the disagreements are the thin samples. Folded, because the
          board is still what he came for. HR only: it is the only market with
          a real rate, so it is the only one with a diagonal that means
          anything. */}
      {market === 'batter_home_runs' && shown.filter((r) => r.rate != null).length >= 4 && (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 10.5, color: C.text3, listStyle: 'revert' }}>
            <span style={{ color: C.text2 }}>See the board as a picture</span>
            {' '}— his rate against what each price needs, with the sampling band on every dot
          </summary>
          <div style={{ marginTop: 8 }}>
            <CalibrationScatter
              rows={shown.filter((r) => r.rate != null).map((r) => ({
                id: r._key, name: r.player, need: r.need, rate: r.rate,
                lo: r.rateLo, hi: r.rateHi, thin: !!r.rateThin,
              }))}
              onPick={(r) => onPlayerClick?.(shown.find((x) => x._key === r.id)?._raw)}
              footer={`Each vertical bar is the 95% Wilson interval on that hitter's season homer counts, converted to a per-game rate the same way the RATE column is. A bar that crosses the diagonal is a hitter whose own season cannot tell you which side of tonight's price he belongs on — which, on this board, is most of them. Hollow dots are under ${LEAD_MIN_PA} plate appearances and are the same rows the table dims.`}
            />
          </div>
        </details>
      )}

      {!rows.length ? (
        <div style={{
          background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 12,
          padding: '14px 16px', fontSize: 11, color: C.text3, lineHeight: 1.6,
        }}>
          No {live.label} prices joined to tonight&apos;s slate yet. The status line above says where
          the fetch stands — an empty board here with a healthy status usually just means the books
          haven&apos;t posted this market for this slate.
        </div>
      ) : (
        <DenseTable
          heatMode="sorted"
key={market}
          rows={shown}
          columns={[
            { key: 'player', label: 'Hitter', heat: false, w: 152, bold: true, sticky: true },
            { key: 'tm', label: 'TM', heat: false, w: 34, mono: true, dim: true },
            { key: 'opp', label: 'vs', heat: false, w: 34, mono: true, dim: true },
            {
              key: 'line', label: 'LINE', w: 52, heat: false, dp: 1,
              title: `The bar the book set. Standard for ${live.label} is ${live.std} — anything else is a different bet than the boards assume.`,
              fmt: (v) => (Number.isFinite(v) ? (
                <b style={{
                  fontFamily: NUM_FONT,
                  color: Math.abs(v - live.std) > 1e-9 ? '#FCD34D' : C.text,
                }}>{Math.abs(v - live.std) > 1e-9 ? '≠ ' : ''}{v}</b>
              ) : '—'),
            },
            {
              key: 'over', label: 'PRICE', w: 76, heat: false,
              title: 'The over, as the book prices it. Green is plus money. The arrow is real intraday movement since the line opened — ▲ shortened (the book likes it more now), ▼ drifted, ⟲ the line itself changed. Same numbers as ⚡ Moves & gaps, just here without a tab switch.',
              fmt: (v, r) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <b style={{ fontFamily: NUM_FONT, color: v > 0 ? '#4ade80' : C.text }}>{fmtOdds(v)}</b>
                  {r?.lineChanged ? (
                    <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, color: '#60a5fa' }}>⟲</span>
                  ) : Number.isFinite(r?.moveOpen) && Math.abs(r.moveOpen) >= 1.5 ? (
                    <span style={{
                      fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900,
                      color: r.moveOpen >= 3 ? '#4ade80' : r.moveOpen <= -3 ? '#f87171' : C.text3,
                    }}>
                      {r.moveOpen > 0 ? '▲' : '▼'}{Math.abs(r.moveOpen).toFixed(1)}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'need', label: 'NEED %', w: 56, dp: 1, invert: true,
              title: 'What that price has to hit to break even.',
            },
            ...(HAS_SCORE.has(market) ? [{
              key: 'score', label: `${live.label} score`, w: 62, dp: 1,
              title: "The bot's 0-100 confidence on THIS market. Not a probability — never compare it to NEED.",
            }] : []),
            ...(market === 'batter_home_runs' ? [
              { key: 'rate', label: 'HIS RATE %', w: 78, dp: 1,
                title: `His own per-game homer probability, from hr_per_pa and his lineup spot. The one real rate the slate publishes — and blank on any row where the book has moved off the ${live.std} bar, because that price is for two homers and this rate is for one. The small range under it is the 95% Wilson interval on his season homer counts, pushed through the same per-game conversion: it is how much resolution the number actually has.`,
                fmt: (v, r) => (v == null ? '—' : (
                  <span style={{ display: 'inline-block', lineHeight: 1.15 }}>
                    <b style={{ fontFamily: NUM_FONT }}>{v.toFixed(1)}</b>
                    {r?.rateLo != null && (
                      <span style={{ display: 'block', fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>
                        {r.rateLo.toFixed(1)}–{r.rateHi.toFixed(1)}
                      </span>
                    )}
                  </span>
                )) },
              { key: 'fair', label: 'FAIR', w: 52, heat: false,
                title: 'What his own rate says the price should be.',
                fmt: (v) => (v == null ? '—' : <span style={{ fontFamily: NUM_FONT, color: C.text3 }}>{fmtOdds(v)}</span>) },
              { key: 'edge', label: 'EDGE', w: 76, dp: 1,
                title: 'His rate minus the break-even. Positive means the book is paying more than his season says it should. Blank off the standard line — there the book is pricing a different bet. The second line is the 95% interval on that edge, from his own season counts: a ● means the whole 95% band sits on one side of the price, so his SAMPLE is not the reason to doubt the sign. Park, weather, the arm and one book being one opinion are all still outside it.',
                fmt: (v, r) => (v == null ? '—' : (
                  <span style={{ display: 'inline-block', lineHeight: 1.15, fontFamily: NUM_FONT }}>
                    <b style={{ color: v >= 3 ? '#4ade80' : v <= -3 ? '#f87171' : C.text2 }}>
                      {v > 0 ? '+' : ''}{v.toFixed(1)}
                    </b>
                    {r?.edgeClears ? (
                      <span title="The whole 95% band on his season rate sits on one side of this price." style={{ fontSize: 8, marginLeft: 3, color: verdictInk(v > 0).color }}>●</span>
                    ) : null}
                    {r?.edgeLo != null && (
                      <span style={{ display: 'block', fontSize: 8, color: C.text3 }}>
                        {r.edgeLo > 0 ? '+' : ''}{r.edgeLo.toFixed(1)}…{r.edgeHi > 0 ? '+' : ''}{r.edgeHi.toFixed(1)}
                      </span>
                    )}
                  </span>
                )) },
            ] : []),
            { key: 'frozen', label: '❄', w: 32, flag: true, mark: '❄',
              title: "Frozen — his game has started, so this is the last price taken BEFORE first pitch, not the live in-game number. A live price already knows he grounded out twice; comparing it to a pregame hit rate would be nonsense." },
            { key: 'books', label: 'BKS', w: 40, heat: false, dim: true,
              title: 'How many of your books quoted it. One book is one opinion.' },
          ]}
          onRowClick={onPlayerClick}
          // THIN SEASON, DIMMED — never hidden (2026-08-15). A homer rate built
          // on forty plate appearances rendered at full weight is how a 4-for-40
          // sample ended up sorting to the top of this board. The row still
          // carries every number; it just stops shouting.
          dimRow={market === 'batter_home_runs' ? ((r) => r?._pa > 0 && r._pa < LEAD_MIN_PA) : null}
          initialSort={market === 'batter_home_runs' ? 'edge' : HAS_SCORE.has(market) ? 'score' : 'need'}
          maxHeight={560}
          caption={`Click a header to sort, a row to open his card. LINE in yellow with a ≠ means the book is NOT on the standard ${live.std} bar for ${live.label} — the boards' hit rates are measured against ${live.std}, so read those two together carefully.${market === 'batter_home_runs' ? ` Dimmed rows are hitters with under ${LEAD_MIN_PA} plate appearances this season: their rate is real arithmetic on a sample too thin to lead with, and no dimmed row is ever named in the read above.` : ''}`}
        />
      )}
    </div>
  )
}
