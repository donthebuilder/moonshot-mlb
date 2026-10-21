// THE RANKED CARD'S STAT COLUMN, CHECKED (2026-10-21, Donovan: "instead of our score on the side it has their per game stats for each player ... rn
// my eye thinks I should play them for whatever number is there"). lib/cards/shareCards.js rankedDesign: a row with `stat` shows HIS number on the
// right and the score small ("SCORE 95") by the status word; the lead's box shows his stat, the score a line under the status; a row without a stat
// draws as before. TEST data only (every name says Test).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-ranked-stat.mjs
const { rankedDesign, renderShare } = await import('../lib/cards/shareCards.js')
const { assets } = await import('../lib/cards/cardKit.js')

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
// every text string in a design tree
const texts = (node, out = []) => {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach((x) => texts(x, out)); return out }
  if (typeof node.type === 'function') return texts(node.type(node.props), out)
  return texts(node.props?.children, out)
}
const row = (rank, extra = {}) => ({ rank, name: `Test Player ${rank}`, team: 'TST', where: 'vs EXA', status: rank <= 2 ? 'called' : 'board', score: 96 - rank, face: '', logo: '', ...extra })
const base = { sport: 'nba', brand: { name: 'BUCKETS' }, kicker: 'RANKINGS · TEST', right: '9 RANKED', headLabel: 'TEST SCORE', dayWord: 'Oct 21', note: '', more: 0 }
const withStat = { ...base, statHead: 'PER GAME', lead: { ...row(1, { stat: { value: '27.9', label: 'PTS/G' } }), scoreWord: 'TEST SCORE', line: '' }, rows: [2, 3, 4].map((r) => row(r, { stat: { value: `${20 + r}.0`, label: 'PTS/G' } })) }
const noStat = { ...base, lead: { ...row(1), scoreWord: 'TEST SCORE', line: '' }, rows: [2, 3, 4].map((r) => row(r)) }
const { grain } = await assets()

const a = texts(rankedDesign(withStat, grain))
ok(a.includes('27.9') && a.includes('PTS/G'), 'the lead box shows his stat')
ok(a.includes('TEST SCORE 95'), `the lead's score is a line under the status (${a.filter((t) => /SCORE/.test(t)).join(' | ')})`)
ok(a.includes('22.0') && a.includes('· SCORE 94'), 'a row: his number on the right, "· SCORE 94" by the status word')
ok(a.includes('PER GAME') && !a.includes('TEST SCORE'), 'the column head says PER GAME, not the score word')
ok(!a.some((t) => t === '94' || t === '93'), 'no bare big score on a row that has a stat')

const b = texts(rankedDesign(noStat, grain))
ok(b.includes('95') && b.includes('94') && !b.some((t) => /· SCORE/.test(t)), 'no stat: the score column exactly as before')
ok(b.includes('TEST SCORE'), 'no stat: the head and the box keep the score word')

const graded = texts(rankedDesign({ ...withStat, rows: [row(2, { stat: { value: '22.0', label: 'PTS/G' }, result: { text: '31 PTS', hot: true } })] }, grain))
ok(graded.includes('31 PTS') && !graded.includes('22.0'), 'a graded row shows its result, not the stat')

const png = await renderShare('ranked', withStat)
ok(png && png.length > 1000, 'it renders')
console.log(bad ? `${bad}/${n} FAILED` : `check-ranked-stat: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
