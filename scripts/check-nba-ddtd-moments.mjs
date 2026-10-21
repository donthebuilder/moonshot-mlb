// THE NBA DOUBLE-DOUBLE / TRIPLE-DOUBLE MOMENT, CHECKED (2026-10-20). lib/nba/moments.js ddtdRows + ddtdText: CALLED only, once on the
// box score, the triple-double first, one post per man. TEST data only.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nba-ddtd-moments.mjs
import { ddtdRows, ddtdText, DD_KIND, TD_KIND } from '../lib/nba/moments.js'

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const games = [{ id: 'g1', date: '2026-10-21', home: { abbrev: 'TSH' }, away: { abbrev: 'TSA' }, seasonType: 2 }]
const box = (id, pts, reb, ast, extra = {}) => ({ id, name: `Test Player ${id}`, team: 'TSA', pts, reb, ast, stl: 1, blk: 0, dnp: false, ...extra })
const boxes = [[box('a', 24, 11, 4), box('b', 18, 12, 10), box('c', 30, 9, 9), box('d', 22, 10, 10), box('e', 10, 10, 2, { dnp: true }), box('f', 12, 10, 3)]]
const locks = new Map([['g1|a|dd', 'called'], ['g1|b|td', 'called'], ['g1|b|dd', 'called'], ['g1|c|dd', 'called'], ['g1|d|dd', 'called'], ['g1|e|dd', 'called'], ['g1|f|dd', 'board']])
const rows = ddtdRows(games, boxes, locks, new Set(['g1']))
const by = Object.fromEntries(rows.map((r) => [r.player_id, r.kind]))
ok(by.a === DD_KIND, 'a CALLED double-double, on the box: posted')
ok(by.b === TD_KIND && rows.filter((r) => r.player_id === 'b').length === 1, 'CALLED for both and gets the triple-double: ONE post, the triple-double')
ok(!by.c, '30 / 9 / 9 is not a double-double')
ok(by.d === DD_KIND, 'CALLED for the double-double only: a triple-double line still posts as the double-double he was called for')
ok(!by.e, 'did not play: nothing')
ok(!by.f, 'ON THE BOARD, not CALLED: nothing (CALLED only)')
ok(ddtdRows(games, boxes, locks, new Set()).length === 0, 'a game that never locked: nothing')
ok(rows.every((r) => r.status === 'called' && r._line && !('line' in r)), 'rows carry the box line in _line only (never a stored column)')
const t = ddtdText(rows.find((r) => r.player_id === 'a'))
ok(t === '\u{1F916} CALLED IT\n\n\u{1F3C0} TEST PLAYER A GETS THE DOUBLE-DOUBLE\n24 PTS · 11 REB · 4 AST\nTSA vs TSH · called before tip on the BUCKETS double-double board', t)
const tt = ddtdText(rows.find((r) => r.player_id === 'b'))
ok(/GETS THE TRIPLE-DOUBLE\n18 PTS · 12 REB · 10 AST\n/.test(tt) && !/https?:|#[A-Za-z]|%/.test(tt), tt)
ok(ddtdText({ kind: 'x' }) === '' && ddtdText({ kind: DD_KIND }) === '', 'no line, no text')
console.log(bad ? `${bad}/${n} FAILED` : `check-nba-ddtd-moments: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
