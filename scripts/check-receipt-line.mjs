// THE RECEIPT LINE, CHECKED (2026-10-20: "makeusre all the tweet get that notice too expsically our write ups on players").
// lib/posts/receiptLine.js: every X post that names one of our calls ends on its sport's "Locked before ... Graded against
// exactly that."; a post that names no call never does; the line is never doubled and never costs the post a word. TEST data.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-receipt-line.mjs
import { RECEIPT_LINE, CARD_RECEIPT_LINE, receiptLineFor, withReceiptLine } from '../lib/posts/receiptLine.js'
import { PUBLIC_BANNED } from '../lib/card/text.js'
import { KIND_TAGS } from '../lib/dash/xSchedule.js'

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }

// 1. the words: one shape, every sport, never "advice"
for (const [s, l] of Object.entries(RECEIPT_LINE)) ok(/^Locked before .+\. Graded against exactly that\.$/.test(l) && !/advice|guarantee/i.test(l), `${s}: ${l}`)

// 2. which posts: the calls do, the rest don't
const YES = ['board', 'nfl_board', 'nhl_board', 'card_mlb', 'card_nfl', 'card_ls_nhl', 'card_today', 'card_don_mlb', 'card_result_mlb', 'slate', 'nhl_slate',
  'writeup_nfl_401873010', 'call_777001', 'writeup_nba_1', 'receipt', 'weekly', 'nfl_results', 'top_totals', 'nba_top_totals', 'nfl_whyboard']
const NO = ['facts', 'hotcontact', 'matchup_hr', 'list_mlb', 'list_nfl', 'longshots', 'nfl_longshots', 'nfl_spotlight', 'nfl_milestone', 'multi_club', 'numerology',
  'moment_mlb_hr_1', 'postseason_mlb_1_2', 'nfl_bigweek', 'nhlhardest', 'not_a_kind']
for (const k of YES) ok(receiptLineFor(k) != null, `${k} carries the line`)
for (const k of NO) ok(receiptLineFor(k) == null, `${k} carries no line`)
for (const k of Object.keys(KIND_TAGS).filter((k) => /poll|pick_one|reveal/.test(k))) ok(receiptLineFor(k) == null, `${k} (a poll) carries no line`)
// THE CARD never prints "lock": its kinds say "Called before", and pass the card's own banned-word list
for (const k of ['card_mlb', 'card_nhl', 'card_result_nfl', 'card_ls_nba', 'card_don_nhl', 'card_don_nhl_n_man_1_result', 'card_double_result', 'card_today']) {
  const l = receiptLineFor(k)
  ok(l && /^Called before/.test(l) && !PUBLIC_BANNED.some((re) => re.test(l)), `${k}: "${l}" (no "lock")`)
}
ok(CARD_RECEIPT_LINE.nhl === 'Called before puck drop. Graded against exactly that.', 'the card line is the same promise')
ok(receiptLineFor('writeup_nfl_1') === RECEIPT_LINE.nfl && receiptLineFor('card_nhl') === CARD_RECEIPT_LINE.nhl && receiptLineFor('board') === RECEIPT_LINE.mlb, 'each sport its own words')
ok(receiptLineFor('slate') === RECEIPT_LINE.all && receiptLineFor('receipt') === RECEIPT_LINE.all, 'a cross-sport post: the cross-sport words')
ok(receiptLineFor('slate', { sport: 'mlb' }) === RECEIPT_LINE.all, 'a cross-sport post routed to one sport\'s room keeps the cross-sport words')

// 3. a live alert: only a CALLED one
ok(receiptLineFor('homer', { text: '🤖 CALLED IT\n\nTEST Hitter goes deep.' }) === RECEIPT_LINE.mlb, 'a CALLED homer carries it')
ok(receiptLineFor('homer', { text: 'TEST Hitter goes deep.\nNot on the board.' }) == null, 'a homer we did not call carries none')
ok(receiptLineFor('td', { text: 'TEST Back FINDS THE END ZONE.' }) == null, 'an uncalled TD carries none')

// 4. placement: last block, once, never trimming the post
const post = '🏈 TEST BOARD\n\nTEST Player A\nTEST Player B'
ok(withReceiptLine(post, 'nfl_board') === `${post}\n\n${RECEIPT_LINE.nfl}`, 'appended as the last block')
ok(withReceiptLine(withReceiptLine(post, 'nfl_board'), 'nfl_board') === `${post}\n\n${RECEIPT_LINE.nfl}`, 'never doubled')
ok(withReceiptLine(post, 'facts') === post, 'a fact post is left as it is')
ok(withReceiptLine(post, 'nfl_board', { limit: post.length + 5 }) === post, 'no room: the post goes without it, untrimmed')
ok(withReceiptLine('🤖 CALLED IT\n\nTEST Hitter goes deep. Called before first pitch: #3 on the board.', 'homer') === '🤖 CALLED IT\n\nTEST Hitter goes deep. Called before first pitch: #3 on the board.', 'an alert that already says "before first pitch" is not repeated')

console.log(bad ? `${bad}/${n} FAILED` : `check-receipt-line: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
