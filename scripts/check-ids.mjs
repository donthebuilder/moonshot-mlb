// ID guard. Two ids on this site look interchangeable and are not.
//
//   playerId(p)  composite ROW key, "621566-824887" — the man plus the game,
//                because a hitter in a doubleheader is two rows. A STRING.
//   mlbId(p)     the league's numeric id — what every live feed joins on:
//                boxscore lines, batting orders, the offense block.
//
// Number(playerId(p)) is NaN. On 2026-08-10 that shipped in two places at
// once. In the Games lineup merge it keyed a Map, and because Map treats NaN
// as a single key under SameValueZero, all nine slate rows collapsed into ONE
// entry — so every posted-card row rendered as "not on the slate" with a dash
// and one duplicated row appeared at the bottom of each lineup. On the picks
// page it meant snap.lines[NaN], so every pick showed no live grading at all,
// silently, which is the worse of the two because nothing looked wrong.
//
// Both failures are invisible in review and obvious on screen at 4pm. This
// costs one regex.
import fs from 'node:fs'

const files = []
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
  const full = `${dir}/${e.name}`
  if (e.isDirectory()) walk(full)
  else if (e.name.endsWith('.js')) files.push(full)
})
walk('components'); walk('lib')

let bad = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return          // the comments explaining it
    if (/Number\s*\(\s*playerId\s*\(/.test(line)) {
      console.log(`MISS ${f}:${i + 1} — Number(playerId(...)) is NaN; use mlbId()`)
      bad += 1
    }
    // The other direction: a numeric id handed to a watchlist Set keyed on the
    // composite. Same class of bug, opposite sign — it silently never matches.
    if (/watchIds\??\.\s*has\s*\(\s*(Number|mlbId)\s*\(/.test(line)) {
      console.log(`MISS ${f}:${i + 1} — watchIds is keyed on playerId(), not a numeric id`)
      bad += 1
    }
  })
}
console.log(bad ? `\n${bad} id problem(s)` : `\nok   ids: ${files.length} files, no numeric/composite id mixups`)
process.exit(bad ? 1 : 0)
