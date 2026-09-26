// 🏒 THE LAMP LEDGER (lamp research step 4, 2026-09-26). Server only.
// Every scorer on a locked, graded night, graded against the board -- the
// hockey edition of MOONSHOT's Called Ledger and TUDDY's Tuddy Ledger, in
// the shape components/ledger/Ledger.js takes.
//
//   who scored, and CALLED / ON THE BOARD / NOT ON THE BOARD
//                  lib/record/nhl.js readNhlRecords (lamp_goal_log, the
//                  same reader /called uses) -- never re-derived here
//   how            lamp_shots goals for that game and player: shot type and
//                  strength (EV / PP / SH), where the archive has the game
//
// Preseason nights are graded and shown, labelled PRESEASON, and kept out
// of the season numbers (the record's own rule).
import { adminClient } from './db'
import { readNhlRecords } from '../record/nhl'

const dayMinus = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - n, 12)).toISOString().slice(0, 10) }

async function goalShots(db, gameIds) {
  const out = new Map()
  if (!gameIds.length) return out
  const { data, error } = await db.from('lamp_shots').select('game_id, player_id, shot_type, strength').eq('result', 'goal').in('game_id', gameIds)
  if (error) { console.error(`[lamp ledger] shots: ${error.message}`); return out }
  for (const s of data) {
    const k = `${s.game_id}:${s.player_id}`
    if (!out.has(k)) out.set(k, [])
    out.get(k).push(`${s.shot_type || 'shot'}${s.strength && s.strength !== 'ev' ? ` (${s.strength.toUpperCase()})` : ''}`)
  }
  return out
}

const STATUS_WORD = { called: 'called', board: 'on the board', off: 'not on the board' }

function rowOf(r, how) {
  return {
    id: r.player_id, name: r.name, team: r.team, value: r.goals ?? 1, score: r.score ?? undefined,
    status: r.status, statusLabel: r.status === 'called' && r.rank ? `called #${r.rank}` : STATUS_WORD[r.status] || r.status,
    detail: [`vs ${r.opp}`, how?.length ? how.join(', ') : null].filter(Boolean).join(' · '),
    _raw: { player_id: r.player_id, name: r.name, team: r.team },
  }
}
const totalsOf = (rows) => ({ total: rows.length, called: rows.filter((r) => r.status === 'called').length, board: rows.filter((r) => r.status === 'board').length, off: rows.filter((r) => r.status === 'off').length })

/** One night: { date, pre, nights, totals, rows }. date null = the latest graded night. */
export async function readLedgerNight(date = null) {
  const db = adminClient()
  if (!db) throw new Error('no supabase env')
  const all = await readNhlRecords(db, { includePre: true, hitOnly: true })
  if (all.error) throw new Error(all.error.message)
  const nights = [...new Set(all.rows.map((r) => r.game_date))].sort()
  const day = date || nights[nights.length - 1] || null
  const rows = all.rows.filter((r) => r.game_date === day)
  const how = await goalShots(db, [...new Set(rows.map((r) => Number(r.game_id)))])
  const shaped = rows.map((r) => rowOf(r, how.get(`${r.game_id}:${r.player_id}`))).sort((a, b) => ({ called: 0, board: 1, off: 2 }[a.status] - { called: 0, board: 1, off: 2 }[b.status]) || b.value - a.value)
  return { date: day, pre: rows.length > 0 && rows.every((r) => r.game_type === 1), nights, totals: totalsOf(shaped), rows: shaped }
}

/** The last `days` days, regular season only: the Ledger's season block and per-player history. */
export async function readLedgerSeason(days, today) {
  const db = adminClient()
  if (!db) throw new Error('no supabase env')
  const { rows, error } = await readNhlRecords(db, { since: dayMinus(today, days), hitOnly: true })
  if (error) throw new Error(error.message)
  const nights = [...new Set(rows.map((r) => r.game_date))].sort()
  const t = totalsOf(rows)
  const per = new Map()
  for (const r of rows) {
    const h = per.get(r.player_id) || { id: r.player_id, name: r.name, team: r.team, goals: 0, calledNights: 0, boardNights: 0, scoreSum: 0, scoreN: 0, nights: 0, last: null }
    h.goals += r.goals ?? 1; h.nights += 1
    if (r.status === 'called') h.calledNights += 1
    if (r.status === 'board') h.boardNights += 1
    if (Number.isFinite(r.score)) { h.scoreSum += r.score; h.scoreN += 1 }
    if (!h.last || r.game_date > h.last) { h.last = r.game_date; h.team = r.team }
    per.set(r.player_id, h)
  }
  const hitters = [...per.values()].sort((a, b) => b.goals - a.goals).map((h) => ({
    id: h.id, name: h.name, team: h.team, value: h.goals,
    status: h.calledNights ? 'called' : h.boardNights ? 'board' : 'off',
    statusLabel: h.calledNights ? `${h.calledNights} called night${h.calledNights === 1 ? '' : 's'}` : h.boardNights ? `${h.boardNights} on the board` : 'never on the board',
    score: h.scoreN ? Math.round(h.scoreSum / h.scoreN) : undefined, detail: `${h.nights} night${h.nights === 1 ? '' : 's'} scored`, last: h.last,
    _raw: { player_id: h.id, name: h.name, team: h.team },
  }))
  return nights.length ? {
    from: nights[0], to: nights[nights.length - 1], nightsCount: nights.length, totalEvents: t.total,
    called: t.called, board: t.board, off: t.off, perNight: Math.round((10 * t.total) / nights.length) / 10, hitters,
  } : null
}
