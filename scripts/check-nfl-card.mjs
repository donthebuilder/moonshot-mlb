#!/usr/bin/env node
// THE CARD ON /called MATCHES THE RECORD TAB (TUDDY depth step 1). Reads the
// live data branch (read-only) and diffs lib/nfl/cardRecord.js against
// lib/nfl/resultsArchive.js seasonTotals() -- the Record tab's own sum --
// over the same weekly files, market by market.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-card.mjs
import { readNflCardRecord, sumTotals, edgeWord } from '../lib/nfl/cardRecord.js'
import { seasonTotals } from '../lib/nfl/resultsArchive.js'
import { NFL_DATA_BASE } from '../lib/nfl/dataSource.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const rec = await readNflCardRecord()
check(Boolean(rec?.markets?.length), `card record read: season ${rec?.season}, weeks ${rec?.weeks?.join(',')}`)
const files = (await Promise.all(rec.weeks.map((w) => fetch(`${NFL_DATA_BASE}/nfl_results_${rec.season}_w${String(w).padStart(2, '0')}.json`).then((r) => (r.ok ? r.json() : null)))))
const latest = await fetch(`${NFL_DATA_BASE}/nfl_results.json`).then((r) => r.json())
// The Record tab's set: the archive weeks plus the live file under its own week.
const tabSet = files.map((f, i) => (rec.weeks[i] === Number(latest.week) ? latest : f)).filter(Boolean)
const tab = seasonTotals(tabSet)
const mine = sumTotals(tabSet)
// Voids: only completed weeks (the live week's ungraded rungs are written as
// void by the bot -- pending, not void). n / hit / pct must match exactly.
const done = seasonTotals(tabSet.filter((p) => Number(p.week) !== Number(latest.week)))
for (const m of rec.markets) {
  const t = tab[m.key] || {}
  check(t.n === m.n && t.hit === m.hit && t.pct === m.pct, `${m.key.padEnd(8)} page ${m.hit}/${m.n} ${m.pct}%  ==  Record tab ${t.hit}/${t.n} ${t.pct}%`)
  check((done[m.key]?.void || 0) === m.void, `${m.key.padEnd(8)} void ${m.void} = completed weeks' voids ${done[m.key]?.void || 0} (Record tab says ${t.void}, counting week ${latest.week}'s pending calls)`)
  check(mine[m.key]?.n === m.n, `${m.key.padEnd(8)} sumTotals agrees`)
}
check(rec.live && rec.live.week === Number(latest.week), `live week ${rec.live?.week}, ${rec.live?.graded} calls graded so far`)
check(edgeWord({ edge: 0, hit: 77.8, form_hit: 77.8 }) === 'no edge over recent form yet (77.8% vs 77.8%)', 'edge 0 -> "no edge over recent form yet"')
check(edgeWord({ edge: -3.4, hit: 84.4, form_hit: 87.8 }).startsWith('no edge'), 'negative edge -> "no edge ..." (never a minus sold as a plus)')
check(edgeWord({ edge: 7.8, hit: 60, form_hit: 52.2 }) === '+7.8 pts over recent form (60% vs 52.2%)', 'positive edge printed as the bot wrote it')
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
