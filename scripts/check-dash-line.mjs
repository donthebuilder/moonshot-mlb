#!/usr/bin/env node
// THE DASH LINE, CHECKED (BATCH-DASH-LINE step 2). lib/dashLine.js against:
//   1. the rounding rule (.5, never a push) and the lean rule, on made-up numbers (test data)
//   2. one real player, hand-checked: Jahmyr Gibbs (00-0039139), every market, from the
//      published nfl_logs.json + nfl_matchup.json, recomputed here by the definition's
//      own arithmetic (written out, not by calling the function) and compared
//   node --import <loader> scripts/check-dash-line.mjs [--pid 00-0039139] [--opp CAR]
import { dashLine, toHalf, leanOf, oppFactor, DASH_MARKETS } from '../lib/dashLine.js'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const RAW = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
let bad = 0, n = 0
const eq = (name, got, want) => { n++; if (got !== want && !(Number.isFinite(got) && Math.abs(got - want) < 1e-9)) { bad++; console.log('  FAIL', name, 'got', got, 'want', want) } }

// 1. rules (test data)
eq('toHalf 54 -> 54.5', toHalf(54), 54.5); eq('toHalf 54.2 -> 54.5 (nearest .5 is 54.0, a whole number)', toHalf(54.2), 54.5)
eq('toHalf 54.4 -> 54.5', toHalf(54.4), 54.5); eq('toHalf 54.8 -> 55.5', toHalf(54.8), 55.5); eq('toHalf 3.6 -> 3.5', toHalf(3.6), 3.5)
eq('lean over', leanOf(62.5, 54.5, 'rec_yds'), 'over'); eq('lean under', leanOf(50.5, 54.5, 'rec_yds'), 'under')
eq('lean none (within 2.5 yds)', leanOf(56.5, 54.5, 'rec_yds'), 'none'); eq('lean rec none (within .25)', leanOf(4.5, 4.5, 'rec'), 'none')
eq('too few games', dashLine({ games: [{ s: 2026, w: 1, g_rec: 2, g_recyd: 20 }, { s: 2026, w: 2, g_rec: 0, g_recyd: 0 }], season: 2026, market: 'rec' }).line, null)
eq('out = no line', dashLine({ games: [], season: 2026, market: 'rec', out: true }).reason, 'out or doubtful')

// 2. one real player, hand-checked
const [logs, mu] = await Promise.all([fetch(`${RAW}/nfl_logs.json`).then((r) => r.json()), fetch(`${RAW}/nfl_matchup.json`).then((r) => r.json())])
const pid = arg('--pid', '00-0039139')
const games = logs.logs[pid]?.log || []
const season = Math.max(...games.map((g) => g.s))
const role = mu.roles?.[pid]?.role || mu.roles?.[pid] || null
const def = arg('--opp', 'CAR')
console.log(`player ${pid}: ${games.length} logged games, season ${season}, role ${JSON.stringify(role)}, vs ${def}`)
for (const [mk, M] of Object.entries(DASH_MARKETS.nfl)) {
  const opp = oppFactor(mu.dvp?.season, def, typeof role === 'string' ? role : null, M.dvp)
  const got = dashLine({ games, season, market: mk, opp })
  // the definition, by hand: newest first, this season, then last season up to 6, weight 0.5^(k/4), weighted median
  const s = [...games].sort((a, b) => (b.s - a.s) || (b.w - a.w))
  const cur = s.filter((g) => g.s === season), prev = s.filter((g) => g.s < season)
  const win = cur.length >= 6 ? cur : cur.concat(prev.slice(0, 6 - cur.length))
  // weighted median by hand: sort the window's values, walk the weights to half
  const pts = win.map((g, k) => [g[M.stat], Math.pow(0.5, k / 4)]).sort((a, b) => a[0] - b[0])
  const half = pts.reduce((a, p) => a + p[1], 0) / 2
  let acc = 0, med = 0
  for (let i = 0; i < pts.length; i++) { acc += pts[i][1]; if (Math.abs(acc - half) < 1e-12 && i + 1 < pts.length) { med = (pts[i][0] + pts[i + 1][0]) / 2; break } if (acc > half) { med = pts[i][0]; break } }
  const v = med * opp.factor, r2 = Math.round(v * 2) / 2
  let hand = toHalf(v)
  if (Number.isInteger(r2)) {
    let above = 0, below = 0
    win.forEach((g, k) => { const x = g[M.stat] * opp.factor, w = Math.pow(0.5, k / 4); if (x > r2) above += w; if (x < r2) below += w })
    hand = above >= below ? r2 + 0.5 : r2 - 0.5
  }
  const num = med, den = 1
  const roleGames = win.filter((g) => g[M.vol] > 0).length
  const want = roleGames >= 3 ? hand : null
  eq(`${mk} line`, got.line, want)
  console.log(`  ${mk.padEnd(8)} window ${win.map((g) => `${g.s % 100}w${g.w}:${g[M.stat]}`).join(' ')} -> base ${(num / den).toFixed(2)} x ${opp.factor.toFixed(3)} = ${want ?? 'no line'} (${got.reason || 'ok'})`)
}
console.log(`\n${n - bad}/${n} checks`)
process.exit(bad ? 1 : 0)
