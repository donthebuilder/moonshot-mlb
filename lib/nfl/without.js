// 🏈 TUDDY WITHOUT -- his line in the games a teammate did not play (2026-10-31; BUCKETS' lib/nba/without.js and LAMP's twin run the SAME functions).
// Pure. No route, no SQL: the bot's game logs (nfl_logs.json) the player card already holds carry one row per man per game he LOGGED
// ({ s: season, w: week, tm: club, d: date, g_* stats }), zero-stat rows included (about one in six rows is all zeros), so a club game is a week some
// logged man of that club has a row, and "his club played and he has no row" = he did not log that game (inactive, hurt, or no stat line).
// The same window rule as BUCKETS: a man counts as out only from his first game for the club to the club's last, unless he later logged for another
// club that season (a trade or a release: the gap is not counted). Only the men the log holds (offence skill players and kickers, ~400) are teammates.
import { matesFrom } from '../nba/without'
import { aggregateNflGames } from './gameSplits'

/** The game id both sides use: the season and the week. */
export const gameKey = (r) => `${r.s}-${r.w}`
/** What each teammate's `ppg` averages: the yards he gains a game, passing + rushing + receiving (a stat the log holds, not a score). */
const yards = (r) => (Number(r.g_payd) || 0) + (Number(r.g_ruyd) || 0) + (Number(r.g_recyd) || 0)

/**
 * logs: the whole file ({ logs: { [id]: { log: [...], name? } } }). names: { [id]: name } (the week file's). him: his id.
 * Returns the same mates matesFrom returns: [{ id, name, team, gp, ppg, on: [game keys], out: [game keys] }].
 */
export function nflMates(logs, names, him) {
  const rows = []; const other = []
  const mine = logs?.logs?.[him]?.log || []
  const clubs = new Set(mine.filter((r) => r.tm && r.s != null).map((r) => `${r.s}|${r.tm}`))
  for (const [id, e] of Object.entries(logs?.logs || {})) {
    for (const r of e?.log || []) {
      if (!r?.tm || r.s == null || r.w == null) continue
      const row = { game_id: gameKey(r), game_date: r.d || `${r.s}-w${String(r.w).padStart(2, '0')}`, season: r.s, team: r.tm, player_id: id, name: names?.[id] || e.name || id, ...r }
      if (clubs.has(`${r.s}|${r.tm}`)) rows.push(row)
      else other.push({ player_id: id, season: r.s, team: r.tm, game_date: row.game_date })
    }
  }
  return matesFrom(rows, other, him, { val: yards })
}

/** aggregateNflGames, with the `gp` the shared withoutLines / withoutScan read. */
export const aggregateWithGp = (games) => ({ ...aggregateNflGames(games), gp: games.length })
