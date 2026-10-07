'use client'
// 🛒 LINE SHOP — where the books disagree, tonight.
//
// Donovan (2026-09-05): "odd discrepancies, add that too — there are some
// things I've seen that might help me cash." This is that page: every prop
// the site prices, with EACH book's own number beside the others, and the
// three kinds of disagreement a line shopper actually bets on:
//
//   PRICE  — same line, different price. The spread in probability points
//            is money left on the table by whoever bets at the worse book.
//   LINE   — the books are not even on the same bar (0.5 at one, 1.5 at the
//            other). That is not a price difference, it is two different
//            bets, and the one at the lower bar for a similar price is the
//            one to look at.
//   HOLD   — what the book keeps on the over/under pair at the consensus
//            line. A thin hold is a market the book is confident in; a fat
//            one is a market it is guessing at.
//
// It needs the bot's `by_book` field (odds_fetch.py, added 2026-09-05). The
// consensus payload alone cannot show a spread: with two books the median
// IS the better price, so best_over == over on every two-book quote. Until
// the first run carrying by_book lands, the page says so and shows the one
// thing the old payload can say -- the best price and who posted it.
import { useMemo, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'
import { oddsAdapter } from '../../lib/odds/adapters'
import { nameOf, teamOf, oppOf, n, clean } from '../../lib/player'
import { fmtOdds, impliedPct } from '../../lib/odds'
import { shortBook, bookSpread } from '../../lib/odds/shop'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import DenseTable from '../DenseTable'
import { btnStyle } from '../ui'

// the markets are the sport's (lib/odds/adapters.js); MOONSHOT's eight batter markets are the MLB one

/** One row per (player, market) that at least one book quotes. Pure. */
export function shopRows(players, odds, A = oddsAdapter('mlb')) {
  const MARKETS = A.markets.map((m) => [m.key, m.label, m.std])
  const out = []
  let hasByBook = false
  players.forEach((p) => {
    const quotes = A.quotesOf(odds, p)
    if (!quotes) return
    const band = A.bandOf(p)
    MARKETS.forEach(([mk, label, std]) => {
      const q = quotes[mk]
      if (!q) return
      const sp = bookSpread(q)
      const books = sp.books
      if (books.length) hasByBook = true
      const line = n(q.line, NaN)
      // Price spread: at the consensus line only, in break-even points (lib/odds/shop.js).
      const { best: bestQ, worst: worstQ, atLine: needs, spread, lines, split } = sp
      // Hold at the consensus line, from the consensus over/under.
      const oNeed = impliedPct(n(q.over, NaN)), uNeed = impliedPct(n(q.under, NaN))
      const hold = oNeed != null && uNeed != null ? Math.round(10 * (oNeed + uNeed - 100)) / 10 : null
      // The model's side, HR only: his season rate against the BEST price.
      const rate = mk === A.rateMarket && band && !band.thin ? band.rate : null
      const bestOver = bestQ ? bestQ.over : n(q.best_over, NaN)
      const edge = rate != null && Number.isFinite(bestOver) ? Math.round(10 * (rate - impliedPct(bestOver))) / 10 : null
      // The same edge at the WORST book -- what betting at the wrong shop
      // costs on this exact play (Donovan, 2026-09-05).
      const worstOver = worstQ ? worstQ.over : null
      const edgeWorst = rate != null && Number.isFinite(worstOver) && needs.length > 1 ? Math.round(10 * (rate - impliedPct(worstOver))) / 10 : null
      const perBook = Object.fromEntries(books.map(([bk, b]) => [shortBook(bk), { line: n(b.line, NaN), over: n(b.over, NaN), under: n(b.under, NaN) }]))
      out.push({
        id: `${A.rowKey(p)}-${mk}`, _p: p, _mk: mk,
        player: nameOf(p), tm: teamOf(p), opp: oppOf(p), market: label, mk,
        line: Number.isFinite(line) ? line : null, std, offStd: Number.isFinite(line) && Math.abs(line - std) > 1e-9,
        books: n(q.books, books.length), linesSeen: n(q.lines_seen, lines.length || 1),
        perBook, spread, split, splitText: split ? books.map(([bk, b]) => `${shortBook(bk)} ${b.line}`).join(' / ') : '',
        best: Number.isFinite(bestOver) ? bestOver : null, bestBook: bestQ ? shortBook(bestQ.bk) : shortBook(clean(q.best_book, '')),
        worst: worstQ ? worstQ.over : null, worstBook: worstQ ? shortBook(worstQ.bk) : '',
        // LINE MOVES, where we hold history (the feed's opening price against our latest read; lib/odds/lineMove.js)
        moveOpen: q.movement?.from_open_pp != null && Number.isFinite(Number(q.movement.from_open_pp)) ? Number(q.movement.from_open_pp) : null,
        lineChanged: Boolean(q.movement?.line_changed),
        openOver: q.movement?.opening_over != null && Number.isFinite(Number(q.movement.opening_over)) ? Number(q.movement.opening_over) : null,
        fairOver: Number.isFinite(Number(q.fair_over)) && Number(q.fair_over) !== 0 ? Number(q.fair_over) : null,
        hold, rate, edge, edgeWorst, cost: edge != null && edgeWorst != null ? Math.round(10 * (edge - edgeWorst)) / 10 : null, frozen: Boolean(q.frozen),
      })
    })
  })
  return { rows: out, hasByBook }
}

export default function OddsDiscrepancies({ players = [], odds = null, onPlayerClick, sport = 'mlb', theme = null, numFont = null, Table = DenseTable }) {
  const A = oddsAdapter(sport)
  const C = theme || MLB_C
  const NUM_FONT = numFont || MLB_NUM
  const MARKETS = A.markets.map((m) => [m.key, m.label, m.std])
  const [market, setMarket] = useState('all')
  const [only, setOnly] = useState('any')   // any | price | line | plus
  const [minSpread, setMinSpread] = useState(0)
  const { rows, hasByBook } = useMemo(() => shopRows(players, odds, A), [players, odds, A])
  const bookCols = useMemo(() => {
    const s = new Set(); rows.forEach((r) => Object.keys(r.perBook).forEach((b) => s.add(b))); return [...s].sort()
  }, [rows])

  const shown = useMemo(() => {
    let r = rows
    if (market !== 'all') r = r.filter((x) => x.mk === market)
    if (only === 'price') r = r.filter((x) => x.spread != null && x.spread > 0)
    if (only === 'line') r = r.filter((x) => x.split)
    if (only === 'plus') r = r.filter((x) => x.best != null && x.best > 0)
    if (minSpread > 0) r = r.filter((x) => (x.spread ?? 0) >= minSpread)
    return r
  }, [rows, market, only, minSpread])

  const counts = useMemo(() => ({
    price: rows.filter((x) => x.spread > 0).length,
    line: rows.filter((x) => x.split).length,
    widest: [...rows].sort((a, b) => (b.spread ?? -1) - (a.spread ?? -1))[0] || null,
    moved: rows.filter((x) => x.lineChanged || (x.moveOpen != null && Math.abs(x.moveOpen) >= 1.5)).length,
  }), [rows])
  const ACCENT = SPORT_ACCENT[A.sport] || C.orange

  const chip = (on) => ({ ...btnStyle(C.orange, on), padding: '6px 12px', fontSize: 12 })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '2px 0 8px' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.text }}>🛒 Line shop</div>
          <div style={{ fontSize: 10.5, color: C.text3, marginTop: 2 }}>Every book’s own number, side by side. The spread is what you leave on the table by betting at the wrong one.</div>
        </div>
        {hasByBook && counts.widest?.spread > 0 && (
          <div style={{ fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT }}>
            <b style={{ color: C.orange }}>{counts.price}</b> price gaps · <b style={{ color: C.yellow }}>{counts.line}</b> line splits{counts.moved ? <> · <b style={{ color: C.text }}>{counts.moved}</b> moved since open</> : null} · widest{' '}
            <b style={{ color: C.text }}>{counts.widest.player}</b> {counts.widest.market} {fmtOdds(counts.widest.worst)}→{fmtOdds(counts.widest.best)} ({counts.widest.spread}pp)
          </div>
        )}
      </div>

      {!hasByBook && (
        <div style={{ margin: '0 0 10px', padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.yellow}`, background: C.bg2, fontSize: 12, color: C.text2, lineHeight: 1.55 }}>
          <b style={{ color: C.yellow }}>No per-book prices for this slate.</b> Each book’s own number is kept for the yes/no prop (home run, touchdown, goal); the other markets are the feed’s consensus line, so for them this page shows the best price and which book posted it. Spreads, splits and holds fill in where the books were read.
        </div>
      )}

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <button onClick={() => setMarket('all')} style={chip(market === 'all')}>All</button>
        {MARKETS.filter(([k]) => rows.some((r) => r.mk === k)).map(([k, l]) => <button key={k} onClick={() => setMarket(k)} style={chip(market === k)}>{l}</button>)}
        <span style={{ width: 6 }} />
        <button onClick={() => setOnly(only === 'price' ? 'any' : 'price')} style={chip(only === 'price')} title="Same line, different price at two books">Price gaps</button>
        <button onClick={() => setOnly(only === 'line' ? 'any' : 'line')} style={chip(only === 'line')} title="The books are on different bars">Line splits</button>
        <button onClick={() => setOnly(only === 'plus' ? 'any' : 'plus')} style={chip(only === 'plus')} title="Best available price is plus money">Plus money</button>
        <span style={{ width: 6 }} />
        <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Min spread</span>
        {[0, 1, 2, 4].map((v) => <button key={v} onClick={() => setMinSpread(v)} style={chip(minSpread === v)}>{v ? `${v}pp` : 'any'}</button>)}
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{shown.length} of {rows.length}</span>
      </div>

      {!rows.length ? (
        <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24, textAlign: 'center', color: C.text3, fontSize: 11.5 }}>No quotes on the board.</div>
      ) : (
        <Table
          heatMode="sorted"
          rows={shown}
          columns={[
            { key: 'player', label: A.words.noun, heat: false, w: 148, bold: true, sticky: true, group: 'Player' },
            { key: 'tm', label: 'TM', heat: false, w: 34, mono: true, dim: true, teamMark: A.sport },
            { key: 'opp', label: 'vs', heat: false, w: 34, mono: true, dim: true, teamMark: A.sport },
            { key: 'market', label: 'Prop', heat: false, w: 64, mono: true, group: 'Bet' },
            { key: 'line', label: 'LINE', heat: false, w: 46, dp: 1, title: 'The consensus bar. Yellow ≠ means off the standard number.',
              fmt: (v, r) => (v == null ? '—' : <b style={{ fontFamily: NUM_FONT, color: r?.offStd ? C.yellow : C.text }}>{r?.offStd ? '≠ ' : ''}{v}</b>) },
            ...bookCols.map((bk) => ({
              key: `bk_${bk}`, label: bk, w: 62, heat: false, group: 'Each book', title: `${bk}'s own over price, at ${bk}'s own line`,
              fmt: (_, r) => {
                const b = r?.perBook?.[bk]
                if (!b || !Number.isFinite(b.over)) return <span style={{ color: C.text3 }}>—</span>
                const isBest = r.bestBook === bk && r.spread > 0
                const off = Number.isFinite(b.line) && r.line != null && Math.abs(b.line - r.line) > 1e-9
                return (
                  <span style={{ display: 'inline-block', lineHeight: 1.15, fontFamily: NUM_FONT }}>
                    <b style={{ color: isBest ? ACCENT : b.over > 0 ? C.text : C.text2 }}>{fmtOdds(b.over)}</b>
                    {off && <span style={{ display: 'block', fontSize: 10, color: C.yellow }}>@ {b.line}</span>}
                  </span>
                )
              },
            })),
            { key: 'best', label: 'BEST', w: 66, heat: false, group: 'Where they disagree',
              title: 'The best price at the consensus line, and the book that has it. Lit in the accent when another book is paying less.',
              fmt: (v, r) => (v == null ? <span style={{ color: C.text3 }}>—</span> : (
                <span style={{ display: 'inline-block', lineHeight: 1.15, fontFamily: NUM_FONT }}>
                  <b style={{ color: r?.spread > 0 ? ACCENT : C.text2 }}>{fmtOdds(v)}</b>
                  {r?.bestBook ? <span style={{ display: 'block', fontSize: 10, color: r?.spread > 0 ? ACCENT : C.text3 }}>{r.bestBook}</span> : null}
                </span>
              )) },
            { key: 'spread', label: 'SPREAD', w: 58, dp: 1, group: 'Where they disagree', title: 'Break-even points between the best and worst price at the same line. Bigger = more left on the table at the wrong book.',
              fmt: (v) => (v == null ? <span style={{ color: C.text3 }}>—</span> : <b style={{ fontFamily: NUM_FONT }}>{v.toFixed(1)}</b>) },
            { key: 'splitText', label: 'SPLIT', w: 92, heat: false, group: 'Where they disagree', title: 'The books are on different bars — two different bets, not one price.',
              fmt: (v) => (v ? <b style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.yellow }}>{v}</b> : <span style={{ color: C.text3 }}>—</span>) },
            ...(rows.some((r) => r.openOver != null || r.lineChanged) ? [
              { key: 'openOver', label: 'OPEN', w: 58, heat: false, group: 'Move', title: "The feed's opening price for this bet.",
                fmt: (v, r) => (r?.lineChanged ? <b style={{ fontFamily: NUM_FONT, color: C.yellow }}>≠ line</b> : v == null ? <span style={{ color: C.text3 }}>—</span> : <span style={{ fontFamily: NUM_FONT, color: C.text2 }}>{fmtOdds(v)}</span>) },
              { key: 'moveOpen', label: 'MOVE', w: 56, dp: 1, group: 'Move', title: 'Break-even points the price has moved since it opened. ▲ shortened, ▼ drifted. A changed line is a new bet and carries no price move.',
                fmt: (v, r) => (r?.lineChanged || v == null ? <span style={{ color: C.text3 }}>—</span> : <b style={{ fontFamily: NUM_FONT }}>{v > 0 ? '\u25B2' : '\u25BC'}{Math.abs(v).toFixed(1)}</b>) },
            ] : []),
            ...(rows.some((r) => r.fairOver != null) ? [
              { key: 'fairOver', label: 'FAIR', w: 56, heat: false, group: 'Margin', title: "The market's own no-vig price for this bet.",
                fmt: (v) => (v == null ? <span style={{ color: C.text3 }}>—</span> : <span style={{ fontFamily: NUM_FONT, color: C.text2 }}>{fmtOdds(v)}</span>) },
            ] : []),
            { key: 'hold', label: 'HOLD', w: 52, dp: 1, invert: true, group: 'Margin', title: "The book's margin on the over/under pair at the consensus line. Thin = the book is sure; fat = it is guessing.",
              fmt: (v) => (v == null ? <span style={{ color: C.text3 }}>—</span> : <span style={{ fontFamily: NUM_FONT }}>{v.toFixed(1)}%</span>) },
            { key: 'edge', label: 'EDGE', w: 72, dp: 1, group: 'Model', title: 'HR only: his season homer rate minus the break-even at the BEST price. The small number under it is the same edge at the WORST book — the gap between them is what betting at the wrong shop costs you.',
              fmt: (v, r) => (v == null ? <span style={{ color: C.text3 }}>—</span> : (
                <span style={{ display: 'inline-block', lineHeight: 1.15, fontFamily: NUM_FONT }}>
                  <b style={{ color: v >= 3 ? C.green : v <= -3 ? C.red : C.text2 }}>{v > 0 ? '+' : ''}{v.toFixed(1)}</b>
                  {r?.edgeWorst != null && <span style={{ display: 'block', fontSize: 10, color: r.edgeWorst >= 3 ? C.green : r.edgeWorst <= -3 ? C.red : C.text3 }}>{r.edgeWorst > 0 ? '+' : ''}{r.edgeWorst.toFixed(1)} @ {r.worstBook}</span>}
                </span>
              )) },
            { key: 'cost', label: 'COST', w: 52, dp: 1, group: 'Model', title: 'Edge at the best book minus edge at the worst — the points you give up by betting this at the wrong shop. HR only.',
              fmt: (v) => (v == null ? <span style={{ color: C.text3 }}>—</span> : <b style={{ fontFamily: NUM_FONT, color: v >= 3 ? C.red : C.text2 }}>{v.toFixed(1)}</b>) },
            { key: 'frozen', label: '❄', w: 30, flag: true, mark: '❄', title: 'Pregame price, frozen at first pitch.' },
          ]}
          onRowClick={(r) => r?._p && onPlayerClick?.(r._p)}
          initialSort={hasByBook ? 'spread' : 'edge'}
          maxHeight={560}
          caption="Click a header to sort, a row to open his card. Green is the best price at the consensus line; a small @ under a book's price means that book is on a different bar."
        />
      )}
    </div>
  )
}
