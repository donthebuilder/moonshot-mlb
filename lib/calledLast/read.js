// CALLED LAST NIGHT -- the server readers. READ ONLY: nothing here writes, locks or regrades.
//   MLB  por_rows_<day>.jsonl (the board at each game's lock) + outcome_log_<day>.jsonl (what happened) from the
//        bot's data branch, graded by the same gradeNight the calibration table uses (lib/calibration/mlbCalibration.js).
//   NHL  lamp_goal_log (status 'called', graded by the tick) + the shot archive for shots on goal.
//   NFL  board_lock (status 'called', graded daily) + nfl_logs.json for the game-log line.
//   NBA  buckets_log (status 'called'); BUCKETS stays hidden until BUCKETS_PUBLIC=on.
// "Last night" = the previous slate that has stored calls, found from the stored rows themselves (never the
// wall clock): the latest game day strictly before the slate being viewed (NFL: the previous week).
import { dataUrl } from '../dataSource'
import { parseJsonl, finalOutcomes } from '../record/mlbLocked'
import { gradeNight } from '../calibration/mlbCalibration'
import { ALL_VERSIONS } from '../nhl/goalModel'
import { versionsFor } from '../nhl/versions'
import { NFL_DATA_BASE } from '../nfl/dataSource'
import { readNbaRecords } from '../record/nba'
import { isDay, shiftDate } from './core'
import { mlbRows, nhlRows, nflRows, nbaRows, payloadOf } from './adapters'

const get = (u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null)).catch(() => null)
const SCHED_FIELDS = 'dates,games,gamePk,gameDate,officialDate,gameType,status,detailedState'
const LOOKBACK = 6   // MLB: how many days back to look for a slate with a stored board (off days, rainouts)

async function mlbSchedule(day) {
  const j = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${day}&endDate=${day}&gameType=S,R,F,D,L,W&fields=${SCHED_FIELDS}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!j) return null
  const m = new Map()
  for (const d of j.dates || []) for (const g of d.games || []) m.set(String(g.gamePk), { start: Date.parse(g.gameDate), type: g.gameType, state: g.status?.detailedState || '', date: g.officialDate || d.date })
  return m
}

export async function readMlb(slate) {
  for (let k = 1; k <= LOOKBACK; k += 1) {
    const day = shiftDate(slate, -k)
    // eslint-disable-next-line no-await-in-loop
    const por = await get(dataUrl(`current/por_rows_${day}.jsonl`))
    if (!por) continue
    const [out, games] = await Promise.all([get(dataUrl(`current/outcome_log_${day}.jsonl`)), mlbSchedule(day)])
    if (!games) throw new Error('schedule unreadable')
    const { entries } = gradeNight({ date: day, por: parseJsonl(por), outcomes: finalOutcomes(parseJsonl(out)), games })
    const rows = mlbRows(entries, day)
    if (rows.length) return payloadOf({ sport: 'mlb', slate, date: day, dates: [day], rows })
  }
  return payloadOf({ sport: 'mlb', slate })
}

async function shotsByPlayer(db, gameIds) {
  const shots = new Map()
  const archived = new Set()
  if (!gameIds.length) return { shots, archived }
  const { data, error } = await db.from('lamp_shots').select('game_id, player_id, result').in('game_id', gameIds).limit(20000)
  if (error) return { shots, archived }   // no archive access on this key: goals alone
  for (const s of data || []) {
    archived.add(String(s.game_id))
    if (s.result === 'goal' || s.result === 'sog') { const k = `${s.game_id}|${s.player_id}`; shots.set(k, (shots.get(k) || 0) + 1) }
  }
  return { shots, archived }
}

export async function readNhl(db, slate) {
  const prev = await db.from('lamp_goal_log').select('game_date').in('model_version', ALL_VERSIONS).eq('status', 'called').neq('game_type', 1).lt('game_date', slate).order('game_date', { ascending: false }).limit(1)
  if (prev.error) throw new Error(prev.error.message || 'nhl read')
  const day = prev.data?.[0]?.game_date
  if (!day) return payloadOf({ sport: 'nhl', slate })
  const { data, error } = await db.from('lamp_goal_log')
    .select('game_id, game_date, player_id, model_version, team, opp, name, status, dressed, goals, hit, graded_at')
    .in('model_version', ALL_VERSIONS).eq('status', 'called').eq('game_date', day).neq('game_type', 1).limit(2000)
  if (error) throw new Error(error.message || 'nhl read')
  const wanted = ['lamp-goal-v1', versionsFor(day).goal]
  const logRows = (data || []).filter((r) => wanted.includes(r.model_version))
  const { shots, archived } = await shotsByPlayer(db, [...new Set(logRows.map((r) => r.game_id))])
  return payloadOf({ sport: 'nhl', slate, date: day, dates: [day], rows: nhlRows(logRows, { shots, archivedGames: archived }) })
}

/** NFL: `week` = the week on the board; the previous slate is the latest earlier week with stored calls. */
export async function readNfl(db, slate, week) {
  const w = Number(week)
  let q = db.from('board_lock').select('week, game_date').eq('sport', 'nfl').eq('status', 'called')
  q = Number.isFinite(w) && w > 0 ? q.lt('week', w) : q.lt('game_date', slate)
  const prev = await q.order('game_date', { ascending: false }).limit(1)
  if (prev.error) return { ...payloadOf({ sport: 'nfl', slate }), unavailable: true }   // the table's SQL has not run: said, not guessed
  const last = prev.data?.[0]
  if (!last) return payloadOf({ sport: 'nfl', slate })
  const { data, error } = await db.from('board_lock')
    .select('game_id, game_date, player_id, name, team, opp, week, status, called_by, result, actual, graded_at')
    .eq('sport', 'nfl').eq('status', 'called').eq('week', last.week).limit(2000)
  if (error) throw new Error(error.message || 'nfl read')
  const logs = await fetch(`${NFL_DATA_BASE}/nfl_logs.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const rows = nflRows(data || [], logs)
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  return payloadOf({ sport: 'nfl', slate, date: dates.at(-1) || last.game_date, dates, rows })
}

export async function readNba(db, slate) {
  const prev = await db.from('buckets_log').select('game_date').eq('status', 'called').neq('season_type', 1).lt('game_date', slate).order('game_date', { ascending: false }).limit(1)
  if (prev.error) throw new Error(prev.error.message || 'nba read')
  const day = prev.data?.[0]?.game_date
  if (!day) return payloadOf({ sport: 'nba', slate })
  const { rows, error } = await readNbaRecords(db, { since: day, until: day, graded: false, status: 'called' })
  if (error) throw new Error(error.message || 'nba read')
  return payloadOf({ sport: 'nba', slate, date: day, dates: [day], rows: nbaRows(rows) })
}

export { isDay }
