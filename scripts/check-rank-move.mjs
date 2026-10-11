// node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-rank-move.mjs
// RANK MOVES (2026-10-10): lib/rankMove.js, the registry entry in lib/routes.js, and the places that mount
// the arrow. Every player id, rank and time below is TEST data (made up), labelled as such.
import { readFileSync } from 'node:fs'
import { rankMapOf, signature, diffMoves, advance, movesFor, botPrevOf, moveText, MAX_AGE_H, MOVE_CAPTION } from '../lib/rankMove.js'
import { RANK_MOVE, rankMoveSpec, ALL_SPORT_KEYS } from '../lib/routes.js'
import { recordAndPrev, readBySig, movesFromAnswer, KEEP, _forTests } from '../lib/rankSnapshots/store.js'
import { nhlBoards, nbaBoard, nflGameDate } from '../lib/rankSnapshots/compute.js'

let bad = 0
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { bad++; console.log(`ERROR ${name}: got ${g}, want ${w}`) } }
const H = 3600 * 1000
const T0 = Date.parse('2026-10-10T18:00:00Z')   // TEST clock
const board = (ids) => new Map(ids.map((id, i) => [id, i + 1]))   // TEST ids a..j, ranked in the order given

// ── diffMoves: up / down / same / new / dropped / ties ──────────────────────
const prev = board(['a', 'b', 'c', 'd', 'e', 'f'])
const cur = board(['b', 'a', 'c', 'f', 'd', 'g'])          // b up 1, a down 1, c same, f up 2, d down 1, e dropped, g new
const mv = diffMoves(cur, prev)
eq('up', mv.get('b'), { kind: 'up', n: 1 })
eq('down', mv.get('a'), { kind: 'down', n: 1 })
eq('same = nothing', mv.get('c'), undefined)
eq('up by two', mv.get('f'), { kind: 'up', n: 2 })
eq('down by one', mv.get('d'), { kind: 'down', n: 1 })
eq('new', mv.get('g'), { kind: 'new', n: 0 })
eq('a player who dropped off has no arrow (he has no row)', mv.has('e'), false)
eq('ties: equal ranks are unchanged, the next rank still compares', (() => { const m = diffMoves(new Map([['a', 1], ['b', 1], ['c', 3], ['d', 4]]), new Map([['a', 1], ['b', 2], ['c', 3], ['d', 3]])); return [m.get('a'), m.get('b'), m.get('c'), m.get('d')] })(), [undefined, { kind: 'up', n: 1 }, undefined, { kind: 'down', n: 1 }])
eq('ids compare as strings (47 and "47")', diffMoves(new Map([[47, 2], [8, 1], [9, 3]]), new Map([['47', 1], ['8', 2], ['9', 3]])).get('47'), { kind: 'down', n: 1 })
eq('arrows are neutral data: diffMoves never mutates its inputs', (() => { const c = board(['a', 'b', 'c']); const p = board(['c', 'b', 'a']); const before = JSON.stringify([...c]) + JSON.stringify([...p]); diffMoves(c, p); return JSON.stringify([...c]) + JSON.stringify([...p]) === before })(), true)
// too little to compare honestly: nothing, not invented movement
eq('previous too small', diffMoves(board(['a', 'b', 'c', 'd']), board(['a', 'b'])), null)
eq('previous is a different board (no overlap): no arrows', diffMoves(board(['a', 'b', 'c', 'd']), board(['x', 'y', 'z', 'w'])), null)
eq('missing previous', diffMoves(board(['a', 'b', 'c']), null), null)
eq('junk ranks are dropped', [...rankMapOf({ a: 1, b: 'x', c: 0, d: -2, e: 3 })], [['a', 1], ['e', 3]])

// ── signature: stable, order independent ────────────────────────────────────
eq('signature ignores insertion order', signature(new Map([['a', 1], ['b', 2]])), signature(new Map([['b', 2], ['a', 1]])))
eq('signature changes with a rank', signature(board(['a', 'b', 'c'])) === signature(board(['b', 'a', 'c'])), false)

