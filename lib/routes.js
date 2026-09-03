// ONE ROUTE TABLE FOR BOTH PRODUCTS.
//
// Findings 2, 3, 15 and 16 were logged as four bugs and are one: MOONSHOT and
// TUDDY grew separate routing conventions and neither knew the other's words.
//
//   #sport=mlb&tab=picks   → blank page   (MOONSHOT's Picks is `bot`)
//   #sport=nfl&tab=board   → silent Home  (TUDDY's is `boards`, plural)
//   #sport=nfl&tab=results → silent Home  (TUDDY's is `accountability`)
//   #sport=nfl&tab=reportcard → nothing at all
//
// Two failure shapes, both bad in the same way: a URL that says one thing
// while the screen shows another. A blank page looks broken; a silent rewrite
// to Home is worse, because someone who shared "here are the receipts" has no
// idea their link landed people somewhere else.
//
// So: every key each product actually renders, plus the OTHER product's word
// for the same page as an alias, plus one honest answer -- 'missing' -- for a
// tab nobody has. The app already knows how to say "that page isn't on the
// board" (app/not-found.js); an unknown tab now gets that instead of a blank
// div or a lie.
//
// Aliases are only added where the two products genuinely mean the same page.
// TUDDY's Matchups (a defensive field map) is not MOONSHOT's Slate, and
// TUDDY's Research is not MOONSHOT's Charts, so neither is aliased -- those
// route to 'missing', which is the truthful answer.

/** Keys MOONSHOT renders. The first ten are the nav; the rest are the
 *  pre-consolidation aliases Dashboard still routes (see its ALIASES block). */
export const MLB_TABS = [
  'home', 'board', 'props', 'scoreboard', 'games', 'pitchers', 'bot', 'combos', 'odds', 'you', 'results',
  'boxes', 'atplate', 'power', 'steals', 'shape', 'patterns', 'longest', 'due', 'hitshrr',
  'align', 'ledger', 'pairs', 'pools', 'builder', 'pairhist',
  'mypicks', 'watch', 'trueprice', 'leaders', 'player', 'derby', 'runs', 'spray', 'guide',
]

/** Keys TUDDY renders. */
export const NFL_TABS = [
  'home', 'games', 'picks', 'boards', 'players', 'watchlist',
  'research', 'matchups', 'report', 'accountability', 'pairs', 'guide',
]

/** The other product's word for the same page. */
export const MLB_ALIASES = {
  picks: 'bot',            // TUDDY calls the bot's sheet Picks
  boards: 'board',         // TUDDY pluralises it
  accountability: 'results',
  watchlist: 'watch',
  players: 'player',
  reportcard: 'results',   // typed by people who know TUDDY's Report Card
  report: 'results',
}

export const NFL_ALIASES = {
  board: 'boards',
  results: 'accountability',
  reportcard: 'report',
  bot: 'picks',
  watch: 'watchlist',
  player: 'players',
  mypicks: 'picks',
}

const TABLE = {
  mlb: { tabs: new Set(MLB_TABS), aliases: MLB_ALIASES },
  nfl: { tabs: new Set(NFL_TABS), aliases: NFL_ALIASES },
}

/**
 * Resolve a raw `tab` value off the hash.
 *
 * @returns {{ tab: string, status: 'default'|'ok'|'alias'|'missing', asked: string }}
 *   default — no tab in the URL; Home, and nothing to correct.
 *   ok      — a real key for this product.
 *   alias   — a real page under the other product's name. `tab` is the
 *             canonical key; callers write it back so the URL agrees.
 *   missing — no such page. `tab` is the fallback so something still renders
 *             under the not-found panel, and `asked` is what was typed.
 */
export function resolveTab(sport, raw) {
  const key = String(sport) === 'nfl' ? 'nfl' : 'mlb'
  const { tabs, aliases } = TABLE[key]
  const asked = String(raw || '').trim().toLowerCase()
  if (!asked) return { tab: 'home', status: 'default', asked: '' }
  if (tabs.has(asked)) return { tab: asked, status: 'ok', asked }
  const aliased = aliases[asked]
  if (aliased && tabs.has(aliased)) return { tab: aliased, status: 'alias', asked }
  return { tab: 'home', status: 'missing', asked }
}

/** True when this product renders that key at all. */
export function knowsTab(sport, raw) {
  return resolveTab(sport, raw).status !== 'missing'
}

