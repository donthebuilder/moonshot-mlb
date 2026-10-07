// Pools page guard (2026-10-07). ALL DATA IN THIS FILE IS TEST DATA, labelled TEST.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-pools-legacy.mjs
//     asserts: the old-recipe rows merge/sort right, a missing key is "not published", the best-pairs rank
//     is by pair_score, and no component draws the hidden pool keys.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-pools-legacy.mjs --write-fixture [--graded]
//     after `node scripts/dev-fixture-mlb.mjs`: writes a TEST pair_builder_latest.json (8 TEST pools of 3 +
//     TEST pairs, built from the fixture slate's players) into public/__devfixture/mlb/current, and with
//     --graded a TEST pair_pool_results into results_live.json. Run the site with
//     NEXT_PUBLIC_DATA_BASE=/__devfixture/mlb. Gitignored output, never shipped.
import { readFileSync, writeFileSync } from 'node:fs'
import { legacyPoolRows, poolTag } from '../lib/pools.js'
import { bestPairs } from '../lib/pairRank.js'

const ROOT = new URL('..', import.meta.url).pathname
const CUR = `${ROOT}public/__devfixture/mlb/current`
let bad = 0
const ok = (c, m) => { if (!c) { bad++; console.log('ERROR ' + m) } }

const testLeg = (name, team, id) => ({ name, team, player_id: id })
const mkPools = (legs) => ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'].map((t, i) => ({
  name: `Pool ${t}`, parent: `Pool ${t[0]}`, model_version: 'pools_6man_legacy_v1_half', size: 3,
  pool_score: 60 + i, risk: 'TEST', tags: ['TEST'], reason: 'TEST pool, not a real pick.',
  estimated_grade_probability: { '2plus': 0.5 }, locked: false,
  players: [legs[(i * 3) % legs.length], legs[(i * 3 + 1) % legs.length], legs[(i * 3 + 2) % legs.length]],
}))

if (process.argv.includes('--write-fixture')) {
  const slate = JSON.parse(readFileSync(`${CUR}/today_slim.json`, 'utf8'))
  const legs = slate.players.slice(0, 24).map((p) => testLeg(p.player_name, p.team, p.player_id))
  const pools = mkPools(legs)
  const pairs = Array.from({ length: 8 }, (_, i) => ({
    pair_key: `TEST-${i}`, pair_score: 40 + ((i * 7) % 8) * 3, risk: 'TEST', lane_key: 'A',
    players: [slate.players[i * 2], slate.players[i * 2 + 1]].map((p) => ({ ...p, name: p.player_name })),
  }))
  writeFileSync(`${CUR}/pair_builder_latest.json`, JSON.stringify({ recommended_pairs: pairs, pools_3man_legacy: pools,
    // hidden keys on purpose: they must NOT render
    pools_3man: [{ name: 'Pool A — TEST HIDDEN', players: legs.slice(0, 3) }], pools_4man: [{ name: 'TEST HIDDEN 4', players: legs.slice(0, 4) }], pools_6man_legacy: [{ name: 'TEST HIDDEN 6', players: legs.slice(0, 6) }] }))
  if (process.argv.includes('--graded')) {
    const r = JSON.parse(readFileSync(`${CUR}/results_live.json`, 'utf8'))
    r.pair_pool_results = { pool3_legacy: pools.map((p, i) => ({
      label: `OLD-RECIPE 3-MAN ${p.name}`, hr_count: i % 3, total_count: 3, homer_names: i % 3 ? p.players.slice(0, i % 3).map((x) => x.name) : [],
      void_names: i === 5 ? [p.players[2].name] : [], bar_label: '2+ of 3', primary: 2, hit_2plus: i % 3 === 2, model_version: p.model_version })),
    graded_pools: [{ label: '4-MAN HR POOL A (TEST HIDDEN)', hr_count: 1, total_count: 4, players: legs.slice(0, 4) }], all_pairs: [] }
    writeFileSync(`${CUR}/results_live.json`, JSON.stringify(r))
  }
  console.log('wrote TEST fixture' + (process.argv.includes('--graded') ? ' (graded)' : ''))
  process.exit(0)
}

const legs = Array.from({ length: 24 }, (_, i) => testLeg(`TEST Player ${i}`, 'ATL', 9000 + i))
const pools = mkPools(legs)
ok(poolTag('OLD-RECIPE 3-MAN Pool A1') === 'A1' && poolTag('Pool D2') === 'D2', 'poolTag')
let rows = legacyPoolRows({ pools_3man_legacy: [...pools].reverse() }, null)
ok(rows.length === 8 && rows.map((r) => r.tag).join() === 'A1,A2,B1,B2,C1,C2,D1,D2', 'eight pools, A1..D2 order')
ok(rows.every((r) => r.players.length === 3 && !r.graded), 'three legs each, ungraded pregame')
rows = legacyPoolRows({ pools_3man_legacy: pools }, { pair_pool_results: { pool3_legacy: [{ label: 'OLD-RECIPE 3-MAN Pool A1', hr_count: 2, total_count: 3, homer_names: ['TEST Player 0', 'TEST Player 1'], void_names: [], hit_2plus: true }] } })
ok(rows[0].graded && rows[0].hr === 2 && rows[0].hit && rows[0].homered.has('test player 0'), 'graded half merges onto its pool')
ok(!rows[1].graded, 'an ungraded pool stays ungraded')
ok(legacyPoolRows({}, null).length === 0 && legacyPoolRows({ pools_3man_legacy: [] }, {}).length === 0, 'missing or empty key -> no rows (not published yet)')
ok(legacyPoolRows({ pools_3man: pools, pools_4man: pools, pools_6man: pools, pools_6man_legacy: pools }, null).length === 0, 'hidden keys never become rows')
const bp = bestPairs([{ pair_key: 'a', pair_score: 10, players: [1, 2] }, { pair_key: 'b', pair_score: 30, players: [1, 2] }, { pair_key: 'c', pair_score: 20, players: [1, 2] }, { pair_key: 'x', players: [1, 2] }, { pair_key: 'y', pair_score: 99, players: [1] }], { limit: 2 })
ok(bp.map((p) => p.key).join() === 'b,c', 'best pairs: by pair_score, scoreless and one-player pairs left out')

// the hidden keys are not drawn by any component (the data reads stay in the file, not in the UI)
const HIDDEN = /pools_4man|pools_6man|recommended_3mans|graded_pools|pools_3man(?!_legacy)/
for (const f of ['components/tabs/Pools.js', 'components/tabs/Pairs.js', 'components/tabs/Results.js', 'components/LiveWire.js', 'components/PairBlock.js']) {
  readFileSync(ROOT + f, 'utf8').split('\n').forEach((ln, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return
    if (HIDDEN.test(ln)) { bad++; console.log(`ERROR ${f}:${i + 1} reads a hidden pool key: ${ln.trim().slice(0, 90)}`) }
  })
}
console.log(bad ? `${bad} ERROR line(s)` : 'pools-legacy: all green')
process.exit(bad ? 1 : 0)