// ── advance + movesFor: the device's memory ─────────────────────────────────
const D1 = '2026-10-10', D2 = '2026-10-11'
let st = advance(null, { date: D1, ranks: prev, at: T0 })
eq('first sight: no previous, so no arrows', movesFor(st, { date: D1, ranks: prev, atNow: T0 }), null)
const st2 = advance(st, { date: D1, ranks: cur, at: T0 + 1 * H })
eq('second ordering: previous held', st2.prev.sig, signature(prev))
const r2 = movesFor(st2, { date: D1, ranks: cur })
eq('arrows from the two orderings', r2.moves.get('f'), { kind: 'up', n: 2 })
eq('prevAt is the previous ordering\'s time', r2.prevAt, T0)
eq('the same ordering again is not a new update (never rewritten)', advance(st2, { date: D1, ranks: cur, at: T0 + 2 * H }), st2)
eq('seeing it again keeps the same arrows', movesFor(st2, { date: D1, ranks: cur }).moves.get('b'), { kind: 'up', n: 1 })
eq('before the store absorbs a new ordering, the arrow already compares to cur', movesFor(st, { date: D1, ranks: cur, atNow: T0 + 1 * H }).moves.get('f'), { kind: 'up', n: 2 })
eq('an older payload cannot become the previous', advance(st2, { date: D1, ranks: board(['c', 'a', 'b', 'd', 'e', 'f']), at: T0 - 5 * H }), st2)
eq('a third ordering shifts: previous = the second', advance(st2, { date: D1, ranks: board(['f', 'b', 'a', 'c', 'd', 'g']), at: T0 + 2 * H }).prev.sig, signature(cur))
// different game dates are never compared
eq('another date starts fresh', advance(st2, { date: D2, ranks: cur, at: T0 + 20 * H }).prev, null)
eq('another date reads nothing from this store', movesFor(st2, { date: D2, ranks: cur }), null)
// staleness
eq('previous older than the limit: no arrows', movesFor(advance(st, { date: D1, ranks: cur, at: T0 + (MAX_AGE_H + 1) * H }), { date: D1, ranks: cur }), null)
eq('previous right at the limit still compares', movesFor(advance(st, { date: D1, ranks: cur, at: T0 + MAX_AGE_H * H }), { date: D1, ranks: cur }) !== null, true)
// boards with no previous snapshot, and tiny boards
eq('no store: nothing', movesFor(null, { date: D1, ranks: cur }), null)
eq('a board of two is not a board', advance(null, { date: D1, ranks: board(['a', 'b']), at: T0 }), null)
// arrows never alter sort order: the ranks the caller passes come back untouched
eq('ranks in = ranks out (the arrow never re-sorts)', (() => { const c = board(['b', 'a', 'c', 'f', 'd', 'g']); const copy = JSON.stringify([...c]); movesFor(st2, { date: D1, ranks: c }); diffMoves(c, prev); return JSON.stringify([...c]) === copy })(), true)

// ── the bot's own previous ranks, when it publishes them ────────────────────
const spec = rankMoveSpec('mlb')
const botRows = [['a', 2], ['b', 1], ['c', 3], ['d', 4]].map(([id, r]) => ({ id, prev_ranks: { hr: r }, prev_ranks_at: '2026-10-10T17:00:00Z', prev_ranks_date: D1 }))
const idOf = (r) => r.id
eq('bot previous read', [...botPrevOf(botRows, spec, { board: 'hr', date: D1, idOf, curAt: T0 }).ranks], [['a', 2], ['b', 1], ['c', 3], ['d', 4]])
eq('bot previous time', botPrevOf(botRows, spec, { board: 'hr', date: D1, idOf, curAt: T0 }).prevAt, Date.parse('2026-10-10T17:00:00Z'))
eq('bot previous for another date is never used', botPrevOf(botRows, spec, { board: 'hr', date: D2, idOf, curAt: T0 }), null)
eq('bot previous older than the limit is not used', botPrevOf(botRows, spec, { board: 'hr', date: D1, idOf, curAt: T0 + 24 * H }), null)
eq('bot rows without the field: nothing (never invented)', botPrevOf([{ id: 'a' }, { id: 'b' }], spec, { board: 'hr', date: D1, idOf }), null)
eq('another board has no entry: nothing', botPrevOf(botRows, spec, { board: 'hit', date: D1, idOf, curAt: T0 }), null)
eq('a sport with no bot field: nothing', botPrevOf(botRows, rankMoveSpec('nhl'), { board: 'hr', date: D1, idOf, curAt: T0 }), null)


