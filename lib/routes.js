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
]

/** Keys TUDDY renders. */
export const NFL_TABS = [
  'home', 'games', 'picks', 'boards', 'players', 'watchlist',
  'research', 'matchups', 'report', 'accountability', 'pairs', 'guide',
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
  // 2026-09-15: B10m, the NFL sibling of MLB's Boxes.js -- see
  // components/nfl/tabs/BoxScores.js's header.
  'boxscores',
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
  streaks: 'runs',         // TUDDY's word for the streak board
  tuddyledger: 'calledledger', // same shared Ledger component, NFL's data
  boxscores: 'boxes',           // same page shape, NFL's data
  explosive: 'power',           // same clone-list slot, separate component
  numerology: 'align',          // same clone-list slot, separate component
}

export const NFL_ALIASES = {
  board: 'boards',
  results: 'accountability',
  reportcard: 'report',
  bot: 'picks',
  watch: 'watchlist',
  player: 'players',
  mypicks: 'picks',
  scoreboard: 'live',      // MOONSHOT's word for the live page
  runs: 'streaks',         // MOONSHOT's word for the streak board
  // 2026-09-07: the drawer calls these "The record" and "Player portal", so
  // those are the words people type and bookmark. Both 404'd.
  record: 'accountability',
  portal: 'players',
  leaderboard: 'leaders',
  calledledger: 'tuddyledger', // same shared Ledger component, MOONSHOT's word
  boxes: 'boxscores',           // same page shape, MOONSHOT's word
  power: 'explosive',           // same clone-list slot, separate component
  align: 'numerology',          // same clone-list slot, separate component
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
  board:      { label: 'Boards',       icon: '\u{1F4CA}', blurb: 'Nine ranked boards \u2014 HR, hits, HRR, contact, weak spots' },
  scoreboard: { label: 'Live',         icon: '\u{1F4E1}', blurb: 'Scores, the wire, and what is happening right now' },
  games:      { label: 'Slate',        icon: '\u{1F4CB}', blurb: "Every game, its lineups, and the bot's read on it" },
  bot:        { label: 'Picks',        icon: '\u{1F3AF}', blurb: 'What the bot says to back tonight' },
  // reached from the MOONSHOT wordmark, not a tab of its own
  home:       { label: 'Tonight',      icon: '\u{1F319}', blurb: 'The night in one page' },
  // the drawer
  pitchers:   { label: 'Pitchers',     icon: '\u26BE', blurb: 'Starting arms and matchup pressure' },
  combos:     { label: 'Parlays',      icon: '\u{1F39F}', blurb: 'Pairs, alignments, pools and the builder' },
  odds:       { label: 'Odds',         icon: '\u{1F4B5}', blurb: 'Prices and how they moved today' },
  trueprice:  { label: 'True Price',   icon: '\u{1F3F7}', blurb: "What the model thinks the line should be" },
  you:        { label: 'Your stuff',   icon: '\u2B50', blurb: 'Your watchlist and the calls you made' },
  results:    { label: 'The record',   icon: '\u{1F9FE}', blurb: 'Every graded night, wins and losses alike' },
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
  pitchermap: { label: 'Pitcher map',  icon: '\u{1F3AF}', blurb: 'Where the league does its damage against him' },
  fullboard:  { label: 'The Board',    icon: '\u{1F4CB}', blurb: 'Every hitter the model rated tonight, #1 to the bottom, every stat' },
  player:     { label: 'Player board', icon: '\u{1F464}', blurb: 'One hitter at a time, the full file' },
  leaders:    { label: 'Leaders',      icon: '\u{1F3C6}', blurb: 'Season leaderboards' },
  derby:      { label: 'Derby',        icon: '\u{1F3DF}', blurb: 'The home run derby board' },
  runs:       { label: 'Runs',         icon: '\u{1F3C3}', blurb: 'Runs and RBI looks' },
  ledger:     { label: 'Homer ledger', icon: '\u{1F9FE}', blurb: 'Who is due, who is hot, night by night' },
  calledledger: { label: 'Called Ledger', icon: '\u{1F4D2}', blurb: 'Every called homer this season \u2014 called, on board, or not' },
  guide:      { label: 'How this works', icon: '\u2753', blurb: 'What every page is for, in plain words' },
}

/**
 * The More drawer, grouped. Before this the drawer was six flat buttons and
 * SEVEN WHOLE PAGES had no way in at all -- Derby, Leaders, Runs, Spray board,
 * Player board, True Price and the Guide were reachable only by typing a URL.
 * Every page on MOONSHOT is now clickable from somewhere.
 */
