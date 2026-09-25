// The one server-side helper the batch-2 routes share: today's active
// season, from the league's own boundary. Two cached upstream calls
// (standings-season, 1 h) behind it; see lib/nhl/season.js for the rule.
import { easternToday } from '../data'
import { standingsSeasons } from './api'
import { reduceStandingsSeasons } from './reduce'
import { activeSeason } from './season'

export async function whichSeason() {
  const seasons = reduceStandingsSeasons(await standingsSeasons())
  return activeSeason(seasons, easternToday())
}
