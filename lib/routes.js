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
//
// ── A THIRD SPORT IS ONE IMPORT (2026-09-25, LAMP) ─────────────────────────
// The clone-parity audit named this file's two-way `sport === 'nfl' ? … : …`
// switches as the gate for any third sport. LAMP's table lives in
// lib/nhl/routes.js (NHL_TABS derived from NHL_NAV, so the two cannot drift)
// and plugs in below through TABLE / NAMES / BRAND. The ternaries became
// lookups with 'mlb' as the fallback they always had.
import { NHL_TABS, NHL_ALIASES, NHL_NAV, NHL_MORE_GROUPS, NHL_NAMES } from './nhl/routes'
import { NBA_TABS, NBA_ALIASES, NBA_NAV, NBA_MORE_GROUPS, NBA_NAMES } from './nba/routes'
export { NHL_TABS, NHL_ALIASES, NHL_NAV, NHL_MORE_GROUPS }
export { NBA_TABS, NBA_ALIASES, NBA_NAV, NBA_MORE_GROUPS }

// ── NAV ICONS ARE EMOJI, NOT GEOMETRIC GLYPHS (2026-09-06) ──────────────────
// Boards / Live / Slate / Tonight / Gap used text-shape code points (U+25A5
// U+25C9 U+25A4 U+25CE U+25C7). Next to a real emoji like 🃏 or 🎯 those render
// as thin monochrome marks -- on the nav bar and the mobile tab bar they read
// as nothing at all (Donovan: "the board and live and slate don't show").
// Every nav icon is now a colour emoji. Same rule on the TUDDY side.
/** Keys MOONSHOT renders. The first ten are the nav; the rest are the
 *  pre-consolidation aliases Dashboard still routes (see its ALIASES block). */
export const MLB_TABS = [
  'home', 'board', 'props', 'scoreboard', 'games', 'pitchers', 'bot', 'combos', 'odds', 'you', 'results',
  'boxes', 'atplate', 'power', 'steals', 'gap', 'triples', 'shape', 'patterns', 'longest', 'due', 'hitshrr',
  'align', 'ledger', 'calledledger', 'pairs', 'pools', 'builder', 'pairhist',
  'mypicks', 'watch', 'trueprice', 'leaders', 'player', 'derby', 'runs', 'spray', 'guide',
  // 2026-09-24 audit: in MLB_NAV and rendered by Dashboard since 09-21, never
  // registered here, so a reload or a shared link answered NO SUCH TAB.
  'pitchermap',
  // 2026-09-25: the full board, every rated hitter #1 to #N, on its own page.
  'fullboard',
  // 2026-09-27: long-priced hitters beside the model (components/Longshots.js).
  'longshots',
  // 2026-09-27: tonight's starters ranked by the lineup's pitch-mix fit (components/tabs/Matchups.js).
  'matchups',
  // 2026-09-27: tonight's games, each with its stories (components/StorylinesPage.js).
  'storylines',
  // 2026-10-02: what a 0-100 is worth, off the record page (BATCH-RECORD-PAGE: it isn't the record).
  'bands',
]

