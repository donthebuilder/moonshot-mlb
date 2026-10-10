// lib/nfl/seasonRule.js -- WHICH SEASON A DEFENSE'S "ALLOWED" NUMBERS COME FROM (2026-10-10).
//
// Donovan: "I need this season data now, everything on the site." The bot's
// nfl_matchup.json already serves THIS season's defense-vs-position table once
// three weeks are played (nfl_features.stats_season_for), and nfl_matchup_prev.json
// holds last season's. This file is the site's side of that one rule, pure and
// server-safe so the page, the Discord line and the write-ups all read the same:
//
//   a defense with MIN_GAMES_THIS (3) or more games this season  -> this season,
//       labelled with the real count ("3 games this season");
//   a defense with fewer                                         -> last season,
//       labelled "last season" and the year;
//   no last-season table to fall back on                         -> this season,
//       labelled with its count and "small sample", never blank.
//
// NEVER MIX SEASONS IN ONE NUMBER: a team's whole role map comes from exactly one
// season (every row of a swapped team carries `s`), and the league mean a row is
// judged against (dvpSignal.leagueCells) is built only from rows of that same
// season. The ranks inside a row are that season's own ranks of 32.
export const MIN_GAMES_THIS = 3

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)

/** Games behind a defense's table in `win` (the most any role cell reports). */
export function teamGames(matchup, team, win = 'season') {
  const roles = matchup?.dvp?.[win]?.[team]
  if (!roles || typeof roles !== 'object') return null
  let g = null
  for (const row of Object.values(roles)) { const n = num(row?.g); if (n != null && (g == null || n > g)) g = n }
  return g
}

/** The season a single row was measured in: its own tag, else the file's. */
export const rowSeason = (matchup, row) => num(row?.s) ?? num(matchup?.season)

const gamesWord = (n) => `${n} ${n === 1 ? 'game' : 'games'}`

/**
 * The season, game count and words for one defense. `slateSeason` is this
 * season (the slate's); `matchup.season` is the season the file serves.
 * Returns { season, games, current, label, short, small } or null when the
 * file holds no table for the team.
 */
export function defenseSeason(matchup, team, slateSeason = null) {
  const games = teamGames(matchup, team)
  if (games == null) return null
  const file = num(matchup?.season)
  const slate = num(slateSeason) ?? file
  const seasonOf = num(matchup?.dvp?.season?.[team] && Object.values(matchup.dvp.season[team])[0]?.s) ?? file
  const current = seasonOf != null && slate != null ? seasonOf >= slate : true
  if (current) {
    const small = games < MIN_GAMES_THIS
    return { season: seasonOf, games, current: true, small,
      label: small ? `${gamesWord(games)} this season, small sample` : `${gamesWord(games)} this season`,
      short: `${gamesWord(games)} this season` }
  }
  return { season: seasonOf, games, current: false, small: false,
    label: `last season (${seasonOf}), ${gamesWord(games)}`, short: `last season (${seasonOf})` }
}

/** Teams in the file's season table below the this-season floor. */
export function thinTeams(matchup, slateSeason = null) {
  const file = num(matchup?.season); const slate = num(slateSeason) ?? file
  if (file == null || slate == null || file < slate) return []   // the file is already last season's: nothing to swap
  return Object.keys(matchup?.dvp?.season || {}).filter((t) => { const g = teamGames(matchup, t); return g != null && g < MIN_GAMES_THIS })
}

/** Does the page need last season's table to honour the rule? */
export const needsPrev = (matchup, slateSeason = null) => Boolean(num(matchup?.alt_season)) && thinTeams(matchup, slateSeason).length > 0

const tag = (roles, s) => Object.fromEntries(Object.entries(roles || {}).map(([r, row]) => [r, { ...row, s }]))

/**
 * THE BLEND. `cur` is the file's table (this season), `prev` the last-season
 * payload (nfl_matchup_prev.json). Every defense under the floor takes its WHOLE
 * role map from `prev` (when prev has it), tagged with prev's season; every
 * other defense keeps this season's, tagged too. Returns `cur` itself when
 * nothing needs swapping, so a healthy payload is untouched (same reference).
 * `dvp_team_season` maps team -> season for the swapped ones.
 */
export function blendMatchup(cur, prev, slateSeason = null) {
  const thin = thinTeams(cur, slateSeason)
  if (!thin.length || !prev?.dvp?.season) return cur
  const curS = num(cur.season); const prevS = num(prev.season)
  const win = { ...cur.dvp }
  const season = {}
  const swapped = {}
  for (const [t, roles] of Object.entries(cur.dvp.season)) {
    if (thin.includes(t) && prev.dvp.season[t]) { season[t] = tag(prev.dvp.season[t], prevS); swapped[t] = prevS } else season[t] = tag(roles, curS)
  }
  win.season = season
  // the other windows (l3 / l5 / l10) are trailing games of whichever season the file serves; a swapped team must not carry them
  for (const w of Object.keys(win)) {
    if (w === 'season' || !win[w]) continue
    win[w] = Object.fromEntries(Object.entries(win[w]).filter(([t]) => !swapped[t]))
  }
  // the last-season LEAGUE the swapped teams are judged against: prev's whole season table, every row tagged with prev's season
  const dvp_league = Object.fromEntries(Object.entries(prev.dvp.season).map(([t, roles]) => [t, tag(roles, prevS)]))
  return { ...cur, dvp: win, dvp_team_season: swapped, dvp_league }
}
