#!/usr/bin/env node
// lib/dayLine.js on TEST schedules (made-up games, labelled; not a real slate).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-dayline.mjs
import assert from 'node:assert/strict'
const { dayLine, todayLine, tally } = await import('../lib/dayLine.js')
const TZ = 'America/New_York'
let n = 0
const ok = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }
const g = (away, home, hhmmET, state = 'pre', day = '2026-10-04') => ({ away, home, state, start: Date.parse(`${day}T${hhmmET}:00-04:00`) })
const noonET = Date.parse('2026-10-04T12:00:00-04:00')

ok('NFL Sunday, mixed states: the count, the states, the next start', () => {
  const games = [g('TST', 'AAA', '13:00', 'final'), g('TST', 'BBB', '13:00', 'live'), g('TST', 'CCC', '16:25'), g('TST', 'DDD', '20:20')]
  const d = dayLine(games, { sport: 'nfl', date: '2026-10-04', now: noonET, label: 'Week 5', tz: TZ })
  assert.equal(d.eyebrow, 'SUNDAY · WEEK 5')
  assert.equal(d.lead, '4 games: 1 live, 1 final, 2 still to start, next at 4:25 PM EDT.')
  assert.equal(d.accent, 'Grading as they land.')
  assert.equal(d.count.label, 'NEXT KICKOFF'); assert.ok(d.count.ms > 0)
})
ok('Monday night, one game: matchup and kickoff time', () => {
  const d = dayLine([g('KCT', 'BLT', '20:15', 'pre', '2026-10-05')], { sport: 'nfl', date: '2026-10-05', now: noonET, tz: TZ })
  assert.equal(d.lead, 'KCT at BLT, 8:15 PM EDT.')
  assert.equal(d.eyebrow, 'MONDAY')
})
ok('no games: says so and names the next day, one-game next', () => {
  const d = dayLine([], { sport: 'nfl', date: '2026-10-06', now: noonET, next: { date: '2026-10-08', games: [g('SFT', 'LAT', '20:15', 'pre', '2026-10-08')] }, tz: TZ })
  assert.equal(d.lead, 'No football today.')
  assert.equal(d.accent, 'Next: Thursday, SFT at LAT, 8:15 PM EDT.')
  assert.equal(d.count.label, 'NEXT KICKOFF')
})
ok('no games, several next: "Next: Thursday, 6 games."', () => {
  const next = { date: '2026-10-08', games: Array.from({ length: 6 }, (_, i) => g(`A${i}`, `H${i}`, '19:00', 'pre', '2026-10-08')) }
  assert.equal(dayLine([], { sport: 'nhl', date: '2026-10-06', next, tz: TZ }).accent, 'Next: Thursday, 6 games.')
})
ok('no games and nothing scheduled: no invented next', () => {
  const d = dayLine([], { sport: 'mlb', date: '2026-11-10', tz: TZ })
  assert.equal(d.lead, 'No baseball today.'); assert.equal(d.accent, '')
})
ok('no games, next known only by date: names the day, no count', () => {
  assert.equal(dayLine([], { sport: 'nhl', date: '2026-09-28', next: { date: '2026-09-29' }, tz: TZ }).accent, 'Next: Tuesday.')
})
ok('all final', () => {
  const d = dayLine([g('A', 'B', '13:05', 'final'), g('C', 'D', '19:05', 'final')], { sport: 'mlb', date: '2026-10-04', tz: TZ })
  assert.equal(d.lead, '2 games: 2 final.'); assert.equal(d.accent, 'Every one final.')
})
ok('nothing started yet: count + first start', () => {
  const d = dayLine([g('A', 'B', '13:08'), g('C', 'D', '16:38')], { sport: 'mlb', date: '2026-10-04', now: noonET, label: 'Wild Card', tz: TZ })
  assert.equal(d.lead, '2 games, first pitch 1:08 PM EDT.')
  assert.equal(d.eyebrow, 'SUNDAY · WILD CARD')
})
ok('postponed is counted, not called live', () => {
  const t = tally([g('A', 'B', '13:00', 'postponed'), g('C', 'D', '13:00', 'final')])
  assert.equal(t.postponed, 1); assert.equal(t.final, 1)
})
ok('the today line for inner pages', () => {
  assert.equal(todayLine([g('KCT', 'BLT', '20:15', 'pre', '2026-09-28')], { sport: 'nfl', date: '2026-09-28', now: Date.parse('2026-09-28T12:00:00-04:00'), tz: TZ }), 'MON, SEP 28 · 1 game (KCT at BLT 8:15 PM EDT)')
  assert.equal(todayLine([], { sport: 'mlb', date: '2026-09-28', next: { date: '2026-09-29', games: [g('A', 'B', '13:08', 'pre', '2026-09-29')] }, tz: TZ }), 'MON, SEP 28 · no games · next Tuesday')
  assert.equal(todayLine([], { sport: 'nhl', date: '2026-09-28', next: { date: '2026-09-29' }, tz: TZ }), 'MON, SEP 28 · no games · next Tuesday')
})
console.log(`\n${n} checks passed`)
