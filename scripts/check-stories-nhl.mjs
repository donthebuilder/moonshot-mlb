// lib/stories/nhl.js.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-stories-nhl.mjs
// 1. today (preseason): the loader runs; past-season numbers make no stories.
// 2. TEST: real 2025-26 hot sticks / special teams (the readers' stale
//    fallback, relabelled not-stale HERE ONLY) against a real 2026-04 slate,
//    so every path is exercised before opening night. Not shown anywhere.
import { createRequire } from 'node:module'
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { loadNhlStories, buildNhlStories } = await import('../lib/stories/nhl.js')
const { readHotSticks } = await import('../lib/nhl/hotSticks.js')
const { readSpecialTeams } = await import('../lib/nhl/spots.js')
const { scoreFor } = await import('../lib/nhl/api.js')
const { reduceScoreDay } = await import('../lib/nhl/reduce.js')
const { easternToday } = await import('../lib/data.js')

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }

const today = easternToday()
const live = await loadNhlStories(today)
const types = [...new Set(live.stories.map((s) => s.type))]
check(live.stories.every((s) => s.game_id && s.source && s.text), `today ${today}: ${live.games.length} games, ${live.stories.length} stories (${types.join(', ') || 'none'}), all tied to a game`)
check(!live.stories.some((s) => ['hot', 'special', 'history'].includes(s.type)), 'preseason: no hot-stick / special-teams / history story from last season\'s numbers')

const [hot, st] = await Promise.all([readHotSticks(), readSpecialTeams()])
const date = '2026-04-09'
const games = reduceScoreDay(await scoreFor(date)).games.filter((g) => g.scheduleState === 'OK')
const t = buildNhlStories({ day: date, games, hot: { ...hot, stale: false }, st: { ...st, stale: false }, rest: { [games[0]?.away?.abbrev]: { b2b: true, last: '2026-04-08' } } })
const by = {}
for (const s of t) by[s.type] = (by[s.type] || 0) + 1
check(games.length > 0 && t.length > 0 && t.every((s) => s.game_id && s.day === date), `TEST ${date}: ${games.length} games -> ${t.length} stories ${JSON.stringify(by)}`)
// Find a real slate where a top-5 power play meets a bottom-5 penalty kill.
let sp = t.filter((s) => s.type === 'special')
for (const d of ['2026-04-01', '2026-04-02', '2026-04-04', '2026-04-05', '2026-04-07', '2026-04-11', '2026-04-12']) {
  if (sp.length) break
  const gs = reduceScoreDay(await scoreFor(d)).games.filter((g) => g.scheduleState === 'OK')
  sp = buildNhlStories({ day: d, games: gs, st: { ...st, stale: false } }).filter((s) => s.type === 'special')
}
check(sp.length > 0, `special teams fires on a real April slate (${sp.length}): ${sp[0]?.text || '-'}`)
check(sp.every((s) => /\d+\.\d%, \d+(st|nd|rd|th)\) meets .*\d+\.\d%, \d+(st|nd|rd|th)\)$/.test(s.text)), 'special teams lines read as percentages with league ranks')
const pp = st.teams.map((x) => x.ppPct)
check(pp.every((v) => v > 0 && v < 1), `ppPct is a fraction (${Math.min(...pp).toFixed(3)}-${Math.max(...pp).toFixed(3)}), so x100 prints a percent`)
for (const ty of Object.keys(by)) { const s = t.find((x) => x.type === ty); console.log(`   ${s.rarity.toFixed(2)} ${s.icon} [${ty}] ${s.text}`) }
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
