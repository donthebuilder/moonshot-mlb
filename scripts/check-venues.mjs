#!/usr/bin/env node
// THE VENUE TABLES (2026-10-02): every NFL and NHL club has its home building,
// named, and the shared buildings resolve to one entry. node --import <loader> scripts/check-venues.mjs
import { NFL_TEAMS } from '../lib/nfl/teams.js'
import { NHL_TEAMS } from '../lib/nhl/teams.js'
import { NFL_STADIUMS } from '../lib/nfl/stadiums.js'
import { NHL_ARENAS } from '../lib/nhl/arenas.js'
let bad = 0
const fail = (m) => { bad++; console.log('  FAIL', m) }
for (const [t] of NFL_TEAMS) {
  const s = NFL_STADIUMS[t]
  if (!s) { fail(`NFL ${t}: no stadium`); continue }
  if (!s.name) fail(`NFL ${t}: no name`)
}
for (const [a, b] of [['NYG', 'NYJ'], ['LAC', 'LA']]) if (NFL_STADIUMS[a] !== NFL_STADIUMS[b]) fail(`NFL ${a}/${b} should share one building`)
for (const [t] of NHL_TEAMS) if (!NHL_ARENAS[t]?.name) fail(`NHL ${t}: no arena`)
const extra = [...Object.keys(NFL_STADIUMS).filter((t) => !NFL_TEAMS.some(([x]) => x === t)), ...Object.keys(NHL_ARENAS).filter((t) => !NHL_TEAMS.some(([x]) => x === t))]
if (extra.length) fail(`entries for unknown codes: ${extra.join(', ')}`)
console.log(`${NFL_TEAMS.length} NFL clubs, ${new Set(Object.values(NFL_STADIUMS)).size} stadiums; ${NHL_TEAMS.length} NHL clubs, ${Object.keys(NHL_ARENAS).length} arenas`)
console.log(bad ? `${bad} failures` : 'all green')
process.exit(bad ? 1 : 0)
