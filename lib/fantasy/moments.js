// ── LEAGUE MOMENTS (2026-09-20) ─────────────────────────────────────────────
//
// The Feed is the locker room, and until now the only things in it were what
// owners typed and what the transaction log recorded. A quiet league therefore
// had an empty room, and the one panel that claimed to add something -- "DASH
// COACH / League pulse" -- printed a sentence that restated a count it had
// already shown ("N recent roster moves are shaping this league"). Rule #6:
// a card that does not help you understand an event, comparison or signal
// comes out. This replaces it with things that actually happened.
//
// EVERY MOMENT IS A SUM OF SCORES THIS LEAGUE ALREADY PLAYED (rule #16).
// Nothing is projected, modelled or invented, and a league with no finished
// week produces no moments rather than a filler one.
//
// DISPLAY ONLY -- NOTHING IS WRITTEN. fantasy_feed_posts requires a real
// author_id and team_id and has no column marking a post as generated, so a
// synthetic post cannot be stored there without lying about who wrote it.
// These are derived at render and clearly marked as the network's note, not
// an owner's. If they ever need to be persisted, that is a migration and a
// job, not a page.
//
// `finals` is the caller's list of matchups it has already decided are final;
// finality belongs to matchupState.js, never to row.status, which lies until
// migration 202609140300 lands.

import { gamesFor, seasonRecord, sideOf, streakOf } from './receipts'

const round = (n) => Math.round(n * 100) / 100

/** Both sides of every finished game, flattened. */
function allSides(finals, teamIds) {
  const out = []
  for (const row of finals || []) {
    for (const id of teamIds) {
      const side = sideOf(row, id)
      if (side) out.push({ ...side, teamId: id })
    }
  }
  return out
}

/**
 * The moments worth telling, newest first, capped.
 *
 * @param finals   finished matchup rows
 * @param teams    the league's teams (id + name)
 * @param weekTime (week) => ISO string to sort the moment by; the caller
 *                 passes the week's last kickoff, because a matchup row has
 *                 no finished-at column to use instead.
 */
export function leagueMoments(finals, teams, weekTime, limit = 5) {
  const rows = finals || []
  if (!rows.length || !(teams || []).length) return []
  const teamIds = teams.map((team) => team.id)
  const nameOf = (id) => teams.find((team) => team.id === id)?.name || 'A team'
  const sides = allSides(rows, teamIds)
  if (!sides.length) return []

  const latest = Math.max(...rows.map((row) => Number(row.week)))
  const weeksPlayed = new Set(rows.map((row) => Number(row.week))).size
  const thisWeek = sides.filter((side) => side.week === latest)
  const at = (week) => weekTime?.(week) || null
  const out = []

  // The week's high score -- and whether it is the best anyone has managed.
  const high = [...thisWeek].sort((a, b) => b.pf - a.pf)[0]
  if (high) {
    const seasonBest = Math.max(...sides.map((side) => side.pf))
    const isSeasonBest = weeksPlayed > 1 && round(high.pf) >= round(seasonBest)
    out.push({
      key: `high-${latest}`,
      week: latest,
      kind: isSeasonBest ? 'season_high' : 'high_score',
      glyph: isSeasonBest ? '🔥' : '🏆',
      teamId: high.teamId,
      headline: `${nameOf(high.teamId)} put up ${high.pf.toFixed(1)}`,
      detail: isSeasonBest
        ? `The best score anyone has posted this season, and it came in Week ${latest}.`
        : `Week ${latest}'s high score, ${(high.pf - high.pa).toFixed(1)} clear of ${nameOf(high.opponentId)}.`,
      time: at(latest),
    })
  }

  // Margins. A blowout and a photo finish are only worth saying when they are
  // actually one or the other -- a 12-point win is just a win, and calling it
  // a statement would be the kind of manufactured drama rule #8 rejects.
  const wins = thisWeek.filter((side) => side.margin > 0)
  const widest = [...wins].sort((a, b) => b.margin - a.margin)[0]
  if (widest && widest.margin >= 25 && widest.teamId !== high?.teamId) {
    out.push({
      key: `blowout-${latest}`,
      week: latest,
      kind: 'blowout',
      glyph: '💥',
      teamId: widest.teamId,
      headline: `${nameOf(widest.teamId)} won by ${widest.margin.toFixed(1)}`,
      detail: `The week's widest margin — ${widest.pf.toFixed(1)} to ${widest.pa.toFixed(1)} over ${nameOf(widest.opponentId)}.`,
      time: at(latest),
    })
  }
  const closest = [...wins].sort((a, b) => a.margin - b.margin)[0]
  if (closest && closest.margin <= 5 && closest.margin > 0) {
    out.push({
      key: `close-${latest}`,
      week: latest,
      kind: 'nailbiter',
      glyph: '🎯',
      teamId: closest.teamId,
      headline: `${nameOf(closest.teamId)} survived by ${closest.margin.toFixed(1)}`,
      detail: `${closest.pf.toFixed(1)} to ${closest.pa.toFixed(1)} over ${nameOf(closest.opponentId)}. The week's closest finish.`,
      time: at(latest),
    })
  }

  // Runs. Three is where a streak becomes a thing people say out loud.
  const streaks = teamIds
    .map((id) => ({ id, streak: streakOf(rows, id) }))
    .filter((entry) => entry.streak && entry.streak.length >= 3)
    .sort((a, b) => b.streak.length - a.streak.length)
    .slice(0, 2)
  for (const entry of streaks) {
    const won = entry.streak.kind === 'W'
    const record = seasonRecord(rows, entry.id)
    out.push({
      key: `streak-${entry.id}-${entry.streak.label}`,
      week: latest,
      kind: won ? 'hot' : 'cold',
      glyph: won ? '📈' : '📉',
      teamId: entry.id,
      headline: `${nameOf(entry.id)} ${won ? 'has won' : 'has lost'} ${entry.streak.length} straight`,
      detail: `${record.label} on the season, averaging ${record.average === null ? '—' : record.average.toFixed(1)} a week.`,
      time: at(latest),
    })
  }

  return out.slice(0, limit)
}

/** Week -> the last kickoff of that week, for ordering moments in a stream. */
export function weekKickoffIndex(games) {
  const byWeek = new Map()
  for (const game of games || []) {
    const week = Number(game?.week)
    const kickoff = game?.kickoff ? new Date(game.kickoff).getTime() : NaN
    if (!Number.isFinite(kickoff)) continue
    if (!byWeek.has(week) || kickoff > byWeek.get(week)) byWeek.set(week, kickoff)
  }
  return (week) => (byWeek.has(Number(week)) ? new Date(byWeek.get(Number(week))).toISOString() : null)
}

export { gamesFor }
