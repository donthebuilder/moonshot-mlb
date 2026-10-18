// The ledger's shared round-number rules (lib/ledger/backHalf.js) give the SAME answers as the hand-written copies they replaced.
// TEST DATA, labelled: counts 0..60 checked against the old inline formulas.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-ledger-backhalf.mjs
const { roundMark, oneShort } = await import('../lib/ledger/backHalf.js')
const { dayLabels } = await import('../lib/numerology/lanePlayers.js')
let bad = 0
const eq = (name, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log(`FAIL ${name}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); bad += 1 } }
for (const step of [5, 10]) for (let b = 0; b <= 60; b++) for (let g = 0; g <= 4; g++) {
  const old = Math.floor((b + g) / step) > Math.floor(b / step) ? Math.floor((b + g) / step) * step : null
  eq(`roundMark ${b}+${g}/${step}`, roundMark(b, g, step), old)
}
for (let n = 0; n <= 60; n++) {
  eq(`oneShort10 ${n}`, oneShort(n, 10), n > 0 && (n + 1) % 10 === 0)
  eq(`oneShort10 vs MLB formula ${n}`, oneShort(n, 10), Math.ceil((n + 1) / 10) * 10 - n === 1 && n > 0)
  eq(`oneShort5 ${n}`, oneShort(n, 5), n > 0 && (n + 1) % 5 === 0)
}
eq('no total -> no mark', roundMark(null, 1, 10), null)
eq('dayLabels drops Fibonacci, keeps order, dedupes', dayLabels([{ label: 'Jersey = day' }, { label: 'Is Fibonacci' }, { label: 'Jersey = day' }, { label: 'Birthday' }]), ['Jersey = day', 'Birthday'])
if (bad) { console.log(`${bad} FAILED`); process.exit(1) }
console.log('check-ledger-backhalf: shared round rules match the old per-sport code')
