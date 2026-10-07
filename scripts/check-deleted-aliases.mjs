// DELETED PAGES, HELD TO THEIR ALIASES (2026-10-07), TEST data, no network. Derby, the Parlay Builder, the
// Ledger lab and Score bands are not pages any more; every old key (and the words people type for them) must
// still LAND on a real tab of every sport, never 'missing', and none may still be a registered tab, a nav
// entry or a More-drawer entry. The slip's pair help (lib/slipPairs.js) answers its own cases.
//   node scripts/check-deleted-aliases.mjs
import './_esm-resolve.mjs'
const R = await import('../lib/routes.js')
const D = await import('../lib/deletedPages.js')
const SP = await import('../lib/slipPairs.js')

let bad = 0
const fail = (m) => { console.log(`FAIL ${m}`); bad += 1 }
const SPORTS = ['mlb', 'nfl', 'nhl', 'nba']
const TABS = { mlb: R.MLB_TABS, nfl: R.NFL_TABS, nhl: R.NHL_TABS, nba: R.NBA_TABS }
const NAVS = { mlb: R.MLB_NAV, nfl: R.NFL_NAV, nhl: R.NHL_NAV, nba: R.NBA_NAV }
const MORE = { mlb: R.MLB_MORE_GROUPS, nfl: R.NFL_MORE_GROUPS, nhl: R.NHL_MORE_GROUPS, nba: R.NBA_MORE_GROUPS }
const has = (list, k) => (list instanceof Set ? list.has(k) : list.includes(k))

// 1. every removed key lands on a real tab, as an alias, on every sport (ledger keys: on #tab=ledger + the sub-tab)
const LEDGER = { ledgerlab: 'archive', bands: 'bands' }
for (const s of SPORTS) {
  const real = new Set(TABS[s] instanceof Set ? [...TABS[s]] : TABS[s])
  for (const [kind, keys] of [['derby', D.DERBY_KEYS], ['builder', D.BUILDER_KEYS]]) {
    for (const k of keys) {
      const r = R.resolveTab(s, k)
      if (r.status !== 'alias') { fail(`${s} #tab=${k} -> ${r.tab} (${r.status}), wanted an alias`); continue }
      if (!real.has(r.tab)) fail(`${s} #tab=${k} -> ${r.tab}, which is not a tab of ${s}`)
      if (r.tab !== D.DELETED_LANDING[s][kind]) fail(`${s} #tab=${k} -> ${r.tab}, wanted ${D.DELETED_LANDING[s][kind]}`)
    }
  }
  for (const [k, view] of Object.entries(LEDGER)) {
    const r = R.resolveTab(s, k)
    if (r.tab !== 'ledger' || r.status !== 'alias' || r.view !== view) fail(`${s} #tab=${k} -> ${r.tab}/${r.view} (${r.status}), wanted ledger/${view}`)
  }
  // 2. gone from the registry, the nav, the drawer, and the page names
  for (const dead of ['derby', 'builder', 'bands', 'ledgerlab']) {
    if (has(TABS[s], dead)) fail(`${s} still registers ${dead} as a tab`)
    if (NAVS[s][dead]) fail(`${s} nav still names ${dead}`)
    if (MORE[s].flatMap((g) => g[1]).includes(dead)) fail(`${s} More still lists ${dead}`)
  }
  // the landing pages stay in the drawer or on the bar (a granny can still get there)
  if (!has(TABS[s], D.DELETED_LANDING[s].builder) || !has(TABS[s], D.DELETED_LANDING[s].derby)) fail(`${s} landing tabs are not registered`)
  // the appHref of a dead key is a live address
  const a = R.appHref(s, 'builder')
  if (!/tab=(props|picks|board)/.test(a)) fail(`${s} appHref(builder) = ${a}`)
}

// 3. the slip's pair help: real rows in, a measured note out; nothing invented
const top = (id, name, extra = {}) => ({ player_id: id, name, game_pick_role: 'TOP', hr_score: 80, season_iso: 0.25, ...extra })
const A = top(1, 'Test A'); const B = top(2, 'Test B'); const C = { player_id: 3, name: 'Test C', hr_score: 40 }
const notes = SP.pairNotes([{ key: 'a', k: 'TOP', r: A }, { key: 'b', k: 'HR', r: B }], null)
if (notes.length !== 1 || !/Both TOP picks/.test(notes[0].text) || !/5\.3%/.test(notes[0].text)) fail(`pairNotes TOP+TOP: ${JSON.stringify(notes)}`)
if (SP.pairNotes([{ key: 'a', k: 'HIT', r: A }, { key: 'b', k: 'HIT', r: B }], null).length) fail('a hits pair must get no home-run pair note')
if (SP.pairNotes([{ key: 'a', k: 'TOP', r: A }], null).length) fail('one leg has no pair')
const none = SP.pairNotes([{ key: 'a', k: 'TOP', r: A }, { key: 'c', k: 'HR', r: C }], null)
if (none.length !== 1 || !/none of the measured pair rules/.test(none[0].text)) fail(`a pair meeting no rule must say so: ${JSON.stringify(none)}`)
const hist = { top_pairs: [{ players: [{ player_id: 1 }, { player_id: 2 }], repeat_count: 3 }] }
if (!/3 times/.test(SP.pairNotes([{ key: 'a', k: 'TOP', r: A }, { key: 'b', k: 'TOP', r: B }], hist)[0].text)) fail('co-HR history should print')
const parts = SP.partners([{ r: A, k: 'TOP' }], [A, B, C], { canAdd: (r) => 'HR' })
if (parts.length !== 1 || parts[0].name !== 'Test B') fail(`partners should be B only (C meets no rule, A is on the slip): ${JSON.stringify(parts.map((p) => p.name))}`)
if (SP.partners([{ r: A, k: 'TOP' }], [B], { canAdd: () => null }).length) fail('an unpriced / started partner must not be suggested')
if (SP.partners([{ r: A, k: 'HIT' }], [B], { canAdd: () => 'HR' }).length) fail('no partners for a hits leg')

console.log(bad ? `\n${bad} deleted-page alias failure(s)` : `OK: Derby / Builder / Ledger lab / Score bands all land on a real tab on ${SPORTS.length} sports; slip pair help holds`)
process.exit(bad ? 1 : 0)
