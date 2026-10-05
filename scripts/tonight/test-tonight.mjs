// lib/tonight.js on TEST inputs (made up here, labelled TEST -- not real players).
//   node scripts/tonight/test-tonight.mjs
await import('../_esm-resolve.mjs')
const { tonightMlb, tonightNfl, tonightNhl, tonightNba, liningFrom } = await import('../../lib/tonight.js')
const { alignedWithBy } = await import('../../lib/numerology/align.js')
let fails = 0, n = 0
const eq = (a, b, what) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', what, '->', JSON.stringify(a), 'expected', JSON.stringify(b)) } }
const ids = (xs) => xs.map((x) => x.id)

// ── MLB: 9-man board of 9 -> top third (3) is the board; a role is CALLED ──
const board = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ player_id: i, name: `TEST M${i}`, team: 'T', game_pk: i <= 4 ? 100 : 200, game_pick_role: i === 5 ? 'HR' : '', score: 100 - i }))
const m = tonightMlb({ board, of: 9, scoreOf: (p) => p.score, games: [{ pk: 100, state: 'Live' }, { pk: 200, state: 'Preview' }],
  lines: { 2: { hr: 1, state: 'Live' }, 3: { hr: 2, state: 'Live' } } })
eq(ids(m.went), ['2', '3'], 'MLB went: the two homer hitters')
eq(m.went.find((w) => w.id === '3').note, '×2', 'MLB went: two homers noted')
eq(ids(m.still), ['1', '5'], 'MLB still: board #1 (live) then the CALLED #5 (upcoming); scorers and off-board men out')
eq(m.still.map((s) => s.when), ['now', 'later'], 'MLB still: live before upcoming')
eq(tonightMlb({ board, of: 9, games: [{ pk: 100, state: 'Final' }, { pk: 200, state: 'Final' }] }).still.length, 0, 'MLB still: final games drop out')
eq(tonightMlb({ board: [], of: 0 }), { went: [], lining: [], still: [] }, 'MLB: empty slate -> all empty')

// ── LINING UP = the Numerology page's own result, passed through ──
const rows = [{ pid: 'a', name: 'TEST A', axes: { j: 6, d: 6 } }, { pid: 'b', name: 'TEST B', axes: { j: 6, d: 2 } }, { pid: 'c', name: 'TEST C', axes: { j: 6, d: 6, p: 6 } }]
const al = alignedWithBy(6, rows, () => 0)
eq(ids(liningFrom(al.byBotScore, 6)), al.byBotScore.map((x) => x.a.pid), 'LINING UP is byBotScore as-is (2+ on the root)')
eq(liningFrom(al.byBotScore, 6).find((x) => x.id === 'c').note, '6×3', 'LINING UP notes the root and how many of his numbers')

// ── NFL: CALLED by the TD ladder, board = top third ──
const nrows = [1, 2, 3, 4, 5, 6].map((i) => ({ player_id: `n${i}`, name: `TEST N${i}`, team: 'T', scores: { TD: 80 - i } }))
const nf = tonightNfl({ rows: nrows, onBotOf: (p) => (p.player_id === 'n5' ? { market: 'GAME' } : null), tdsOf: (p) => (p.player_id === 'n1' ? 1 : 0), stateOf: (p) => (p.player_id === 'n2' ? 'in' : 'pre') })
eq(ids(nf.went), ['n1'], 'NFL went: the TD scorer')
eq(ids(nf.still), ['n2', 'n5'], 'NFL still: on-board #2 (live) then CALLED #5; #1 scored, #3-6 off the board except the call')

// ── NHL: the board row's own status; a scorer leaves STILL TO GO ──
const nh = tonightNhl({ games: [{ game: { id: 9, state: 'live' }, rows: [
  { playerId: 1, name: 'TEST Hockey One', team: 'T', score: 90, status: 'called' },
  { playerId: 2, name: 'TEST Hockey Two', team: 'T', score: 80, status: 'board' },
  { playerId: 3, name: 'TEST Hockey Three', team: 'T', score: 70, status: 'off' }] }],
  scorers: [{ id: 1, name: 'T. One', team: 'T' }, { id: 1, name: 'T. One', team: 'T' }] })
eq(nh.went.map((w) => [w.name, w.note]), [['TEST Hockey One', '×2']], 'NHL went: full name from the board, two goals noted')
eq(ids(nh.still), ['2'], 'NHL still: the board man who hasn’t scored; off out')

// ── NBA: locked rows only (a preview isn't a call) ──
const nb = tonightNba({ rows: [{ playerId: 1, name: 'TEST B1', team: 'T', gameId: 7, score: 70, status: 'called', locked: true },
  { playerId: 2, name: 'TEST B2', team: 'T', gameId: 7, score: 60, status: 'board', locked: false }],
  games: [{ id: 7, state: 'pre' }], cleared: [] })
eq(ids(nb.still), ['1'], 'NBA still: locked call only')
eq(nb.lining, [], 'NBA lining: none (no NBA numerology) -- not faked')
console.log(`${n - fails}/${n} checks passed (TEST inputs)`)
process.exit(fails ? 1 : 0)
