#!/usr/bin/env node
// Prints a day's X plan (Phoenix time, with the ET equivalent) for a SAMPLE day. TEST DATA: the games
// below are made up for the preview, not a real slate. Nothing is posted or read.
//   node --import ./scripts/_esm-resolve.mjs scripts/x-schedule-preview.mjs [YYYY-MM-DD] [mlb|nfl|mixed]
const { planDay, planLines, SCHEDULE, sportShares, phxClock, KIND_TAGS, tagOf } = await import('../lib/dash/xSchedule.js')

const arg = process.argv.slice(2)
const day = /^\d{4}-\d{2}-\d{2}$/.test(arg[0] || '') ? arg[0] : new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: SCHEDULE.tz })
const scenario = arg.find((a) => ['mlb', 'nfl', 'mixed'].includes(a)) || 'mixed'
const mk = (sport, n) => Array.from({ length: n }, (_, i) => ({ sport, startMs: Date.parse(`${day}T23:00:00Z`) + i * 36e5 }))   // TEST games
const games = scenario === 'mlb' ? mk('mlb', 12) : scenario === 'nfl' ? mk('nfl', 14) : [...mk('mlb', 6), ...mk('nhl', 5), ...mk('nfl', 1)]
const slots = planDay(day, games)
const shares = sportShares(games)
console.log(`SAMPLE PLAN (test games: ${scenario}) for ${day}, ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][phxClock(slots[0].at).dow]} Phoenix`)
console.log(`sport shares: ${Object.entries(shares).map(([s, v]) => `${s} ${(v * 100).toFixed(0)}%`).join(', ') || 'no games'}`)
console.log(planLines(slots).map((l, i) => `${String(i + 1).padStart(2)}. ${l}`).join('\n'))
console.log(`${slots.length} planned counted posts; INFO ${slots.filter((s) => s.tag === 'INFO').length}, FUN ${slots.filter((s) => s.tag === 'FUN').length}; overnight experiment ${slots.filter((s) => s.experiment).length}`)
console.log(`kinds with no tag: ${Object.keys(KIND_TAGS).filter((k) => ['scheduled', 'event'].includes(KIND_TAGS[k].mode) && !tagOf(k)).join(', ') || 'none'}`)