export const MLB_MORE_GROUPS = [
  ['Boards',  ['fullboard', 'board', 'power', 'steals', 'gap', 'spray', 'pitchermap']],
  ['Players', ['player', 'pitchers', 'leaders']],
  // A11 (2026-09-13, Donovan): "surface it higher in nav." True Price
  // carries Model Score and Streak beside its own rate since 7217318;
  // it led nothing, sitting after Odds in its own group. Order only.
  ['Betting', ['trueprice', 'odds', 'combos']],
  ['Yours',   ['you', 'results', 'ledger', 'calledledger']],
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
  touchdowns:     { label: 'Props',          icon: '\u{1F0CF}', blurb: 'Who scores this week, and why' },
  boards:         { label: 'Boards',         icon: '\u{1F4CA}', blurb: 'Ranked boards across the seven markets' },
  games:          { label: 'Slate',          icon: '\u{1F4CB}', blurb: "Every game, its script, and the model's read on it" },
  picks:          { label: 'Picks',          icon: '\u{1F3AF}', blurb: 'What the model says to back this week' },
  research:       { label: 'Research',       icon: '\u{1F50E}', blurb: 'Scoring breakdowns and the highlights behind them' },
  // storylines (2026-09-12) -- the brand bet, not a cheatsheet, so it rides
  // the rail with the other four instead of the drawer with Matchups/Pairs/
  // Streaks. See components/nfl/tabs/Storylines.js's header for scope.
  storylines:     { label: 'Storylines',     icon: '\u{1F4F0}', blurb: 'The week, read as sentences instead of tables' },
  // reached from the wordmark
  home:           { label: 'This week',      icon: '\u{1F319}', blurb: 'The week in one page' },
  // the drawer
  players:        { label: 'Player portal',  icon: '\u{1F464}', blurb: 'Every player, the full file' },
  watchlist:      { label: 'Watchlist',      icon: '\u2B50', blurb: 'Your starred players' },
  matchups:       { label: 'Matchups',       icon: '\u{1F6E1}', blurb: 'Defense vs position, and game scripts' },
  pairs:          { label: 'Pairs',          icon: '\u{1F39F}', blurb: 'Two-leg prop combinations' },
  live:           { label: 'Live',           icon: '\u{1F4E1}', blurb: 'Every rung on the card against its bar, while the game is on' },
  boxscores:      { label: 'Box Scores',      icon: '\u{1F3DF}', blurb: "This week's games, passing/rushing/receiving/kicking" },
  explosive:      { label: 'Explosive',      icon: '\u{1F4A5}', blurb: 'Who turns a target into a chunk play -- and who allows it' },
  numerology:     { label: 'Numerology',     icon: '\u{1F52E}', blurb: 'Jersey, birthday, life path -- pattern watching, not evidence' },
  streaks:        { label: 'Streaks',        icon: '\u{1F525}', blurb: 'Who is hot, or cold, at a line you pick' },
  accountability: { label: 'The record',     icon: '\u{1F9FE}', blurb: 'Every graded call, wins and losses alike' },
  tuddyledger:    { label: 'Tuddy Ledger',    icon: '\u{1F4D2}', blurb: 'Every called touchdown this season \u2014 called, on board, or not' },
  report:         { label: 'Report card',    icon: '\u{1F4CB}', blurb: "The model's own grades, week over week" },
  leaders:        { label: 'Leaders',        icon: '\u{1F3C6}', blurb: 'Who is first in each category, measured — no model score' },
  guide:          { label: 'How this works', icon: '\u2753', blurb: 'What every page is for, in plain words' },
  // SCORES (2026-09-21). Donovan's page-by-page pass: Slate does the deep
  // per-game read, Live does live rung-tracking, and neither one is "just
  // tell me the score." No MOONSHOT counterpart yet -- MLB's own Live tab
  // already opens on a plain scoreboard, so the gap this closes is
  // football-only. Drawer, not the rail: the four-slot rail is deliberately
  // identical to MOONSHOT's own (see the NFL_NAV header above), and this is
  // the first NFL-only concept since that parity call -- promote it to both
  // rails together if it earns the spot, not one now and MLB later.
  scores:         { label: 'Scores',         icon: '\u{1F4FA}', blurb: 'Every game this week, kickoff or score, nothing ranked' },
}

/** TUDDY's More drawer, grouped the way MOONSHOT's is. */
export const NFL_MORE_GROUPS = [
  ['Sunday',   ['boxscores', 'scores']],
  ['Research', ['research', 'storylines', 'boards', 'matchups', 'explosive', 'pairs', 'numerology', 'streaks', 'leaders']],
  ['Players',  ['players']],
  ['Yours',    ['accountability', 'report', 'tuddyledger', 'watchlist']],
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