/** Keys TUDDY renders. */
export const NFL_TABS = [
  'home', 'games', 'picks', 'boards', 'players', 'watchlist',
  'research', 'matchups', 'accountability', 'pairs', 'guide',
  // 2026-09-27: the week in names and numbers (components/nfl/tabs/Ledger.js)
  'ledger',
  'storylines',
  // 2026-09-13: the product's whole stated purpose gets its own page. See
  // NFL_NAV below for why it takes the rail slot rather than joining it.
  'touchdowns',
  // 2026-09-05: the live page came back (every rung against its bar, on the
  // league feed) and Streaks is the NFL sibling of MOONSHOT's Runs.
  'live', 'streaks',
  // 2026-09-07: top player per category, asked for on 08-23 and unbuilt since.
  'leaders',
  // 2026-09-15: B10a, TUDDY's own side of the shared Called/Tuddy Ledger --
  // see components/nfl/tabs/TuddyLedger.js's header.
  'tuddyledger',
  // 2026-09-15: B10l, the NFL sibling of MLB's Power.js -- see
  // components/nfl/tabs/Explosive.js's header. Different component (the
  // underlying question is answered with football's own stats, not a
  // literal port), same clone-list slot.
  'explosive',
  // 2026-09-15: B10d, the NFL sibling of MLB's Alignments view (mounted
  // inside Combos there) -- see components/nfl/tabs/Numerology.js's header
  // for what ported and what didn't.
  'numerology',
  // 2026-09-24 audit: in NFL_NAV and the More sheet, rendered by NflDashboard,
  // never registered here -- and NflDashboard's setTab guards on this set, so
  // the drawer button was a silent no-op in production.
  'scores',
  // 2026-09-26: the slot LAMP's bar has (shell-parity step 3).
  'standings',
  // 2026-09-27: red-zone and goal-line usage, ranked (components/nfl/tabs/RedZone.js).
  'redzone',
  // 2026-09-27: long-priced players beside the TD model (components/Longshots.js).
  'longshots',
  // 2026-10-02: MOONSHOT's Odds page for TUDDY (components/tabs/OddsBoard.js, sport="nfl")
  'odds',
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
  live: 'scoreboard',      // TUDDY's word for the live page
  scores: 'scoreboard',    // TUDDY's and LAMP's word for the plain scores page (2026-09-25)
  schedule: 'games',       // LAMP's word for the slate of games; NHL_ALIASES maps games → schedule, so this is the same page both ways (2026-09-25)
  streaks: 'runs',         // TUDDY's word for the streak board
  tuddyledger: 'calledledger', // same shared Ledger component, NFL's data
  lampledger: 'calledledger',  // and LAMP's
  boxscores: 'boxes',           // same page shape, NFL's data
  explosive: 'power',           // same clone-list slot, separate component
  numerology: 'align',          // same clone-list slot, separate component
  // 2026-09-25: TUDDY's Research is labelled The Board and NFL_ALIASES already
  // sends `fullboard` there; LAMP's The Board is `fullboard` too. The other
  // direction was missing, so a TUDDY -> MOONSHOT switch on it found no page.
  research: 'fullboard',
  // 2026-10-04 (audit 02 #2): the bar's and drawer's own words, which 404'd
  // as typed or shared links.
  slate: 'games',
  rankings: 'fullboard',
  record: 'results',
}

export const NFL_ALIASES = {
  standing: 'standings',   // LAMP's aliases, same page (2026-09-26)
  table: 'standings',
  board: 'boards',
  results: 'accountability',
  // The Report card page was deleted (2026-09-30, Donovan: "the report card
  // page is redundant please delete"); its links land on the record.
  reportcard: 'accountability',
  report: 'accountability',
  bot: 'picks',
  watch: 'watchlist',
  player: 'players',
  mypicks: 'picks',
  scoreboard: 'live',      // MOONSHOT's word for the live page
  runs: 'streaks',         // MOONSHOT's word for the streak board
  // 2026-09-25: MOONSHOT's full board is #tab=fullboard; TUDDY's is Research.
  fullboard: 'research',
  schedule: 'games',       // LAMP's word for the slate (NHL_ALIASES: games → schedule)
  // 2026-09-07: the drawer calls these "The record" and "Player portal", so
  // those are the words people type and bookmark. Both 404'd.
  record: 'accountability',
  portal: 'players',
  leaderboard: 'leaders',
  calledledger: 'tuddyledger', // same shared Ledger component, MOONSHOT's word
  lampledger: 'tuddyledger',   // and LAMP's
  // Scores and Box Scores are one page since 2026-09-29 (queue batch 8);
  // the old key and MOONSHOT's word both land on it.
  boxscores: 'scores',
  boxes: 'scores',
  power: 'explosive',           // same clone-list slot, separate component
  align: 'numerology',          // same clone-list slot, separate component
  // 2026-10-04 (audit 02 #2): the bar's own words, which 404'd as links.
  props: 'picks',
  slate: 'games',
  rankings: 'research',
}

