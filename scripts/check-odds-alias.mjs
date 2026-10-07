// THE ODDS + NUMEROLOGY ALIAS MAP (2026-10-07), held to the cases it names -- TEST data, no network.
//   True Price and Moves & gaps are deleted and the Line shop is a view of Odds: every old key must land on
//   #tab=odds (status alias, never 'missing') on every sport; Numerology + Alignments are one page, every old
//   key lands on #tab=numerology; the registry no longer lists the dead keys; the line-move and book-spread
//   helpers (lib/odds/lineMove.js, lib/odds/shop.js) answer their own cases and never invent a move.
//   node scripts/check-odds-alias.mjs
import './_esm-resolve.mjs'
const R = await import('../lib/routes.js')
const M = await import('../lib/odds/lineMove.js')
const S = await import('../lib/odds/shop.js')
const AL = await import('../lib/odds/aliases.js')

let bad = 0
const fail = (m) => { console.log(`FAIL ${m}`); bad += 1 }
const SPORTS = ['mlb', 'nfl', 'nhl', 'nba']

// 1. every old odds key opens Odds, on every sport; the canonical key is the plain key
for (const s of SPORTS) {
  for (const k of AL.ODDS_OLD_KEYS) {
    const r = R.resolveTab(s, k)
    if (r.tab !== 'odds' || r.status !== 'alias') fail(`${s} #tab=${k} -> ${r.tab} (${r.status}), wanted odds (alias)`)
  }
  const ok = R.resolveTab(s, 'odds')
  if (ok.tab !== 'odds' || ok.status !== 'ok') fail(`${s} #tab=odds -> ${ok.tab} (${ok.status})`)
}
// 2. the dead keys are not pages any more
const NAVS = { mlb: R.MLB_NAV, nfl: R.NFL_NAV, nhl: R.NHL_NAV, nba: R.NBA_NAV }
const MORE = { mlb: R.MLB_MORE_GROUPS, nfl: R.NFL_MORE_GROUPS, nhl: R.NHL_MORE_GROUPS, nba: R.NBA_MORE_GROUPS }
const TABS = { mlb: R.MLB_TABS, nfl: R.NFL_TABS, nhl: R.NHL_TABS, nba: R.NBA_TABS }
for (const s of SPORTS) {
  const listed = MORE[s].flatMap((g) => g[1])
  for (const dead of ['trueprice', 'signals', 'moves']) {
    if (NAVS[s][dead]) fail(`${s} nav still names ${dead}`)
    if (listed.includes(dead)) fail(`${s} More still lists ${dead}`)
    if ((TABS[s] instanceof Set ? [...TABS[s]] : TABS[s]).includes(dead)) fail(`${s} tabs still register ${dead}`)
  }
  if (listed.filter((k) => k === 'odds').length !== 1) fail(`${s} More lists odds ${listed.filter((k) => k === 'odds').length}x`)
}
// 3. Numerology + Alignments: one page. MLB's canonical key is numerology; `align` and the words people type open it
const NUM = {
  mlb: ['align', 'alignments', 'alignment', 'numbers'],
  nfl: ['align', 'alignments', 'alignment', 'numbers', 'weeknumbers', 'weekendnumbers'],
  nhl: ['align'], nba: ['align', 'alignments'],
}
for (const s of SPORTS) {
  const ok = R.resolveTab(s, 'numerology')
  if (ok.tab !== 'numerology' || ok.status !== 'ok') fail(`${s} #tab=numerology -> ${ok.tab} (${ok.status})`)
  for (const k of NUM[s]) {
    const r = R.resolveTab(s, k)
    if (r.tab !== 'numerology' || r.status !== 'alias') fail(`${s} #tab=${k} -> ${r.tab} (${r.status}), wanted numerology (alias)`)
  }
}
if (!R.MLB_NAV.numerology || R.MLB_NAV.numerology.label !== 'Numerology') fail('MLB nav has no Numerology entry')
if (!R.MLB_MORE_GROUPS.flatMap((g) => g[1]).includes('numerology')) fail('MLB More does not list Numerology')
if ([...R.MLB_TABS].includes('align')) fail('MLB tabs still register align as a page of its own')

// 4. line moved: the feed's opening price against our latest read; never a guess
const q = (over, m, extra = {}) => ({ over, line: 0.5, snap: 'lock', movement: m, ...extra })
const t = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`) }
t('no movement', M.lineMove({ over: 100 }), null)
t('no opening price', M.lineMove(q(500, { from_open_pp: null, line_changed: false })), null)
t('unchanged price', M.lineMove(q(900, { opening_over: 900, from_open_pp: 0, line_changed: false })), null)
const lengthened = M.lineMove(q(1200, { opening_over: 900, from_open_pp: -2.3, line_changed: false }))
t('drifted', [lengthened?.dir, lengthened?.from, lengthened?.to, lengthened?.pp], ['longer', 900, 1200, -2.3])
const shorter = M.lineMove(q(600, { opening_over: 900, from_open_pp: 2.5, line_changed: false }))
t('shortened', [shorter?.dir, shorter?.pp], ['shorter', 2.5])
const fromPrices = M.lineMove(q(-110, { opening_over: 100, line_changed: false }))   // pp worked out from the two prices when the feed's is absent
t('pp from prices', [fromPrices?.dir, fromPrices?.pp > 0], ['shorter', true])
const lc = M.lineMove(q(-120, { opening_over: 100, opening_line: 0.5, line_changed: true }, { line: 1.5 }))
t('line changed has no price move', [lc?.dir, lc?.pp, lc?.fromLine, lc?.toLine], ['line', null, 0.5, 1.5])
if (!/lock read/.test(M.lineMoveText(lengthened, (v) => `+${v}`))) fail('lineMoveText does not name the read')

// 5. where the books disagree: the spread is at the consensus line only; books on other bars are a split, not a price gap
const sp = S.bookSpread({ line: 0.5, by_book: { draftkings: { line: 0.5, over: 1200 }, fanduel: { line: 0.5, over: 900 }, caesars: { line: 1.5, over: 3000 } } })
t('best book', sp.best?.bk, 'draftkings'); t('worst book', sp.worst?.bk, 'fanduel')
t('split', sp.split, true)
if (!(sp.spread > 0)) fail(`spread ${sp.spread}`)
t('no per-book prices', S.bookSpread({ line: 0.5, over: 300 }).spread, null)
t('one book', S.bookSpread({ line: 0.5, by_book: { fanduel: { line: 0.5, over: 300 } } }).spread, null)
t('shortBook', [S.shortBook('draftkings'), S.shortBook('espnbet')], ['DK', 'ESPN'])

console.log(bad ? `\n${bad} failure(s)` : 'odds + numerology alias map: ok')
process.exit(bad ? 1 : 0)
