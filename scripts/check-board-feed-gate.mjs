// THE BOARD FEEDS KEEP THE PAID PICKS PAID (lib/members/boardGate.js, 2026-10-26). TEST data only.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-board-feed-gate.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const G = await import('../lib/members/boardGate.js')
let n = 0, bad = 0
const t = (name, fn) => { n++; try { fn(); console.log(`ok    ${name}`) } catch (e) { bad++; console.log(`FAIL  ${name}\n      ${e.message}`) } }
const NOW = Date.parse('2026-10-26T20:00:00Z')
const LATER = '2026-10-26T23:00:00Z', EARLIER = '2026-10-26T18:00:00Z'
const row = (id, status, extra = {}) => ({ playerId: id, name: `Test ${id}`, status, score: 80, why: 'TEST why', reason: 'TEST', pct: { a: 90 }, role: 'TOP', context: { role: 'TOP', nightRank: 1, goalGameProbability: 0.4 }, hit: null, ...extra })

t('the member address: only the two board feeds get m=1, once, and only for a member', () => {
  assert.equal(G.withMemberFeed('/api/lamp/board', true), '/api/lamp/board?m=1')
  assert.equal(G.withMemberFeed('/api/buckets/board?market=reb', true), '/api/buckets/board?market=reb&m=1')
  assert.equal(G.withMemberFeed('https://x.test/api/lamp/board?date=2026-10-26', true), 'https://x.test/api/lamp/board?date=2026-10-26&m=1')
  assert.equal(G.withMemberFeed('/api/lamp/board?m=1', true), '/api/lamp/board?m=1')
  assert.equal(G.withMemberFeed('/api/lamp/board', false), '/api/lamp/board')
  assert.equal(G.withMemberFeed('/api/lamp/scores', true), '/api/lamp/scores')
  assert.equal(G.withMemberFeed(null, true), null)
})
t('LAMP shape: an open CALLED pick (not free) is drawn as ON THE BOARD with no score, why or role', () => {
  const board = { games: [{ game: { id: 1, startUtc: LATER }, rows: [row('a', 'called'), row('b', 'called'), row('c', 'board')] }] }
  const { board: out, hidden } = G.gateBoard(board, { freeIds: new Set(['a']), now: NOW })
  const [a, b, c] = out.games[0].rows
  assert.equal(hidden, 1)
  assert.equal(a.status, 'called'); assert.equal(a.score, 80)                               // a free-four pick keeps everything
  assert.equal(b.status, 'board'); assert.equal(b.score, null); assert.equal(b.why, null); assert.equal(b.role, null)
  assert.equal(b.context.role, null); assert.equal(b.context.goalGameProbability, null); assert.equal(b.name, 'Test b')
  assert.deepEqual(c, board.games[0].rows[2])                                                // an ON THE BOARD row is untouched
  assert.equal(board.games[0].rows[1].status, 'called', 'the input board is not changed')
  assert.ok(!JSON.stringify(out).includes('"status":"called","score":80,"why":"TEST why","reason":"TEST","pct":{"a":90},"role":"TOP","context":{"role":"TOP","nightRank":1,"goalGameProbability":0.4},"hit":null,"playerId":"b"'))
})
t('a started game or a graded pick is public proof and keeps its CALLED label', () => {
  const board = { games: [{ game: { id: 1, startUtc: EARLIER }, rows: [row('a', 'called')] }, { game: { id: 2, startUtc: LATER }, rows: [row('b', 'called', { hit: true })] }] }
  const { hidden } = G.gateBoard(board, { now: NOW })
  assert.equal(hidden, 0)
})
t('an unknown start time counts as NOT started (fails closed)', () => {
  const { hidden } = G.gateBoard({ games: [{ game: { id: 1 }, rows: [row('a', 'called')] }] }, { now: NOW })
  assert.equal(hidden, 1)
})
t('BUCKETS shape: rows[] with gameId, games[].start', () => {
  const board = { games: [{ id: '10', start: LATER }, { id: '11', start: EARLIER }], rows: [row('a', 'called', { gameId: '10' }), row('b', 'called', { gameId: '11' }), row('c', 'called', { gameId: '10' })] }
  const { board: out, hidden } = G.gateBoard(board, { freeIds: new Set(['c']), now: NOW })
  assert.equal(hidden, 1)
  assert.deepEqual(out.rows.map((r) => r.status), ['board', 'called', 'called'])
})
t('the routes: plain address = gated + cached; m=1 = private; the CALLED card asks with the member\'s cookie', () => {
  for (const f of ['app/api/lamp/board/route.js', 'app/api/buckets/board/route.js']) {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.match(s, /boardForViewer\(/, f); assert.match(s, /private, no-store/, f); assert.match(s, /: ok\(/, f)
  }
  const v = readFileSync(new URL('../lib/members/boardViewer.js', import.meta.url), 'utf8')
  assert.match(v, /if \(await viewerIsMember\(\)\) return \{ body: board, private: true \}/)
  assert.match(v, /private: memberAsked \}/)
  const c = readFileSync(new URL('../app/api/card/called/route.js', import.meta.url), 'utf8')
  assert.match(c, /withMemberFeed\(u, true\)/); assert.match(c, /headers: cookie \? \{ cookie \}/)
  const h = readFileSync(new URL('../lib/useLiveFetch.js', import.meta.url), 'utf8')
  assert.match(h, /withMemberFeed\(rawUrl, useMemberState\(\) === 'member'\)/)
})

console.log(bad ? `${bad}/${n} FAILED` : `OK: board feed gate (${n} checks, TEST data)`)
process.exit(bad ? 1 : 0)
