// BUCKETS' SEASON POINTS (parity, 2026-10-05). Server only. The Ledger's round
// numbers and who-needs-what, on a mark of every 500 regular-season points.
//
//   entering a night  his game log (ESPN athletes/{id}/gamelog): the season's
//                     regular-season games dated (ET) before that night, summed --
//                     exact on any past night. One read per player, so only for
//                     the night's PTS clearers (a handful).
//   right now         the league's season totals (statistics/byathlete `points`),
//                     for who-needs-what before tip on the current night.
import { gamelogFor, reduceGamelog } from './api'
import { easternDate } from '../data'

export const PTS_MARK = 500
// ESPN's log files these under the regular season; the league's season totals leave them out
// (checked 10-05: Doncic 2025-26 log 2145 incl. the All-Star round robin, totals 2143)
const NOT_SEASON = /all-star|cup\s*-\s*(championship|final)/i

/** Regular-season points in games before `date` (ET), or null when the log can't be read. */
export async function ptsBefore(playerId, season, date) {
  try {
    const log = reduceGamelog(await gamelogFor(playerId, season))
    return log.filter((g) => g.seasonType === 2 && !NOT_SEASON.test(g.note || '') && g.date && easternDate(Date.parse(g.date)) < date)
      .reduce((n, g) => n + (Number(g.pts) || 0), 0)
  } catch (e) {
    console.error(`[buckets] gamelog ${playerId} ${season}: ${e?.message}`)
    return null
  }
}

/** Crossed a multiple of PTS_MARK: the mark, or null. */
export const roundCrossed = (before, tonight) => {
  if (!Number.isFinite(before) || !Number.isFinite(tonight)) return null
  const a = Math.floor(before / PTS_MARK), b = Math.floor((before + tonight) / PTS_MARK)
  return b > a ? b * PTS_MARK : null
}
