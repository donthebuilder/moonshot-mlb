// lib/stories/mlb.js on today's live board: every story tied to a game, with
// a source and a sentence; counts per type; a sample.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-stories-mlb.mjs [--json FILE]
import { createRequire } from 'node:module'
import fs from 'node:fs'
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { loadMlbStories } = await import('../lib/stories/mlb.js')

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const t0 = Date.now()
const { day, rows, stories } = await loadMlbStories()
console.log(`   loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
check(rows.length > 0, `board ${day}: ${rows.length} rows, ${new Set(rows.map((r) => r.game_pk)).size} games`)
check(stories.length > 0 && stories.every((s) => s.game_id && s.day === day && s.source && s.text), `${stories.length} stories, every one with its game, the slate's day, a source and a sentence`)
check(stories.every((s, i) => i === 0 || stories[i - 1].rarity >= s.rarity), 'rarest first')
const games = new Set(rows.map((r) => String(r.game_pk)))
check(stories.every((s) => games.has(String(s.game_id))), 'every game_id is one of tonight\'s games')
const by = {}
for (const s of stories) by[s.type] = (by[s.type] || 0) + 1
console.log('   by type:', JSON.stringify(by))
for (const t of Object.keys(by)) { const s = stories.find((x) => x.type === t); console.log(`   ${s.rarity.toFixed(2)} ${s.icon} [${t}] ${s.text}`) }
const i = process.argv.indexOf('--json')
if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify({ day, stories }))
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
