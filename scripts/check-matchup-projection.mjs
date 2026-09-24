// The matchup projection stays bounded and honest -- TEST DATA below, not
// real players or real defences. (2026-09-23: "make the projected points
// based on the matchup, not just the average.")
// Run: node --import ./scripts/_esm-resolve.mjs scripts/check-matchup-projection.mjs
import { factorFrom, matchupProjection, FACTOR_MIN, FACTOR_MAX } from '../lib/fantasy/matchupProjection.js'

let failed = 0
const ok = (name, cond) => { if (!cond) failed++; console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${name}`) }

// Ten fake defences; SOFT allows double the league's RB1 rushing, HARD half.
const dvp = {}
for (let i = 0; i < 10; i++) dvp[`T${i}`] = { RB1: { rshyd_g: 60, recyd_g: 20, td: 8 } }
dvp.SOFT = { RB1: { rshyd_g: 140, recyd_g: 20, td: 8 } }
dvp.HARD = { RB1: { rshyd_g: 30, recyd_g: 20, td: 8 } }
const zone = (yds) => ({ z: { att: 100, yds } })
const matchup = { dvp: { season: dvp }, roles: { rb: 'RB1' }, field: { league_pass: zone(700), def_pass: { SOFT: zone(700), HARD: zone(700) } } }
const rb = { id: 'rb', source_player_id: 'rb', position: 'RB', team: 'X', source_payload: { stats: { RUYD: 100, TD: 1, xTD: 1 } } }

console.log('\nfactor bounds')
ok('neutral ratio is 1', factorFrom(1) === 1)
ok('huge ratio clamps high', factorFrom(10) === FACTOR_MAX)
ok('tiny ratio clamps low', factorFrom(0.01) === FACTOR_MIN)
ok('garbage is neutral', factorFrom(NaN) === 1 && factorFrom(-2) === 1)

console.log('\nprojection')
const soft = matchupProjection(rb, 'ppr', { matchup, opp: 'SOFT' })
const hard = matchupProjection(rb, 'ppr', { matchup, opp: 'HARD' })
const none = matchupProjection(rb, 'ppr', { matchup, opp: null })
ok(`soft run defence raises it (${soft.base} -> ${soft.points})`, soft.points > soft.base)
ok(`hard run defence lowers it (${hard.base} -> ${hard.points})`, hard.points < hard.base)
ok('no opponent = no matchup factors', none.factors === null && none.points === none.base)
ok('never more than the clamp allows', soft.points <= soft.base * FACTOR_MAX + 0.1)
const k = { id: 'k', position: 'K', team: 'X', source_payload: { stats: { FGM: 2, PAT: 3 } } }
ok('kickers are untouched', matchupProjection(k, 'ppr', { matchup, opp: 'SOFT' }).points === 9)

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall matchup-projection checks passed')