// ── the shared table (lib/rankSnapshots/store.js): a fake in-memory database, TEST rows ─────────────────────
function fakeDb({ missing = false } = {}) {
  const rows = []
  const calls = { select: 0, upsert: 0, delete: 0 }
  const q = (op) => {
    const f = []
    let order = null, lim = null, inn = null
    const api = {
      eq: (k, v) => { f.push([k, v]); return api },
      in: (k, v) => { inn = [k, v]; return api },
      order: (k, o) => { order = [k, o]; return api },
      limit: (n) => { lim = n; return api },
      select: () => api,
      then: (res, rej) => Promise.resolve().then(() => {
        if (missing) return { data: null, error: { code: '42P01' } }
        let out = rows.filter((r) => f.every(([k, v]) => r[k] === v) && (!inn || inn[1].includes(r[inn[0]])))
        if (op === 'delete') { calls.delete++; out.forEach((r) => rows.splice(rows.indexOf(r), 1)); return { data: null, error: null } }
        calls.select++
        out = out.sort((a, b) => Date.parse(b.taken_at) - Date.parse(a.taken_at))
        return { data: out.slice(0, lim ?? 999).map((r) => ({ ...r })), error: null }
      }).then(res, rej),
    }
    return api
  }
  return {
    rows, calls,
    from: () => ({
      select: () => q('select'),
      delete: () => q('delete'),
      upsert: (row, opt) => { calls.upsert++; if (missing) return Promise.resolve({ error: { code: '42P01' } }); if (!rows.some((r) => ['sport', 'board', 'game_date', 'source_stamp'].every((k) => r[k] === row[k]))) rows.push({ ...row }); return Promise.resolve({ error: null }) },
    }),
  }
}
const mk = (ids) => new Map(ids.map((id, i) => [id, i + 1]))
const key = { sport: 'mlb', board: 'hr', date: '2026-10-10' }
const A = mk(['a', 'b', 'c', 'd', 'e']), B = mk(['b', 'a', 'c', 'e', 'd']), C2 = mk(['c', 'b', 'a', 'e', 'd'])
{
  _forTests.recent.clear()
  const db = fakeDb()
  const t = Date.parse('2026-10-10T18:00:00Z')
  const r1 = await recordAndPrev(db, { ...key, ranks: A, now: t })
  eq('first ordering records one row', [r1.status, r1.recorded, db.rows.length], ['ok', true, 1])
  eq('first ordering has no previous: no arrows', r1.prev, null)
  _forTests.recent.clear()
  const r1b = await recordAndPrev(db, { ...key, ranks: A, now: t + 1000 })
  eq('a repeat read records nothing', [r1b.recorded, db.rows.length, db.calls.upsert], [false, 1, 1])
  const selects = db.calls.select
  await recordAndPrev(db, { ...key, ranks: A, now: t + 2000 })
  eq('a repeat read within seconds costs no query at all', db.calls.select, selects)
  _forTests.recent.clear()
  const r2 = await recordAndPrev(db, { ...key, ranks: B, now: t + 3600000 })
  eq('a new ordering records one more row', [r2.recorded, db.rows.length], [true, 2])
  eq('and its previous is the one before', Object.keys(r2.prev.ranks).join(), 'a,b,c,d,e')
  // two visitors read the same thing
  const v1 = movesFromAnswer(r2, B), v2 = movesFromAnswer(await recordAndPrev(db, { ...key, ranks: B, now: t + 3600500 }), B)
  eq('two visitors see the same arrows', JSON.stringify([...v1.moves]), JSON.stringify([...v2.moves]))
  eq('the arrows are right', v1.moves.get('b'), { kind: 'up', n: 1 })
  eq('a reader on another ordering gets none (fingerprint differs)', movesFromAnswer(r2, A), null)
  // a stale previous is ignored
  _forTests.recent.clear()
  const r3 = await recordAndPrev(db, { ...key, ranks: C2, now: t + 3600000 + 7 * 3600000 })
  eq('previous older than 6h: none', r3.prev, null)
  // another date is its own board
  _forTests.recent.clear()
  const r4 = await recordAndPrev(db, { ...key, date: '2026-10-11', ranks: A, now: t })
  eq('another game date never sees this date\'s rows', r4.prev, null)
  // prune keeps KEEP
  _forTests.recent.clear()
  const db2 = fakeDb()
  for (let i = 0; i < 9; i++) { _forTests.recent.clear(); const ids = ['a', 'b', 'c', 'd', 'e', 'f'].slice(); ids.push(ids.splice(i % 5, 1)[0]); ids.splice(i % 3, 0, `x${i}`); await recordAndPrev(db2, { ...key, ranks: mk(ids), now: t + i * 60000 }) }
  eq('prune keeps the newest KEEP orderings of a board and day', db2.rows.length, KEEP)
  eq('ranks only: no score or status columns ever stored', Object.keys(db2.rows[0]).sort().join(), 'board,game_date,ranks,source_stamp,sport,taken_at')
  // A, B, then A again: B is what A replaced
  _forTests.recent.clear()
  const db3 = fakeDb()
  await recordAndPrev(db3, { ...key, ranks: A, now: t }); _forTests.recent.clear()
  await recordAndPrev(db3, { ...key, ranks: B, now: t + 600000 }); _forTests.recent.clear()
  const back = await recordAndPrev(db3, { ...key, ranks: A, now: t + 1200000 })
  eq('A, B, then A again: the previous is B', back.prev.ranks.b, 1)
  // read-only mode (LAMP / BUCKETS readers)
  const ro = await readBySig(db3, { sport: 'mlb', board: 'hr', date: '2026-10-10', sig: signature(B), now: t + 1300000 })
  eq('read by fingerprint finds the ordering and its previous', [ro.status, ro.prev?.ranks?.a], ['ok', 1])
  eq('read by fingerprint of an unknown ordering answers ok with no previous', (await readBySig(db3, { sport: 'mlb', board: 'hr', date: '2026-10-10', sig: 'zzz' })).prev, null)
}
// the table is not there yet: every call is quiet
{
  _forTests.recent.clear()
  const gone = fakeDb({ missing: true })
  eq('table missing: unreachable, no throw (record)', (await recordAndPrev(gone, { ...key, ranks: A })).status, 'unreachable')
  eq('table missing: unreachable, no throw (read)', (await readBySig(gone, { ...key, sig: 'x' })).status, 'unreachable')
  eq('no database at all: unreachable', (await recordAndPrev(null, { ...key, ranks: A })).status, 'unreachable')
  eq('an unreachable answer draws nothing', movesFromAnswer({ status: 'unreachable' }, A), null)
  eq('a thrown database is swallowed', (await recordAndPrev({ from: () => { throw new Error('boom') } }, { ...key, ranks: A })).status, 'unreachable')
}
// LAMP / BUCKETS orderings, TEST board
{
  const nhl = nhlBoards('GOAL', { games: [{ game: { id: 11 }, rows: [{ playerId: 1, status: 'called', score: 90, rank: 1 }, { playerId: 2, status: 'board', score: 70, rank: 2 }, { playerId: 3, status: 'off', score: null, rank: null }] }, { game: { id: 12 }, rows: [{ playerId: 4, status: 'called', score: 95, rank: 1 }] }] })
  eq('LAMP all-games order is by score, off rows left out', [...nhl['GOAL:all']], [['12|4', 1], ['11|1', 2], ['11|2', 3]])
  eq('LAMP by-game order is the in-game rank', [...nhl['GOAL:game']], [['11|1', 1], ['11|2', 2], ['12|4', 1]])
  eq('BUCKETS order is nightRank, unscored rows left out', [...nbaBoard({ rows: [{ gameId: 'g', playerId: 1, score: 80, nightRank: 1 }, { gameId: 'g', playerId: 2, score: null, nightRank: 2 }] })], [['g-1', 1]])
  eq('the NFL slate\'s date is its first kickoff\'s own date', nflGameDate([{ kickoff: '2026-10-11T17:00Z' }, { kickoff: '2026-10-09T00:15Z' }]), '2026-10-09')
}

