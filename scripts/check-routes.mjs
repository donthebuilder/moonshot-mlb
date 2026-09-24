// Route registry invariant (2026-09-24 audit). Every key the nav or the More
// sheet offers must resolve for its own product, and every alias must point at
// a real key. Two production bugs this would have caught: MLB `pitchermap` and
// NFL `scores` were in *_NAV but not *_TABS -- one 404'd on reload, the other
// was a drawer button that did nothing.
//   node scripts/check-routes.mjs
import * as R from '../lib/routes.js'

let bad = 0
const miss = (sport, keys, where) => {
  for (const k of keys) {
    if (R.resolveTab(sport, k).status === 'missing') { console.log(`FAIL ${sport} ${where}: '${k}' does not resolve`); bad += 1 }
  }
}
miss('mlb', Object.keys(R.MLB_NAV), 'MLB_NAV')
miss('nfl', Object.keys(R.NFL_NAV), 'NFL_NAV')
miss('mlb', R.MLB_MORE_GROUPS.flatMap((g) => g[1]), 'MLB_MORE_GROUPS')
miss('nfl', R.NFL_MORE_GROUPS.flatMap((g) => g[1]), 'NFL_MORE_GROUPS')
for (const [k, v] of Object.entries(R.MLB_ALIASES)) if (!R.MLB_TABS.includes(v)) { console.log(`FAIL MLB_ALIASES ${k} -> '${v}' not in MLB_TABS`); bad += 1 }
for (const [k, v] of Object.entries(R.NFL_ALIASES)) if (!R.NFL_TABS.includes(v)) { console.log(`FAIL NFL_ALIASES ${k} -> '${v}' not in NFL_TABS`); bad += 1 }
console.log(bad ? `${bad} problem(s)` : 'OK routes registry: nav, More groups and aliases all resolve')
process.exit(bad ? 1 : 0)