const TABLE = {
  mlb: { tabs: new Set(MLB_TABS), aliases: MLB_ALIASES },
  nfl: { tabs: new Set(NFL_TABS), aliases: NFL_ALIASES },
  nhl: { tabs: new Set(NHL_TABS), aliases: NHL_ALIASES },
  nba: { tabs: new Set(NBA_TABS), aliases: NBA_ALIASES },
}

/** The product each sport key belongs to, for titles and the in-app 404. */
export const BRAND = {
  mlb: { name: 'MOONSHOT', league: 'MLB', icon: '⚾' },
  nfl: { name: 'TUDDY', league: 'NFL', icon: '🏈' },
  nhl: { name: 'LAMP', league: 'NHL', icon: '🏒' },
  // HIDDEN (2026-10-02) until BUCKETS_PUBLIC=on (next.config.js copies it into
  // the build): routable, but on no public list -- the switcher shows it only
  // to a visitor /api/buckets/access lets in, and every /api/buckets route 404s
  // anyone else (lib/nba/gate.js). With the switch on it is a product like the rest.
  nba: { name: 'BUCKETS', league: 'NBA', icon: '🏀', hidden: String(process.env.NEXT_PUBLIC_BUCKETS_PUBLIC || '').toLowerCase() !== 'on' },
}
/** The sport a bare /start, /called or /app means. */
// THE LIVE TABS (2026-10-02, "live in game based on personal refresh"): the
// pages that carry the ↻ stamp (components/RefreshStamp.js) above their
// content. Nothing refreshes on a timer; these are where you'd want to ask.
// MOONSHOT's Games tab and its Live Wire carry their own ↻, so they're not here.
export const LIVE_TABS = {
  mlb: ['home', 'ledger', 'boxes'],
  nfl: ['home', 'games', 'live', 'ledger', 'tuddyledger'],
  nhl: ['home', 'scores', 'game', 'ledger', 'board'],
  nba: ['home', 'scores', 'game', 'board', 'games', 'ledger'],
}
export const isLiveTab = (sport, tab) => (LIVE_TABS[sportKey(sport)] || []).includes(String(tab || ''))

export const DEFAULT_SPORT = 'mlb'
/** The page for a sport that carries it in ?sport= -- the default sport is the bare path. */
export const sportPage = (path, sport) => (sport === DEFAULT_SPORT ? path : `${path}?sport=${sport}`)
/** 'mlb' | 'nfl' | 'nhl' — anything else is MOONSHOT, as it always was. */
export const sportKey = (sport) => (TABLE[String(sport)] ? String(sport) : 'mlb')

// ── THE ONE SPORT LIST (2026-09-25, Batch 1) ────────────────────────────────
// Read off TABLE, never typed out again. `sportKey` answers "which product
// renders this" and falls back to MOONSHOT; `isSport` answers "is this a
// sport at all" for the places where an unknown value must mean NO filter
// rather than baseball (push/log's ?sport=, the /called switch).
// scripts/check-routes.mjs fails the build check when a new hand-written
// `sport === 'nfl' ? … : …` appears outside this file.
// SPORT_KEYS is the PUBLIC list (sitemap, the front door, /start and /called
// links, every header's product pills): a hidden product (BRAND.x.hidden) is
// left out, so registering one can't publish it. ALL_SPORT_KEYS is every
// product the app can render; isSport answers for all of them.
export const ALL_SPORT_KEYS = Object.keys(TABLE)
export const SPORT_KEYS = ALL_SPORT_KEYS.filter((k) => !BRAND[k]?.hidden)
export const isHiddenSport = (sport) => Boolean(BRAND[String(sport)]?.hidden)
export const isSport = (sport) => Object.hasOwn(TABLE, String(sport))

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
  const { tabs, aliases } = TABLE[sportKey(sport)]
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

/**
 * The in-app address of a sport's page (funnel step 1, 2026-09-26): what
 * every public page's "Open tonight's board" points at, built here rather
 * than typed as `/app#sport=…` on each page. An unknown tab falls back the
 * way the app itself would (Home).
 */
export function appHref(sport, tab = 'home') {
  return `/app#sport=${sportKey(sport)}&tab=${resolveTab(sport, tab).tab}`
}

