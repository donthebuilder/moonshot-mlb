// THE RECEIPTS, TESTED (BATCH-GAME-WRITEUP). lib/dash/quoteFor.js on TEST rows
// (made up here, labelled TEST -- ids and names are not real posts):
//   MLB: the lifted lookup decides exactly as the homers tick's closure did.
//   NFL: only a CALLED scorer named in a FEATURED write-up with a real X id quotes.
//   node scripts/writeups/test-quotes.mjs
await import('../_esm-resolve.mjs')
const { mlbQuotes, nflWriteupQuotes, slateQuoteFor, pregameQuotes, quoteKinds, receiptLineOf } = await import('../../lib/dash/quoteFor.js')
let fails = 0, n = 0
const eq = (a, b, what) => { n++; if (a !== b) { fails++; console.log('FAIL', what, '->', a, 'expected', b) } }

// ── MLB (TEST rows) ──
const status = (row) => row._test_status
// 2026-10-09: the quoted set is the NAMED set (payload.named), never the old `called` list
const pre = { x_post_id: '111', payload: { named: ['10', '11'], called: ['10', '11', '12'] } }
const gamePosts = [{ kind: 'call_900', x_post_id: '222', payload: { game_pk: 900, player_id: 10, posted_at: '2026-10-04T21:10:00Z' } }]
const m = mlbQuotes({ pre, gamePosts, callStatus: status })
eq(m.quoteFor({ player_id: 10, game_pk: 900, _test_status: 'called' }), '222', 'MLB: a called homer quotes its game call first')
eq(m.quoteFor({ player_id: 11, game_pk: 901, _test_status: 'called' }), '111', 'MLB: else the morning post when he was on it')
eq(m.quoteFor({ player_id: 11, game_pk: 901, _test_status: 'board' }), null, 'MLB: ON THE BOARD quotes nothing')
eq(m.quoteFor({ player_id: 12, game_pk: 901, _test_status: 'called' }), null, 'MLB: called but NOT NAMED in the morning post (even if in the old `called` list) -> nothing')
eq(m.calledAtLine({ player_id: 10, game_pk: 900, _test_status: 'called' }), 'WE HAD HIM 🔥 Called at 5:10 PM ET.', 'MLB: the called-at line (the receipt words, 2026-10-20)')
eq(mlbQuotes({ pre: { x_post_id: '111', payload: { picks: [{ player_id: 13 }] } }, gamePosts: [], callStatus: status }).quoteFor({ player_id: 13, _test_status: 'called' }), '111', 'MLB: an old pregame row (picks only) still quotes')

// ── THE SLATE (TEST rows, 2026-10-09): the morning post names players of several sports; MLB reads named_by_sport.mlb ──
const slate = { x_post_id: '444', payload: { named: ['10', '00-1', '7'], named_by_sport: { mlb: ['10'], nfl: ['00-1'], nhl: ['7'], nba: [] } } }
const ms = mlbQuotes({ pre: slate, gamePosts: [], callStatus: status })
eq(ms.quoteFor({ player_id: 10, game_pk: 1, _test_status: 'called' }), '444', 'SLATE: a called homer the Slate names quotes it')
eq(ms.quoteFor({ player_id: 7, game_pk: 1, _test_status: 'called' }), null, "SLATE: a hockey id in `named` never quotes a hitter")
eq(mlbQuotes({ pre: { x_post_id: '444', payload: { named: ['00-1'], named_by_sport: { mlb: [], nfl: ['00-1'], nhl: [], nba: [] } } }, gamePosts: [], callStatus: status }).quoteFor({ player_id: 10, _test_status: 'called' }), null, 'SLATE: named no hitter -> nothing')
eq(slateQuoteFor('nfl', slate)('00-1'), '444', 'SLATE: a named football player quotes it')
eq(slateQuoteFor('nfl', slate)('00-2'), null, 'SLATE: a football player it does not name does not')
eq(slateQuoteFor('nhl', { x_post_id: 'dry', payload: slate.payload })('7'), null, 'SLATE: a Slate that never went to X quotes nothing')

