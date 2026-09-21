// ── THE SHEET'S PAYLOAD, BUILT ON THE SERVER (2026-09-20) ───────────────────
//
// Donovan: "i just dont like how slw everything loads." Measured against
// production, the Wire shipped 1,112 KB of HTML, 639 KB of it the React
// server-component payload -- and almost all of THAT was this: eighty players
// times four weeks of raw `stats` jsonb, serialised into the page so a modal
// could format it, for a modal nobody had opened.
//
// The sheet never needed the blobs. It renders, per week, a points total and a
// status; and for the LATEST week only, the handful of stat lines that are not
// zero. All three are computable here, where the data already is. What crosses
// to the browser is now a few numbers and the labels of the lines he actually
// has, instead of twenty mostly-zero keys per week per player.
//
// It also removes a duplicated block from four pages, which each built this
// shape slightly differently by hand (rule #21).

import { fantasyPointsFromStats } from './scoring'

const STAT_ROWS = [
  ['passing_yards', 'Passing yds'],
  ['passing_touchdowns', 'Passing TD'],
  ['interceptions', 'Interceptions'],
  ['rushing_yards', 'Rushing yds'],
  ['rushing_touchdowns', 'Rushing TD'],
  ['receptions', 'Catches'],
  ['receiving_yards', 'Receiving yds'],
  ['receiving_touchdowns', 'Receiving TD'],
  ['fumbles_lost', 'Fumbles lost'],
  ['return_touchdowns', 'Return TD'],
  ['field_goals_0_39', 'FG 0-39'],
  ['field_goals_40_49', 'FG 40-49'],
  ['field_goals_50_plus', 'FG 50+'],
  ['extra_points', 'Extra points'],
  ['def_sacks', 'Sacks'],
  ['def_interceptions', 'Interceptions'],
  ['def_fumble_recoveries', 'Fumbles recovered'],
  ['def_touchdowns', 'Defensive TD'],
  ['def_safeties', 'Safeties'],
  ['points_allowed', 'Points allowed'],
]

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Only the lines he actually has. A stat sheet of twenty zeroes is furniture. */
export function linesFor(stats = {}) {
  return STAT_ROWS
    .filter(([key]) => stats[key] !== undefined && stats[key] !== null && num(stats[key]) !== 0)
    .map(([key, label]) => [label, num(stats[key])])
}

/**
 * @param player  an nfl_players row (only the fields the sheet shows survive)
 * @param rows    that player's nfl_player_week_stats rows, any order
 * @param scoring the league's scoring rules
 */
export function buildSheetEntry(player, rows, scoring) {
  if (!player) return null
  const sorted = [...(rows || [])].sort((a, b) => Number(b.week) - Number(a.week))
  const latest = sorted[0] || null
  return {
    player: {
      id: player.id,
      name: player.name,
      position: player.position,
      team: player.team,
      injury_status: player.injury_status,
      source_player_id: player.source_player_id,
    },
    weeks: sorted.map((row) => ({
      week: Number(row.week),
      status: row.status || 'scheduled',
      points: Math.round(fantasyPointsFromStats(row.stats || {}, scoring) * 10) / 10,
      projected: row.projected_points == null ? null : Number(row.projected_points),
    })),
    lines: latest ? linesFor(latest.stats) : [],
  }
}

/** The same thing for a whole list, keyed by player id. */
export function buildSheetData(players, statsByPlayer, scoring) {
  return Object.fromEntries(
    (players || []).filter(Boolean).map((player) => [player.id, buildSheetEntry(player, statsByPlayer?.[player.id] || [], scoring)]),
  )
}