// A player's page in the app -- each product keeps its own address shape
// (MOONSHOT's player modal rides `p=`; TUDDY's file and LAMP's page are tabs).
const PLAYER_HREF = {
  mlb: (id) => `/app#sport=mlb&p=${id}`,
  nfl: (id) => `/app#sport=nfl&tab=players&player=${id}`,
  nhl: (id) => `/app#sport=nhl&tab=player&player=${id}`,
  nba: (id) => `/app#sport=nba&tab=player&player=${id}`,
}
export function playerHref(sport, id) {
  return PLAYER_HREF[sportKey(sport)](encodeURIComponent(String(id)))
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
  board:      { label: 'Boards',       icon: '\u{1F4CA}', blurb: 'Nine ranked boards \u2014 HR, hits, HRR, contact, weak spots' },
  scoreboard: { label: 'Live', search: 'MLB live scores',         icon: '\u{1F4E1}', blurb: 'Scores, the wire, and what is happening right now' },
  games:      { label: 'Slate', search: 'MLB games tonight',        icon: '\u{1F4CB}', blurb: "Every game, its lineups, and the bot's read on it" },
  bot:        { label: 'Picks',        icon: '\u{1F3AF}', blurb: 'What the bot says to back tonight' },
  // reached from the MOONSHOT wordmark, not a tab of its own
  home:       { label: 'Tonight', search: 'MLB home run picks tonight',      icon: '\u{1F319}', blurb: 'The night in one page' },
  // the drawer
  pitchers:   { label: 'Pitchers', search: 'MLB starting pitchers',     icon: '\u26BE', blurb: 'Starting arms and matchup pressure' },
  combos:     { label: 'Parlays',      icon: '\u{1F39F}', blurb: 'Pairs, alignments, pools and the builder' },
  odds:       { label: 'Odds',         icon: '\u{1F4B5}', blurb: 'Prices and how they moved today' },
  trueprice:  { label: 'True Price',   icon: '\u{1F3F7}', blurb: "What the model thinks the line should be" },
  you:        { label: 'Your stuff',   icon: '\u2B50', blurb: 'Your watchlist and the calls you made' },
  results:    { label: 'The record', search: 'MLB home run picks, graded',   icon: '\u{1F9FE}', blurb: 'Every graded night, wins and losses alike' },
  power:      { label: 'Power',        icon: '\u{1F4A5}', blurb: 'Park ladder, longest balls, season power' },
  steals:     { label: 'Steal board',  icon: '\u{1F3C3}', blurb: 'Stolen-base looks' },
  gap:        { label: 'Gap board',    icon: '\u{1F4CF}', blurb: 'Doubles and triples \u2014 measured, no score' },
  spray:      { label: 'Spray board',  icon: '\u{1F5FA}', blurb: 'Where the league is putting the ball' },
  // PITCHER MAP (2026-09-21). TUDDY's field map ("this heat chart is my
  // favorite thing ever" -- Donovan) mirrored the other direction: `spray`
  // above is per-HITTER, his own contact; this is per-PITCHER, where the
  // league does damage against him. Same field-is-the-chart rule, real
  // Statcast balls in play (lib/savant.js), self-relative -- see
  // components/PitcherHeatMap.js's own header for the honest scope.
  matchups:   { label: 'Matchups', search: 'MLB pitching matchups tonight', icon: '\u{1F9ED}', blurb: 'Tonight\u2019s starters ranked by how well the lineup fits their pitch mix' },
  pitchermap: { label: 'Pitcher map',  icon: '\u{1F3AF}', blurb: 'Where the league does its damage against him' },
  fullboard:  { label: 'Rankings', search: 'Home run predictions, every hitter',    icon: '\u{1F4CB}', blurb: 'Every hitter the model rated tonight, #1 to the bottom, every stat' },
  player:     { label: 'Player board', icon: '\u{1F464}', blurb: 'One hitter at a time, the full file' },
  leaders:    { label: 'Leaders', search: 'MLB leaders',      icon: '\u{1F3C6}', blurb: 'Season leaderboards' },
  bands:      { label: 'Score bands', search: 'What an MLB home run score is worth', icon: '\u{1F4CA}', blurb: 'What a 0-100 is actually worth, on the clean pregame record' },
  derby:      { label: 'Derby',        icon: '\u{1F3DF}', blurb: 'The home run derby board' },
  runs:       { label: 'Runs',         icon: '\u{1F3C3}', blurb: 'Runs and RBI looks' },
  ledger:     { label: 'Ledger', icon: '\u{1F9FE}', blurb: 'The night in names and numbers: round numbers, the watchlist, echoes, first scorers' },
  calledledger: { label: 'Called Ledger', icon: '\u{1F4D2}', blurb: 'Every called homer this season \u2014 called, on board, or not' },
  storylines: { label: 'Storylines', search: 'MLB storylines tonight, by game', icon: '\u{1F4F0}', blurb: 'Tonight\u2019s games, each with what the numbers are already saying' },
  longshots:  { label: 'Longshots', search: 'Home run longshots with odds', icon: '\u{1F3AF}', blurb: 'Hitters the books price long, beside the model\u2019s score' },
  guide:      { label: 'How this works', icon: '\u2753', blurb: 'What every page is for, in plain words' },
}

