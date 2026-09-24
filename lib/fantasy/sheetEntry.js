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

// ── WHO HE PLAYED, AND THE BOX SCORE IN ONE LINE (2026-09-24) ───────────────
// Donovan: "the player modals should show a little more stats, like who they
// played and just basic stats." Each week now carries its opponent (from the
// week row's own game_id -> nfl_week_games) and a one-line box score built
// from the same stored stats the points come from. The stat feed carries
// yards, TDs, catches, turnovers and kicks -- no carries or targets -- so the
// line says only what the data has.
const n0 = (v) => Math.round(num(v) * 10) / 10
const part = (value, label) => (num(value) ? `${n0(value)} ${label}` : null)
const join = (...xs) => xs.filter(Boolean).join(', ')

/** "vs KC" / "@ BUF", from the week's game row, or null. */
export function opponentLabel(team, game) {
  const club = String(team || '').toUpperCase()
  const home = String(game?.home_team || '').toUpperCase()
  const away = String(game?.away_team || '').toUpperCase()
  if (!club || !home || !away) return null
  if (club === home) return `vs ${away}`
  if (club === away) return `@ ${home}`
  return null
}

/** One readable box-score line for a week. '' when he recorded nothing. */
export function boxLine(stats = {}, position = '') {
  const pass = join(part(stats.passing_yards, 'pass yds'), part(stats.passing_touchdowns, 'pass TD'), part(stats.interceptions, 'INT'))
  const rush = join(part(stats.rushing_yards, 'rush yds'), part(stats.rushing_touchdowns, 'rush TD'))
  const rec = join(part(stats.receptions, 'rec'), part(stats.receiving_yards, 'rec yds'), part(stats.receiving_touchdowns, 'rec TD'))
  const kick = join(part(num(stats.field_goals_0_39) + num(stats.field_goals_40_49) + num(stats.field_goals_50_plus), 'FG'), part(stats.extra_points, 'XP'))
  const def = join(part(stats.def_sacks, 'sacks'), part(stats.def_interceptions, 'INT'), part(stats.def_fumble_recoveries, 'FR'), part(stats.def_touchdowns, 'TD'),
    stats.points_allowed === undefined || stats.points_allowed === null ? null : `${n0(stats.points_allowed)} pts allowed`)
  const extra = join(part(stats.fumbles_lost, 'fum lost'), part(stats.return_touchdowns, 'ret TD'))
  const order = position === 'QB' ? [pass, rush, rec] : position === 'K' ? [kick] : position === 'DEF' ? [def] : position === 'RB' ? [rush, rec, pass] : [rec, rush, pass]
  return [...order, extra].filter(Boolean).join(' · ')
}

// Season-to-date across the weeks the page read (the sheet says how many).
const TOTAL_KEYS = ['passing_yards', 'passing_touchdowns', 'interceptions', 'rushing_yards', 'rushing_touchdowns', 'receptions', 'receiving_yards', 'receiving_touchdowns',
  'field_goals_0_39', 'field_goals_40_49', 'field_goals_50_plus', 'extra_points', 'def_sacks', 'def_interceptions', 'def_fumble_recoveries', 'def_touchdowns', 'fumbles_lost', 'return_touchdowns']
function totalsFor(rows, position) {
  const played = rows.filter((r) => r.status === 'final' || r.status === 'live')
  if (!played.length) return null
  const sum = {}
  for (const key of TOTAL_KEYS) sum[key] = played.reduce((a, r) => a + num(r.stats?.[key]), 0)
  return { games: played.length, line: boxLine(sum, position) }
}

/**
 * @param player  an nfl_players row (only the fields the sheet shows survive)
 * @param rows    that player's nfl_player_week_stats rows, any order; embed
 *                `game:nfl_week_games(home_team,away_team)` to get opponents
 * @param scoring the league's scoring rules
 */
export function buildSheetEntry(player, rows, scoring, extra = null) {
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
      opp: opponentLabel(player.team, row.game),
      line: row.status === 'scheduled' ? '' : boxLine(row.stats || {}, player.position),
    })),
    lines: latest ? linesFor(latest.stats) : [],
    totals: totalsFor(sorted, player.position),
    // This week's game and matchup projection, when the page has them.
    next: extra ? extra(player) : null,
  }
}

/** The same thing for a whole list, keyed by player id. */
export function buildSheetData(players, statsByPlayer, scoring, extra = null) {
  return Object.fromEntries(
    (players || []).filter(Boolean).map((player) => [player.id, buildSheetEntry(player, statsByPlayer?.[player.id] || [], scoring, extra)]),
  )
}
