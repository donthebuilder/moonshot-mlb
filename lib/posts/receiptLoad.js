// THE NIGHT RECEIPT'S READS (X overhaul, 2026-10-09). The one impure half of lib/posts/receipt.js: it reads
// what ALREADY exists and re-grades nothing -- homer_feed (MOONSHOT's home runs, the event table) and the
// MLB box score line (lib/dash/homerFeed boxLinesForDate, the line the board's own grade used); nfl_td_feed
// (TUDDY's touchdowns) and the week file's injury status; lamp_goal_log (LAMP's own graded rows, via
// lib/record/nhl.js resultOf). Only the sports a named player is in are read. A read that fails is NOT a
// miss: the sport's games come back null (not ready) and the receipt waits.
import { fetchNflGamesOn } from '../nfl/liveSlate'
import { fetchNfl, nflSlateLooksReal, nflSlatePaths } from '../nfl/dataSource'
import { ALL_VERSIONS } from '../nhl/goalModel'
import { boxLinesForDate } from '../dash/homerFeed'

const txt = (v) => String(v == null ? '' : v).trim()
const SCHED = 'dates,games,gamePk,gameDate,status,abstractGameState,detailedState,teams,away,home,team,abbreviation,id'

// ── MOONSHOT ────────────────────────────────────────────────────────────────
/** The day's MLB games from the league's schedule: [{ id, teams: [away, home], final, postponed, startMs }], or null when unreadable. */
export async function mlbGamesOn(day, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}&hydrate=team&fields=${SCHED}`)
    if (!res?.ok) return null
    const j = await res.json()
    return (j?.dates || []).flatMap((d) => d.games || []).map((g) => {
      const detail = txt(g?.status?.detailedState)
      const postponed = /postponed|cancel/i.test(detail)
      return {
        id: String(g.gamePk), startMs: Date.parse(g.gameDate),
        teams: [g?.teams?.away?.team?.abbreviation, g?.teams?.home?.team?.abbreviation].map(txt).filter(Boolean),
        final: g?.status?.abstractGameState === 'Final' || postponed, postponed,
      }
    })
  } catch { return null }
}
async function readMlb(db, day, players) {
  const games = await mlbGamesOn(day)
  const out = { games, results: { homered: new Set(), lines: {}, linesOk: false, postponed: new Set() } }
  if (!games) return out
  // a man in a postponed game did not play
  for (const p of players) {
    const g = games.find((x) => (p.game != null && String(x.id) === String(p.game)) || (p.team && x.teams.map((t) => t.toUpperCase()).includes(String(p.team).toUpperCase())))
    if (g?.postponed) out.results.postponed.add(String(p.id))
  }
  if (!games.every((g) => g.final)) return out                     // the night is still going: no need for the box scores yet
  const { data } = await db.from('homer_feed').select('player_id').eq('day', day)
  out.results.homered = new Set((data || []).map((r) => String(r.player_id)))
  out.results.lines = await boxLinesForDate(day)
  out.results.linesOk = Object.keys(out.results.lines).length > 0
  return out
}

// ── TUDDY ───────────────────────────────────────────────────────────────────
async function readNfl(db, day) {
  let games = null
  try {
    games = (await fetchNflGamesOn(day)).map((g) => ({ id: String(g.game_id), teams: [g.home, g.away].filter(Boolean), final: g.state === 'post' || g.completed === true, startMs: Date.parse(g.kickoff) }))
  } catch { games = null }
  const { data: tds } = await db.from('nfl_td_feed').select('scorer_name, gsis_id').eq('day', day)
  const scorers = {
    ids: new Set((tds || []).map((r) => txt(r.gsis_id)).filter(Boolean)),
    names: new Set((tds || []).filter((r) => !txt(r.gsis_id)).map((r) => txt(r.scorer_name).toLowerCase()).filter(Boolean)),
  }
  let players = null
  try {
    const week = await fetchNfl(nflSlatePaths(), nflSlateLooksReal)
    players = week ? new Map((week.players || []).map((p) => [txt(p.player_id), p])) : null
  } catch { players = null }
  return { games, results: { scorers, players } }
}

// ── LAMP ────────────────────────────────────────────────────────────────────
// LAMP grades its own rows when the game ends, so a row IS a game here: final = graded.
async function readNhl(db, day, players) {
  const ids = [...new Set(players.map((p) => String(p.id)))]
  const { data, error } = await db.from('lamp_goal_log').select('game_id, game_date, player_id, team, model_version, graded_at, dressed, hit')
    .eq('game_date', day).in('player_id', ids).in('model_version', ALL_VERSIONS)
  if (error) return { games: null, results: { rows: new Map() } }
  const rows = new Map()
  for (const r of data || []) {
    const k = String(r.player_id)
    // the latest model's row if a man has two (a graded one over an ungraded one)
    if (!rows.has(k) || (r.graded_at && !rows.get(k).graded_at)) rows.set(k, r)
  }
  const games = [...rows.values()].map((r) => ({ id: String(r.game_id), teams: [r.team].filter(Boolean), final: Boolean(r.graded_at), startMs: NaN }))
  return { games, results: { rows } }
}

/**
 * The receipt's loader for postReceiptOnce: async (players) => { results, games }, per sport.
 * `db` is the service client. Only the sports a named player is in are read.
 */
export function receiptLoader(db, { day }) {
  return async (players) => {
    const results = {}
    const games = {}
    const has = (s) => players.some((p) => p.sport === s)
    const jobs = []
    if (has('mlb')) jobs.push(readMlb(db, day, players.filter((p) => p.sport === 'mlb')).then((r) => { results.mlb = r.results; games.mlb = r.games }))
    if (has('nfl')) jobs.push(readNfl(db, day).then((r) => { results.nfl = r.results; games.nfl = r.games }))
    if (has('nhl')) jobs.push(readNhl(db, day, players.filter((p) => p.sport === 'nhl')).then((r) => { results.nhl = r.results; games.nhl = r.games }))
    await Promise.all(jobs)
    return { results, games }
  }
}
