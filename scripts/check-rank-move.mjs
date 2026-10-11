// node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-rank-move.mjs
// RANK MOVES (2026-10-10): lib/rankMove.js, the registry entry in lib/routes.js, and the places that mount
// the arrow. Every player id, rank and time below is TEST data (made up), labelled as such.
import { readFileSync } from 'node:fs'
import { rankMapOf, signature, diffMoves, advance, movesFor, botPrevOf, moveText, MAX_AGE_H, MOVE_CAPTION } from '../lib/rankMove.js'
import { RANK_MOVE, rankMoveSpec, ALL_SPORT_KEYS } from '../lib/routes.js'

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
for (const f of ['components/PlayerCard.js', 'components/nfl/tabs/Touchdowns.js', 'components/nfl/tabs/Boards.js', 'components/lamp/LampCard.js', 'components/buckets/BucketsCard.js']) has(f, /RankMoveCell/, 'the card must mount the shared arrow')
// a sport ternary is not how this is wired
for (const f of ['lib/useRankMove.js', 'lib/rankMove.js', 'components/RankMove.js']) if (/sport === '(mlb|nfl|nhl|nba)'/.test(src(f))) { bad++; console.log(`ERROR ${f}: a hand-written sport ternary`) }
// no new hex colours in the new JS
for (const f of ['lib/useRankMove.js', 'lib/rankMove.js', 'components/RankMove.js']) if (/#[0-9a-fA-F]{3,8}\b/.test(src(f).replace(/\/\/.*$/gm, ''))) { bad++; console.log(`ERROR ${f}: a hex literal`) }
// the model code never reads the move
for (const f of ['lib/scoring.js', 'lib/callStatus.js', 'lib/boardOrder.js', 'lib/nhl/goalModel.js']) if (/rankMove|useRankMove|lib\/rankMove/.test(src(f))) { bad++; console.log(`ERROR ${f}: the rank move must not touch a score, rank or status`) }

console.log(bad ? `${bad} problem(s)` : 'rank moves OK')
process.exit(bad ? 1 : 0)
