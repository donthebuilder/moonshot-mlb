// THE BOARD, FROZEN AT LOCK (2026-10-03, BATCH-MODEL-V2 M4 -- the value call,
// NFL). Server only. TUDDY's weekly board is not archived with its scores, so
// the odds tick's NFL LOCK (app/api/odds/tick, 50-70 min before kickoff)
// freezes it for that game, beside the anytime-TD prices odds_snap took at
// the same instant: every rated player in the game, his TD score, his rank
// on the week's board and CALLED / ON THE BOARD / NOT ON THE BOARD -- the
// labels from the one place they come from (lib/callStatus.js tdCallStatus on
// lib/nfl/tdFeed.js onBotFor + boardRankFor, the same inputs a touchdown's
// feed row is labelled with). Insert-only; a row is never rewritten.
// Graded once a day from nfl_logs.json (gradeBoardLock). Read only by /admin
// (lib/shadowRecord.js readValueNfl). HIDDEN UNTIL ITS SQL RUNS: no
// board_lock table = nothing read, nothing written.
import { tdCallStatus } from './callStatus'
import { onBotFor, boardRankFor } from './nfl/tdFeed'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal, nflPicksPaths, nflPicksLooksReal, nflGameCallsPaths, NFL_DATA_BASE } from './nfl/dataSource'

export const TD_MODEL = { model_id: 'tuddy-td', model_version: 'tuddy-td-v1' }
const KICKOFF_SLACK_MS = 3 * 3600 * 1000

let ready = null   // per instance: the table exists (checked once)
async function tableReady(db) {
  if (ready === true) return true
  ready = !(await db.from('board_lock').select('player_id').limit(1)).error
  return ready
}

/**
 * Pure: the rows to freeze for one NFL event. `pricedIds` = our ids the lock
 * snapshot priced in this event (odds_snap rows). The game is found from them:
 * the week-file game both their teams play in, kicking off within 3 h of the
 * event's start -- a stale week file (last week's games) finds none and
 * writes nothing, said in `why`.
 * @returns {{ rows: object[], why: string|null }}
 */
export function tdBoardRows({ pricedIds, week, picks, gameCalls, eventId, gameDate, startsAt, takenAt }) {
  const byPid = new Map((week?.players || []).map((p) => [String(p.player_id), p]))
  const pairs = new Map()
  for (const id of pricedIds) {
    const p = byPid.get(String(id))
    if (!p?.team || !p?.opp) continue
    const k = [p.team, p.opp].sort().join('|')
    pairs.set(k, (pairs.get(k) || 0) + 1)
  }
  const top = [...pairs].sort((a, b) => b[1] - a[1])[0]
  if (!top) return { rows: [], why: 'no priced player on the week file' }
  const [a, b] = top[0].split('|')
  const game = (week.games || []).find((g) => [g.home, g.away].sort().join('|') === `${a}|${b}`)
  if (!game) return { rows: [], why: `no ${a}-${b} game on the week file` }
  if (!(Math.abs(Date.parse(game.kickoff) - Date.parse(startsAt)) <= KICKOFF_SLACK_MS)) return { rows: [], why: `week file's ${a}-${b} kicks off ${game.kickoff}, the event ${startsAt} (stale week file)` }
  const rows = []
  for (const p of week.players) {
    if (!(p.team === a || p.team === b) || typeof p.scores?.TD !== 'number' || p.on_bye) continue
    const onBot = onBotFor(picks?.card || null, p.player_id, { gameCalls, gameId: game.game_id })
    const board = boardRankFor(week, p.player_id)
    rows.push({
      sport: 'nfl', game_id: eventId, game_date: gameDate, player_id: String(p.player_id), ...TD_MODEL,
      name: p.name || null, team: p.team, opp: p.opp || null, pos: p.position || null, week: Number(week.week) || null,
      score: Math.round(10 * p.scores.TD) / 10, board_rank: board?.rank ?? null, board_of: board?.of ?? null,
      status: tdCallStatus({ on_bot: onBot, td_board: board }), called_by: onBot?.market || null,
      source: week.built_at || null, locked_at: takenAt,
    })
  }
  return { rows, why: rows.length ? null : 'no rated player in the game' }
}

/** At an NFL lock: freeze the TD board for this game. Its own failure, logged; never the snapshot's. */
export async function freezeTdBoard(db, ev, snapRows, takenAt, startsAt) {
  if (ev?.leagueID !== 'NFL') return null
  if (!(await tableReady(db))) return 'no table (sql not run)'
  const [week, picks, gameCalls] = await Promise.all([
    fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
    fetchNfl(nflPicksPaths(), nflPicksLooksReal).catch(() => null),
    fetchNfl(nflGameCallsPaths()).catch(() => null),
  ])
  if (!week) return 'no week file'
  const pricedIds = [...new Set(snapRows.filter((r) => r.our_player_id).map((r) => r.our_player_id))]
  const { rows, why } = tdBoardRows({ pricedIds, week, picks, gameCalls, eventId: ev.eventID, gameDate: snapRows[0]?.game_date, startsAt, takenAt })
  if (!rows.length) return why
  // NOTHING PREGAME AT OR AFTER KICKOFF: the clock re-read before the write
  if (!(Date.now() < Date.parse(startsAt))) return 'started'
  const w = await db.from('board_lock').upsert(rows, { onConflict: 'sport,game_id,player_id,model_version', ignoreDuplicates: true })
  if (w.error) { console.error(`[board lock] ${ev.eventID}: ${w.error.message}`); return `error: ${w.error.message}` }
  return rows.length
}

/**
 * Pure: one frozen row's grade from the game logs, or null (not published yet).
 * hit = 1+ scrimmage TD (g_td, what an anytime-TD bet pays on). A player with
 * no log row while his team's game IS logged didn't play: void, not a miss.
 */
export function tdResult(row, logs, season) {
  const mine = (logs?.logs?.[row.player_id]?.log || []).find((g) => g.s === season && g.w === row.week)
  if (mine) return { result: Number(mine.g_td) > 0 ? 'hit' : 'miss', actual: Number(mine.g_td) || 0 }
  const teamLogged = Object.values(logs?.logs || {}).some((v) => (v.log || []).some((g) => g.s === season && g.w === row.week && g.tm === row.team))
  return teamLogged ? { result: 'void', actual: null } : null
}

/** Once a day (the odds tick's 11:00 UTC run): grade the frozen rows whose game is over. */
export async function gradeBoardLock(db, today) {
  const open = await db.from('board_lock').select('sport, game_id, player_id, model_version, team, week, game_date')
    .eq('sport', 'nfl').is('graded_at', null).lt('game_date', today).limit(2000)
  if (open.error) return `no table or error: ${open.error.message}`
  if (!open.data?.length) return 0
  const logs = await fetch(`${NFL_DATA_BASE}/nfl_logs.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!logs) return 'no logs file'
  let n = 0
  for (const r of open.data) {
    const season = Number(String(r.game_date).slice(0, 4)) - (Number(String(r.game_date).slice(5, 7)) <= 2 ? 1 : 0)
    const g = tdResult(r, logs, season)
    if (!g) continue
    const w = await db.from('board_lock').update({ ...g, graded_at: new Date().toISOString() })
      .match({ sport: r.sport, game_id: r.game_id, player_id: r.player_id, model_version: r.model_version }).is('graded_at', null)
    if (!w.error) n++
  }
  return n
}
