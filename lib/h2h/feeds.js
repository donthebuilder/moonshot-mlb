// HEAD TO HEAD, THE FEEDS REDUCED (2026-10-13). Pure: a league's public schedule JSON in, games (lib/h2h/core.js shape) out.
// No fetch here, so a node check can hold each one on a saved sample. lib/h2h/read.js does the fetching.
//
// WHICH RESULTS ARE STORED, AND HOW FAR BACK (traced 2026-10-13). None of the four sports keeps a completed-games table in
// this repo's database that reaches back more than the current season: lamp_goal_games holds the NHL games our board graded,
// the NFL week files hold the weeks we scored, and BUCKETS has no completed-season rows at all. The leagues' own public
// schedule feeds hold every finished game with its score for many seasons, and the site already reads the same family of
// feed for its team pages. So this module reads those, three seasons deep, and stores nothing.
//   MLB  statsapi.mlb.com schedule?teamId&opponentId&season   NHL  api-web.nhle.com club-schedule-season/{club}/{season}
//   NFL  ESPN teams/{club}/schedule?season&seasontype         NBA  ESPN teams/{id}/schedule?season&seasontype
const num = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** MLB's schedule JSON -> games. `codeOf(teamId)` gives the site's club code. Spring training and exhibitions are not asked for (gameType). */
export function reduceMlb(json, season, codeOf) {
  const out = []
  for (const d of json?.dates || []) for (const g of d.games || []) {
    if (g.status?.abstractGameState !== 'Final') continue
    const home = g.teams?.home; const away = g.teams?.away
    out.push({
      id: String(g.gamePk), season: season.label, seasonKey: season.key, date: g.officialDate || String(g.gameDate || '').slice(0, 10),
      type: g.gameType === 'R' ? 'R' : 'P', home: codeOf(home?.team?.id), away: codeOf(away?.team?.id), hs: num(home?.score), as: num(away?.score), ot: null,
    })
  }
  return out
}

/** The NHL's club-schedule-season JSON -> games. gameType 2 regular season, 3 playoffs; 1 (preseason) and the rest are dropped. */
export function reduceNhl(json, season) {
  const out = []
  for (const g of json?.games || []) {
    if (g.gameType !== 2 && g.gameType !== 3) continue
    if (g.gameState !== 'OFF' && g.gameState !== 'FINAL') continue
    const lp = g.gameOutcome?.lastPeriodType
    out.push({
      id: String(g.id), season: season.label, seasonKey: season.key, date: g.gameDate, type: g.gameType === 3 ? 'P' : 'R',
      home: g.homeTeam?.abbrev, away: g.awayTeam?.abbrev, hs: num(g.homeTeam?.score), as: num(g.awayTeam?.score), ot: lp === 'OT' || lp === 'SO' ? lp : null,
    })
  }
  return out
}

/** ESPN's club schedule JSON (NFL and NBA) -> games. `codeOf(team)` gives the site's club code. Regular season (2) and postseason (3) only. */
export function reduceEspn(json, season, codeOf) {
  const out = []
  for (const e of json?.events || []) {
    const st = Number(e.seasonType?.type ?? e.seasonType?.id)
    if (st !== 2 && st !== 3) continue
    const c = e.competitions?.[0]
    if (!c || c.status?.type?.state !== 'post') continue
    if (c.type?.abbreviation === 'CC') continue   // the NBA Cup championship is filed under the regular season but is not one of its 82 games
    const home = (c.competitors || []).find((x) => x.homeAway === 'home'); const away = (c.competitors || []).find((x) => x.homeAway === 'away')
    const score = (x) => num(x?.score?.value ?? x?.score)
    out.push({
      id: String(e.id), season: season.label, seasonKey: season.key, date: String(e.date || c.date || '').slice(0, 10), type: st === 3 ? 'P' : 'R',
      home: codeOf(home?.team), away: codeOf(away?.team), hs: score(home), as: score(away), ot: null,
    })
  }
  return out
}

/** ESPN's NFL abbreviations that differ from the site's (WSH / WAS, LAR / LA). */
const NFL_FROM_ESPN = { WSH: 'WAS', LAR: 'LA' }
export const nflCodeOf = (t) => { const a = String(t?.abbreviation || '').toUpperCase(); return NFL_FROM_ESPN[a] || a }
export const NFL_TO_ESPN = { WAS: 'WSH', LA: 'LAR' }
