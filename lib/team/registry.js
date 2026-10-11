// THE TEAM-PAGE SECTION REGISTRY (2026-10-10). The list of sections a sport's team page has, in order, and which
// one opens first: data, not a ternary. A sport is listed once, here; a new section for a sport is one line.
// `needs` names the data the section reads (the audit's "what we hold"); the empty state prints it when it is missing.
// Sports are keyed by lib/routes.js sportKey (nhl / nfl / mlb / nba).
import { SECTION_IDS } from './contract'

const S = (id, label, needs) => ({ id, label, needs })

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
}

/** The section list for a sport, or [] for one with no team page yet (never a guess). */
export const sectionsOf = (sport) => TEAM_SECTIONS[sport]?.list || []
export const firstSection = (sport) => TEAM_SECTIONS[sport]?.first || null
/** A section id the hash may carry: a real section of this sport, else the sport's first. */
export function resolveSection(sport, id) {
  const list = sectionsOf(sport)
  return list.some((s) => s.id === id) ? id : firstSection(sport)
}
export const KNOWN_IDS = new Set(SECTION_IDS)
