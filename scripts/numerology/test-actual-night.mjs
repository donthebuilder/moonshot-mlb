// lib/numerology/actualNight.js on TEST rows (made up here, labelled TEST --
// not real players). Matches only where a root equals the day's; a missing
// field is left out, never guessed; a postseason homer uses its own count;
// a two-homer night is one hitter; the night speaks from its first homer.
//   node scripts/numerology/test-actual-night.mjs
await import('../_esm-resolve.mjs')
const { actualNight } = await import('../../lib/numerology/actualNight.js')
let fails = 0, n = 0
const eq = (a, b, what) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', what, '->', JSON.stringify(a), 'expected', JSON.stringify(b)) } }
// 2026-10-04 -> 2+0+2+6+1+0+0+4 = 15 -> 6
const day = '2026-10-04'
const rows = [
  { player_id: 1, name: 'TEST Full', team: 'AAA', hr_n: 1, stats: { jersey: 24, birthDate: '1990-03-15', season_hr: 32 } },          // #24->6 match, born 15->6 match, path 1+9+9+0+0+3+1+5=28->1, HR 33->6 match
  { player_id: 2, name: 'TEST NoJersey', team: 'BBB', hr_n: 1, stats: { birthDate: '1995-07-02' } },                                // no jersey, no season_hr
  { player_id: 3, name: 'TEST Post', team: 'CCC', hr_n: 1, stats: { jersey: 7, birthDate: '1992-01-01', postseason: true, post_nth: 3, season_hr: 40 } },
  { player_id: 4, name: 'TEST Two', team: 'DDD', hr_n: 1, stats: { jersey: 12, season_hr: 9 } },
  { player_id: 4, name: 'TEST Two', team: 'DDD', hr_n: 2, stats: { jersey: 12, season_hr: 9 } },
]
const night = actualNight(rows, day)
eq(night.dateRoot, 6, 'day root of 2026-10-04 is 6')
eq(night.homers, 5, 'five homers')
eq(night.hitters.length, 4, 'four hitters (a two-homer night is one)')
const by = (name) => night.hitters.find((h) => h.name === name)
eq(by('TEST Full').axes.map((x) => [x.k, x.root, x.match]), [['jersey', 6, true], ['bday', 6, true], ['path', 1, false], ['nth', 6, true]], 'full hitter: each number reduced, matches marked')
eq(by('TEST NoJersey').axes.map((x) => x.k), ['bday', 'path'], 'missing jersey / season count -> left out, not guessed')
eq(by('TEST Post').axes.find((x) => x.k === 'nth')?.label, 'postseason HR 3', 'postseason homer uses its own count')
eq(by('TEST Two').hr, 2, 'two homers counted')
eq(by('TEST Two').axes.find((x) => x.k === 'nth')?.value, 11, 'his second homer tonight = season count + 2')
eq(night.hitters[0].name, 'TEST Full', 'the hitter carrying the most of the day’s number leads')
eq(night.matched, 1 + (by('TEST Two').axes.some((x) => x.match) ? 1 : 0) + (by('TEST Post').axes.some((x) => x.match) ? 1 : 0) + (by('TEST NoJersey').axes.some((x) => x.match) ? 1 : 0), 'matched = hitters with any match')
eq(actualNight([rows[1]], day).topRoot != null, true, 'one homer is enough to speak')
eq(actualNight([], day).hitters.length, 0, 'no homers -> empty, not an error')
// the leading root ignores 'which homer' (in October it's 1 for nearly everyone)
const oct = actualNight([1, 2, 3].map((i) => ({ player_id: 10 + i, name: `TEST Oct${i}`, hr_n: 1, stats: { jersey: 23, postseason: true, post_nth: 1 } })), day)
eq(oct.topRoot, { root: 5, n: 3 }, "leading root from own numbers, not 'postseason HR 1'")
console.log(`${n - fails}/${n} checks passed (TEST rows)`)
process.exit(fails ? 1 : 0)
