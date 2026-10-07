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
import { LEDGER_ALIAS_VIEW, LEDGER_ALIASES } from '../ledger/views'
import { ODDS_ALIASES } from '../odds/aliases'

export const NHL_NAV = {
  // the rail
  // THE BAR IS MOONSHOT'S (2026-09-28, Donovan): Board · Shots · Live · Slate.
  // Live is the scores page (MOONSHOT's Live opens on the scoreboard too);
  // Shots is the board on its SHOTS 3+ market; Slate is new (LampSlate).
  scores:    { label: 'Live', search: 'NHL scores',    icon: '\u{1F4E1}', blurb: 'Every game tonight — score, period, clock, shots, who scored' },
  shots:     { label: 'Shots', search: 'NHL shots on goal board', icon: '\u{1F3D2}', blurb: 'Tonight\u2019s shots board \u2014 3+ shots on goal, three called per game' },
  games:     { label: 'Slate', search: 'NHL games tonight', icon: '\u{1F4CB}', blurb: 'Every game tonight, and one game at a time: its read, its whole board, the two called' },
  schedule:  { label: 'Schedule', search: 'NHL schedule',  icon: '\u{1F4C5}', blurb: 'The week, day by day, with puck-drop times in your time zone' },
  standings: { label: 'Standings', search: 'NHL standings', icon: '\u{1F4CA}', blurb: 'Division, wild card, conference and league tables' },
  // reached from the LAMP wordmark, not a tab of its own (same as the other two)
  home:      { label: 'Tonight', search: 'NHL goal picks tonight',   icon: '\u{1F319}', blurb: 'The NHL night in one page' },
  // a game, opened from any score row; never on a rail
  game:      { label: 'Game',      icon: '\u{1F3D2}', blurb: 'One game: goals, penalties, shots by period, the box' },
  // ── batch 3 (2026-09-25): the first LAMP board, and its record ──
  // PROPS (2026-10-02, Donovan: "where is the props page like the others"): the board -- the calls
  // and the ranked board, every market on its chips -- is LAMP's Props, as TUDDY's Props is its touchdowns page
  board:     { label: 'Props', search: 'NHL goal props tonight', icon: '\u{1F0CF}', blurb: 'The calls, as cards: goals and shots, each with its price' },
  results:   { label: 'The record', search: 'NHL goal picks, graded', icon: '\u{1F9FE}', blurb: 'Every graded night \u2014 who scored, and whether the board had him' },
  // 2026-09-25: every scored skater on the night, #1 to the bottom, across
  // games -- MOONSHOT's The Board, hockey edition. Same label and icon as
  // MLB_NAV.fullboard so `fullboard` means one thing on all three.
  // lamp research step 4 (2026-09-26): MOONSHOT's Called Ledger / TUDDY's Tuddy Ledger, hockey edition
  // 2026-09-27 (ledger plan): the night in names and numbers -- was an alias of 'results'
  // THE LEDGER (2026-10-07): ONE entry, four sub-tabs -- Tonight | Called | Record | Archive (lib/ledger/views.js).
  // The old Ledger / Lamp Ledger / The record keys are aliases of it; `results` stays in this table only so
  // the registry can still say its name ("The record") -- it is not a page of its own any more.
  ledger:    { label: 'The Ledger', search: 'NHL goal ledger and record', icon: '\u{1F4D2}', blurb: 'Tonight in names and numbers, every goal called or not, the graded record, and the archive' },
  // RANKINGS (10-03, Donovan: one word per kind of page on every sport -- MOONSHOT and TUDDY call this Rankings): every rated skater, every number
  // ONE PAGE (2026-10-06, Donovan: "the rankings and the boards should be the same thing"): the old Boards
  // page (goals, shots, points, assists; by game or all games; filters) and this one are merged here.
  // #tab=boards is an alias; #tab=shots still opens it on the shots market.
  fullboard: { label: 'Rankings', search: 'NHL goal, shots and points predictions, every skater', icon: '\u{1F4CA}', blurb: 'Who we rank tonight, and why: every skater, #1 to the bottom, with the reason and the numbers' },
  // ── batch 2 (2026-09-25): the league's people and clubs ──
  players:   { label: 'Players', search: 'NHL players',   icon: '\u{1F464}', blurb: 'Every player on every roster \u2014 search a name, open the file' },
  goalies:   { label: 'Goalies', search: 'NHL goalies',   icon: '\u{1F9E4}', blurb: 'Every goalie on every roster, their own hierarchy' },
  player:    { label: 'Player',    icon: '\u{1F4C4}', blurb: 'One player: the season line, career, last five, game log' },
  teams:     { label: 'Teams',     icon: '\u{1F3DF}', blurb: 'The 32 clubs by division, with their records' },
  team:      { label: 'Team',      icon: '\u{1F3DF}', blurb: 'One club: record, roster with season lines, schedule, leaders' },
  leaders:   { label: 'Leaders', search: 'NHL goal leaders',   icon: '\u{1F3C6}', blurb: 'Who leads the league \u2014 measured, no model score' },
  // ── lamp research step 2 (2026-09-26) ──
  numerology: { label: 'Numerology', search: 'NHL numerology, for fun', icon: '\u{1F52E}', blurb: 'For fun: jerseys and birthdays that line up with the date \u2014 not a prediction' },
  shotmap:   { label: 'Shot map', search: 'NHL shot map', icon: '\u{1F3AF}', blurb: 'Where a club or a skater shoots from \u2014 every attempt, on one attacking half' },
  // 2026-09-27 (matchups plan Part B): tonight's defences ranked, TUDDY's Matchups shape
  matchups:  { label: 'Matchups', search: 'NHL matchups tonight, defences ranked', icon: '\u{1F9ED}', blurb: 'Tonight\u2019s defences ranked by goals allowed \u2014 power play vs penalty kill, the net, rest, who fits' },
  specialteams: { label: 'Special teams', search: 'NHL power play and penalty kill', icon: '\u{1F945}', blurb: 'Every club\u2019s power play and penalty kill, tonight\u2019s matchups flagged' },
  // 2026-09-27: last 5 / last 10 games beside the season rate
  // POWER (2026-09-29): MOONSHOT's power page shape for shooters (components/lamp/tabs/Power.js).
  power: { label: 'Power', search: 'NHL shooters: volume, heating up, finishing', icon: '\u{1F680}', blurb: 'Who shoots most, who is heating up, who finishes \u2014 one lead, one board' },
  hotsticks: { label: 'Hot streaks', search: 'NHL hot players, last 5 and 10 games', icon: '\u{1F525}', blurb: 'Who is shooting more than usual \u2014 last 5 and 10 games against his season' },
  // 2026-09-27: tonight's games, each with its stories (components/StorylinesPage.js)
  storylines: { label: 'Storylines', search: 'NHL storylines tonight, by game', icon: '\u{1F4F0}', blurb: 'Tonight\u2019s games, each with what the numbers are already saying' },
  longshots: { label: 'Longshots', search: 'NHL anytime goal longshots with odds', icon: '\u{1F3AF}', blurb: 'Skaters the books price long, beside the goal model\u2019s score' },
  // 2026-10-02: MOONSHOT's Odds page for LAMP (components/tabs/OddsBoard.js, sport="nhl")
  odds: { label: 'Odds', search: 'NHL player prop odds and line moves', icon: '\u{1F4B5}', blurb: 'Prices and how they moved tonight' },
  // 2026-09-29 (parity item 6): your followed skaters + "Your nights, graded"
  watchlist: { label: 'Watchlist', search: 'NHL watchlist: your skaters, graded', icon: '\u2B50', blurb: 'Your followed skaters, and every night they played for you, graded' },
  // the drawer
  guide:     { label: 'How this works', icon: '❓', blurb: 'What LAMP is, what it shows, and what is coming' },
}

