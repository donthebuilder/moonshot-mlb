// The Six's milestone line (lib/nfl/milestones.js): 100 rec / 100 rush / 300 pass, counted off the season's game log.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-milestones.mjs
const M = await import('../lib/nfl/milestones.js')
const { MIN_BAR } = await import('../lib/card/rules.js')
let bad = 0
const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { console.log(`FAIL ${n}: got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`); bad += 1 } }

eq('bars follow the Card ruling', [M.MILESTONE.REC_YDS.bar, M.MILESTONE.RUSH_YDS.bar, M.MILESTONE.PASS_YDS.bar], [MIN_BAR.nfl.rec_yds, MIN_BAR.nfl.rush_yds, MIN_BAR.nfl.pass_yds])
eq('the three bars are 100/100/300', [100, 100, 300], [M.MILESTONE.REC_YDS.bar, M.MILESTONE.RUSH_YDS.bar, M.MILESTONE.PASS_YDS.bar])
eq('no milestone for TD', M.milestoneOf('TD'), null)

// a fixture log, labelled as test data: 5 games in 2026 (2 reach 100 rec), 1 game in 2025 (reaches 100: must not count)
const log = [
  { s: 2025, w: 17, g_recyd: 140 },
  { s: 2026, w: 1, g_recyd: 101 }, { s: 2026, w: 2, g_recyd: 99 }, { s: 2026, w: 3, g_recyd: 100 }, { s: 2026, w: 4, g_recyd: 12 }, { s: 2026, w: 5, g_recyd: 0 },
]
const logs = { logs: { A: { log }, B: { log: [{ s: 2026, w: 1, g_payd: 301 }, { s: 2026, w: 2, g_payd: 299 }] } } }
eq('rec: 2 of 5 this season, last year ignored', M.milestoneCount(logs, 'A', 'REC_YDS'), { n: 2, of: 5, bar: 100 })
eq('pass: 1 of 2', M.milestoneCount(logs, 'B', 'PASS_YDS'), { n: 1, of: 2, bar: 300 })
eq('no log for the player', M.milestoneCount(logs, 'Z', 'REC_YDS'), null)
eq('no logs loaded yet', M.milestoneCount(null, 'A', 'REC_YDS'), null)
eq('market without a line', M.milestoneCount(logs, 'A', 'TD'), null)
eq('words', M.milestoneWords({ n: 2, of: 5, bar: 100 }), '100+ in 2 of 5 games')
eq('words singular', M.milestoneWords({ n: 1, of: 1, bar: 300 }), '300+ in 1 of 1 game')

if (bad) { console.log(`\n${bad} FAILED`); process.exit(1) }
console.log('check-milestones: all ok')
