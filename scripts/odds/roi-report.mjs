#!/usr/bin/env node
// ODDS STEP 3 -- ROI BY BAND, AS A REPORT (2026-09-27). Read-only.
//   node scripts/odds/roi-report.mjs [since=2026-09-26] [until=yesterday ET]
// Prints the join counts and every band. A band under 100 priced picks
// prints its n and "not enough yet" instead of rates (the plan's rule).
// Where this lives on the site is Donovan's call; until then, this is it.
import { createRequire } from 'node:module'
import './../_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const { pricedPicks } = await import('../../lib/odds/gradedPicks.js')
const { roiTable, MIN_N } = await import('../../lib/odds/roi.js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const etToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
const yesterday = new Date(Date.parse(`${etToday}T12:00:00Z`) - 864e5).toISOString().slice(0, 10)
const since = process.argv[2] || '2026-09-26'
const until = process.argv[3] || yesterday
const NFL_SEASON = 2026
const nflWeeks = Array.from({ length: 18 }, (_, i) => i + 1)

const all = []
for (const sport of ['mlb', 'nfl', 'nhl']) {
  const { picks, counts, error } = await pricedPicks(db, { sport, since, until, season: NFL_SEASON, weeks: nflWeeks })
  if (error) { console.log(`${sport}: ${error.message}`); continue }
  console.log(`${sport}: ${counts.picks} picks, ${counts.graded} graded hit/miss, ${counts.priced} priced at lock, ${counts.ambiguous} ambiguous player-dates`)
  all.push(...picks)
  // MLB's home-run calls on their own (TOP / HR: the calls whose market is the homer).
  if (sport === 'mlb') all.push(...picks.filter((p) => p.hrCall).map((p) => ({ ...p, status: 'hr-call' })))
}
const f = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`
console.log(`\n${since} to ${until}. Banded on the median book's lock price. Shown at n >= ${MIN_N}.`)
for (const r of roiTable(all)) {
  const head = `${r.sport.toUpperCase()} ${r.status.padEnd(7)} ${r.bandLabel.padEnd(13)} n=${String(r.n).padStart(4)}`
  console.log(r.shown
    ? `${head}  hits ${r.hits}  implied ${r.impliedPct.toFixed(1)}%  actual ${r.actualPct.toFixed(1)}%  ROI best ${f(r.roiBest)}  median ${f(r.roiMedian)}`
    : `${head}  not enough yet`)
}