/** Keys LAMP renders — derived, never typed twice. */
export const NHL_TABS = Object.keys(NHL_NAV).filter((k) => !LEDGER_ALIAS_VIEW[k])

/** The other products' words for the same page. Only where it IS the same page. */
export const NHL_ALIASES = {
  // (2026-09-29) games -> schedule and shots -> shotmap are gone: both keys are
  // real tabs now (the Slate, the SHOTS 3+ board), so an alias could never fire.
  live: 'scores',        // TUDDY's word for the live page
  scoreboard: 'scores',  // MOONSHOT's word for the live page
  slate: 'games',         // the bar's Slate is `games` (was schedule, 2026-10-04 audit 02 #2)
  props: 'board',         // the bar's Props
  rankings: 'fullboard',  // the bar's Rankings
  boards: 'fullboard',    // the old Boards page, merged into Rankings (2026-10-06)
  standing: 'standings',
  table: 'standings',
  tonight: 'home',
  help: 'guide',
  bot: 'board',           // MOONSHOT's word for the picks page
  picks: 'board',         // TUDDY's
  research: 'fullboard',  // TUDDY's The Board
  ...LEDGER_ALIASES,      // calledledger, lampledger, results, record, bands ... -> The Ledger's sub-tabs
  portal: 'players',      // TUDDY's word for the directory
  playerboard: 'player',  // MOONSHOT's word for one man's file
  roster: 'team',
  leaderboard: 'leaders',
  clubs: 'teams',
  powerplay: 'specialteams',
  penaltykill: 'specialteams',
  special: 'specialteams',
  align: 'numerology',      // MOONSHOT's word for the same slot
  ...ODDS_ALIASES,          // True Price / Moves & gaps / Line shop -> the Odds page (2026-10-07)
  heatmap: 'shotmap',
  hot: 'hotsticks',
  explosive: 'power',     // TUDDY's power page, same slot
  shooters: 'power',
  form: 'hotsticks',
}

/** The More drawer, grouped the way MOONSHOT's and TUDDY's are. */
export const NHL_MORE_GROUPS = [
  // 2026-10-04: the shared More (lib/routes.js MLB_MORE_GROUPS).
  ['Tonight',  ['games', 'storylines']],
  ['Results',  ['ledger']],
  ['Research', ['power', 'hotsticks', 'specialteams', 'shotmap', 'numerology']],
  ['Games',    ['schedule', 'standings', 'matchups']],
  ['Players',  ['players', 'goalies', 'teams', 'leaders']],
  ['Betting',  ['longshots', 'odds']],
  ['You',      ['watchlist', 'guide']],
]

export const NHL_NAMES = Object.fromEntries(Object.entries(NHL_NAV).map(([k, v]) => [k, v.label]))
