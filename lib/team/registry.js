// THE TEAM-PAGE SECTION REGISTRY (2026-10-10). The list of sections a sport's team page has, in order, and which
// one opens first: data, not a ternary. A sport is listed once, here; a new section for a sport is one line.
// `needs` names the data the section reads (the audit's "what we hold"); the empty state prints it when it is missing.
// Sports are keyed by lib/routes.js sportKey (nhl / nfl / mlb / nba).
import { SECTION_IDS, RESERVED_SECTION_IDS } from './contract'

const S = (id, label, needs) => ({ id, label, needs })

// ADDING A SECTION TO A SPORT (e.g. NFL 'defense' / 'tags', built by another workflow): one S(...) line in that sport's
// `list` (at the place its chip should sit) and one builder under the same id in lib/team/<sport>.js's BUILDERS. The
// page, the chips, the address (sec=) and the empty-state contract need no change. A sport with a section id the
// registry does not list simply has no chip for it.
export const TEAM_SECTIONS = {
  nhl: {
    first: 'roster',
    list: [
      S('roster', 'Roster', 'the club roster + season lines (NHL club-stats) and tonight’s board'),
      S('schedule', 'Schedule', 'the club schedule (NHL club-schedule-season)'),
      S('stats', 'Stats & ranks', 'the league team report (api.nhle.com team/summary) and the club-game xG table (lamp_team_game_xg)'),
      S('calls', 'Our calls', 'the graded goal log (lamp_goal_log)'),
      S('matchup', 'Next game', 'the next scheduled game, the team model (lamp_team_game_xg) and the opposing goalie’s zones'),
      S('trends', 'Trends', 'the club schedule (home, away, last 10, division, rest)'),
      S('special', 'Goalies & special teams', 'the goalie lines, goalie xG faced (lamp_team_game_xg) and the power-play / penalty-kill reports'),
    ],
  },
  nfl: {
    first: 'roster',
    list: [
      S('roster', 'Players', 'this week\u2019s slate players (nfl_week.json), the depth chart roles and snaps (nfl_matchup.json)'),
      S('schedule', 'Schedule', 'the club schedule and results (ESPN team schedule via /api/nfl/team)'),
      S('stats', 'Stats & ranks', 'the standings feed (points for / against) and the week file\u2019s team_defense per game'),
      S('calls', 'Our calls', 'the graded weekly results (nfl_results_<season>_wNN.json) and the touchdown feed (nfl_td_feed)'),
      S('matchup', 'Next game', 'the next game, the opposing defense vs position (nfl_matchup.json), the team model (nfl_logs.json) and the stored Top Totals line'),
      S('trends', 'Trends', 'the standings feed (home, road, division, conference) and the club schedule'),
      S('special', 'Tendencies & usage', 'tendencies, pressure, coverage, snaps, red-zone and target usage (nfl_matchup.json)'),
    ],
  },
}

/** The section list for a sport, or [] for one with no team page yet (never a guess). */
export const sectionsOf = (sport) => TEAM_SECTIONS[sport]?.list || []
export const firstSection = (sport) => TEAM_SECTIONS[sport]?.first || null
/** A section id the hash may carry: a real section of this sport, else the sport's first. */
export function resolveSection(sport, id) {
  const list = sectionsOf(sport)
  return list.some((s) => s.id === id) ? id : firstSection(sport)
}
export const KNOWN_IDS = new Set([...SECTION_IDS, ...RESERVED_SECTION_IDS])
