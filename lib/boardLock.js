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
import { twoBoard, TWO_MODEL, TWO_MIN } from './nfl/twoScore'
import { tdOnBoard } from './callStatus'
import { FIRST_MODEL, firstTdRows, clubFirstCounts, firstTdResult } from './nfl/firstTd'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal, nflPicksPaths, nflPicksLooksReal, nflGameCallsPaths, nflMatchupPaths, nflMatchupLooksReal, NFL_DATA_BASE } from './nfl/dataSource'

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
  // THE TWO-SCORE RANKING (td2_site_v1) freezes beside it, its own rows, from the same pregame week file. A failure here never stops the TD rows.
  try {
    const matchup = await fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).catch(() => null)
    const gids = new Set(rows.map((r) => r.player_id))
    rows.push(...twoScoreRows({ week, matchup, rowsBase: rows }).filter((r) => gids.has(r.player_id)))
  } catch (e) { console.error(`[board lock] two-score ${ev.eventID}: ${e?.message || e}`) }
  // THE FIRST-TD RANKING (first_td_site_v1, lib/nfl/firstTd.js) freezes beside them too: its own rows, this season's finished games before the day
  // for each club's first-score lean. Its own try/catch: a failure here never stops the TD rows.
  try {
    const season = Number(String(snapRows[0]?.game_date || '').slice(0, 4)) - (Number(String(snapRows[0]?.game_date || '').slice(5, 7)) <= 2 ? 1 : 0)
    const og = await db.from('opening_games').select('home, away, first_score_team').eq('sport', 'nfl').in('season_type', [2, 3]).lt('game_date', snapRows[0]?.game_date).gte('game_date', `${season}-08-01`).limit(1000)
    if (og.error) throw new Error(og.error.message)
    const base = rows.filter((r) => r.model_version === TD_MODEL.model_version)
    rows.push(...firstTdRows({ week, counts: clubFirstCounts(og.data), rowsBase: base }))
  } catch (e) { console.error(`[board lock] first-td ${ev.eventID}: ${e?.message || e}`) }
  const w = await db.from('board_lock').upsert(rows, { onConflict: 'sport,game_id,player_id,model_version', ignoreDuplicates: true })
  if (w.error) { console.error(`[board lock] ${ev.eventID}: ${w.error.message}`); return `error: ${w.error.message}` }
  return rows.length
}

/**
 * Pure: one frozen row's grade from the game logs, or null (not published yet).
 * hit = 1+ scrimmage TD (g_td, what an anytime-TD bet pays on). A player with
 * no log row while his team's game IS logged didn't play: void, not a miss.
 */
export function tdResult(row, logs, season, min = 1) {
  const mine = (logs?.logs?.[row.player_id]?.log || []).find((g) => g.s === season && g.w === row.week)
  if (mine) return { result: Number(mine.g_td) >= min ? 'hit' : 'miss', actual: Number(mine.g_td) || 0 }
  const teamLogged = Object.values(logs?.logs || {}).some((v) => (v.log || []).some((g) => g.s === season && g.w === row.week && g.tm === row.team))
  return teamLogged ? { result: 'void', actual: null } : null
}

/** The two-score model's grade: hit = 2 or more scrimmage TDs (rushing + receiving, the game log's g_td). */
export const tdResult2 = (row, logs, season) => tdResult(row, logs, season, TWO_MIN)

/**
 * Pure: the TWO-SCORE rows to freeze for the same game (model_version td2_site_v1, lib/nfl/twoScore.js): every ranked
 * player of the game with his place on the WEEK'S two-score board. Status is ON THE BOARD (top third of that board) or
 * NOT; nothing is CALLED on this board until the Card carries a 2+ straight. Insert-only, beside the anytime rows.
 */
export function twoScoreRows({ week, matchup, rowsBase }) {
  const ids = new Set(rowsBase.map((r) => r.player_id))
  const board = twoBoard(week, matchup)
  const mine = rowsBase[0]
  return board.rows.filter((p) => ids.has(String(p.player_id))).map((p) => ({
    ...mine, ...TWO_MODEL, player_id: String(p.player_id), name: p.name || null, team: p.team, opp: p.opp || null, pos: p.position || null,
    score: Math.round(10 * p.two.score) / 10, board_rank: p.two_rank, board_of: p.two_of,
    status: tdOnBoard({ rank: p.two_rank, of: p.two_of }) ? 'board' : 'off', called_by: null,
  }))
}

/** Once a day (the odds tick's 11:00 UTC run): grade the frozen rows whose game is over. */
export async function gradeBoardLock(db, today) {
  const open = await db.from('board_lock').select('sport, game_id, player_id, model_version, name, team, opp, week, game_date')
    .eq('sport', 'nfl').is('graded_at', null).lt('game_date', today).limit(2000)
  if (open.error) return `no table or error: ${open.error.message}`
  if (!open.data?.length) return 0
  const logs = await fetch(`${NFL_DATA_BASE}/nfl_logs.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!logs) return 'no logs file'
  // the first-TD model grades off the TD feed (the earliest touchdown of the game), one read per day
  const feedDays = [...new Set(open.data.filter((r) => r.model_version === FIRST_MODEL.model_version).map((r) => String(r.game_date).slice(0, 10)))]
  const feedBy = new Map()
  for (const d of feedDays) {
    const f = await db.from('nfl_td_feed').select('team, opponent, quarter, clock, td_n, scorer_name').eq('day', d)
    if (!f.error) feedBy.set(d, f.data || [])
  }
  let n = 0
  for (const r of open.data) {
    const season = Number(String(r.game_date).slice(0, 4)) - (Number(String(r.game_date).slice(5, 7)) <= 2 ? 1 : 0)
    const g = r.model_version === FIRST_MODEL.model_version ? firstTdResult(r, feedBy.get(String(r.game_date).slice(0, 10))) : r.model_version === TWO_MODEL.model_version ? tdResult2(r, logs, season) : tdResult(r, logs, season)
    if (!g) continue
    const w = await db.from('board_lock').update({ ...g, graded_at: new Date().toISOString() })
      .match({ sport: r.sport, game_id: r.game_id, player_id: r.player_id, model_version: r.model_version }).is('graded_at', null)
    if (!w.error) n++
  }
  return n
}
