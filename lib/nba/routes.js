// BUCKETS' half of lib/routes.js -- the NBA tab table, LAMP's shape
// (lib/nhl/routes.js). NBA_TABS is DERIVED from NBA_NAV, so a key can't be in
// the nav and not routable; ONLY KEYS THAT RENDER ARE HERE. Words: standard
// NBA language first, BUCKETS second.
export const NBA_NAV = {
  // the rail: Props · Boards · Live · Slate, as the other three
  board:     { label: 'Props', search: 'NBA player props tonight', icon: '\u{1F0CF}', blurb: 'The calls and the ranked board, every market: points, rebounds, assists, threes, PRA, first basket' },
  fullboard: { label: 'Boards', search: 'NBA predictions, every player', icon: '\u{1F4CA}', blurb: 'Every player the model rated tonight, every market, #1 to the bottom' },
  scores:    { label: 'Live', search: 'NBA scores', icon: '\u{1F4E1}', blurb: 'Every game tonight -- score, quarter, clock' },
  games:     { label: 'Slate', search: 'NBA games tonight', icon: '\u{1F4CB}', blurb: 'Every game tonight, and one game at a time: its calls and its board' },
  // reached from the BUCKETS wordmark, not a tab of its own (as the other three)
  home:      { label: 'Tonight', search: 'NBA picks tonight', icon: '\u{1F319}', blurb: 'The NBA night in one page' },
  // a game, opened from any score row; never on a rail
  game:      { label: 'Game', icon: '\u{1F3C0}', blurb: 'One game: the box score, every shot on the floor, the first basket' },
  standings: { label: 'Standings', search: 'NBA standings', icon: '\u{1F4C8}', blurb: 'Both conferences, seeded' },
  teams:     { label: 'Teams', search: 'NBA teams', icon: '\u{1F3DF}', blurb: 'The 30 clubs by division' },
  team:      { label: 'Team', icon: '\u{1F3DF}', blurb: 'One club: record, roster with season lines, schedule' },
  players:   { label: 'Players', search: 'NBA players', icon: '\u{1F464}', blurb: 'Every player on the league’s stats -- search a name, open the file' },
  player:    { label: 'Player', icon: '\u{1F4C4}', blurb: 'One player: the season line, the game log, every shot, the board on him' },
  leaders:   { label: 'Leaders', search: 'NBA leaders', icon: '\u{1F3C6}', blurb: 'Who leads the league -- measured, no model score' },
  shotmap:   { label: 'Shot map', search: 'NBA shot charts', icon: '\u{1F3AF}', blurb: 'Where a club or a player shoots from -- every attempt on file' },
  results:   { label: 'The record', search: 'NBA picks, graded', icon: '\u{1F9FE}', blurb: 'Every graded night -- the calls, and whether they hit' },
  guide:     { label: 'How this works', icon: '❓', blurb: 'What BUCKETS is, what it shows, and what is coming' },
}

/** Keys BUCKETS renders -- derived, never typed twice. */
export const NBA_TABS = Object.keys(NBA_NAV)

/** The other products' words for the same page. Only where it IS the same page. */
export const NBA_ALIASES = {
  live: 'scores', scoreboard: 'scores', slate: 'games', tonight: 'home', help: 'guide',
  bot: 'board', picks: 'board', props: 'board', boards: 'board', research: 'fullboard', rankings: 'fullboard',
  record: 'results', accountability: 'results', reportcard: 'results',
  portal: 'players', playerboard: 'player', roster: 'team', clubs: 'teams', leaderboard: 'leaders',
  table: 'standings', standing: 'standings', heatmap: 'shotmap', spray: 'shotmap',
}

/** The More drawer, grouped the way the others are. */
export const NBA_MORE_GROUPS = [
  ['Board',  ['board', 'fullboard', 'results']],
  ['Games',  ['games', 'scores', 'standings']],
  ['League', ['players', 'teams', 'leaders', 'shotmap']],
  ['Help',   ['guide']],
]

export const NBA_NAMES = Object.fromEntries(Object.entries(NBA_NAV).map(([k, v]) => [k, v.label]))
