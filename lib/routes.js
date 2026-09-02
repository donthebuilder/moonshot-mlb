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

/** Human name for a tab key, per product -- used for the page's <h1> and for
 *  the document outline generally. Kept beside the key table so a renamed tab
 *  cannot leave a screen reader announcing the old word. */
const MLB_NAMES = {
  home: 'Tonight', board: 'Charts', props: 'Props', scoreboard: 'Rundown', games: 'Slate',
  pitchers: 'Pitchers', bot: 'Picks', combos: 'Combos', odds: 'Odds', you: 'You',
  results: 'Results', boxes: 'Box scores', atplate: 'At the plate', power: 'Power',
  steals: 'Steal board', shape: 'Homer shape', patterns: 'Patterns', longest: 'Longest',
  due: 'Due board', hitshrr: 'Charts', align: 'Alignments', ledger: 'Homer ledger',
  pairs: 'Pairs', pools: 'Pools', builder: 'Pair builder', pairhist: 'Pair history',
  mypicks: 'My picks', watch: 'Watchlist', trueprice: 'True Price', leaders: 'Leaders',
  player: 'Player board', derby: 'Derby', runs: 'Runs', spray: 'Spray board', guide: 'Guide',
}
const NFL_NAMES = {
  home: 'This week', games: 'Games', picks: 'Picks', boards: 'Boards', players: 'Player portal',
  watchlist: 'Watchlist', research: 'Research', matchups: 'Matchups', report: 'Report card',
  accountability: 'Results', pairs: 'Pairs', guide: 'Guide',
}

export function tabName(sport, tab) {
  const names = String(sport) === 'nfl' ? NFL_NAMES : MLB_NAMES
  return names[String(tab || '')] || 'Board'
}

export function pageTitle(sport, tab) {
  return `${String(sport) === 'nfl' ? 'TUDDY · NFL' : 'MOONSHOT · MLB'} — ${tabName(sport, tab)}`
}
