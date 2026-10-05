// PRINT THE WRITE-UPS A TICK WOULD WRITE (BATCH-GAME-WRITEUP). Reads the live
// published files, writes NOTHING (dry: 'print' never touches the database).
//
//   node scripts/writeups/print.mjs --at 2026-10-05T23:05:00Z
//
// --at: the moment to pretend it is (a game is due 75-60 min before kickoff).
// --any-build: skip the 'calls file rebuilt within 100 min of kickoff' rule (print only).
await import('../_esm-resolve.mjs')
const { runNflWriteups } = await import('../../lib/writeups/post.js')
const { fetchNfl, nflSlatePaths, nflSlateLooksReal } = await import('../../lib/nfl/dataSource.js')
const i = process.argv.indexOf('--at')
const at = i > 0 ? new Date(process.argv[i + 1]).getTime() : Date.now()
if (!Number.isFinite(at)) { console.error('bad --at'); process.exit(2) }
const out = await runNflWriteups(null, { now: at, dry: 'print', getWeek: () => fetchNfl(nflSlatePaths(), nflSlateLooksReal), ...(process.argv.includes('--any-build') ? { freshMs: Infinity } : {}) })
if (typeof out === 'string') console.log(out)
else for (const [id, r] of Object.entries(out)) {
  if (typeof r === 'string') { console.log(`${id}: ${r}`); continue }
  console.log(`\n===== ${id} · featured: ${r.featured || 'no (site + Discord only)'} =====\n${r.full}\n\n----- X (${r.x.length} chars) -----\n${r.x}`)
}
