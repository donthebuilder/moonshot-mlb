// CALLED LAST NIGHT -- one pure adapter per sport: stored rows in, CalledRows out (lib/calledLast/core.js makeRow).
// Each adapter keeps ONLY players who were CALLED at lock, by the sport's own stored status; the rest of the
// board is not here. No fetch, no clock: the readers (read.js) hand the rows in, so these run in plain node.
import { TIERS, inTier } from '../calibration/mlbCalibration'
import { makeRow } from './core'

// the calls whose bar is a touchdown: the TD ladder, and a game's locked call (lib/nfl/tdFeed.js onBotFor)
const TD_CALLS = ['TD', 'GAME']
const keyOf = (r) => String(r.pid)
// the NFL season a game date belongs to (Jan-Feb games are the previous year's season; lib/boardLock.js grades the same way)
const seasonOf = (d) => Number(String(d).slice(0, 4)) - (Number(String(d).slice(5, 7)) <= 2 ? 1 : 0)

/** MLB: calibration entries (gradeNight output) -> one row per called hitter. A hitter named in several lanes is
 *  one row; he HIT only if he cleared every called lane's own bar. Rows stamped at/after first pitch ('late')
 *  were never calls and are not here. A void game is DID NOT PLAY; no final yet is PENDING. */
export function mlbRows(entries, date) {
  const by = new Map()
  for (const e of entries || []) {
    if (!e?.roles?.length || e.status === 'late') continue
    if (date && e.date !== date) continue
    const lanes = TIERS.filter((t) => t.kind === 'call' && inTier(e, t))
    const graded = e.status === 'graded' && e.line
    const did = lanes.map((t) => (graded ? Boolean(t.test(e.line)) : null))
    const result = e.status === 'graded' ? (did.every(Boolean) ? 'hit' : 'miss') : e.status === 'void' ? 'void' : 'pending'
    const calledAs = lanes.length > 1 && graded ? lanes.map((t, i) => `${t.key}${did[i] ? '' : ' ✗'}`).join(' / ') : lanes.map((t) => t.key).join(' / ')
    const row = makeRow({
      sport: 'mlb', date: e.date, pid: e.pid, name: e.name, team: e.team, opp: e.opp, gameId: e.pk, result, calledAs,
      bar: lanes.map((t) => t.bar).join(' / '), stat: graded ? { hits: e.line.hits, ab: e.line.ab, hr: e.line.hr, rbi: e.line.rbi, runs: e.line.runs } : null,
    })
    const prev = by.get(keyOf(row))
    if (!prev || (prev.result === 'hit' && row.result !== 'hit')) by.set(keyOf(row), row)   // a doubleheader: the worse game stands, named once
  }
  return [...by.values()]
}

/** NHL: lamp_goal_log rows (status called) -> rows. result as the tick graded it (lib/record/nhl.js resultOf:
 *  not graded = pending, not dressed = void). `shots`: Map('gameId|playerId' -> shots on goal), only for games
 *  the shot archive holds; a game without it prints goals alone. */
export function nhlRows(logRows, { shots = new Map(), archivedGames = new Set(), versions = null } = {}) {
  const by = new Map()
  for (const r of logRows || []) {
    if (r?.status !== 'called') continue
    if (versions && !versions.includes(r.model_version)) continue
    const result = !r.graded_at ? 'pending' : r.dressed === false || r.hit == null ? 'void' : r.hit ? 'hit' : 'miss'
    const k = `${r.game_id}|${r.player_id}`
    const sh = archivedGames.has(String(r.game_id)) ? (shots.get(k) ?? 0) : null
    const row = makeRow({
      sport: 'nhl', date: r.game_date, pid: r.player_id, name: r.name, team: r.team, opp: r.opp, gameId: r.game_id, result,
      calledAs: 'GOAL', bar: '1+ goal', stat: result === 'hit' || result === 'miss' ? { goals: r.goals ?? 0, shots: sh } : null,
    })
    if (!by.has(k)) by.set(k, row)
  }
  return [...by.values()]
}

/** NFL: board_lock rows (status called) + the week's game logs -> rows. The stored result is the touchdown
 *  grade (hit = 1+ scrimmage TD); the line is whatever the game log stored for him that week. */
export function nflRows(lockRows, logs = null) {
  const by = new Map()
  for (const r of lockRows || []) {
    if (r?.status !== 'called') continue
    // board_lock grades a touchdown (1+ scrimmage TD). A call made in another market (yards, receptions) has a different
    // bar, so it is not judged on this one: only the TD ladder's and the game calls are here.
    if (r.called_by && !TD_CALLS.includes(r.called_by)) continue
    const result = r.result === 'hit' || r.result === 'miss' || r.result === 'void' ? r.result : 'pending'
    const g = (logs?.logs?.[r.player_id]?.log || []).find((x) => x.w === r.week && x.s === seasonOf(r.game_date))
    const stat = g ? { td: g.g_td, car: g.g_car, ruyd: g.g_ruyd, rec: g.g_rec, recyd: g.g_recyd, payd: g.g_payd } : (result === 'hit' || result === 'miss' ? { td: r.actual ?? 0 } : null)
    const row = makeRow({
      sport: 'nfl', date: r.game_date, pid: r.player_id, name: r.name, team: r.team, opp: r.opp, gameId: r.game_id, result,
      calledAs: r.called_by === 'GAME' ? 'GAME CALL' : 'TD', bar: 'anytime TD', stat: result === 'hit' || result === 'miss' ? stat : null,
    })
    if (!by.has(keyOf(row))) by.set(keyOf(row), row)
  }
  return [...by.values()]
}

/** NBA (BUCKETS, hidden until BUCKETS_PUBLIC=on): buckets_log rows already mapped by lib/record/nba.js toRecord. */
export function nbaRows(records, stat = 'pts') {
  const by = new Map()
  for (const r of records || []) {
    if (r?.status !== 'called') continue
    const result = r.result === 'hit' || r.result === 'miss' || r.result === 'void' ? r.result : 'pending'
    const row = makeRow({
      sport: 'nba', date: r.game_date, pid: r.player_id, name: r.name, team: r.team, opp: r.opp, gameId: r.game_id, result,
      calledAs: String(r.target || 'pts').toUpperCase(), stat: result === 'hit' || result === 'miss' ? { actual: r.actual, stat } : null,
    })
    if (!by.has(keyOf(row))) by.set(keyOf(row), row)
  }
  return [...by.values()]
}

/** rows -> the payload every surface reads. state: none (no calls stored) | pending (calls, none graded) | ok. */
export function payloadOf({ sport, slate, date = null, dates = [], rows = [] }) {
  const state = !rows.length ? 'none' : rows.every((r) => r.result === 'pending') ? 'pending' : 'ok'
  return { sport, slate, date, dates, state, rows }
}
