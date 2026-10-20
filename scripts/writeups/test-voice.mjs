// THE CALL'S VOICE, TESTED (2026-10-20). lib/writeups/voice.js: the hook under the headline and the network ask last, on
// every sport's write-up, without ever costing a call, a case or the price. TEST data only.
//   node --import ./scripts/_esm-resolve.mjs scripts/writeups/test-voice.mjs
import { CALL_HOOKS, CALL_ASKS, VOICE_WORDS, callVoice, withVoice } from '../../lib/writeups/voice.js'
import { SWEARS, OVERCLAIM } from '../../lib/facts/check.js'

let bad = 0, n = 0
const ok = (cond, m) => { n += 1; if (!cond) { bad += 1; console.log('FAIL ' + m) } }

// 1. the words: no digit, no swearing, no claim past the board, no betting word; every hook points down, every ask asks
for (const l of VOICE_WORDS) {
  ok(!/\d/.test(l), `no digit: ${l}`)
  ok(!SWEARS.test(l), `no swearing: ${l}`)
  ok(!OVERCLAIM.test(l), `no overclaim: ${l}`)
  ok(!/\b(bet|lock|hammer|parlay|guarantee)/i.test(l), `no betting word: ${l}`)
}
for (const s of ['mlb', 'nfl', 'nhl', 'nba']) ok(CALL_HOOKS[s].length >= 2 && CALL_HOOKS[s].every((h) => h.endsWith('\u{1F447}')), `${s} hooks`)
ok(CALL_ASKS.every((a) => a.endsWith('?')), 'every ask is a question')

// 2. the pick: the same game always gets the same lines; nobody called = no voice
const w = { sport: 'nfl', away: 'TSA', home: 'TSB', when: 'Sun 1:00 PM ET', players: [{}] }
ok(JSON.stringify(callVoice(w)) === JSON.stringify(callVoice({ ...w })), 'stable for one game')
ok(callVoice({ ...w, players: [] }) === null, 'no players, no voice')
const spread = new Set(['TSA', 'TSC', 'TSD', 'TSE', 'TSF', 'TSG'].map((a) => callVoice({ ...w, away: a }).hook))
ok(spread.size > 1, 'a slate of games does not all get the same hook')

// 3. the placement
const v = { hook: 'TEST hook \u{1F447}', ask: 'TEST ask?' }
const full = withVoice('HEAD\n\nThe one sentence.\n\nA\nB\nC', v)
ok(full === 'HEAD\n\nTEST hook \u{1F447}\nThe one sentence.\n\nA\nB\nC\n\nTEST ask?', 'hook on top of the one-line sentence, ask last')
const mid = withVoice('HEAD\n\nA\nB\nC\nD', v)
ok(mid === 'HEAD\n\nTEST hook \u{1F447}\n\nA\nB\nC\nD\n\nTEST ask?', 'hook as its own block over a longer block (no 5-line stack)')
ok(withVoice('HEAD\nrow one', v, 1000) === 'HEAD\nrow one\n\nTEST ask?', 'a tight 280 version (no blank under the head) gets no hook')
ok(withVoice('HEAD\n\nrow', null) === 'HEAD\n\nrow', 'no voice = the body as it was')

// 4. the 280 budget: the hook goes first, then the ask; the body is never cut
const body = 'HEAD\n\n' + 'x'.repeat(100)
ok(withVoice(body, v, body.length + 12).endsWith('TEST ask?') && !withVoice(body, v, body.length + 12).includes('hook'), 'room for the ask only: hook shed')
ok(withVoice(body, v, body.length) === body, 'no room: the body alone')
ok(withVoice(body, v, 10) === body, 'even over budget the body is never cut (the caller decides)')

console.log(bad ? `${bad}/${n} FAILED` : `${n} voice checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
