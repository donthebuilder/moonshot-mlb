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

  // THIRD SHAPE, and the one that got through both rules above for weeks: a
  // Map BUILT on a bare player_id and READ with the composite row key. No NaN,
  // no crash, no warning — .get() just never hits, so the whole graded layer
  // of the Watchlist rendered nothing every night and looked like a quiet
  // slate. Found 2026-08-15.
  //
  // File-local on purpose: a composite lookup is only wrong when the same file
  // built its map on an id, which is exactly what makes this cheap to check
  // and impossible to false-positive on a genuinely composite-keyed map.
  const buildsOnId = /\.\s*set\s*\(\s*(String\s*\(\s*\w+[.?]*\.player_id|mlbId\s*\(|Number\s*\(\s*\w+[.?]*\.player_id)/.test(src)
  if (buildsOnId) {
    src.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return
      // watchIds IS composite-keyed — that's the rule above, in reverse.
      if (/watchIds/.test(line)) return
      if (/\.\s*(get|has)\s*\(\s*(String\s*\(\s*)?playerId\s*\(/.test(line)) {
        console.log(`MISS ${f}:${i + 1} — this file keys a Map on the numeric id; playerId() is the composite row key and will never match`)
        bad += 1
      }
    })
  }
}
console.log(bad ? `\n${bad} id problem(s)` : `\nok   ids: ${files.length} files, no numeric/composite id mixups`)
process.exit(bad ? 1 : 0)
