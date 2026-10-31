// TUDDY'S TRENDING ROWS, PURE (2026-10-25): lifted out of components/nfl/tabs/Trending.js so the all-sports route (/api/trending) builds
// the same rows on the server. Every lined man x lane (the odds feed's NFL markets) whose game has not kicked off, from the week file
// and the bot's game logs, through the shared core (lib/hitRater.js). No fetch, no React.
import { propLanesOf } from '../propLanes'
import { hitRaterRow } from '../hitRater'

// the odds feed's market for each lane (lib/odds/latest.js SPORTS.nfl + the anytime TD snap market)
export const NFL_ODDS_KEY = { TD: 'player_anytime_td', REC_YDS: 'player_reception_yds', REC: 'player_receptions', RUSH_YDS: 'player_rush_yds', RUSH_ATT: 'player_rush_attempts', PASS_YDS: 'player_pass_yds', KICK_PTS: 'player_kicking_points' }
export const NFL_TREND_LANES = propLanesOf('nfl').filter((l) => NFL_ODDS_KEY[l.key] && l.stat)

/**
 * THE DEFENSE (DVP): for each club, the lane's values posted by men at the SAME position who played AGAINST it this season, newest first.
 * Built from the bot's own game logs (every man's log row carries the club he faced as `opp`), so no new file or fetch. A man not on this
 * week's file has no position and is left out. { 'KC|WR': [log rows newest first] }.
 */
export function defenseIndex({ data, logs }) {
  const pos = new Map((data?.players || []).map((p) => [String(p.player_id), p.position]))
  const all = []
  for (const [id, e] of Object.entries(logs?.logs || {})) {
    const pp = pos.get(String(id))
    if (!pp || !Array.isArray(e?.log)) continue
    for (const x of e.log) if (x?.opp) all.push({ ...x, _pos: pp })
  }
  const season = Math.max(...all.map((x) => Number(x.s) || 0), 0)
  const idx = new Map()
  for (const x of all.filter((r) => !season || Number(r.s) === season).sort((a, b) => (Number(b.s) || 0) - (Number(a.s) || 0) || (Number(b.w) || 0) - (Number(a.w) || 0))) {
    const k = `${x.opp}|${x._pos}`
    if (!idx.has(k)) idx.set(k, [])
    idx.get(k).push(x)
  }
  return idx
}

/** The rows: every lined man x lane whose game has not kicked off. Pure over the three files the shell holds. */
export function tuddyTrendingRows({ data, logs, odds, now = Date.now() }) {
  const lined = odds?.by_player_id || {}
  const byId = new Map((data?.players || []).map((p) => [String(p.player_id), p]))
  const gameOf = (team) => (data?.games || []).find((g) => g.home === team || g.away === team)
  const out = []
  const vsD = defenseIndex({ data, logs })
  for (const [id, quotes] of Object.entries(lined)) {
    const p = byId.get(id)
    const log = logs?.logs?.[id]?.log
    if (!p || !Array.isArray(log) || !log.length) continue
    const g = gameOf(p.team)
    if (!g || !(Date.parse(g.kickoff) > now)) continue   // this week's game, not under way
    const games = log.slice().reverse().map((x) => ({ ...x, home: x.h === 1 ? true : x.h === 0 ? false : null }))
    const next = { opp: g.home === p.team ? g.away : g.home, home: g.home === p.team }
    const dRows = vsD.get(`${next.opp}|${p.position}`) || null
    for (const lane of NFL_TREND_LANES) {
      const q = quotes?.[NFL_ODDS_KEY[lane.key]]
      const line = Number(q?.line)
      if (!Number.isFinite(line)) continue
      const best = Number(q.best_over ?? q.over)
      const row = hitRaterRow({ p: { sport: 'nfl', id, name: p.name, team: p.team, pos: p.position }, lane: { key: lane.key, word: lane.short || lane.label, stat: (x) => x[lane.stat] }, line, odds: Number.isFinite(best) ? best : null, games, next, dvp: dRows ? dRows.map((x) => x[lane.stat]) : null })
      out.push({ ...row, gameId: g.game_id })
    }
  }
  return out
}

