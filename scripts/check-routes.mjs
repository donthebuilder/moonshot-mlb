// Route registry invariant (2026-09-24 audit). Every key the nav or the More
// sheet offers must resolve for its own product, and every alias must point at
// a real key. Two production bugs this would have caught: MLB `pitchermap` and
// NFL `scores` were in *_NAV but not *_TABS -- one 404'd on reload, the other
// was a drawer button that did nothing.
//   node scripts/check-routes.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
// lib/routes.js imports './nhl/routes' without an extension (fine under Next,
// not under plain node) -- the resolver has to be registered before the
// registry is loaded, so both are dynamic imports, in this order.
await import('./_esm-resolve.mjs')
const R = await import('../lib/routes.js')

let bad = 0
const miss = (sport, keys, where) => {
  for (const k of keys) {
    if (R.resolveTab(sport, k).status === 'missing') { console.log(`FAIL ${sport} ${where}: '${k}' does not resolve`); bad += 1 }
  }
}
miss('mlb', Object.keys(R.MLB_NAV), 'MLB_NAV')
miss('nfl', Object.keys(R.NFL_NAV), 'NFL_NAV')
miss('nhl', Object.keys(R.NHL_NAV), 'NHL_NAV')
miss('mlb', R.MLB_MORE_GROUPS.flatMap((g) => g[1]), 'MLB_MORE_GROUPS')
miss('nfl', R.NFL_MORE_GROUPS.flatMap((g) => g[1]), 'NFL_MORE_GROUPS')
miss('nhl', R.NHL_MORE_GROUPS.flatMap((g) => g[1]), 'NHL_MORE_GROUPS')
for (const [k, v] of Object.entries(R.MLB_ALIASES)) if (!R.MLB_TABS.includes(v)) { console.log(`FAIL MLB_ALIASES ${k} -> '${v}' not in MLB_TABS`); bad += 1 }
for (const [k, v] of Object.entries(R.NFL_ALIASES)) if (!R.NFL_TABS.includes(v)) { console.log(`FAIL NFL_ALIASES ${k} -> '${v}' not in NFL_TABS`); bad += 1 }
for (const [k, v] of Object.entries(R.NHL_ALIASES)) if (!R.NHL_TABS.includes(v)) { console.log(`FAIL NHL_ALIASES ${k} -> '${v}' not in NHL_TABS`); bad += 1 }
// A sport the registry does not know must still answer MOONSHOT, never throw.
if (R.resolveTab('xfl', 'home').tab !== 'home') { console.log('FAIL unknown sport did not fall back to MOONSHOT'); bad += 1 }
if (R.pageTitle('nhl', 'scores') !== 'LAMP · NHL — Scores') { console.log(`FAIL pageTitle nhl: ${R.pageTitle('nhl', 'scores')}`); bad += 1 }
// The one sport list is the registry's own keys, and every one is branded.
if (R.SPORT_KEYS.join() !== Object.keys(R.BRAND).join()) { console.log(`FAIL SPORT_KEYS ${R.SPORT_KEYS} vs BRAND ${Object.keys(R.BRAND)}`); bad += 1 }
if (!R.isSport('nhl') || R.isSport('xfl') || R.isSport(null) || R.isSport('toString')) { console.log('FAIL isSport answers wrong'); bad += 1 }

// ── NO NEW HAND-WRITTEN SPORT TERNARIES (Batch 1, 2026-09-25) ──────────────
// `sport === 'nfl' ? … : …` is how hockey kept turning into baseball: every
// copy is a private sport list that the registry above can't reach. The ones
// still standing are counted below, per file. A file that goes UP, or a new
// file with one, fails -- use sportKey / isSport / SPORT_KEYS / BRAND from
// lib/routes.js, or a table keyed by sport, instead. A file that goes DOWN is
// reported so the number below can be lowered in the same commit.
// FRANCHISE is another workflow's; the registry files are the registry.
const TERNARY_BASELINE = {
  'app/called/page.js': 19,     // copy per sport; Batch 2 rewrites the page
  'app/start/page.js': 12,      // copy per sport; Batch 6 (search titles)
  'components/Header.js': 5,    // ticker nav: latent, the ticker has no NHL items
  'components/nfl/NflHeader.js': 3,
  'components/ScoreRail.js': 1, // MOONSHOT keeps its pre-merge storage key
}
const TERNARY = /\b[\w.]*sport\w*(?:\.key)?\s*[!=]==?\s*['"](?:mlb|nfl|nhl)['"]\s*\?/gi
const SKIP = (f) => /fantasy|franchise/i.test(f) || f === 'lib/routes.js' || f === 'lib/nhl/routes.js'
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []
})
// Comments don't count -- this file's own history is written in them. Blanked
// rather than removed so the line numbers printed stay true.
const code = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const seen = {}
for (const f of ['app', 'components', 'lib'].flatMap(walk)) {
  if (SKIP(f)) continue
  const text = code(readFileSync(f, 'utf8'))
  const hits = [...text.matchAll(TERNARY)]
  if (!hits.length) continue
  seen[f] = hits.length
  const allowed = TERNARY_BASELINE[f] || 0
  if (hits.length > allowed) {
    console.log(`FAIL ${f}: ${hits.length} hand-written sport ternaries (baseline ${allowed}) -- use lib/routes.js`)
    for (const h of hits) console.log(`       ${f}:${text.slice(0, h.index).split('\n').length}  ${h[0].replace(/\s+/g, ' ')}`)
    bad += 1
  }
}
for (const [f, n] of Object.entries(TERNARY_BASELINE)) {
  if ((seen[f] || 0) < n) console.log(`note ${f}: ${seen[f] || 0} sport ternaries, baseline ${n} -- lower it`)
}

console.log(bad ? `${bad} problem(s)` : 'OK routes registry: nav, More groups and aliases all resolve; no new sport ternaries')
process.exit(bad ? 1 : 0)
