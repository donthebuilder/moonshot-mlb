#!/usr/bin/env node
// Do the quarter lines (lib/nba/quarters.js) add up to the box score? For each ESPN game id given (or the last few finals of a
// date), every player's periods summed against his box line: points, rebounds, assists, threes made / tried. Prints each
// mismatch; exits 1 if any.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nba-quarters.mjs 401909841 401909840 ...
import { quarterLines } from '../lib/nba/quarters.js'
import { reduceBox } from '../lib/nba/api.js'

const ids = process.argv.slice(2).filter((x) => /^\d+$/.test(x))
let bad = 0, players = 0
for (const id of ids) {
  const s = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`)).json()
  const box = reduceBox(s)
  const sum = new Map()
  for (const r of quarterLines(s)) {
    const t = sum.get(r.player_id) || { pts: 0, reb: 0, ast: 0, tpm: 0, tpa: 0 }
    for (const k of Object.keys(t)) t[k] += r[k]
    sum.set(r.player_id, t)
  }
  for (const b of box) {
    if (!b.min) continue
    players++
    const q = sum.get(String(b.id)) || { pts: 0, reb: 0, ast: 0, tpm: 0, tpa: 0 }
    const want = { pts: b.pts, reb: b.reb, ast: b.ast, tpm: b.tpm, tpa: b.tpa }
    const off = Object.keys(want).filter((k) => want[k] != null && Number(want[k]) !== q[k])
    if (off.length) { bad++; console.log(`${id} ${b.name}: ${off.map((k) => `${k} box ${want[k]} vs periods ${q[k]}`).join(', ')}`) }
  }
}
console.log(`${ids.length} games, ${players} players, ${bad} with a mismatch`)
process.exit(bad ? 1 : 0)
