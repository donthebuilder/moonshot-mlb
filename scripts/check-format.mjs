// Shared text helpers invariant (2026-10-17 audit, batch 1): lib/format.js is the one place for
// ordinal / plural / "Nth most" / "top N%". Guards the rules the copies used to disagree on.
//   node scripts/check-format.mjs
const F = await import('../lib/format.js')

let bad = 0
const eq = (name, got, want) => {
  if (got !== want) { console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); bad += 1 }
}

// ordinal: the suffix rule every old private copy implemented, 1..5000
const old = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`
const old2 = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }
for (let n = 1; n <= 5000; n += 1) {
  eq(`ordinal(${n}) vs rule`, F.ordinal(n), old(n))
  eq(`ordSuffix(${n}) vs rule`, F.ordSuffix(n), old(n).slice(String(n).length))
  eq(`ordinal(${n}) vs stories/nhl rule`, F.ordinal(n), old2(n))
}
eq('ordinal 11', F.ordinal(11), '11th')
eq('ordinal 112', F.ordinal(112), '112th')
eq('ordinal 22', F.ordinal(22), '22nd')

// plural
eq('plural 0', F.plural(0, 'game'), '0 games')
eq('plural 1', F.plural(1, 'game'), '1 game')
eq('plural 2', F.plural(2, 'game'), '2 games')
eq('plural irregular 1', F.plural(1, 'carry', 'carries'), '1 carry')
eq('plural irregular 3', F.plural(3, 'carry', 'carries'), '3 carries')
eq('pluralWord 1', F.pluralWord(1, 'day'), 'day')
eq('pluralWord 30', F.pluralWord(30, 'day'), 'days')

// "Nth most": rank 1 is never "1st most"
eq('mostWord 1', F.mostWord(1), 'most in the league')
eq('mostWord 2', F.mostWord(2), '2nd most')
eq('mostWord 1 of 32', F.mostWord(1, 32), 'most in the league')
eq('mostWord 16 of 32', F.mostWord(16, 32), '16th most')
eq('mostWord 17 of 32', F.mostWord(17, 32), '16th fewest')
eq('mostWord 32 of 32', F.mostWord(32, 32), 'fewest in the league')
eq('mostWord null', F.mostWord(null, 32), null)

// stat percentile -> "top N%"
eq('topPercentile 99.3', F.topPercentile(99.3), 1)
eq('topPercentile 100', F.topPercentile(100), 1)
eq('topPercentile 60', F.topPercentile(60), 40)
eq('topPercentile 0', F.topPercentile(0), 99)

// night rank band: #1 says "#1", the rest snap honestly
eq('rankBandOf 1 of 76', F.rankBandOf(1, 76), null)
eq('rankBandOf 2 of 76', F.rankBandOf(2, 76)?.word, 'top 5%')
eq('rankBandOf 3 of 76', F.rankBandOf(3, 76)?.word, 'top 5%')
eq('rankBandOf 4 of 76', F.rankBandOf(4, 76)?.word, 'top 10%')
eq('rankBandOf 8 of 76', F.rankBandOf(8, 76)?.word, 'top quarter')
eq('rankBandOf 19 of 76', F.rankBandOf(19, 76)?.word, 'top quarter')
eq('rankBandOf 38 of 76', F.rankBandOf(38, 76)?.word, 'top half')
eq('rankBandOf 60 of 76', F.rankBandOf(60, 76), null)
eq('rankBandOf 2 of 200', F.rankBandOf(2, 200)?.n, 1)
eq('rankBandOf bad', F.rankBandOf(null, 76), null)

if (bad) { console.log(`\n${bad} FAILED`); process.exit(1) }
console.log('check-format: all ok')
