// ── RECENT FORM (2026-09-20) ────────────────────────────────────────────────
//
// Donovan: "make sure the free agents show their score for this week ... should
// also be a cool moving power ranking thing to help pick hot players and not
// hot." The Wire ranked free agents by a market score and a projection and
// showed nothing either man had actually produced, so "who is hot" was a
// question the page could not answer.
//
// Everything here is a sum of stat lines already stored in
// nfl_player_week_stats and scored with this league's own rules. Nothing is
// projected and nothing is predicted: `trend` describes weeks that have been
// played, and the UI says so. Calling a rising line a forecast would be the
// invented number rule #16 exists to stop.
//
// A week counts as PLAYED only once its row's status leaves 'scheduled'. An
// empty stat line in a final game is a real 0.0 -- a scratch, an inactive, a
// back who never got a carry -- and must drag an average down, which is the
// same rule the matchup board settled on. A week with no row at all is not a
// zero; it is a week we have nothing for, and it is skipped.

import { fantasyPointsFromStats } from './scoring'

const round1 = (n) => Math.round(n * 10) / 10
const mean = (list) => (list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : null)

/**
 * @param weeks   nfl_player_week_stats rows for one player (any order)
 * @param scoring the league's scoring rules
 * @param current the week being viewed
 * @param span    how many weeks back to consider, inclusive of `current`
 */
export function playerForm(weeks, scoring, current, span = 4) {
  const first = Math.max(1, Number(current) - (span - 1))
  const rows = (weeks || [])
    .filter((row) => Number(row.week) >= first && Number(row.week) <= Number(current))
    .map((row) => {
      const played = Boolean(row.status && row.status !== 'scheduled')
      return {
        week: Number(row.week),
        status: row.status || 'scheduled',
        played,
        points: played ? round1(fantasyPointsFromStats(row.stats || {}, scoring)) : null,
      }
    })
    .sort((a, b) => a.week - b.week)

  const played = rows.filter((row) => row.played)
  const currentRow = rows.find((row) => row.week === Number(current)) || null
  const scores = played.map((row) => row.points)
  const best = scores.length ? Math.max(...scores) : 0
  const average = mean(scores)

  // The trend compares the LATEST played week against the ones before it in
  // this window. Fewer than two played weeks is not a trend, it is a game.
  const latest = played[played.length - 1] || null
  const earlier = played.slice(0, -1).map((row) => row.points)
  const prior = mean(earlier)
  let trend = null
  let delta = null
  if (latest && prior !== null) {
    delta = round1(latest.points - prior)
    const swing = prior === 0 ? (latest.points > 0 ? 1 : 0) : (latest.points - prior) / Math.abs(prior)
    // Both a proportional and an absolute bar, so a 1.2 -> 2.6 fantasy week is
    // not announced as a breakout because it happens to be a 117% rise.
    if (swing >= 0.25 && delta >= 3) trend = 'hot'
    else if (swing <= -0.25 && delta <= -3) trend = 'cold'
    else trend = 'steady'
  }

  return {
    rows,
    played: played.length,
    current: currentRow,
    best,
    average: average === null ? null : round1(average),
    prior: prior === null ? null : round1(prior),
    trend,
    delta,
  }
}

/**
 * The scalar the board ranks on when you sort by form: average points over the
 * weeks in this window that were actually played. A man with nothing played
 * sorts last rather than first -- he has no record, which is not the same as
 * a good one.
 */
export function formRank(form) {
  if (!form || !form.played) return -1
  return form.average ?? -1
}

export const TREND_LABEL = { hot: 'HOT', cold: 'COLD', steady: 'STEADY' }
export const TREND_GLYPH = { hot: '▲', cold: '▼', steady: '·' }
