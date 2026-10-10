'use client'
// TOP TOTALS, ONE COMPONENT FOR ALL FOUR PRODUCTS (2026-10-09, Donovan: "games with highest totals, like top 3
// games, for each sport ... tracked and CALLED, not just on the board").
//
// A table, not cards: the slate's games ranked by the team model's projected combined count, the three
// highest wearing CALLED (lib/callStatus.js totalsCallStatus; the word is drawn by DenseTable's status stamp
// from STATUS_WORD, never typed here). Every number is the row the lock stored -- projection, line, rank -- and,
// once the game is final, the counted total and OVER / UNDER against that line.
//
//   mode 'slate'   the newest locked slate (the Slate / Games / Schedule page of each product)
//   mode 'record'  the record: CALLED and ON THE BOARD tallies, and the graded CALLED rows (the Ledger's Record view)
//
// `Table` is the product's own DenseTable wrapper (LampTable, NflTable, BucketsTable; MOONSHOT passes DenseTable)
// so the glossary, the logos and the accent are the product's. Phone first: the slate shows the three calls, "show more" for the rest.
import { useMemo } from 'react'
import DenseTable from './DenseTable'
import { useSportTheme } from './SportTheme'
import { useLiveFetch } from '../lib/useLiveFetch'
import { GameTap, TeamTap } from './EntityTap'
import { useGameNav } from '../lib/teamNav'
import { gameHref } from '../lib/routes'
import { TOTALS_UNITS, TOTALS_CALLS, BOOK_LINE_SPORTS } from '../lib/totals/core'

const WORD = { over: 'OVER', under: 'UNDER', push: 'PUSH', void: 'VOID' }
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const rec = (t) => (t && t.graded ? `${t.hits}–${t.misses}${t.pushes ? `–${t.pushes}` : ''}` : '—')

function Game({ sport, row }) {
  const go = useGameNav()
  const label = (
    <span style={{ whiteSpace: 'nowrap' }}>
      <TeamTap abbr={row.away} sport={sport} /> <span style={{ opacity: 0.6 }}>@</span> <TeamTap abbr={row.home} sport={sport} />
    </span>
  )
  // the game itself opens through the shell's door; a product with no door (BUCKETS) gets a real link to the game's address
  return go
    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{label}<GameTap pk={row.game_id} style={{ fontSize: 11 }}>game</GameTap></span>
    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{label}<a className="tap-link" href={gameHref(sport, row.game_id)} style={{ color: 'inherit', fontSize: 11, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '0 6px' }}>game</a></span>
}

function Tile({ C, NUM_FONT, accent, label, value, sub }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, padding: '8px 10px' }}>
      <div style={{ color: C.text3, font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.08em' }}>{label}</div>
      <div style={{ color: accent, font: `900 20px/1.2 ${NUM_FONT}` }}>{value}</div>
      <div style={{ color: C.text3, fontSize: 11 }}>{sub}</div>
    </div>
  )
}