// ── ONE NAME PER PAGE, DEFINED ONCE (2026-09-03) ────────────────────────────
//
// Counted off the code the same day: 11 names in the nav, 35 routable keys, 16
// real pages, ~90 screens. The count was survivable. The NAMING was not.
//
// Three files each kept their own private label list and they had drifted:
//
//   `board`  was "Boards" in Header.js, "Boards" in MobileTabBar.js, and
//            "Charts" here -- so the page title and the tab you clicked to
//            reach it said different words.
//   `home`   was "Home" on the desktop rail and "Tonight" on the phone bar.
//            Same page, and which name you knew depended on your device.
//   `hitshrr` and `board` were BOTH called "Charts" here, which is correct
//            (they mount the same component) and unhelpful, because the nav
//            called that component something else entirely.
//
// So the table below is the only place a MOONSHOT page gets named, and
// Header.js and MobileTabBar.js read it instead of carrying their own. A
// future rename lands in one place or it does not happen. `blurb` is the one
// line the phone's More sheet prints under each name -- kept here beside the
// name for the same reason.
//
// PLAINER WORDS, Donovan's call: Rundown -> Live, Combos -> Parlays, You ->
// Your stuff, Results -> The record, Guide -> How this works. "Slate" stays,
// because the whole product says "tonight's slate" in its own copy and a tab
// that disagreed with the prose would be a new collision, not a fixed one.
export const MLB_NAV = {
  // the five the nav actually shows
  props:      { label: 'Props',        icon: '\u{1F0CF}', blurb: 'Player lines and quick cards' },
  board:      { label: 'Boards',       icon: '\u25A5', blurb: 'Nine ranked boards \u2014 HR, hits, HRR, contact, weak spots' },
  scoreboard: { label: 'Live',         icon: '\u25C9', blurb: 'Scores, the wire, and what is happening right now' },
  games:      { label: 'Slate',        icon: '\u25A4', blurb: "Every game, its lineups, and the bot's read on it" },
  bot:        { label: 'Picks',        icon: '\u{1F3AF}', blurb: 'What the bot says to back tonight' },
  // reached from the MOONSHOT wordmark, not a tab of its own
  home:       { label: 'Tonight',      icon: '\u25CE', blurb: 'The night in one page' },
  // the drawer
  pitchers:   { label: 'Pitchers',     icon: '\u26BE', blurb: 'Starting arms and matchup pressure' },
  combos:     { label: 'Parlays',      icon: '\u{1F39F}', blurb: 'Pairs, alignments, pools and the builder' },
  odds:       { label: 'Odds',         icon: '\u{1F4B5}', blurb: 'Prices and how they moved today' },
  trueprice:  { label: 'True Price',   icon: '\u{1F3F7}', blurb: "What the model thinks the line should be" },
  you:        { label: 'Your stuff',   icon: '\u2B50', blurb: 'Your watchlist and the calls you made' },
  results:    { label: 'The record',   icon: '\u{1F9FE}', blurb: 'Every graded night, wins and losses alike' },
  power:      { label: 'Power',        icon: '\u{1F4A5}', blurb: 'Park ladder, longest balls, who is due' },
  steals:     { label: 'Steal board',  icon: '\u{1F3C3}', blurb: 'Stolen-base looks' },
  spray:      { label: 'Spray board',  icon: '\u{1F5FA}', blurb: 'Where the league is putting the ball' },
  player:     { label: 'Player board', icon: '\u{1F464}', blurb: 'One hitter at a time, the full file' },
  leaders:    { label: 'Leaders',      icon: '\u{1F3C6}', blurb: 'Season leaderboards' },
  derby:      { label: 'Derby',        icon: '\u{1F3DF}', blurb: 'The home run derby board' },
  runs:       { label: 'Runs',         icon: '\u{1F3C3}', blurb: 'Runs and RBI looks' },
  ledger:     { label: 'Homer ledger', icon: '\u{1F9FE}', blurb: 'Who is due, who is hot, night by night' },
  guide:      { label: 'How this works', icon: '\u2753', blurb: 'What every page is for, in plain words' },
}

/**
 * The More drawer, grouped. Before this the drawer was six flat buttons and
 * SEVEN WHOLE PAGES had no way in at all -- Derby, Leaders, Runs, Spray board,
 * Player board, True Price and the Guide were reachable only by typing a URL.
 * Every page on MOONSHOT is now clickable from somewhere.
 */
