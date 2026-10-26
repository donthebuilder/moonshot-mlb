// MISSING FIELDS NEVER PRINT AS null / undefined / NaN, AND X LENGTH IS X'S OWN COUNT (2026-10-26 review). TEST data only.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-missing-fields.mjs
import assert from 'node:assert/strict'

const M = await import('../lib/cards/momentPosting.js')
const N = await import('../lib/copy/notifications.js')
const X = await import('../lib/dash/xPost.js')
const P = await import('../lib/dash/postLimit.js')

let n = 0, bad = 0
const t = (name, fn) => { n++; try { fn(); console.log(`ok    ${name}`) } catch (e) { bad++; console.log(`FAIL  ${name}\n      ${e.message}`) } }
const BROKEN = /\bnull|undefined|NaN|\bat\s+(against|\.|:)|\s{2,}/
const who = { name: 'Test Skater', team: 'TST', opp: 'OPP' }

t('a goal with no clock time: no "at  against"', () => {
  const s = M.momentLine('nhl_goal', { period: 2, period_type: 'REG', time_in_period: null, score_after: null }, who)
  assert.ok(!BROKEN.test(s), s); assert.match(s, /scored in the 2nd period against OPP\.$/)
})
t('a season-goal milestone with no count: no "his nullth goal"', () => {
  const s = M.momentLine('nhl_season_goal_milestone', { season_goals: null }, who)
  assert.ok(!BROKEN.test(s), s)
  assert.match(M.momentLine('nhl_season_goal_milestone', { season_goals: 10 }, who), /his 10th goal of the season/)
})
t('a long shot with no stored price: no "+NaN" or "best of null books"', () => {
  const s = M.momentLine('long_shot_cashed', { market: 'anytime goal', best: null, books: null }, who)
  assert.ok(!BROKEN.test(s), s)
  assert.match(M.momentLine('long_shot_cashed', { market: 'anytime goal', best: 650, books: 4 }, who), /\+650 \(best of 4 books\)/)
})
t('a slate homer push with no rank: no "#undefined"', () => {
  const p = N.homer?.slateHomer || Object.values(N).find((g) => g?.slateHomer)?.slateHomer
  const r = p({ name: 'Test Hitter', n: 1, status: 'CALLED', rank: undefined, line: null })
  assert.ok(!/undefined/.test(JSON.stringify(r)), JSON.stringify(r))
})
t('a 30-point push with no teams: no "undefined vs undefined"', () => {
  const r = N.nba.thirty({ name: 'Test Guard', points: 31, team: undefined, opp: undefined, status: 'called' })
  assert.ok(!/undefined/.test(JSON.stringify(r)), JSON.stringify(r))
})
t('X length: emoji count 2, and the sender trims to X\'s count (not characters)', () => {
  assert.equal(P.xLen('ab'), 2); assert.equal(P.xLen('🏒'), 2)
  const text = Array.from({ length: 30 }, (_, i) => `🏒 Test line ${i}`).join('\n')
  const fit = X.fitToLimit(text, 280)
  assert.ok(P.xLen(fit) <= 280 && Array.from(fit).length < 280, `${P.xLen(fit)} / ${Array.from(fit).length}`)
})

console.log(bad ? `${bad}/${n} FAILED` : `OK: missing fields (${n} checks, TEST data)`)
process.exit(bad ? 1 : 0)
