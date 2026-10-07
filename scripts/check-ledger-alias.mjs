// THE LEDGER'S ALIAS MAP (2026-10-07), held to the cases it names -- TEST data, no network.
// Every old tab key (ledger, calledledger, tuddyledger, lampledger, results, record, accountability,
// reportcard, bands, ledgerlab) must land on #tab=ledger and on the right sub-tab, on every sport that
// ever had it; The Ledger leads the More drawer after Tonight; one icon, one label, on every sport.
//   node scripts/check-ledger-alias.mjs
import './_esm-resolve.mjs'
const R = await import('../lib/routes.js')
const V = await import('../lib/ledger/views.js')

// [old key, expected sub-tab (the address value), sports that had the key]
const CASES = [
  ['ledger', null, ['mlb', 'nfl', 'nhl', 'nba']],            // the canonical key: Tonight, no alias
  ['calledledger', 'called', ['mlb', 'nfl', 'nhl', 'nba']],   // MOONSHOT's word, and the other sports' aliases of it
  ['tuddyledger', 'called', ['mlb', 'nfl', 'nhl', 'nba']],
  ['lampledger', 'called', ['mlb', 'nfl', 'nhl', 'nba']],
  ['results', 'record', ['mlb', 'nfl', 'nhl', 'nba']],
  ['accountability', 'record', ['mlb', 'nfl', 'nhl', 'nba']],
  ['record', 'record', ['mlb', 'nfl', 'nhl', 'nba']],
  ['reportcard', 'record', ['mlb', 'nfl', 'nhl', 'nba']],
  ['bands', 'bands', ['mlb', 'nfl', 'nhl', 'nba']],
  ['ledgerlab', 'archive', ['mlb', 'nfl', 'nhl', 'nba']],
  ['archive', 'archive', ['mlb', 'nfl', 'nhl', 'nba']],
]
let bad = 0
const fail = (m) => { console.log(`FAIL ${m}`); bad += 1 }
for (const [key, want, sports] of CASES) {
  for (const s of sports) {
    const r = R.resolveTab(s, key)
    if (r.tab !== 'ledger') { fail(`${s} #tab=${key} -> ${r.tab} (${r.status}), wanted ledger`); continue }
    if (key === 'ledger') { if (r.status !== 'ok' || r.view) fail(`${s} #tab=ledger should be the plain key, got ${r.status}/${r.view}`); continue }
    if (r.status !== 'alias') fail(`${s} #tab=${key} should be an alias, got ${r.status}`)
    if (r.view !== want) fail(`${s} #tab=${key} -> lv=${r.view}, wanted ${want}`)
  }
}
// the address round trip: an alias rewrites to the canonical address, Tonight writes no lv=
if (V.ledgerHash('nhl', 'called') !== '#sport=nhl&tab=ledger&lv=called') fail(`ledgerHash called: ${V.ledgerHash('nhl', 'called')}`)
if (V.ledgerHash('mlb') !== '#sport=mlb&tab=ledger') fail(`ledgerHash tonight: ${V.ledgerHash('mlb')}`)
if (V.cleanView('nonsense') !== 'tonight' || V.cleanView('ARCHIVE') !== 'archive' || V.tabOfView('bands') !== 'record') fail('cleanView / tabOfView')
// every sub-tab has its words and a blurb on every sport; football's first word is THIS WEEK
for (const s of ['mlb', 'nfl', 'nhl', 'nba']) for (const v of V.LEDGER_VIEWS) {
  if (!V.ledgerWord(s, v)) fail(`${s} ${v}: no word`)
  if (!V.ledgerBlurb(s, v)) fail(`${s} ${v}: no blurb`)
}
if (V.ledgerWord('nfl', 'tonight') !== 'This week' || V.ledgerWord('nhl', 'tonight') !== 'Tonight') fail('first word per sport')
if (V.LEDGER_VIEWS.join() !== 'tonight,called,record,archive') fail('sub-tab order')
// the registry: One entry, one label, one icon; first group after Tonight; the old keys are not tabs
const NAVS = { mlb: R.MLB_NAV, nfl: R.NFL_NAV, nhl: R.NHL_NAV, nba: R.NBA_NAV }
const MORE = { mlb: R.MLB_MORE_GROUPS, nfl: R.NFL_MORE_GROUPS, nhl: R.NHL_MORE_GROUPS, nba: R.NBA_MORE_GROUPS }
const TABS = { mlb: R.MLB_TABS, nfl: R.NFL_TABS, nhl: R.NHL_TABS, nba: R.NBA_TABS }
for (const s of ['mlb', 'nfl', 'nhl', 'nba']) {
  const nav = NAVS[s].ledger
  if (!nav || nav.label !== 'The Ledger' || nav.icon !== '\u{1F4D2}') fail(`${s} nav.ledger should be 📒 The Ledger, got ${JSON.stringify(nav && [nav.label, nav.icon])}`)
  const groups = MORE[s]
  if (groups[1]?.[1]?.join() !== 'ledger') fail(`${s} More: The Ledger should be the 2nd group, got ${groups.map((g) => g[0])}`)
  const listed = groups.flatMap((g) => g[1])
  if (listed.filter((k) => k === 'ledger').length !== 1) fail(`${s} More lists the ledger ${listed.filter((k) => k === 'ledger').length}x`)
  for (const old of ['calledledger', 'tuddyledger', 'lampledger', 'results', 'accountability', 'bands']) {
    if (listed.includes(old)) fail(`${s} More still lists the old key ${old}`)
    if (TABS[s].includes(old)) fail(`${s} tabs still register ${old} as a page of its own`)
  }
  if (!R.LIVE_TABS[s].includes('ledger')) fail(`${s} LIVE_TABS lost ledger`)
}
// The record keeps its own icon, distinct from the Ledger's
for (const s of ['mlb', 'nhl', 'nba']) if (NAVS[s].results.icon === NAVS[s].ledger.icon) fail(`${s}: The record and The Ledger share an icon`)
if (NAVS.nfl.accountability.icon === NAVS.nfl.ledger.icon) fail('nfl: The record and The Ledger share an icon')
// the bar is unchanged: Tonight / Props / Rankings / Live (+ More)
const bar = JSON.stringify(R.BAR_KEYS)
if (!bar.includes('"home"') || Object.values(R.BAR_KEYS).some((k) => k.includes('ledger'))) fail(`bar changed: ${bar}`)
console.log(bad ? `${bad} problem(s)` : `OK ledger aliases: ${CASES.length - 1} old keys x 4 sports land on #tab=ledger and the right sub-tab; The Ledger is the 2nd More group, 📒, on every sport`)
process.exit(bad ? 1 : 0)
