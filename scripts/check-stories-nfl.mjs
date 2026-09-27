// lib/stories/nfl.js on the live week: every story is tied to a game, carries
// its source, and the per-kind counts equal the TUDDY tab's own builders.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-stories-nfl.mjs
import { nflSlatePaths, nflLogPaths, fetchNfl } from '../lib/nfl/dataSource.js'
import { buildNflStories } from '../lib/stories/nfl.js'
import { milestoneStreaks, scoredLastTimeOut, revengeGames, dueByTheNumbers, redZoneMonsters, rivalryNights } from '../lib/nfl/storylines.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const http = (ps) => ps.filter((p) => p.startsWith('http'))
const data = await fetchNfl(http(nflSlatePaths()))
const logs = await fetchNfl(http(nflLogPaths()))
check(data?.players?.length > 0 && logs?.logs, `live week ${data?.season} wk ${data?.week}: ${data?.players?.length} players, ${Object.keys(logs?.logs || {}).length} logs`)

const s = buildNflStories({ data, logs })
const count = (t) => s.filter((x) => x.type === t).length
check(s.length > 0 && s.every((x) => x.game_id && x.day && x.source && x.text && x.parts.length), `${s.length} stories, every one with a game, a day, a source and a sentence`)
check(s.every((x, i) => i === 0 || s[i - 1].rarity >= x.rarity), 'sorted rarest first')
const same = [
  ['streak', milestoneStreaks(logs, data).length], ['b2b', scoredLastTimeOut(data).length], ['revenge', revengeGames(data, logs).length],
  ['due', dueByTheNumbers(data).length], ['redzone', redZoneMonsters(data).length], ['rivalry', rivalryNights(data).length],
]
for (const [t, n] of same) check(count(t) === n, `${t}: engine ${count(t)} = tab builder ${n}`)
const games = new Set(s.map((x) => x.game_id))
console.log(`   ${games.size} of ${data.games.length} games have stories; by type:`, JSON.stringify(Object.fromEntries([...new Set(s.map((x) => x.type))].map((t) => [t, count(t)]))))
for (const x of s.slice(0, 5)) console.log(`   ${x.rarity.toFixed(2)} ${x.icon} [${x.type}] ${x.text}  (${x.team} · game ${x.game_id} ${x.day})`)
// The server loader: the same plus the last results weeks (model) and History Watch.
const { createRequire } = await import('node:module')
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { loadNflStories } = await import('../lib/stories/nfl.js')
const { modelNarrativeStories } = await import('../lib/nfl/storylines.js')
const full = await loadNflStories()
const fc = (t) => full.stories.filter((x) => x.type === t).length
check(full.stories.length >= s.length, `loader: ${full.stories.length} stories (model ${fc('model')}, history ${fc('history')}, birthday ${fc('birthday')})`)
const top = full.stories.filter((x) => x.type === 'streak').map((x) => x.rarity)
check(top.every((r) => r >= 0.6 && r <= 0.9), `streak rarity on the log scale: ${Math.min(...top).toFixed(2)}-${Math.max(...top).toFixed(2)}`)
for (const x of full.stories.filter((y) => y.type === 'model').slice(0, 2)) console.log(`   ${x.rarity.toFixed(2)} ${x.icon} [${x.type}] ${x.text}`)
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
