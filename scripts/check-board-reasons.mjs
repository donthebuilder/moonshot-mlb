#!/usr/bin/env node
// BOARD CARDS THAT SAY SOMETHING (TUDDY depth step 4). Reads the live
// nfl_week.json (read-only) and, per market, compares the top-10 cards' "why"
// lines: the old fixed clause (WHY[top component]) vs lib/nfl/boardReason.js.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-board-reasons.mjs
import { boardReason, topComponent } from '../lib/nfl/boardReason.js'
import { WHY } from '../lib/nfl/scoreLabels.js'
import { NFL_DATA_BASE } from '../lib/nfl/dataSource.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const week = await fetch(`${NFL_DATA_BASE}/nfl_week.json`).then((r) => r.json())
const median = (rows, market) => {
  const acc = {}
  for (const p of rows) for (const [k, v] of Object.entries(p?.components?.[market] || {})) if (Number.isFinite(Number(v))) (acc[k] ||= []).push(Number(v))
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.sort((a, b) => a - b)[Math.floor(v.length / 2)]]))
}
for (const m of week.markets || []) {
  const eligible = (week.players || []).filter((p) => Number.isFinite(p.scores?.[m.key]))
  if (!eligible.length) continue
  const base = median(eligible, m.key)
  const top10 = [...eligible].filter((p) => !p.on_bye).sort((a, b) => b.scores[m.key] - a.scores[m.key]).slice(0, 10)
  const oldLines = top10.map((p) => { const t = topComponent(p, m.weights, base, m.key); return t ? WHY[t.k] : null }).filter(Boolean)
  const newLines = top10.map((p) => boardReason(p, m.weights, base, m.key, eligible)?.text).filter(Boolean)
  const oldDistinct = new Set(oldLines).size
  const newDistinct = new Set(newLines).size
  console.log(`${m.key.padEnd(9)} top 10: old ${oldDistinct} distinct of ${oldLines.length} lines -> new ${newDistinct} distinct of ${newLines.length}   e.g. "${newLines[0] || '(none)'}"`)
  check(newLines.length === oldLines.length, `${m.key}: same cards get a line as before (the 60th-percentile floor is unchanged)`)
  check(newDistinct >= oldDistinct, `${m.key}: never fewer distinct lines than before`)
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
