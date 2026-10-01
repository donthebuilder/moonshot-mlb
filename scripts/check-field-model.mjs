#!/usr/bin/env node
// THE FIELD'S MODEL (0e c, BATCH-FIELD-FUSION-PLAN F1 + F3 tests).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-field-model.mjs
// Reads scripts/fixtures/TEST-nfl-field-2026-w4.json -- TEST DATA, a frozen
// slice of the week-4 nfl_matchup.json -- never the live branch, so the
// numbers it checks can't drift under it.
import { readFileSync } from 'node:fs'
import { fieldModel, fieldView, MIN_DEF_ATT, SPOT_MIN_MINE } from '../lib/nfl/fieldModel.js'

const fx = JSON.parse(readFileSync(new URL('./fixtures/TEST-nfl-field-2026-w4.json', import.meta.url)))
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const MCL = { player_id: '00-0038794', name: 'Jaleel McLaughlin', opp: 'PIT' }
const GIBBS = { player_id: '00-0039139', name: 'Jahmyr Gibbs', opp: 'CAR' }

// 1. The numbers Donovan saw on both screenshots, unchanged.
const pit = fieldModel({ field: fx.field, defTeam: 'PIT', mode: 'def', pass: true })
const want = { 'left|mid': 66, 'left|short': -14, 'middle|short': -6, 'right|short': -42, 'left|behind': 19, 'right|behind': 7 }
for (const [z, v] of Object.entries(want)) check(Math.round(pit.by[z].leak) === v, `PIT ${z} leak ${Math.round(pit.by[z].leak)} == ${v}`)

// 2. Under 8 defence attempts in a zone: no leak.
const thinZones = pit.cells.filter((c) => c.att < MIN_DEF_ATT)
check(thinZones.length > 0 && thinZones.every((c) => c.leak == null), `${thinZones.length} zones under ${MIN_DEF_ATT} attempts all have leak null`)

// 3. A one-target player gets no spot (SPOT_MIN_MINE).
const mcl = fieldModel({ field: fx.field, defTeam: 'PIT', player: MCL, mode: 'player', pass: true })
check(mcl && mcl.mineTotal === 1 && mcl.spot === null, `McLaughlin: ${mcl?.mineTotal} target -> no spot (needs ${SPOT_MIN_MINE})`)

// 4. Same leak in player mode as in def mode (one model).
check(Math.round(mcl.by['left|mid'].leak) === 66, 'player mode reads the same leak as def mode')

// 5. The view decider (plan TESTS: logic).
const cases = [[1, 1, 'pass', false], [25, 3, 'pass', false], [3, 25, 'rush', false], [25, 25, 'pass', true], [21, 65, 'rush', true], [0, 0, null, false]]
for (const [tg, ca, view, toggle] of cases) {
  const v = fieldView({ tg, ca })
  check(v.view === view && v.toggle === toggle, `fieldView(${tg} tgt, ${ca} car) -> ${v.view}${v.toggle ? ' + toggle' : ''}`)
}

// 6. Gibbs from the fixture grids: a pass-catching back gets the toggle, opens on runs.
const g = fieldView({ tg: Object.values(fx.field.player_pass[GIBBS.player_id]).reduce((a, z) => a + z.att, 0), ca: Object.values(fx.field.player_rush[GIBBS.player_id]).reduce((a, z) => a + z.att, 0) })
check(g.view === 'rush' && g.toggle, `Gibbs -> ${g.view}${g.toggle ? ' + toggle' : ''}`)

console.log(failed ? `\n${failed} failed` : '\nall green')
process.exit(failed ? 1 : 0)
