// Phone parity guard (PHONE-PARITY.md item 10, 2026-10-18): a tab nobody can reach on a phone is a bug the layout checks cannot see.
// Every key in a sport's *_TABS must be on the bottom bar, in the More sheet, or on the ENTRY / IN-PAGE allowlist below WITH its reason; an in-page
// entry names the file that links to it and that file must still mention the key (so a deleted pill fails here, not on a phone).
//   node scripts/check-phone-parity.mjs
import { readFileSync } from 'node:fs'
await import('./_esm-resolve.mjs')
const R = await import('../lib/routes.js')

// opened by tapping a player, club or game anywhere, never from a menu
const ENTITY = new Set(['team', 'player', 'game'])
// tab -> [the file whose in-page pill / view / link opens it, why]
const IN_PAGE = {
  mlb: {
    boxes: ['components/tabs/Home.js', 'Live view pill'],
    atplate: ['components/tabs/Home.js', 'Live view pill'],
    shape: ['components/tabs/Power.js', 'Power pill'],
    longest: ['components/tabs/Power.js', 'Power pill'],
    due: ['components/tabs/Power.js', 'Power pill'],
    patterns: ['components/tabs/HitsHRR.js', 'Hits / HR / HRR pill'],
    pairs: ['components/tabs/Combos.js', 'Combos view'],
    pools: ['components/tabs/Combos.js', 'Combos view'],
    pairhist: ['components/Dashboard.js', 'folds into Combos (Dashboard routing)'],
    mypicks: ['components/Dashboard.js', 'folds into the You page (Dashboard routing)'],
    bot: ['components/Dashboard.js', 'the lower half of Props (Dashboard routing)'],
    triples: ['components/Storylines.js', 'Gap / Storylines link'],
  },
  nhl: {
    shots: ['components/lamp/LampDashboard.js', "Rankings' SHOTS market chip (m=sog -> shots); out of More 10-18"],
  },
}

const SPORTS = [['mlb', R.MLB_TABS, R.MLB_MORE_GROUPS], ['nfl', R.NFL_TABS, R.NFL_MORE_GROUPS], ['nhl', R.NHL_TABS, R.NHL_MORE_GROUPS], ['nba', R.NBA_TABS, R.NBA_MORE_GROUPS]]
let bad = 0
for (const [sport, tabs, more] of SPORTS) {
  const reach = new Set([...(R.BAR_KEYS?.[sport] || []), ...more.flatMap((g) => g[1])])
  for (const tab of tabs) {
    if (reach.has(tab) || ENTITY.has(tab)) continue
    const via = IN_PAGE[sport]?.[tab]
    if (!via) { console.log(`FAIL ${sport}/${tab}: not on the bar, not in More, not on the in-page list -- no way to reach it on a phone`); bad += 1; continue }
    let src = ''
    try { src = readFileSync(new URL(`../${via[0]}`, import.meta.url), 'utf8') } catch { /* reported below */ }
    if (!src.includes(tab)) { console.log(`FAIL ${sport}/${tab}: ${via[0]} no longer mentions it (${via[1]})`); bad += 1 }
  }
  // the allowlist must not hide a tab that is already reachable (it would go stale)
  for (const tab of Object.keys(IN_PAGE[sport] || {})) if (reach.has(tab)) { console.log(`FAIL ${sport}/${tab}: on the bar or in More already, drop it from the allowlist`); bad += 1 }
}
if (bad) { console.log(`\n${bad} problem(s)`); process.exit(1) }
console.log('OK phone parity: every tab is on the bar, in More, an entity page, or a named in-page link that still exists')
