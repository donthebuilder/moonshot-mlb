#!/usr/bin/env node
// LAMP SHADOW POINTS / ASSISTS (lamp-pts-v1 / lamp-ast-v1) — offline checks.
// Every skater line below is MADE-UP TEST DATA (names start "TEST"); the
// boxscore is the real saved league fixture CAR@TOR 2026-03-20, used only for
// the grade. No network, no database.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-pts-ast.mjs
import { readFileSync } from 'node:fs'
import { pooledLegs } from '../lib/nhl/goalModel.js'
import * as P from '../lib/nhl/ptsModel.js'
import * as A from '../lib/nhl/astModel.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// ── pooling: same window weight as lamp-goal-v1 ───────────────────────────
// TEST DATA: 20 GP this season, 82 last season -> last season weighted 62/82.
const cur = { gp: 20, shots: 50, g: 5, a: 10, pts: 15, toi: 1000 }
const prev = { gp: 82, shots: 200, g: 20, a: 41, pts: 61, toi: 1100 }
const pooled = pooledLegs(cur, prev)
const r = P.pointRates(pooled, cur, prev)
const w = 62 / 82
check(Math.abs(r.ptsPg - (15 + 61 * w) / 82) < 1e-12 && Math.abs(r.astPg - (10 + 41 * w) / 82) < 1e-12, `pooled pts/GP ${r.ptsPg.toFixed(3)}, ast/GP ${r.astPg.toFixed(3)} over 82 games`)
check(P.pointRates(pooledLegs({ gp: 3, pts: 2, a: 1 }, null), { gp: 3 }, null) === null, 'under 10 games -> no rates')

// ── ranking: TEST night, two games ────────────────────────────────────────
const cand = (gameId, id, team, opp, pts, a, toi, oppGa) => {
  const line = { gp: 40, shots: 80, g: pts - a, a, pts, toi }
  const pl = pooledLegs(line, null)
  const rt = P.pointRates(pl, line, null)
  return { gameId, playerId: id, name: `TEST ${id}`, team, opp, home: team === 'H', context: { oppGaPg: oppGa }, pl, rt }
}
const raw = [
  ...[1, 2, 3, 4, 5].map((i) => cand(1, 100 + i, 'A', 'H', 10 + i * 6, 6 + i * 4, 900 + i * 40, 3.0)),
  ...[1, 2, 3, 4].map((i) => cand(1, 200 + i, 'H', 'A', 8 + i * 5, 4 + i * 2, 850 + i * 50, 3.4)),
  ...[1, 2, 3, 4].map((i) => cand(2, 300 + i, 'B', 'C', 12 + i * 3, 8 + i * 2, 1000 + i * 10, 2.9)),
]
const rookie = { gameId: 1, playerId: 999, name: 'TEST rookie', team: 'A', opp: 'H', home: false, context: { oppGaPg: 3.4 }, pl: pooledLegs({ gp: 4, pts: 3, a: 2, toi: 700 }, null), rt: null }
const night = [...raw, rookie]
const ptsRows = P.scorePtsNight(night.map((c) => ({ ...c, legs: P.ptsLegs(c.pl, c.rt, c.context.oppGaPg) })))
const astRows = A.scoreAstNight(night.map((c) => ({ ...c, legs: A.astLegs(c.pl, c.rt, c.context.oppGaPg) })))
for (const [label, rows, leg] of [['PTS', ptsRows, 'ptsPg'], ['AST', astRows, 'astPg']]) {
  check([1, 2].every((gid) => rows.filter((x) => x.gameId === gid && x.status === 'called').length === 3), `${label}: exactly 3 CALLED per game`)
  check(rows.filter((x) => x.score != null).every((x) => x.score >= 0 && x.score <= 100), `${label}: scores 0-100`)
  const g1 = rows.filter((x) => x.gameId === 1 && x.rank != null).sort((a, b) => a.rank - b.rank)
  check(g1.every((x, i) => i === 0 || g1[i - 1].score >= x.score) && g1.slice(0, 3).every((x) => x.status === 'called') && g1.slice(3).every((x) => x.status === 'board'), `${label}: ranks follow score; 1-3 CALLED, 4+ ON THE BOARD`)
  const rk = rows.find((x) => x.playerId === 999)
  check(rk.status === 'off' && rk.rank == null && /fewer than 10 NHL games/.test(rk.reason), `${label}: under 10 games -> NOT ON THE BOARD, "${rk.reason}"`)
  const top = rows.filter((x) => x.legs?.ok).sort((a, b) => b.legs[leg] - a.legs[leg])[0]
  check(top.pct[leg] === 100, `${label}: the night's best ${leg} ranks at the 100th percentile`)
}
// tie on score -> the higher rate wins (TEST DATA: identical except the rate leg is swapped against toi)
const tie = P.scorePtsNight([
  { gameId: 9, playerId: 1, name: 'TEST b', team: 'X', opp: 'Y', legs: { ok: true, ptsPg: 0.5, toi: 1200, oppGaPg: 3 } },
  { gameId: 9, playerId: 2, name: 'TEST a', team: 'X', opp: 'Y', legs: { ok: true, ptsPg: 0.9, toi: 900, oppGaPg: 3 } },
])
check(tie[0].score === tie[1].score && tie.find((x) => x.playerId === 2).rank === 1, 'equal scores -> higher points/GP ranks first')
const noOpp = P.scorePtsNight([{ gameId: 3, playerId: 1, name: 'TEST x', legs: { ok: true, ptsPg: 0.7, toi: 1000, oppGaPg: null } }, { gameId: 3, playerId: 2, name: 'TEST y', legs: { ok: true, ptsPg: 0.3, toi: 900, oppGaPg: null } }])
check(noOpp[0].score != null && noOpp[0].pct.oppGaPg === null, 'missing opponent GA/GP -> that leg drops out, the score still forms')

