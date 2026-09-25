// LAMP's half of lib/routes.js — the NHL tab table.
//
// Kept in its own file so a third sport lands as one import in the shared
// registry rather than a third hand-typed list beside MLB_TABS / NFL_TABS.
// Rule 38 (a registry with two hand-kept lists drifts within days): NHL_TABS
// is DERIVED from NHL_NAV, so a key cannot be in the nav and not routable.
//
// ONLY KEYS THAT RENDER ARE HERE. A registered key with no panel behind it
// renders a blank page, which is the exact failure the registry exists to
// stop. Players / goalies / teams / board / matchups / leaders / results
// arrive with their pages (batch 2 and Phase 3), not before.
//
// Words: standard NHL language first, LAMP second (rule 26). Every label is
// a word a hockey fan already uses.
export const NHL_NAV = {
  // the rail
  scores:    { label: 'Scores',    icon: '\u{1F4E1}', blurb: 'Every game tonight — score, period, clock, shots, who scored' },
  schedule:  { label: 'Schedule',  icon: '\u{1F4C5}', blurb: 'The week, day by day, with puck-drop times in your time zone' },
  standings: { label: 'Standings', icon: '\u{1F4CA}', blurb: 'Division, wild card, conference and league tables' },
  // reached from the LAMP wordmark, not a tab of its own (same as the other two)
  home:      { label: 'Tonight',   icon: '\u{1F319}', blurb: 'The NHL night in one page' },
  // a game, opened from any score row; never on a rail
  game:      { label: 'Game',      icon: '\u{1F3D2}', blurb: 'One game: goals, penalties, shots by period, the box' },
  // ── batch 2 (2026-09-25): the league's people and clubs ──
  players:   { label: 'Players',   icon: '\u{1F464}', blurb: 'Every player on every roster \u2014 search a name, open the file' },
  goalies:   { label: 'Goalies',   icon: '\u{1F9E4}', blurb: 'Every goalie on every roster, their own hierarchy' },
  player:    { label: 'Player',    icon: '\u{1F4C4}', blurb: 'One player: the season line, career, last five, game log' },
  teams:     { label: 'Teams',     icon: '\u{1F3DF}', blurb: 'The 32 clubs by division, with their records' },
  team:      { label: 'Team',      icon: '\u{1F3DF}', blurb: 'One club: record, roster with season lines, schedule, leaders' },
  leaders:   { label: 'Leaders',   icon: '\u{1F3C6}', blurb: 'Who leads the league \u2014 measured, no model score' },
  // the drawer
  guide:     { label: 'How this works', icon: '❓', blurb: 'What LAMP is, what it shows, and what is coming' },
}

/** Keys LAMP renders — derived, never typed twice. */
export const NHL_TABS = Object.keys(NHL_NAV)

/** The other products' words for the same page. Only where it IS the same page. */
export const NHL_ALIASES = {
  live: 'scores',        // TUDDY's word for the live page
  scoreboard: 'scores',  // MOONSHOT's word for the live page
  games: 'schedule',     // "Slate" on the other two is the day's games; here the week is the unit
  slate: 'schedule',
  standing: 'standings',
  table: 'standings',
  tonight: 'home',
  help: 'guide',
  portal: 'players',      // TUDDY's word for the directory
  playerboard: 'player',  // MOONSHOT's word for one man's file
  roster: 'team',
  leaderboard: 'leaders',
  clubs: 'teams',
}

/** The More drawer, grouped the way MOONSHOT's and TUDDY's are. */
export const NHL_MORE_GROUPS = [
  ['Games',  ['scores', 'schedule', 'standings']],
  ['League', ['players', 'goalies', 'teams', 'leaders']],
  ['Help',   ['guide']],
]

export const NHL_NAMES = Object.fromEntries(Object.entries(NHL_NAV).map(([k, v]) => [k, v.label]))
