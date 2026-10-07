// TEST DATA (labelled): a small hand-made matchup + player in nfl_week / nfl_matchup's shape.
// Fails if a depth sentence prints a number that is not in its own `v`, if a `v` number is not
// in the input, or if a thin / missing field still wrote a line. Run: node scripts/writeups/test-nfl-depth.mjs
import { nflDepth, numbersIn } from '../../lib/writeups/nfl.js'

const P = { player_id: 'T1', name: 'Test Receiver', position: 'WR', opp: 'ZZZ', stats: { 'TGT%': 0.294, TGT: 11.5, AIRYD: 93.25, RZ: 3, GL: 1, WOPR: 0.663 } }
const M = {
  roles: { T1: 'WR1' },
  snaps: { T1: { snap_pct: 88.8, games: 4, recent_pct: 80.1, trend: -8.7 } },
  route_value: { T1: { routes: { POST: { targets: 9, yds_per_tgt: 13.1 }, 'IN/DIG': { targets: 39, yds_per_tgt: 10.2 } }, best_route: 'POST', best_yds_per_tgt: 13.1 } },
  coverage_player: { T1: { zone: { tgts: 116, ypt: 8.9, catch_pct: 70.7, td: 4 }, man: { tgts: 56, ypt: 6.8, catch_pct: 62.5, td: 7 } } },
  coverage_team: { ZZZ: { man_pct: 27.7, zone_pct: 71.3, shell_n: 596, shells: { C3: 26.2, C2: 20.5, C1: 17.1 } } },
  qb_pressure: { qbs: {} },
  disruption_team: { ZZZ: { pressure: { created_pct: 28, created_plays: 536 } } },
  red_zone: { T1: { touches: 8, tds: 1 } },
  player_explosive: { T1: { tgts: 46, rec_20: 4, lng: 34 } },
  dvp: { season: { ZZZ: { WR1: { td_rank: 3, g: 3, recyd_g: 35.3, recyd_g_rank: 21 } } } },
  def_explosive: { ZZZ: { pass_20: 14, deep_pct: 53.3, deep_att: 15 } },
}
let bad = 0
const fail = (m) => { bad++; console.error('FAIL', m) }
const flat = new Set()
const walk = (x) => { if (x && typeof x === 'object') Object.values(x).forEach(walk); else if (Number.isFinite(Number(x)) && x !== null && x !== '') { flat.add(Number(x)); flat.add(Number((Number(x) * 100).toFixed(1))) } }
walk(P); walk(M)
const ALLOWED = new Set([20, 32])   // the "20+" yard line and "of 32" clubs are template words
const strip = (t) => t.replace(/\b(?:WR|RB|TE)\d/g, '').replace(/Cover \d/g, '').replace(/2-Man/g, '')

const secs = nflDepth(P, M)
if (secs.length < 5) fail(`expected 5+ sections, got ${secs.length}`)
for (const sec of secs) for (const l of sec.lines) {
  const printed = numbersIn(strip(l.t))
  for (const n of printed) if (!l.v.includes(n)) fail(`"${l.t}" prints ${n} that is not in its v ${JSON.stringify(l.v)}`)
  for (const n of l.v) if (!flat.has(n) && !ALLOWED.has(n) && !flat.has(Math.round(n * 10) / 10)) fail(`"${l.t}" cites ${n} which is not in the input`)
  if (!l.src) fail(`"${l.t}" has no source`)
}
// a thin sample writes nothing
const thin = nflDepth(P, { ...M, coverage_player: { T1: { zone: { tgts: 4, ypt: 20 }, man: { tgts: 3, ypt: 1 } } }, coverage_team: { ZZZ: { shell_n: 10, shells: { C3: 90 } } } })
if (thin.find((s) => s.key === 'coverage')) fail('thin coverage sample still wrote a coverage section')
// missing input writes nothing
if (nflDepth({ player_id: 'T9', position: 'WR', opp: 'ZZZ', stats: {} }, {}).length) fail('missing input wrote lines')
if (bad) { console.error(`${bad} failure(s)`); process.exit(1) }
console.log(`ok: ${secs.reduce((a, s) => a + s.lines.length, 0)} sentences across ${secs.length} sections, every number traced to its input`)
