// One record per bar (lib/nfl/barSplit.js). TEST DATA, labelled: three fixture weeks, the first two graded at the old 40+ bar, the third at 100+.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-bar-split.mjs
const { splitByBar } = await import('../lib/nfl/barSplit.js')
const { seasonTotals } = await import('../lib/nfl/resultsArchive.js')
const wk = (week, bar, n, hit) => ({ week, bars: { REC_YDS: bar, TD: 1 }, card: { REC_YDS: { bar } }, totals: { REC_YDS: { n, hit, void: 0 }, TD: { n: 5, hit: 3, void: 0 } } })
const t = seasonTotals([wk(1, 40, 5, 4), wk(2, 40, 5, 3), wk(3, 100, 5, 1)])
let bad = 0
const eq = (name, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log(`FAIL ${name}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); bad += 1 } }
eq('current bar', t.REC_YDS.bar, 100)
eq('current record only', [t.REC_YDS.n, t.REC_YDS.hit], [5, 1])
eq('earlier record apart', t.REC_YDS.earlier.map((e) => [e.bar, e.n, e.hit]), [[40, 10, 7]])
eq('unchanged market sums all weeks', [t.TD.n, t.TD.hit, t.TD.earlier.length], [15, 9, 0])
const old = seasonTotals([{ totals: { X: { n: 2, hit: 1 } } }, { totals: { X: { n: 3, hit: 1 } } }])
eq('no bars saved (old digest) -> one record', [old.X.n, old.X.earlier.length], [5, 0])
// A 100+ yardage pick against the book's main line (TEST data): the quote is returned, flagged as a different bet, never as the bar's price
const { quoteFor } = await import('../lib/nfl/oddsMatch.js')
const odds = { by_player_id: { P1: { player_reception_yds: { line: 59.5, over: -115, implied: 53.5 }, player_rush_yds: { line: 99.5, over: 310 } } } }
const off = quoteFor(odds, { player_id: 'P1' }, 'REC_YDS')
eq('main-line quote is a different bet', [off.matches, off.line, off.over], [false, 59.5, -115])
eq('a quote on the bar matches', quoteFor(odds, { player_id: 'P1' }, 'RUSH_YDS').matches, true)
eq('no quote -> null', quoteFor(odds, { player_id: 'nobody' }, 'REC_YDS'), null)
if (bad) { console.log(`${bad} FAILED`); process.exit(1) }
console.log('check-bar-split: a new bar starts a new record; old weeks stay apart')