// ── the grade, against a real boxscore ─────────────────────────────────────
const box = JSON.parse(readFileSync(new URL('./fixtures/TEST-nhl-boxscore-2025021094.json', import.meta.url)))
const sk = ['awayTeam', 'homeTeam'].flatMap((s) => [...box.playerByGameStats[s].forwards, ...box.playerByGameStats[s].defense])
const withPt = sk.find((s) => s.points >= 1); const noPt = sk.find((s) => s.points === 0)
const goalNoAst = sk.find((s) => s.goals >= 1 && s.assists === 0) || sk.find((s) => s.assists === 0)
const withAst = sk.find((s) => s.assists >= 1)
const gp = P.gradePtsRows([{ player_id: withPt.playerId }, { player_id: noPt.playerId }, { player_id: 1 }], box.playerByGameStats)
check(gp[0].dressed && gp[0].value === withPt.points && gp[0].hit === true, `PTS: ${withPt.name.default} ${withPt.points} pt -> hit`)
check(gp[1].dressed && gp[1].value === 0 && gp[1].hit === false, `PTS: ${noPt.name.default} 0 pts -> miss`)
check(gp[2].dressed === false && gp[2].value === null && gp[2].hit === null, 'PTS: did not dress -> void (hit null), never a miss')
const ga = A.gradeAstRows([{ playerId: withAst.playerId }, { playerId: goalNoAst.playerId }, { playerId: 2 }], box.playerByGameStats)
check(ga[0].hit === true && ga[0].value === withAst.assists, `AST: ${withAst.name.default} ${withAst.assists} ast -> hit`)
check(ga[1].hit === false && ga[1].value === 0, `AST: ${goalNoAst.name.default} (${goalNoAst.goals} G, 0 A) -> miss (a goal is not an assist)`)
check(ga[2].dressed === false && ga[2].hit === null, 'AST: did not dress -> void')

// ── the row shape ──────────────────────────────────────────────────────────
const g = { id: 1, season: 20262027, gameType: 2, startUtc: '2026-10-01T23:00:00Z' }; const day = { date: '2026-10-01' }
const pr = P.toPtsRow(ptsRows[0], g, day, '2026-10-01T22:59:00Z'); const ar = A.toAstRow(astRows[0], g, day, '2026-10-01T22:59:00Z')
check(pr.market === 'PTS' && pr.model_version === 'lamp-pts-v1' && pr.bar === 1 && 'ptsPg' in pr.legs && 'oppGaPg' in pr.legs, 'PTS row: market PTS, lamp-pts-v1, bar 1, legs carry ptsPg/oppGaPg')
check(ar.market === 'AST' && ar.model_version === 'lamp-ast-v1' && ar.bar === 1 && 'astPg' in ar.legs, 'AST row: market AST, lamp-ast-v1, bar 1, legs carry astPg')
check(P.toPtsRow(ptsRows.find((x) => x.playerId === 999), g, day, 'x').legs === null, 'unscored row writes legs null, reason kept')

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
