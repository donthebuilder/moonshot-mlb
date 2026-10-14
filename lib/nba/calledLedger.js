// 🏀 THE BUCKETS CALLED LEDGER (2026-10-13, parity with lib/nhl/ledger.js). Server only.
// Every 25-point game on a locked, graded night, tagged CALLED / ON THE BOARD / NOT ON THE BOARD as the row
// LOCKED before tip (lib/record/nba.js readNbaRecords, the reader /called uses -- never re-derived here), in the
// shape components/ledger/Ledger.js takes. The event is the points market's bar (NBA_EVENT_BAR), the market every
// night grades. Regular season only: preseason is graded elsewhere and never shown as the season.
// THE PUBLIC-NUMBER FLOOR (lib/record/nbaFloor.js): while points is under NBA_MIN_NIGHTS graded nights the answer
// carries `tracking` and NO called / board / off counts (the row tags stay: they are what each row locked with).
import { readNbaRecords, NBA_EVENT_BAR } from '../record/nba'
import { readNbaFloor, trackingOf } from '../record/nbaFloorRead'
import { NBA_MIN_NIGHTS } from '../record/nbaFloor'
import { STATUS_WORD as WORD } from '../callStatus'

const dayMinus = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - n, 12)).toISOString().slice(0, 10) }
const STATUS_WORD = Object.fromEntries(Object.entries(WORD).map(([k, v]) => [k, v.toLowerCase()]))
const ORDER = { called: 0, board: 1, off: 2 }

function rowOf(r) {
  return {
    id: r.player_id, name: r.name, team: r.team, value: r.actual ?? NBA_EVENT_BAR, score: r.score ?? undefined,
    status: r.status, statusLabel: r.status === 'called' && r.rank ? `called #${r.rank}` : STATUS_WORD[r.status] || r.status,
    detail: [r.opp ? `vs ${r.opp}` : null].filter(Boolean).join(' · '),
    _raw: { player_id: r.player_id, name: r.name, team: r.team },
  }
}
const totalsOf = (rows, tracking) => (tracking ? { total: rows.length } : { total: rows.length, called: rows.filter((r) => r.status === 'called').length, board: rows.filter((r) => r.status === 'board').length, off: rows.filter((r) => r.status === 'off').length })
const trackingBlock = (floor) => ({ n: floor?.pts?.n || 0, nights: floor?.pts?.nights || 0, minNights: NBA_MIN_NIGHTS })

/** One night: { date, nights, tracking, totals, rows }. date null = the latest graded night. */
export async function readNbaLedgerNight(db, date = null) {
  const all = await readNbaRecords(db, { hitOnly: true })
  if (all.error) throw new Error(all.error.message || String(all.error))
  const floor = await readNbaFloor(db)
  const tracking = trackingOf(floor, 'pts')
  const nights = [...new Set(all.rows.map((r) => r.game_date))].sort()
  const day = date || nights[nights.length - 1] || null
  const rows = all.rows.filter((r) => r.game_date === day).map(rowOf)
    .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || b.value - a.value)
  return { date: day, nights, tracking: tracking ? trackingBlock(floor) : null, totals: totalsOf(rows, tracking), rows }
}

/** The last `days` days, regular season: the Archive's season block and per-player history. */
export async function readNbaLedgerSeason(db, days, today) {
  const { rows, error } = await readNbaRecords(db, { since: dayMinus(today, days), hitOnly: true })
  if (error) throw new Error(error.message || String(error))
  const floor = await readNbaFloor(db)
  const tracking = trackingOf(floor, 'pts')
  const nights = [...new Set(rows.map((r) => r.game_date))].sort()
  const per = new Map()
  for (const r of rows) {
    const h = per.get(r.player_id) || { id: r.player_id, name: r.name, team: r.team, games: 0, calledNights: 0, boardNights: 0, scoreSum: 0, scoreN: 0, last: null }
    h.games += 1
    if (r.status === 'called') h.calledNights += 1
    if (r.status === 'board') h.boardNights += 1
    if (Number.isFinite(r.score)) { h.scoreSum += r.score; h.scoreN += 1 }
    if (!h.last || r.game_date > h.last) { h.last = r.game_date; h.team = r.team }
    per.set(r.player_id, h)
  }
  const hitters = [...per.values()].sort((a, b) => b.games - a.games).map((h) => ({
    id: h.id, name: h.name, team: h.team, value: h.games,
    status: tracking ? null : h.calledNights ? 'called' : h.boardNights ? 'board' : 'off',
    statusLabel: tracking ? 'tracking' : h.calledNights ? `${h.calledNights} called night${h.calledNights === 1 ? '' : 's'}` : h.boardNights ? `${h.boardNights} on the board` : 'never on the board',
    score: h.scoreN ? Math.round(h.scoreSum / h.scoreN) : undefined, detail: `${h.games} night${h.games === 1 ? '' : 's'} at ${NBA_EVENT_BAR}+`, last: h.last,
    _raw: { player_id: h.id, name: h.name, team: h.team },
  }))
  if (!nights.length) return null
  const t = totalsOf(rows, tracking)
  return { from: nights[0], to: nights[nights.length - 1], nightsCount: nights.length, totalEvents: t.total, called: t.called ?? null, board: t.board ?? null, off: t.off ?? null,
    perNight: Math.round((10 * t.total) / nights.length) / 10, tracking: tracking ? trackingBlock(floor) : null, hitters }
}
