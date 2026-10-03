#!/usr/bin/env node
// BUCKETS' PLAYING-TIME SHADOW, CHECKED (BATCH-MODEL-V2 M2). lib/nba/model.js on
// made-up players -- TEST DATA, every name and number below is invented.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-buckets-shadow.mjs
import { legsFor, scoreMarket, scoreShadow, NBA_MARKETS, NBA_SHADOWS, LIVE_VERSIONS } from '../lib/nba/model.js'
let bad = 0, n = 0
const eq = (name, got, want) => { n++; if (got !== want && !(Number.isFinite(got) && Math.abs(got - want) < 1e-9)) { bad++; console.log('  FAIL', name, 'got', got, 'want', want) } }

// a season line: per-game averages + games played
const line = (gp, min, pts = 15, fga = 12, fta = 3) => ({ gp, min, pts, fga, fta, reb: 5, ast: 3, tpm: 1, tpa: 3, tpTot: gp, tpaTot: gp * 3 })
const opp = { oppPts: 112, oppReb: 44, oppAst: 25, oppTpm: 12 }

// minCur: this season's minutes from 3 games on, the pool before that
let L = legsFor(line(2, 36), line(70, 22), opp)
eq('2 games this season -> pooled minutes', L.minCur, L.minPg)
L = legsFor(line(5, 36), line(70, 22), opp)
eq('5 games this season -> this season', L.minCur, 36)
eq('the pool still leans on last season', L.minPg < 30, true)

// the shadow is the PTS market with minPg swapped for minCur, nothing else
const S = NBA_SHADOWS.pts
eq('same market', S.market, 'pts')
eq('only the minutes leg differs', JSON.stringify(S.legs.map((l) => (l === 'minCur' ? 'minPg' : l))), JSON.stringify(NBA_MARKETS.pts.legs))
eq('shadow version is not live', LIVE_VERSIONS.includes(S.version), false)
eq('every live market version is listed', NBA_MARKETS.pts.version && LIVE_VERSIONS.includes(NBA_MARKETS.pts.version), true)

// a new starter: 36 minutes this season, 22 last -- the shadow ranks him higher
const cand = (id, game, team, cur, prev) => ({ gameId: game, playerId: id, name: `Test ${id}`, team, opp: team === 'AAA' ? 'BBB' : 'AAA', starter: true, legs: legsFor(cur, prev, opp) })
const pool = [
  cand('t1', 'G1', 'AAA', line(6, 36, 20, 15, 4), line(70, 22, 20, 15, 4)),   // new starter
  cand('t2', 'G1', 'AAA', line(6, 30, 21, 15, 4), line(70, 33, 21, 15, 4)),   // steady
  cand('t3', 'G1', 'BBB', line(6, 25, 12, 9, 2), line(70, 25, 12, 9, 2)),
  cand('t4', 'G1', 'BBB', line(6, 20, 9, 7, 1), line(70, 20, 9, 7, 1)),
  cand('t5', 'G1', 'BBB', line(6, 32, 18, 14, 5), line(70, 32, 18, 14, 5)),
  cand('t6', 'G1', 'AAA', line(6, 15, 6, 5, 1), line(70, 15, 6, 5, 1)),
]
const live = Object.fromEntries(scoreMarket('pts', pool).map((r) => [r.playerId, r]))
const sh = Object.fromEntries(scoreShadow('pts', pool).map((r) => [r.playerId, r]))
eq('every candidate scored by both', Object.keys(sh).length, Object.keys(live).length)
eq('the new starter ranks higher in the shadow', sh.t1.score > live.t1.score, true)
// t3 played 25 both seasons: his own minutes are the same number either way (his
// PERCENTILE can still move -- t1's jump to 36 passes him; percentiles are relative)
eq('unchanged minutes, same raw value', pool[2].legs.minCur, pool[2].legs.minPg)
eq('...and t1 passing him drops his minutes percentile', sh.t3.pct.minCur < live.t3.pct.minPg, true)

console.log(`${n - bad}/${n} BUCKETS shadow checks pass`)
process.exit(bad ? 1 : 0)
