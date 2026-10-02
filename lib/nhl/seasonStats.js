// 📊 LAMP SEASON STATS (2026-09-29, Donovan: "make sure the leaders page for
// nfl and nhl look like mlb"). Server only. MOONSHOT's Leaders ends in the
// full sortable table of every hitter's season line; LAMP's leaders feed is
// ten names a category, so this is the table behind it: every skater's and
// goalie's regular-season line from the league's own stats reports.
// Measured, not modelled: nothing here is a LAMP score, nothing is written.
//
//   source   api.nhle.com/stats skater/summary and goalie/summary, season
//            aggregate (isGame=false), regular season (gameTypeId=2).
//            ~940 skaters, ~430 KB raw -> trimmed to the columns shown.
//   season   the season the leaders feed uses (whichSeason); last season's,
//            labelled stale, until the new one has a game in it -- the rule
//            Leaders and Hot sticks follow.
//   cache    the league report through Next's Data Cache (nhlStatsGet), the
//            route's CDN cache over that. One fetch per ten minutes, and only
//            when someone opens Leaders: the ticker and Home never ask.
import { nhlStatsGet, TTL2 } from './api'
import { whichSeason } from './whichSeason'
import { previousSeasonId } from './season'
import { seasonLabel } from './reduce'

const n = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const q = (seasonId) => `isAggregate=false&isGame=false&start=0&limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2`)}`
// A skater traded mid-season is one row with "TOR,BOS"; the club he is on
// now is the last one named.
const club = (s) => String(s || '').split(',').pop().trim()

/** Pure: the league's report rows -> the table's rows. Exported for tests. */
export function skaterRows(data) {
  return (data || []).map((r) => ({
    id: String(r.playerId), name: r.skaterFullName, team: club(r.teamAbbrevs), pos: r.positionCode,
    gp: n(r.gamesPlayed), g: n(r.goals), a: n(r.assists), pts: n(r.points), pm: n(r.plusMinus),
    ppg: n(r.ppGoals), ppp: n(r.ppPoints), gwg: n(r.gameWinningGoals), sog: n(r.shots),
    shPct: n(r.shootingPct), toi: n(r.timeOnIcePerGame), fo: n(r.faceoffWinPct), pim: n(r.penaltyMinutes),
    ptsPg: n(r.pointsPerGame),
  }))
}
export function goalieRows(data) {
  return (data || []).map((r) => ({
    id: String(r.playerId), name: r.goalieFullName, team: club(r.teamAbbrevs), pos: 'G',
    gp: n(r.gamesPlayed), gs: n(r.gamesStarted), w: n(r.wins), l: n(r.losses), otl: n(r.otLosses),
    svPct: n(r.savePct), gaa: n(r.goalsAgainstAverage), so: n(r.shutouts), sa: n(r.shotsAgainst), sv: n(r.saves),
  }))
}

async function forSeason(id) {
  const [s, g] = await Promise.all([
    nhlStatsGet(`/skater/summary?${q(id)}`, TTL2.leaders),
    nhlStatsGet(`/goalie/summary?${q(id)}`, TTL2.leaders),
  ])
  return { skaters: skaterRows(s?.data), goalies: goalieRows(g?.data) }
}

/** One season's goalie lines (names, clubs, shots against) -- the shot map's
 *  goalie picker, for the season the map is drawn from (BATCH-3D-V2 1h). */
export async function goaliesForSeason(id) {
  const g = await nhlStatsGet(`/goalie/summary?${q(id)}`, TTL2.leaders)
  return goalieRows(g?.data)
}

export async function readSeasonStats() {
  const season = await whichSeason()
  if (!season.id) throw new Error('no season from standings-season')
  let used = season.id; let stale = season.stale
  let data = await forSeason(used)
  if (!data.skaters.length && !season.stale) {
    used = previousSeasonId(season.id); stale = true
    data = await forSeason(used)
  }
  return { ...data, season: used, seasonLabel: seasonLabel(used), stale }
}