// ── words ───────────────────────────────────────────────────────────────────
const t = (ms) => '2:05 PM'
eq('up words', moveText({ kind: 'up', n: 3 }, T0, t), "Moved up 3 places in our model's ranking since the update at 2:05 PM. Information only, it changes no score.")
eq('down words, singular', moveText({ kind: 'down', n: 1 }, T0, t).startsWith("Moved down 1 place in our model's ranking"), true)
eq('new words', moveText({ kind: 'new', n: 0 }, T0, t).startsWith('New on this board'), true)
eq('no time known', moveText({ kind: 'up', n: 2 }, null, t).includes('since the last update'), true)
for (const [name, s] of [['up', moveText({ kind: 'up', n: 3 }, T0, t)], ['down', moveText({ kind: 'down', n: 3 }, T0, t)], ['new', moveText({ kind: 'new', n: 0 }, T0, t)], ['caption', MOVE_CAPTION]]) {
  if (/\b(hot|due|bounce|the bot)\b/i.test(s)) { bad++; console.log(`ERROR ${name} words use a banned word: ${s}`) }
}
eq('the caption says our model', /our model/.test(MOVE_CAPTION) && /places moved/.test(MOVE_CAPTION), true)

// ── the registry: one entry per sport, in step with the sport list ──────────
eq('RANK_MOVE has exactly the registry sports', Object.keys(RANK_MOVE).join(), ALL_SPORT_KEYS.join())
eq('an unknown sport answers MOONSHOT\'s entry', rankMoveSpec('xfl'), RANK_MOVE.mlb)
eq('computed-on-site sports have no bot field', [RANK_MOVE.nhl, RANK_MOVE.nba], [null, null])

