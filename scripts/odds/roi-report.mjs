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

// THE CARD AGAINST THE BOOK'S LINE (TUDDY depth step 1). Not our bar: did the
// card's non-TD rung go OVER the book's line at lock, and what the over paid.
// Its own section, never mixed into the rows above.
const { pricedLinePicks } = await import('../../lib/odds/gradedPicks.js')
const lp = await pricedLinePicks(db, { season: NFL_SEASON, weeks: nflWeeks })
if (lp.error) console.log(`\nNFL card vs the book: ${lp.error.message}`)
else {
  console.log(`\nNFL card vs the BOOK'S line at lock: ${lp.counts.rungs} rungs, ${lp.counts.graded} graded, ${lp.counts.priced} priced, ${lp.counts.ambiguous} ambiguous`)
  const markets = [...new Set(lp.picks.filter((p) => p.price).map((p) => p.market))]
  for (const mk of markets) {
    const mine = lp.picks.filter((p) => p.market === mk && p.price)
    const pushes = mine.filter((p) => p.result === 'push').length
    const rows = roiTable(mine.map((p) => ({ ...p, status: 'called' })))
    const n = rows.reduce((a, r) => a + r.n, 0)
    const hits = rows.reduce((a, r) => a + r.hits, 0)
    console.log(`  ${mk.padEnd(9)} priced n=${String(n).padStart(4)}${pushes ? ` (+${pushes} push)` : ''}  ${n >= MIN_N ? `over the line ${hits}/${n}  ` + rows.map((r) => `${r.bandLabel}: ROI best ${f(r.roiBest)} median ${f(r.roiMedian)}`).join(' · ') : 'not enough yet'}`)
  }
  if (!markets.length) console.log('  no graded rung has a lock line yet (NFL lines are saved at lock from 09-27, week 3)')
}
