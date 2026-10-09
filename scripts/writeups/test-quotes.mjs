// THE RECEIPTS, TESTED (BATCH-GAME-WRITEUP). lib/dash/quoteFor.js on TEST rows
// (made up here, labelled TEST -- ids and names are not real posts):
//   MLB: the lifted lookup decides exactly as the homers tick's closure did.
//   NFL: only a CALLED scorer named in a FEATURED write-up with a real X id quotes.
//   node scripts/writeups/test-quotes.mjs
await import('../_esm-resolve.mjs')
const { mlbQuotes, nflWriteupQuotes } = await import('../../lib/dash/quoteFor.js')
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
eq(m.calledAtLine({ player_id: 10, game_pk: 900, _test_status: 'called' }), '✅ Called at 5:10 PM ET', 'MLB: the called-at line')
eq(mlbQuotes({ pre: { x_post_id: '111', payload: { picks: [{ player_id: 13 }] } }, gamePosts: [], callStatus: status }).quoteFor({ player_id: 13, _test_status: 'called' }), '111', 'MLB: an old pregame row (picks only) still quotes')

// ── NFL (TEST rows) ──
const posts = [
  { kind: 'writeup_nfl_401', x_post_id: '333', payload: { game_id: '401', featured: 'SNF', called: ['00-1', '00-2'] } },
  { kind: 'writeup_nfl_402', x_post_id: 'dry', payload: { game_id: '402', featured: 'MNF', called: ['00-3'] } },
  { kind: 'writeup_nfl_403', x_post_id: null, payload: { game_id: '403', featured: null, called: ['00-4'] } },
]
const r = nflWriteupQuotes(posts)
eq(r({ game_id: '401', gsis_id: '00-1' }, true)?.id, '333', 'NFL: called scorer in a featured write-up quotes it')
eq(r({ game_id: '401', gsis_id: '00-1' }, true)?.line, 'Called pregame. He scored.', 'NFL: the receipt line')
eq(r({ game_id: '401', gsis_id: '00-1' }, false), null, 'NFL: not CALLED -> no receipt')
eq(r({ game_id: '401', gsis_id: '00-9' }, true), null, 'NFL: not in the write-up -> no receipt')
eq(r({ game_id: '402', gsis_id: '00-3' }, true), null, "NFL: a dry write-up is never quoted")
eq(r({ game_id: '403', gsis_id: '00-4' }, true), null, 'NFL: a non-featured (Discord-only) write-up is never quoted')
console.log(`${n - fails}/${n} receipt checks passed (TEST rows)`)
process.exit(fails ? 1 : 0)
