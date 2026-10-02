// node --import <loader> scripts/check-route-shape.mjs [routes file dir]
// lib/nfl/routeShape.js: every charted route has a shape, and every shape ENDS
// at the target's real spot (acrossOf + clampAir, the dot), within 0.01.
// Test data below is made up; pass a folder of nfl_routes_<TEAM>.json to also
// run it over every real target.
import fs from 'node:fs'
import path from 'node:path'
import { routeShape, ROUTES } from '../lib/nfl/routeShape.js'
import { acrossOf, clampAir } from '../lib/nfl/fieldPlace.js'

let bad = 0, n = 0
const check = (p) => {
  n++
  const pts = routeShape(p)
  if (!pts) { bad++; console.log('no shape', p); return }
  const [u, a] = pts[pts.length - 1]
  if (Math.abs(u - acrossOf(p)) > 0.01 || Math.abs(a - clampAir(p.air)) > 0.01) { bad++; console.log('end off', p.rt, [u, a], [acrossOf(p), clampAir(p.air)]) }
  if (pts.some(([x, y]) => !(x >= 0 && x <= 1) || !Number.isFinite(y))) { bad++; console.log('point off field', p.rt, pts) }
}
for (const rt of [...ROUTES, null]) for (const lane of ['L', 'M', 'R']) for (const air of [-6, -2, 0, 3, 8, 15, 40]) check({ i: n, rt, lane, air })
const dir = process.argv[2]
if (dir) {
  for (const f of fs.readdirSync(dir).filter((f) => /^nfl_routes_[A-Z]+\.json$/.test(f))) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    b.plays.forEach((r, i) => { const o = Object.fromEntries(b.cols.map((c, j) => [c, r[j]])); o.i = i; if (o.lane && o.air != null) check(o) })
  }
}
console.log(`${n - bad}/${n} route shapes end on their target`)
process.exit(bad ? 1 : 0)