export const MLB_MORE_GROUPS = [
  ['Boards',  ['board', 'power', 'steals', 'spray']],
  ['Players', ['player', 'pitchers', 'leaders']],
  ['Betting', ['odds', 'trueprice', 'combos']],
  ['Yours',   ['you', 'results', 'ledger']],
  ['For fun', ['derby', 'runs']],
  ['Help',    ['guide']],
]

/** Human name for a tab key, per product -- used for the page's <h1> and for
 *  the document outline generally. Kept beside the key table so a renamed tab
 *  cannot leave a screen reader announcing the old word.
 *
 *  Derived from MLB_NAV above wherever a key is in it, so the two can never
 *  disagree again; the rest are sub-views that never appear in a nav and are
 *  spelled out here. */
const MLB_NAMES = {
  ...Object.fromEntries(Object.entries(MLB_NAV).map(([k, v]) => [k, v.label])),
  boxes: 'Box scores', atplate: 'At the plate', shape: 'Homer shape',
  patterns: 'Patterns', longest: 'Longest', due: 'Due board',
  // hitshrr mounts the same component as `board`, so it gets the same word.
  hitshrr: 'Boards', align: 'Alignments',
  pairs: 'Pairs', pools: 'Pools', builder: 'Pair builder', pairhist: 'Pair history',
  mypicks: 'My picks', watch: 'Watchlist',
}
// ── THE SAME TREATMENT, BEFORE FOOTBALL RESTARTS THE DRIFT (2026-09-03) ─────
//
// TUDDY had MOONSHOT's disease at three quarters the scale: NflHeader.js and
// MobileTabBarNfl.js each carried their own label list, and this file a third.
// `home` was "Home" on the desktop rail, "Tonight" on the phone bar, and "This
// week" here -- three names for one page, and the phone's was borrowed from a
// baseball product where a night is the unit. Football's is a week.
//
// Fixing MOONSHOT alone would have left the drift alive on the half of the
// site that is about to get busy, which is the specific thing Donovan said he
// did not want. Same shape as MLB_NAV: one table, three readers.
//
// TUDDY has no orphan pages -- all twelve keys are already named somewhere in
// its nav -- so the drawer work here is grouping, not rescue.
export const NFL_NAV = {
  // the four the rail shows. `home` left it for the same reason MOONSHOT's
  // did: the TUDDY wordmark is the home button now.
  boards:         { label: 'Boards',         icon: '\u25A5', blurb: 'Ranked boards across the seven markets' },
  games:          { label: 'Games',          icon: '\u25C9', blurb: "Every game, its script, and the model's read on it" },
  picks:          { label: 'Picks',          icon: '\u2726', blurb: 'What the model says to back this week' },
  research:       { label: 'Research',       icon: '\u{1F50E}', blurb: 'Scoring breakdowns and the highlights behind them' },
  // reached from the wordmark
  home:           { label: 'This week',      icon: '\u25CE', blurb: 'The week in one page' },
  // the drawer
  players:        { label: 'Player portal',  icon: '\u{1F464}', blurb: 'Every player, the full file' },
  watchlist:      { label: 'Watchlist',      icon: '\u2B50', blurb: 'Your starred players' },
  matchups:       { label: 'Matchups',       icon: '\u{1F6E1}', blurb: 'Defense vs position, and game scripts' },
  pairs:          { label: 'Pairs',          icon: '\u{1F39F}', blurb: 'Two-leg prop combinations' },
  accountability: { label: 'The record',     icon: '\u{1F9FE}', blurb: 'Every graded call, wins and losses alike' },
  report:         { label: 'Report card',    icon: '\u{1F4CB}', blurb: "The model's own grades, week over week" },
  guide:          { label: 'How this works', icon: '\u2753', blurb: 'What every page is for, in plain words' },
}

/** TUDDY's More drawer, grouped the way MOONSHOT's is. */
export const NFL_MORE_GROUPS = [
  ['Research', ['matchups', 'pairs']],
  ['Players',  ['players', 'watchlist']],
  ['Yours',    ['accountability', 'report']],
  ['Help',     ['guide']],
]

const NFL_NAMES = {
  ...Object.fromEntries(Object.entries(NFL_NAV).map(([k, v]) => [k, v.label])),
}

export function tabName(sport, tab) {
  const names = String(sport) === 'nfl' ? NFL_NAMES : MLB_NAMES
  return names[String(tab || '')] || 'Board'
}

export function pageTitle(sport, tab) {
  return `${String(sport) === 'nfl' ? 'TUDDY · NFL' : 'MOONSHOT · MLB'} — ${tabName(sport, tab)}`
}