/**
 * The More drawer, grouped. Before this the drawer was six flat buttons and
 * SEVEN WHOLE PAGES had no way in at all -- Derby, Leaders, Runs, Spray board,
 * Player board, True Price and the Guide were reachable only by typing a URL.
 * Every page on MOONSHOT is now clickable from somewhere.
 */
export const MLB_MORE_GROUPS = [
  ['Boards',  ['fullboard', 'board', 'ledger', 'storylines', 'power', 'steals', 'gap', 'spray', 'pitchermap']],
  ['Players', ['player', 'pitchers', 'matchups', 'leaders']],
  // A11 (2026-09-13, Donovan): "surface it higher in nav." True Price
  // carries Model Score and Streak beside its own rate since 7217318;
  // it led nothing, sitting after Odds in its own group. Order only.
  ['Betting', ['trueprice', 'longshots', 'odds', 'combos']],
  ['Yours',   ['you', 'results', 'calledledger', 'bands']],
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
  triples: 'Gap board',
  patterns: 'Patterns', longest: 'Longest', due: 'Power-3',
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
/* ONE BAR, ONE SET OF WORDS, BOTH PRODUCTS (2026-09-18). Donovan, with both
 * headers side by side: "there should be zero difference, besides it being
 * moonshot and tuddy." Asked which five words; he picked MOONSHOT's own:
 * Props · Boards · Live · Slate · Picks, on both bars, with MOONSHOT's icons.
 * So TUDDY's `touchdowns` page is labelled Props and `games` is labelled Slate
 * -- the PAGES are unchanged and still football, only the word and glyph on
 * the rail match. Research and Storylines come off the bar into the drawer
 * (they have no MOONSHOT counterpart on the rail); Live goes ON both bars
 * every day, so the game-day swap in MobileTabBarNfl.js is gone. The 2026-09-12
 * "storylines is the brand bet, it rides the rail" call and the 2026-09-17
 * Boards promotion are both superseded by this one. */
/* MOONSHOT'S BAR, AGAIN (2026-09-28). Donovan: "scores is dumb to have as nav
 * clickable considering mlb doesn't have that ... everything based off that
 * nav". Replaces the 09-25/09-26 "TUDDY takes LAMP's shape" call: the bar is
 * Props (picks: the hub's CALLED view) · Boards (the hub's BOARD view) · Live ·
 * Slate (games, rebuilt as MOONSHOT's Slate); Scores and Standings go to More. */
// RANKINGS (2026-09-29, Donovan): "The Board" (every player, #1 to the
// bottom) sat beside "Boards" and TUDDY's "Board" hub on every sport. The
// every-player page is "Rankings" everywhere now; TUDDY's hub reads "Props",
// its bar's word. Labels only -- #tab=fullboard / research / touchdowns stay.
export const NFL_NAV = {
  // the six the rail shows now. `home` left it for the same reason MOONSHOT's
  // did: the TUDDY wordmark is the home button now.
  // TOUCHDOWNS leads the rail. `boards` sat in the drawer from 2026-09-13
  // (Donovan then: the product "has to help people and me find touchdowns
  // just like for home runs," so a seven-market shell didn't get to lead
  // next to it) until 2026-09-17, when round 8 gave Boards the same per-
  // market "why" reasoning MOONSHOT's own `board` has always carried, and
  // Donovan asked for the placement MOONSHOT gives it: on the bar, right
  // after the sport's lead tab. It still leads its own drawer group below,
  // same as MOONSHOT's `board` still leads MLB_MORE_GROUPS's own Boards
  // group -- being on the bar doesn't retire a page from the sheet.
  touchdowns:     { label: 'Boards', search: 'Anytime touchdown picks',          icon: '\u{1F4CA}', blurb: 'The calls and the ranked board, every market: Called or Board' },   // same page as boards (BoardHub); was a second 'Props' (10-03)
  boards:         { label: 'Boards',         icon: '\u{1F4CA}', blurb: 'Ranked boards across the seven markets' },
  games:          { label: 'Slate', search: 'NFL games this week',          icon: '\u{1F4CB}', blurb: 'Every game this week, and one game at a time: its read, both rosters, the defenses, the calls' },
  picks:          { label: 'Props',          icon: '\u{1F0CF}', blurb: 'The card: the calls in every market, each against its bar' },
  research:       { label: 'Rankings',       icon: '\u{1F4CB}', blurb: 'Every scored player, #1 to the bottom, every number' },
  // storylines (2026-09-12) -- the brand bet, not a cheatsheet, so it rides
  // the rail with the other four instead of the drawer with Matchups/Pairs/
  // Streaks. See components/nfl/tabs/Storylines.js's header for scope.
  storylines:     { label: 'Storylines',     icon: '\u{1F4F0}', blurb: 'The week, read as sentences instead of tables' },
  // reached from the wordmark
  home:           { label: 'This week', search: 'NFL touchdown picks this week',      icon: '\u{1F319}', blurb: 'The week in one page' },
  // the drawer
  players:        { label: 'Players', search: 'NFL players',  icon: '\u{1F464}', blurb: 'Every player, the full file' },
  watchlist:      { label: 'Watchlist',      icon: '\u2B50', blurb: 'Your starred players' },
  matchups:       { label: 'Matchups',       icon: '\u{1F6E1}', blurb: 'Defense vs position, and game scripts' },
  pairs:          { label: 'Pairs',          icon: '\u{1F39F}', blurb: 'Two-leg prop combinations' },
  live:           { label: 'Live',           icon: '\u{1F4E1}', blurb: 'Every rung on the card against its bar, while the game is on' },
  odds:           { label: 'Odds',           icon: '\u{1F4B5}', search: 'NFL player prop odds and line moves', blurb: 'Prices and how they moved this week' },
  longshots:      { label: 'Longshots',      icon: '\u{1F3AF}', search: 'NFL anytime TD longshots with odds', blurb: 'Players the books price long, beside the TD model\u2019s score' },
  redzone:        { label: 'Red zone',       icon: '\u{1F3AF}', search: 'NFL red zone touches', blurb: 'Who gets the ball near the end zone: red-zone and goal-line touches' },
  explosive:      { label: 'Explosive',      icon: '\u{1F4A5}', blurb: 'Who turns a target into a chunk play -- and who allows it' },
  numerology:     { label: 'Numerology',     icon: '\u{1F52E}', blurb: 'Jersey, birthday, life path -- pattern watching, not evidence' },
  streaks:        { label: 'Streaks',        icon: '\u{1F525}', blurb: 'Who is hot, or cold, at a line you pick' },
  accountability: { label: 'The record', search: 'NFL touchdown picks, graded',     icon: '\u{1F9FE}', blurb: 'Every graded call, wins and losses alike' },
  ledger:         { label: 'Week in numbers', icon: '\u{1F9FE}', blurb: 'The week in names and numbers: the calls, round numbers, echoes, first TDs' },
  tuddyledger:    { label: 'TD Ledger',       icon: '\u{1F4D2}', blurb: 'Every called touchdown this season \u2014 called, on board, or not' },
  leaders:        { label: 'Leaders', search: 'NFL touchdown leaders',        icon: '\u{1F3C6}', blurb: 'Who is first in each category, measured — no model score' },
  guide:          { label: 'How this works', icon: '\u2753', blurb: 'What every page is for, in plain words' },
  // SCORES (2026-09-21). Donovan's page-by-page pass: Slate does the deep
  // per-game read, Live does live rung-tracking, and neither one is "just
  // tell me the score." No MOONSHOT counterpart yet -- MLB's own Live tab
  // already opens on a plain scoreboard, so the gap this closes is
  // football-only. Drawer, not the rail: the four-slot rail is deliberately
  // identical to MOONSHOT's own (see the NFL_NAV header above), and this is
  // the first NFL-only concept since that parity call -- promote it to both
  // rails together if it earns the spot, not one now and MLB later.
  // STANDINGS (2026-09-26, shell-parity step 3): components/nfl/tabs/
  // Standings.js, from the public standings feed, no logos or other site's
  // labels (Donovan).
  standings:      { label: 'Standings', search: 'NFL standings', icon: '\u{1F4CA}', blurb: 'Every division: record, points, home and road, streak' },
  scores:         { label: 'Scores',         icon: '\u{1F4FA}', blurb: 'Every game this week, kickoff or score -- tap a game for its box' },
}

/** TUDDY's More drawer, grouped the way MOONSHOT's is. */
// LAMP'S SHAPE (2026-09-26, shell-parity step 3; Donovan 09-25: LAMP's bar
// stays, TUDDY takes its shape -- replacing the 09-18 "same five words as
// MOONSHOT" rule). Grouped the way NHL_MORE_GROUPS is: Board / Games /
// League, plus Yours and Help.
export const NFL_MORE_GROUPS = [
  // boards / picks are views of touchdowns since 09-26 (option (b)); they stay routable, not listed twice.
  // The bar is MOONSHOT's (2026-09-28): Props · Boards · Live · Slate, so those four
  // leave the drawer, as MOONSHOT's own do; touchdowns stays routable (the same hub).
  // FOUR GROUPS, 21 PAGES (2026-09-29, queue batch 3). "This week" (home) leads
  // Picks instead of sitting in a group of its own; Yours and Help share one.
  // Renamed by label only -- the keys stay, so every old #tab= link works:
  // ledger "Ledger" -> "The Week" -> "Week in numbers" (09-29, Donovan: it read like
  // "This week" beside it), tuddyledger "Tuddy Ledger" -> "TD Ledger".
  ['Picks',        ['home', 'ledger', 'research', 'longshots', 'odds', 'storylines', 'accountability', 'tuddyledger']],
  ['Games',        ['scores', 'standings', 'matchups']],
  ['League',       ['players', 'leaders', 'redzone', 'explosive', 'streaks', 'pairs', 'numerology']],
  ['Yours + Help', ['watchlist', 'guide']],
]

const NFL_NAMES = {
  ...Object.fromEntries(Object.entries(NFL_NAV).map(([k, v]) => [k, v.label])),
}

const NAMES = { mlb: MLB_NAMES, nfl: NFL_NAMES, nhl: NHL_NAMES, nba: NBA_NAMES }

export function tabName(sport, tab) {
  const names = NAMES[sportKey(sport)]
  return names[String(tab || '')] || 'Board'
}

// SEARCH WORDS FIRST (§36, Batch 6, 2026-09-26). A page's title leads with
// what people type -- "NHL goal leaders", "home run predictions" -- and names
// the product second. The words live on each *_NAV entry (`search`) beside
// the label, so a renamed page can't leave a stale title; a page with no
// `search` reads "<League> <label>". Also the dashboards' screen-reader <h1>.
const NAVS = { mlb: MLB_NAV, nfl: NFL_NAV, nhl: NHL_NAV, nba: NBA_NAV }

export function pageTitle(sport, tab) {
  const k = sportKey(sport)
  const b = BRAND[k]
  const words = NAVS[k][String(tab || '')]?.search || `${b.league} ${tabName(k, tab)}`
  return `${words} · ${b.name}`
}
