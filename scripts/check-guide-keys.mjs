// Every NAV key a Guide page reads must exist (2026-10-17: TUDDY's and LAMP's Guide tabs crashed with "Cannot read properties of undefined (reading 'label')"
// after `scores` became a view inside Live and left the nav tables). A Guide row that names a tab that is not in <SPORT>_NAV is a crash.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-guide-keys.mjs
import { readFileSync } from 'node:fs'
const R = await import('../lib/routes.js')
const NAV = { MLB_NAV: R.MLB_NAV, NFL_NAV: R.NFL_NAV, NHL_NAV: R.NHL_NAV, NBA_NAV: R.NBA_NAV }
const FILES = ['components/tabs/Guide.js', 'components/nfl/tabs/Guide.js', 'components/lamp/tabs/Guide.js', 'components/buckets/tabs/Guide.js']
let bad = 0
for (const f of FILES) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  for (const m of src.matchAll(/\b(MLB_NAV|NFL_NAV|NHL_NAV|NBA_NAV)\.([A-Za-z0-9_]+)/g)) {
    if (!NAV[m[1]]?.[m[2]]) { console.log(`FAIL ${f}: ${m[1]}.${m[2]} does not exist`); bad += 1 }
  }
}
if (bad) { console.log(`\n${bad} FAILED`); process.exit(1) }
console.log('check-guide-keys: every NAV key a Guide reads exists')
