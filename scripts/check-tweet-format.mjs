// TWEET SPACING GUARD. Renders a sample of the real X text builders with TEST data and asserts the
// text that goes out has clean spacing, and that the one normaliser (lib/dash/tweetFormat.js, applied
// in postToX) fixes ragged input without touching URLs / @handles / #hashtags or growing a post.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-tweet-format.mjs
import { normalizeTweet } from '../lib/dash/tweetFormat.js'
import { renderSlate, xLen } from '../lib/posts/slate.js'
import { renderLampSlate } from '../lib/posts/lampSlate.js'
import { renderReceipt } from '../lib/posts/receipt.js'
import { longshotsText } from '../lib/dash/longshotsPost.js'
import { xCardText, todayText, longShotText } from '../lib/card/text.js'
import { stripLinks } from '../lib/dash/xPolicy.js'

let bad = 0
const fail = (msg) => { bad += 1; console.log('ERROR ' + msg) }
const LIMIT = 280
const problems = (t) => {
  const out = []
  if (/ {2,}/.test(t)) out.push('double space')
  if (/\n{3,}/.test(t)) out.push('3+ newlines')
  if (/[ \t]+(\n|$)/.test(t)) out.push('trailing space')
  if (/(^|\n)[ \t]+/.test(t)) out.push('leading space')
  if (/^\n|\n$/.test(t)) out.push('leading/trailing blank line')
  if (/[^\s.] [,.!?:;](?=\s|$)/.test(t) && !/https?:\/\/\S+ [,.!?:;](?=\s|$)/.test(t)) out.push('space before punctuation')
  return out
}
const check = (name, text) => {
  if (!text) return fail(`${name}: builder returned no text (test data should render)`)
  const p = problems(text)
  if (p.length) fail(`${name}: ${p.join(', ')}  ${JSON.stringify(text.slice(0, 120))}`)
  if (xLen(text) > LIMIT) fail(`${name}: ${xLen(text)} > ${LIMIT}`)
  const n = normalizeTweet(text)
  if (problems(n).length) fail(`${name}: normaliser left ${problems(n).join(', ')}`)
  if (xLen(n) > xLen(text)) fail(`${name}: normaliser grew the post`)
  if (normalizeTweet(n) !== n) fail(`${name}: normaliser not idempotent`)
}

// ── the normaliser itself (TEST strings)
const ragged = '  TEST HEAD  \r\n\r\n\r\n\r\nTEST  Player  One ,  (TST)  vs  OPP .  \n   \n\n\nsee https://example.test/a?b=1 . and @test_handle , #testtag !  \n\n'
const fixed = normalizeTweet(ragged)
check('normaliser sample', fixed)
if (!fixed.includes('https://example.test/a?b=1 .')) fail('normaliser touched a URL or the mark after it')
if (!fixed.includes('@test_handle,')) fail('handle edited or comma kept apart')
if (!fixed.includes('#testtag!')) fail('hashtag edited or mark kept apart')
if (normalizeTweet('avg .300 and ...') !== 'avg .300 and ...') fail('normaliser changed .300 / ellipsis')
if (normalizeTweet('a\n\n\n\nb') !== 'a\n\nb') fail('3+ newlines not one blank line')
if (normalizeTweet(stripLinks('TEST line  https://example.test/x  ok .')) !== 'TEST line ok.') fail('stripLinks leftover not cleaned: ' + JSON.stringify(normalizeTweet(stripLinks('TEST line  https://example.test/x  ok .'))))
if (normalizeTweet('```\na   b\n```') !== '```\na   b\n```') fail('code fence altered')

// ── real builders, TEST data
const cand = (sport, i, extra = {}) => ({ sport, id: `t${sport}${i}`, name: `TEST Player ${sport.toUpperCase()}${i}`, teamName: 'TEST Club', rank: i, of: 20, proof: '#1 of 20 tonight', ...extra })
try {
  const s = renderSlate({ day: '2026-10-09', cotn: cand('mlb', 1), lines: [cand('nfl', 2), cand('nhl', 3)], activeSports: ['mlb', 'nfl', 'nhl'] })
  check('slate', s.text)
} catch (e) { fail('slate threw ' + e.message) }
try {
  const picks = [1, 2, 3, 4].map((i) => ({ name: `TEST Skater ${i}`, team: 'TST', opp: 'OPP', fact: 'shots 99th' }))
  const l = renderLampSlate({ day: '2026-10-09', picks, calledCount: 9, allIn: false })
  check('lampSlate', l && l.text)
} catch (e) { fail('lampSlate threw ' + e.message) }
try {
  const graded = [{ sport: 'mlb', id: 'a', name: 'TEST Hitter A', market: 'home run', outcome: 'cashed' }, { sport: 'nhl', id: 'b', name: 'TEST Skater B', market: 'goal', outcome: 'missed' }]
  check('receipt', renderReceipt({ day: '2026-10-09', graded }).text)
} catch (e) { fail('receipt threw ' + e.message) }
try {
  const rows = [1, 2, 3].map((i) => ({ id: `l${i}`, name: `TEST Longshot ${i}`, team: 'TST', median: 400 + i, score: 70 - i }))
  check('longshots', longshotsText({ sport: 'mlb', market: 'HR', longAt: 400, rows }, Date.now(), { rows }))
} catch (e) { fail('longshots threw ' + e.message) }
try {
  const leg = { player_id: 'p1', name: 'TEST Hitter', team: 'TST', opp: 'OPP', market: 'anytime', status: 'called', why: 'TEST why line' }
  check('card x', xCardText({ sport: 'mlb', day: '2026-10-09', straight: leg }).text)
  check('card today', todayText({ day: '2026-10-09', lead: { sport: 'mlb', leg } }).text)
  const ls = longShotText({ sport: 'mlb', day: '2026-10-09', leg: { ...leg, price: { median: 450, books: 3 } } }).text
  if (ls) check('card longshot', ls)
} catch (e) { fail('card threw ' + e.message) }

console.log(bad ? `\n${bad} problem(s)` : 'check-tweet-format: OK')
process.exit(bad ? 1 : 0)