export default function TopTotals({ sport, mode = 'slate', Table = DenseTable }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const u = TOTALS_UNITS[sport]
  const { data, error, loading } = useLiveFetch(`/api/totals?sport=${sport}`)
  const rows = useMemo(() => {
    const src = mode === 'record' ? data?.graded || [] : data?.rows || []
    return src.map((r) => ({
      _key: `${r.sport}-${r.game_id}`, rank: r.rank, game_id: r.game_id, away: r.away, home: r.home, game: `${r.away} @ ${r.home}`,
      proj: r.projected_total, line: r.line, book: r.line_source === 'book' ? r.book_line : null, actual: r.actual_total, result: r.result, status: r.status, start: r.start_at,
    }))
  }, [data, mode])

  const columns = useMemo(() => [
    { key: 'rank', label: '#', w: 30, heat: false, rankCol: true, group: 'GAME' },
    { key: 'game', label: 'Game', w: 150, heat: false, sticky: true, bold: true, group: 'GAME', fmt: (v, r) => <Game sport={sport} row={r} /> },
    { key: 'proj', label: `Proj ${u.short}`, w: 70, dp: u.dp, primary: true, group: 'PROJECTION', title: `The team model's projected combined ${u.unit}, fixed before the game` },
    ...(BOOK_LINE_SPORTS.includes(sport) ? [{ key: 'book', label: 'Book', w: 56, dp: u.dp, heat: false, group: 'PROJECTION', blankWhen: (n) => !Number.isFinite(n), title: `The sportsbooks' consensus total ${u.unit}, read before the game. Blank: no book total listed, so the call is graded against the projection` }] : []),
    { key: 'line', label: 'Line', w: 60, dp: u.dp, heat: false, group: 'PROJECTION', title: 'The number the call is graded against, stored with the call (the book total where there is one, otherwise the projection)' },
    { key: 'actual', label: 'Final', w: 56, dp: 0, heat: false, group: 'RESULT', blankWhen: (n) => !Number.isFinite(n), title: `The combined ${u.unit} the game produced` },
    { key: 'result', label: 'Result', w: 70, heat: false, group: 'RESULT', fmt: (v) => (v ? <b style={{ color: v === 'over' ? accent : C.text2 }}>{WORD[v]}</b> : <span style={{ color: C.text3 }}>{'—'}</span>) },
  ], [sport, u, accent, C])

  const rec_ = data?.record
  const split = data?.record_by_source
  // the two line sources are never pooled once a book-graded call exists: one tile per source
  const bookRec = split?.book?.called
  const showSplit = mode === 'record' && bookRec && bookRec.graded > 0
  const anyBook = rows.some((r) => r.book != null)
  const nothing = !loading && !error && !rows.length

  return (
    <section aria-label="Top totals" data-top-totals={sport} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ color: accent, fontFamily: NUM_FONT, fontSize: 11, letterSpacing: '.1em' }}>TOP TOTALS</b>
        <span style={{ color: C.text3, fontSize: 11 }}>
          The {TOTALS_CALLS} games with the most projected {u.unit} each {u.slate}, called before the first game and graded on the final.
        </span>
      </div>

      {showSplit && (
        <div style={{ display: 'flex', gap: 8, margin: '4px 0 8px' }}>
          <Tile C={C} NUM_FONT={NUM_FONT} accent={accent} label="CALLED vs BOOK" value={rec(bookRec)} sub={`${pct(bookRec.pct)} over the book total · ${bookRec.n} called`} />
          <Tile C={C} NUM_FONT={NUM_FONT} accent={C.text2} label="CALLED vs MODEL" value={rec(split.projection.called)} sub={`${pct(split.projection.called.pct)} over our own number · ${split.projection.called.n} called`} />
        </div>
      )}
      {mode === 'record' && rec_ && !showSplit && (
        <div style={{ display: 'flex', gap: 8, margin: '4px 0 8px' }}>
          <Tile C={C} NUM_FONT={NUM_FONT} accent={accent} label="CALLED" value={rec(rec_.called)} sub={`${pct(rec_.called.pct)} over the line · ${rec_.called.n} called`} />
          <Tile C={C} NUM_FONT={NUM_FONT} accent={C.text2} label="ON THE BOARD" value={rec(rec_.board)} sub={`${pct(rec_.board.pct)} over the line · ${rec_.board.n} listed`} />
        </div>
      )}

      {loading && <div style={{ fontSize: 12, color: C.text3 }}>Reading the calls{'…'}</div>}
      {error && !loading && <div style={{ fontSize: 12, color: C.text3 }}>The top totals are not loading right now. Pull to refresh in a minute.</div>}
      {nothing && (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.text3 }}>
          {mode === 'record'
            ? 'No graded top-totals calls yet. Each call is graded after the final, against the number it was made with.'
            : `No ${u.slate}'s calls are locked yet. They lock 90 minutes before the first game, from the team model's numbers, and are never changed.`}
        </div>
      )}
      {rows.length > 0 && (
        <Table
          rows={rows} columns={columns} statusOf={(r) => r.status} heatMode="primary" bare
          maxRows={mode === 'record' ? 10 : TOTALS_CALLS} maxHeight={9999}
          initialSort={mode === 'record' ? null : { key: 'rank', dir: 'asc' }}
          caption={mode === 'record'
            ? 'Graded CALLED rows, newest first. OVER means the game beat the line stored with its call: the book total where the Book column has one, otherwise the projection.'
            : `${data?.key || ''} — ${anyBook ? 'the line is the book total where one is listed (Book), otherwise the projection. ' : 'the line is the projection itself. '}OVER means the game beat it.`}
        />
      )}
      {mode === 'slate' && rec_ && rec_.called.graded > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: C.text3 }}>
          CALLED so far: {rec(rec_.called)} over the line ({pct(rec_.called.pct)}){split?.book?.called?.graded > 0 ? `, ${rec(split.book.called)} of it against the book total` : ''}.
        </div>
      )}
    </section>
  )
}