// ── NFL (TEST rows) ──
const posts = [
  { kind: 'writeup_nfl_401', x_post_id: '333', payload: { game_id: '401', featured: 'SNF', called: ['00-1', '00-2'] } },
  { kind: 'writeup_nfl_402', x_post_id: 'dry', payload: { game_id: '402', featured: 'MNF', called: ['00-3'] } },
  { kind: 'writeup_nfl_403', x_post_id: null, payload: { game_id: '403', featured: null, called: ['00-4'] } },
]
const r = nflWriteupQuotes(posts)
eq(r({ game_id: '401', gsis_id: '00-1' }, true)?.id, '333', 'NFL: called scorer in a featured write-up quotes it')
eq(r({ game_id: '401', gsis_id: '00-1' }, true)?.line, 'WE HAD HIM 🔥 Called pregame.', 'NFL: the receipt line (no posted time on this TEST row)')
eq(r({ game_id: '401', gsis_id: '00-1' }, false), null, 'NFL: not CALLED -> no receipt')
eq(r({ game_id: '401', gsis_id: '00-9' }, true), null, 'NFL: not in the write-up -> no receipt')
eq(r({ game_id: '402', gsis_id: '00-3' }, true), null, "NFL: a dry write-up is never quoted")
eq(r({ game_id: '403', gsis_id: '00-4' }, true), null, 'NFL: a non-featured (Discord-only) write-up is never quoted')
// ── EVERY SPORT (2026-10-20, pregameQuotes): the most specific post that NAMED him, a real tweet id, the event's own day ──
const D = '2026-10-21'
const all = [
  { day: D, kind: 'slate', x_post_id: '501', seen_at: '2026-10-21T13:12:00Z', payload: { named_by_sport: { nhl: ['8', '9', '6'], nba: ['20'] } } },
  { day: D, kind: 'nhl_slate', x_post_id: '502', payload: { named: ['8', '9'], posted_at: '2026-10-21T21:30:00Z' } },
  { day: D, kind: 'card_nhl', x_post_id: '503', payload: { named: ['9'], posted_at: '2026-10-21T20:00:00Z' } },
  { day: D, kind: 'writeup_nhl_77', x_post_id: '504', payload: { game_id: '77', named: ['9'], posted_at: '2026-10-21T22:05:00Z' } },
  { day: D, kind: 'writeup_nhl_78', x_post_id: 'skipped', payload: { game_id: '78', named: ['6'] } },
  { day: '2026-10-20', kind: 'card_nhl', x_post_id: '599', payload: { named: ['5'] } },
  { day: D, kind: 'card_nba', x_post_id: '601', payload: { named: ['20'], posted_at: '2026-10-21T22:00:00Z' } },
]
const nq = pregameQuotes('nhl', all)
eq(nq({ day: D, playerId: '9', gameId: '77' })?.id, '504', 'NHL: his game write-up first')
eq(nq({ day: D, playerId: '9', gameId: '70' })?.id, '503', 'NHL: another game: THE CARD next')
eq(nq({ day: D, playerId: '8', gameId: '77' })?.id, '502', "NHL: then LAMP's slate")
eq(nq({ day: D, playerId: '6', gameId: '78' })?.id, '501', 'NHL: a write-up that never went to X is skipped; THE SLATE last')
eq(nq({ day: D, playerId: '5', gameId: '1' }), null, "NHL: yesterday's card never quotes today's goal")
eq(nq({ day: D, playerId: '4', gameId: '1' }), null, 'NHL: named nowhere -> no quote')
eq(pregameQuotes('nba', all)({ day: D, playerId: '20', gameId: '9' })?.id, '601', 'NBA: THE CARD before THE SLATE')
eq(receiptLineOf(nq({ day: D, playerId: '9', gameId: '77' })), 'WE HAD HIM 🔥 Called at 6:05 PM ET.', 'the line: the quoted post\'s own ET time')
eq(receiptLineOf(nq({ day: D, playerId: '6', gameId: '78' })), 'WE HAD HIM 🔥 Called at 9:12 AM ET.', 'a post with no posted_at uses its row time')
eq(receiptLineOf(null), null, 'no quote, no line')
eq(quoteKinds('nhl').join(), 'card_nhl,nhl_slate,nhl_board,slate', 'the kinds NHL reads')
// the sender never doubles it: a quoted alert already carries its receipt (lib/posts/receiptLine.js)
const RL = await import('../../lib/posts/receiptLine.js')
eq(RL.withReceiptLine('🤖 CALLED IT\n\nTEST SCORES.\n\nWE HAD HIM 🔥 Called at 6:05 PM ET.', 'nhlgoal'), '🤖 CALLED IT\n\nTEST SCORES.\n\nWE HAD HIM 🔥 Called at 6:05 PM ET.', 'a quoted alert gets no second receipt line')
console.log(`${n - fails}/${n} receipt checks passed (TEST rows)`)
process.exit(fails ? 1 : 0)
