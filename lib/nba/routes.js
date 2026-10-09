// BUCKETS' half of lib/routes.js -- the NBA tab table, LAMP's shape
// (lib/nhl/routes.js). NBA_TABS is DERIVED from NBA_NAV, so a key can't be in
// the nav and not routable; ONLY KEYS THAT RENDER ARE HERE. Words: standard
// NBA language first, BUCKETS second.
import { LEDGER_ALIAS_VIEW, LEDGER_ALIASES } from '../ledger/views'
import { ODDS_ALIASES } from '../odds/aliases'
import { deletedAliases } from '../deletedPages'

export const NBA_NAV = {
  // the rail: Props · Boards · Live · Slate, as the other three
  board:     { label: 'Props', search: 'NBA player props tonight', icon: '\u{1F0CF}', blurb: 'The calls, as cards, every market: points, rebounds, assists, threes, PRA, double-double, triple-double, first basket' },
  fullboard: { label: 'Rankings', search: 'NBA predictions, every player', icon: '\u{1F4CA}', blurb: 'Who we rank tonight, and why: every player, #1 to the bottom, one market or all of them' },
  scores:    { label: 'Live', search: 'NBA scores', icon: '\u{1F4E1}', blurb: 'Every game tonight — score, quarter, clock' },
  games:     { label: 'Slate', search: 'NBA games tonight', icon: '\u{1F4CB}', blurb: 'Every game tonight, and one game at a time: its calls and its board' },
  // reached from the BUCKETS wordmark, not a tab of its own (as the other three)
  home:      { label: 'Tonight', search: 'NBA picks tonight', icon: '\u{1F319}', blurb: 'The NBA night in one page' },
  // a game, opened from any score row; never on a rail
  game:      { label: 'Game', icon: '\u{1F3C0}', blurb: 'One game: the box score, every shot on the floor, the first basket' },
  schedule:  { label: 'Schedule', search: 'NBA schedule', icon: '\u{1F4C5}', blurb: 'The league week, day by day — tip times in your zone, finals with the score' },
  hot:       { label: 'Hot streaks', search: 'NBA hot players', icon: '\u{1F525}', blurb: 'Who is running hot: every rotation player’s last 5 and last 10 beside his season' },
  matchups:  { label: 'Matchups', search: 'NBA defense vs matchups', icon: '\u{1F6E1}', blurb: 'Tonight, each side against what the other defence gives up — and every defence, ranked' },
  standings: { label: 'Standings', search: 'NBA standings', icon: '\u{1F4C8}', blurb: 'Both conferences, seeded' },
  teams:     { label: 'Teams', search: 'NBA teams', icon: '\u{1F3DF}', blurb: 'The 30 clubs by division' },
  team:      { label: 'Team', icon: '\u{1F3DF}', blurb: 'One club: record, roster with season lines, schedule' },
  players:   { label: 'Players', search: 'NBA players', icon: '\u{1F464}', blurb: 'Every player on the league’s stats — search a name, open the file' },
  player:    { label: 'Player', icon: '\u{1F4C4}', blurb: 'One player: the season line, the game log, every shot, the board on him' },
  leaders:   { label: 'Leaders', search: 'NBA leaders', icon: '\u{1F3C6}', blurb: 'Who leads the league — measured, no model score' },
  shotmap:   { label: 'Shot map', search: 'NBA shot charts', icon: '\u{1F3AF}', blurb: 'Where a club or a player shoots from — every attempt on file' },
  numerology: { label: 'Numerology', search: 'NBA numerology, for fun', icon: '\u{1F52E}', blurb: 'For fun: jerseys and birthdays that line up with the date \u2014 not a prediction' },
  // THE LEDGER (2026-10-07): Tonight | Record (BUCKETS has no called table or archive yet) -- lib/ledger/views.js
  ledger:    { label: 'The Ledger', search: 'NBA ledger tonight and the record', icon: '\u{1F4D2}', blurb: 'Every player who cleared a bar tonight, live, and the graded record' },
  storylines: { label: 'Storylines', search: 'NBA storylines tonight', icon: '\u{1F4F0}', blurb: 'The night’s stories — runs, surges, soft defences, back-to-backs — graded after' },
  odds:      { label: 'Odds', search: 'NBA player prop odds', icon: '\u{1F4B5}', blurb: 'The books’ lines on tonight’s players — every market, the moves, the line shop' },
  watchlist: { label: 'Watchlist', icon: '\u2B50', blurb: 'The players you starred, and every night you starred them, graded' },
  results:   { label: 'The record', search: 'NBA picks, graded', icon: '\u{1F9FE}', blurb: 'Every graded night — the calls, and whether they hit' },
  guide:     { label: 'How this works', icon: '❓', blurb: 'What BUCKETS is, what it shows, and what is coming' },
}

/** Keys BUCKETS renders -- derived, never typed twice. */
export const NBA_TABS = Object.keys(NBA_NAV).filter((k) => !LEDGER_ALIAS_VIEW[k])

/** The other products' words for the same page. Only where it IS the same page. */
export const NBA_ALIASES = {
  align: 'numerology', alignments: 'numerology',
  ...ODDS_ALIASES,
  ...deletedAliases('nba'),   // Derby / Parlay Builder, deleted (lib/deletedPages.js)
  live: 'scores', scoreboard: 'scores', slate: 'games', tonight: 'home', help: 'guide',
  bot: 'board', picks: 'board', props: 'board', boards: 'fullboard', research: 'fullboard', rankings: 'fullboard',
  ...LEDGER_ALIASES,
  portal: 'players', playerboard: 'player', roster: 'team', clubs: 'teams', leaderboard: 'leaders',
  table: 'standings', standing: 'standings', calendar: 'schedule', week: 'schedule', defense: 'matchups', hotsticks: 'hot', watch: 'watchlist', stories: 'storylines', lines: 'odds', prices: 'odds', news: 'storylines', starred: 'watchlist', following: 'watchlist', streaks: 'hot', form: 'hot', defence: 'matchups', dvp: 'matchups', heatmap: 'shotmap', spray: 'shotmap',
}

/** The More drawer, grouped the way the others are. */
export const NBA_MORE_GROUPS = [
  // 2026-10-04: the shared More (lib/routes.js MLB_MORE_GROUPS).
  ['Tonight',  ['watchlist', 'games', 'storylines']],
  ['Results',  ['ledger']],
  ['Research', ['hot', 'shotmap', 'numerology']],
  ['Games',    ['schedule', 'standings', 'matchups']],
  ['Players',  ['players', 'teams', 'leaders']],
  ['Betting',  ['odds']],
  ['You',      ['guide']],
]

export const NBA_NAMES = Object.fromEntries(Object.entries(NBA_NAV).map(([k, v]) => [k, v.label]))
