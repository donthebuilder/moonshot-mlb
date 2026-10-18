// The ledger's forward half, once (lib/ledger/nextUp.js): EVERYONE still to come is listed, live first, then the most patterns, then the best score.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-next-up.mjs      (a fixture, labelled TEST DATA)
const { rankNextUp } = await import('../lib/ledger/nextUp.js')
let bad = 0
const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { console.log(`FAIL ${n}: got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`); bad += 1 } }

const c = [
  { key: 'a', name: 'A', when: 'later', chips: ['root 7'], nLanes: 1, score: 60, stat: ['LAMP 60'] },
  { key: 'b', name: 'B', when: 'later', chips: [], nLanes: 0, score: 95, stat: ['LAMP 95'] },          // no pattern at all: still listed, on his score
  { key: 'c', name: 'C', when: 'now', chips: [], nLanes: 0, score: 10, stat: ['LAMP 10'] },             // live first, whatever his score
  { key: 'd', name: 'D', when: 'later', chips: ['root 7', 'day 3'], nLanes: 2, score: 20, stat: [] },
  null,
]
const r = rankNextUp(c, { cap: 12 })
eq('everyone is listed (the null is dropped)', r.length, 4)
eq('order: live, then most patterns, then score', r.map((x) => x.key), ['c', 'd', 'a', 'b'])
eq('chips = patterns then his own numbers', r.find((x) => x.key === 'a').chips, ['root 7', 'LAMP 60'])
eq('a man with no pattern keeps his stat chip', r.find((x) => x.key === 'b').chips, ['LAMP 95'])
eq('the cap holds', rankNextUp(c, { cap: 2 }).length, 2)
eq('nothing in, nothing out', rankNextUp(undefined), [])

if (bad) { console.log(`\n${bad} FAILED`); process.exit(1) }
console.log('check-next-up: all ok')
