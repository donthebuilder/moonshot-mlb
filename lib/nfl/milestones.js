// THE MILESTONE LINE (2026-10-17, Donovan: "the old lines are still showing, 50 yards instead of the hundred yards and 300 yards").
// Until 2026-10-18 the bot GRADED The Six at 40 / 50 / 225 yards; from nfl_*yds_v2 it grades at the same line (100 / 100 / 300), so this count and the
// graded bar now agree, and weeks graded earlier are reported apart (lib/nfl/barSplit.js). The line a reader thinks in is
// 100 receiving, 100 rushing, 300 passing -- the ruling already in lib/card/rules.js MIN_BAR for the Card and the "big day" alerts. This is that line, once,
// and a count of how many of HIS games this season reached it, read off the game log the site already loads (nfl_logs.json). A fact about his games,
// never a grade: the lane still says what it is graded at.
import { MIN_BAR } from '../card/rules'
import { seriesFor, currentSeason } from './streaks'

export const MILESTONE = Object.freeze({
  REC_YDS: Object.freeze({ bar: MIN_BAR.nfl.rec_yds, field: 'g_recyd' }),
  RUSH_YDS: Object.freeze({ bar: MIN_BAR.nfl.rush_yds, field: 'g_ruyd' }),
  PASS_YDS: Object.freeze({ bar: MIN_BAR.nfl.pass_yds, field: 'g_payd' }),
})

/** { bar } for a market on The Six that has a milestone line, else null. */
export const milestoneOf = (market) => MILESTONE[market] || null

/**
 * His games this season that reached the line: { n, of, bar } | null (no milestone for the market, or no game of his this season in the log).
 * `of` counts the games in his log for the season, not the club's schedule.
 */
export function milestoneCount(logs, playerId, market) {
  const m = MILESTONE[market]
  if (!m || !logs) return null
  const rows = seriesFor(logs, playerId, m.field, 40, currentSeason(logs))
  if (!rows.length) return null
  return { n: rows.filter((r) => r.v >= m.bar).length, of: rows.length, bar: m.bar }
}

/** "100+ in 4 of 11 games" */
export const milestoneWords = (c) => (c ? `${c.bar}+ in ${c.n} of ${c.of} game${c.of === 1 ? '' : 's'}` : null)