// ── mount points: every board's table and card use the shared component ─────
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const has = (p, re, what) => { if (!re.test(src(p))) { bad++; console.log(`ERROR ${p}: ${what}`) } }
has('components/table/v2.js', /RankMoveCell cell=\{r\.rankMove\}/, 'the # cell must draw r.rankMove')
for (const f of ['components/tabs/RankedBoard.js', 'components/nfl/tabs/Touchdowns.js', 'components/nfl/tabs/Boards.js', 'components/lamp/tabs/Board.js', 'components/buckets/tabs/Board.js']) {
  has(f, /useRankMove\(/, 'the board must read useRankMove')
  has(f, /RankMoveNote/, 'the board must print the caption')
}
has('components/card/RankCard.js', /RankMoveCell cell=\{rankMove\}/, 'the shared card must draw rankMove once for every sport')
for (const f of ['components/PlayerCard.js', 'components/nfl/tabs/Touchdowns.js', 'components/lamp/LampCard.js', 'components/buckets/BucketsCard.js']) has(f, /rankMove=\{rankMove\}/, 'the card must hand rankMove to RankCard')
has('components/nfl/tabs/Boards.js', /RankMoveCell/, 'the NFL market card must mount the arrow')
has('app/api/rank-snapshots/route.js', /recordAndPrev/, 'the route must record through the store')
has('app/api/lamp/board/route.js', /recordNhlBoard/, 'LAMP records where it computes the night')
has('app/api/buckets/board/route.js', /recordNbaBoard/, 'BUCKETS records where it computes the night')
has('lib/useRankMove.js', /\/api\/rank-snapshots/, 'the hook reads the shared table')
// a sport ternary is not how this is wired
for (const f of ['lib/useRankMove.js', 'lib/rankMove.js', 'components/RankMove.js']) if (/sport === '(mlb|nfl|nhl|nba)'/.test(src(f))) { bad++; console.log(`ERROR ${f}: a hand-written sport ternary`) }
// no new hex colours in the new JS
for (const f of ['lib/useRankMove.js', 'lib/rankMove.js', 'components/RankMove.js']) if (/#[0-9a-fA-F]{3,8}\b/.test(src(f).replace(/\/\/.*$/gm, ''))) { bad++; console.log(`ERROR ${f}: a hex literal`) }
// the model code never reads the move
for (const f of ['lib/scoring.js', 'lib/callStatus.js', 'lib/boardOrder.js', 'lib/nhl/goalModel.js']) if (/rankMove|useRankMove|lib\/rankMove/.test(src(f))) { bad++; console.log(`ERROR ${f}: the rank move must not touch a score, rank or status`) }

console.log(bad ? `${bad} problem(s)` : 'rank moves OK')
process.exit(bad ? 1 : 0)
