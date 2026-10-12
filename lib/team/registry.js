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
      S('goalies', 'Goalies', 'the club goalies\u2019 season lines (NHL club-stats), goalie xG faced (lamp_team_game_xg), tonight\u2019s confirmed starter (the board), the goalie zone read (lamp_goalie_zones) and the shared injury report'),
      S('special', 'Special teams', 'the power-play / penalty-kill reports (api.nhle.com powerplay, penaltykill)'),
    ],
  },
  nfl: {
    first: 'roster',
    list: [
      S('roster', 'Players', 'this week\u2019s slate players (nfl_week.json), the depth chart roles and snaps (nfl_matchup.json) and the shared injury report'),
      S('schedule', 'Schedule', 'the club schedule and results (ESPN team schedule via /api/nfl/team)'),
      S('stats', 'Stats & ranks', 'the standings feed (points for / against) and the week file\u2019s team_defense per game'),
      S('calls', 'Our calls', 'the graded weekly results (nfl_results_<season>_wNN.json) and the touchdown feed (nfl_td_feed)'),
      S('matchup', 'Next game', 'the next game, the opposing defense vs position (nfl_matchup.json), the team model (nfl_logs.json) and the stored Top Totals line'),
      S('trends', 'Trends', 'the standings feed (home, road, division, conference) and the club schedule'),
      S('special', 'Tendencies & usage', 'tendencies, pressure, coverage, snaps, red-zone and target usage (nfl_matchup.json)'),
      S('defense', 'Defense', 'the club\u2019s tags (nfl_matchup_extra.json) and every defender by position group (TUDDY\u2019s disruption table and ESPN box scores via /api/nfl/defense)'),
    ],
  },
}

TEAM_SECTIONS.mlb = {
  first: 'roster',
  list: [
    S('roster', 'Hitters', 'tonight\u2019s board rows MOONSHOT loads (every model number) and the shared injury report'),
    S('schedule', 'Schedule', 'the club schedule with probable pitchers (MLB schedule via /api/mlb/team)'),
    S('stats', 'Stats & ranks', 'MLB\u2019s team batting and pitching for all thirty clubs (/api/mlb/team)'),
    S('splits', 'Splits', 'ESPN\u2019s team splits, MLB\u2019s situational splits, the standings\u2019 record splits and the club schedule (/api/mlb/team)'),
    S('calls', 'Our calls', 'the locked, graded home-run record (lib/record/mlbCalls.js)'),
    S('matchup', 'Next game', 'the next game\u2019s probable starters, both clubs\u2019 ranks, the ballpark and the stored Top Totals row'),
  ],
}

TEAM_SECTIONS.nba = {
  first: 'roster',
  list: [
    S('roster', 'Players', 'the club roster with season lines and injuries (/api/buckets/team) and tonight\u2019s board'),
    S('schedule', 'Schedule', 'the club schedule (ESPN via /api/buckets/team)'),
    S('stats', 'Stats & ranks', 'ESPN\u2019s season team statistics for all thirty clubs and the standings (/api/buckets/teamdeep)'),
    S('splits', 'Splits', 'the standings\u2019 records and the club\u2019s own game results of the read season (/api/buckets/teamdeep)'),
    S('calls', 'Our calls', 'the graded BUCKETS log (buckets_log)'),
    S('matchup', 'Next game', 'the next game, the team model\u2019s expected points (ESPN club schedules), the stored Top Totals row and both clubs\u2019 ranks'),
  ],
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
