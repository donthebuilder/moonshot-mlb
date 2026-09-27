#!/usr/bin/env node
// LAMP SHOTS (lamp-sog-v1) — offline checks of the model + one live,
// read-only buildNight on a real 2025-26 date. TEST DATA ONLY where made up;
// the boxscore fixture is a real saved league payload (CAR@TOR 2026-03-20).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-sog.mjs
import { readFileSync } from 'node:fs'
import { saPer60, sogLegs, scoreSogNight, gradeSogRows, toPropRow, BAR, CALLED_K, MODEL_VERSION } from '../lib/nhl/sogModel.js'
import { pooledLegs } from '../lib/nhl/goalModel.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// ── SA/60 from goalie lines (real TOR 2025-26 club-stats numbers) ───────────
const TOR = [{ sa: 708, toi: 83355 }, { sa: 1220, toi: 133804 }, { sa: 80, toi: 10888 }, { sa: 81, toi: 7560 }, { sa: 548, toi: 60524 }]
const v = saPer60([], TOR)
check(Math.abs(v - (2637 * 3600) / 296131) < 1e-9 && Math.round(v * 10) / 10 === 32.1, `TOR 2025-26 SA/60 = ${v.toFixed(2)} (2637 SA over 82.3 goalie-games)`)
check(saPer60([{ sa: 30, toi: 3600 }], TOR) === v, 'this season under 5 goalie-games -> last season\'s rate')
check(saPer60([{ sa: 170, toi: 5 * 3600 }], TOR) === 34, 'this season at 5 goalie-games -> this season\'s rate')
check(saPer60([], []) === null, 'no goalie lines -> null (the leg drops out of the mean)')

// ── scoring: K = 3 per game, NOT ON THE BOARD keeps its reason ─────────────
const cand = (gameId, id, team, opp, shots, toi, sa) => ({ gameId, playerId: id, name: `TEST ${id}`, team, opp, home: team === 'H', legs: sogLegs(pooledLegs({ gp: 40, shots, g: 5, toi }, null), sa), context: {} })
const night = [
  ...[1, 2, 3, 4, 5].map((i) => cand(1, 100 + i, 'A', 'H', 60 + i * 20, 900 + i * 30, 30)),
  ...[1, 2, 3, 4].map((i) => cand(1, 200 + i, 'H', 'A', 50 + i * 25, 850 + i * 40, 33)),
  { gameId: 1, playerId: 999, name: 'TEST rookie', team: 'A', opp: 'H', home: false, legs: sogLegs(pooledLegs({ gp: 4, shots: 9, g: 1, toi: 700 }, null), 30), context: {} },
  ...[1, 2, 3].map((i) => cand(2, 300 + i, 'B', 'C', 70 + i * 10, 1000, 29)),
]
const rows = scoreSogNight(night)
const g1 = rows.filter((r) => r.gameId === 1)
check(g1.filter((r) => r.status === 'called').length === CALLED_K && rows.filter((r) => r.gameId === 2 && r.status === 'called').length === 3, 'exactly 3 CALLED per game')
const rookie = rows.find((r) => r.playerId === 999)
check(rookie.status === 'off' && /fewer than 10 NHL games/.test(rookie.reason), `under 10 games -> NOT ON THE BOARD, "${rookie.reason}"`)
check(g1.filter((r) => r.score != null).every((r) => r.score >= 0 && r.score <= 100) && g1.find((r) => r.rank === 1).status === 'called', 'scores 0-100, rank 1 is CALLED')
const noOpp = scoreSogNight([cand(3, 1, 'X', 'Y', 80, 1000, null), cand(3, 2, 'X', 'Y', 40, 900, null)])
check(noOpp[0].score != null && noOpp[0].pct.oppSaPg === null, 'missing opponent SA/60 -> that leg drops out, the score still forms')

// ── the grade, against a real boxscore ─────────────────────────────────────
const box = JSON.parse(readFileSync(new URL('./fixtures/TEST-nhl-boxscore-2025021094.json', import.meta.url)))
const skaters = ['awayTeam', 'homeTeam'].flatMap((s) => [...box.playerByGameStats[s].forwards, ...box.playerByGameStats[s].defense])
const three = skaters.find((s) => s.sog >= 3); const two = skaters.find((s) => s.sog < 3)
const graded = gradeSogRows([{ player_id: three.playerId }, { player_id: two.playerId }, { player_id: 1 }], box.playerByGameStats)
check(graded[0].dressed && graded[0].value === three.sog && graded[0].hit === true, `${three.name.default}: ${three.sog} SOG -> hit`)
check(graded[1].hit === false && graded[1].value === two.sog, `${two.name.default}: ${two.sog} SOG -> miss`)
check(graded[2].dressed === false && graded[2].hit === null && graded[2].value === null, 'not dressed -> void (hit null), never a miss')
const pr = toPropRow(rows[0], { id: 1, season: 20262027, gameType: 2, startUtc: '2026-10-01T23:00:00Z' }, { date: '2026-10-01' }, '2026-10-01T22:59:00Z')
check(pr.market === 'SOG' && pr.model_version === MODEL_VERSION && pr.bar === BAR && pr.legs.oppSaPg === 30, 'row shape: market SOG, lamp-sog-v1, bar 3, legs carry oppSaPg')

// ── live, read-only: a real 2025-26 night through buildNight ──────────────
const { buildNight } = await import('../lib/nhl/goalBoard.js')
const n = await buildNight('2026-03-20')
const perGame = [...n.sogByGame.values()]
check(n.sogRows?.length > 0 && perGame.every((list) => list.filter((r) => r.status === 'called').length === 3), `buildNight 2026-03-20: ${n.sogRows.length} SOG rows over ${perGame.length} games, 3 CALLED in each`)
check(n.sogRows.length === n.rows.length, `same population as the goal board (${n.rows.length} rows)`)
const top = [...n.sogRows].filter((r) => r.status === 'called').sort((a, b) => b.score - a.score).slice(0, 3)
console.log('   e.g.', top.map((r) => `${r.name} ${r.score} (shots/GP ${r.legs.shotsPg.toFixed(2)}, opp SA/60 ${r.legs.oppSaPg?.toFixed(1)})`).join(' · '))
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
