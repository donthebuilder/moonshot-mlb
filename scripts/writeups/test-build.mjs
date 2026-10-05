// THE WRITE-UP BUILDER, TESTED (BATCH-GAME-WRITEUP). Runs lib/writeups on a
// directory of REAL published files saved as a TEST FIXTURE (the bot's data
// branch: nfl_week.json, nfl_game_calls.json, nfl_game_calls_totals_<s>.json,
// nfl_matchup.json, nfl_logs.json, nfl_odds_latest.json). The files are too big
// to commit; fetch them into any folder and pass it:
//
//   node scripts/writeups/test-build.mjs --dir <folder> [--print <game_id>]
//
// Checks, every game: every rendered line names its source field; the full and
// short texts pass the fact engine's checker; a side with no call reads its
// real status and is never filled; no stored price -> no PRICE line; and a
// made-up number in a line is caught (the checker is live, not decorative).
await import('../_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const { buildNflWriteup } = await import('../../lib/writeups/build.js')
const { renderWriteup, factOf } = await import('../../lib/writeups/text.js')
const { checkDraft } = await import('../../lib/facts/check.js')

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const dir = arg('--dir')
if (!dir) { console.error('usage: --dir <fixture folder>'); process.exit(2) }
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { return null } }
const week = read('nfl_week.json'), calls = read('nfl_game_calls.json'), matchup = read('nfl_matchup.json'), logs = read('nfl_logs.json'), odds = read('nfl_odds_latest.json')
const totals = read(`nfl_game_calls_totals_${calls?.season}.json`)

let fails = 0, checks = 0
const ok = (cond, what) => { checks++; if (!cond) { fails++; console.log('FAIL', what) } }

for (const g of calls?.games || []) {
  const w = buildNflWriteup(g, { week, totals, matchup, logs, odds })
  ok(w, `${g.game_id} builds`)
  if (!w) continue
  const lines = [w.header, ...w.game, ...w.bottom, ...w.players.flatMap((p) => [...p.why, ...p.watch])]
  ok(lines.every((l) => l && l.t && l.src), `${g.game_id}: every line has a source`)
  const r = renderWriteup(w, { xLimit: 280 })
  ok(r.ok, `${g.game_id}: checker passes -- ${r.why.join('; ')}`)
  ok(r.short.length <= 280, `${g.game_id}: X short text <= 280 (${r.short.length})`)
  for (const n of w.noCall) ok(['called', 'board', 'off'].includes(n.status) && !w.players.some((p) => p.team === n.team), `${g.game_id}: no-call side ${n.team} has a real status, no filled slot`)
  for (const p of w.players) ok(p.price || !/PRICE/.test(r.full.split(p.name.toUpperCase())[1]?.split('\n\n')[0] || ''), `${g.game_id}: ${p.name} no stored price -> no PRICE line`)
  if (arg('--print') === String(g.game_id) || arg('--print') === 'all') console.log(`\n----- ${g.away} @ ${g.home} (${g.game_id}) -----\n${r.full}\n\n[X ${r.xIsLong ? 'long' : 'short'} ${r.x.length} chars]\n${r.x}\n`)
}
// the checker is live: a number nobody gave it is refused
const g0 = (calls?.games || [])[0]
if (g0) {
  const w = buildNflWriteup(g0, { week, totals, matchup, logs, odds })
  const bad = checkDraft(`${w.players[0]?.name} scored 99.9 times`, factOf(w), { limit: 4000 })
  ok(!bad.ok && bad.why.some((x) => /99\.9/.test(x)), 'a made-up number is refused')
}
console.log(`\n${checks - fails}/${checks} checks passed across ${(calls?.games || []).length} games (TEST FIXTURE: ${dir})`)
process.exit(fails ? 1 : 0)
