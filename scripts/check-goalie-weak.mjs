#!/usr/bin/env node
// WHERE A GOALIE IS WEAK (2026-10-10). Offline. Every goalie, club, shot and goal below is TEST data made up for the check.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-goalie-weak.mjs
// Covers: the zone ranking against the league, the sample floor, the season labels, an unconfirmed starter (no goalie claim anywhere),
// the shooter-vs-goalie match counts, the write-up line (and the fact checker over it), and the wording lint.
import { readFileSync } from 'node:fs'
import { weakSpots, weakSentence, sampleLabel, leagueWord, zoneCounts, shooterMatch, clearsFloor, lintWording, WEAK_FLOOR, ZONE_PHRASE, ZONE_SHORT } from '../lib/nhl/goalieWeak.js'
import { GOALIE_ZONES } from '../lib/nhl/zones.js'
import { weakZoneCell, weakZoneColumn, NHL_BOARD_GROUPS, withNhlFullSet } from '../lib/nhl/boardColumns.js'
import { buildNhlWriteup, weakLine } from '../lib/writeups/nhl.js'
import { renderWriteupSafe } from '../lib/writeups/text.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }

// TEST league: 10,000 shots, every zone 10% to score except the crease (30%)
const lgZone = (sa, ga) => ({ sa, ga })
const LEAGUE = { season: 20269999, sa: 10000, ga: 1200, zones: { crease: lgZone(500, 150), inner_slot: lgZone(1500, 300), slot: lgZone(2500, 250), l_circle: lgZone(1500, 150), r_circle: lgZone(1500, 150), l_point: lgZone(1250, 100), r_point: lgZone(1250, 125) } }
// TEST goalie "G": slot 100 shots 20 goals (+10 over the league's 10), l_circle 60 shots 12 goals (+6), r_point 200 shots 28 goals (+8: a bigger gap than the circle),
// inner_slot 30 shots 12 goals (+6, fewer shots than the circle: crowded out by the top 3), r_circle 12 shots 6 goals (thin zone), crease 40 shots 12 goals (= the league)
const mk = (zones, games) => { const sa = Object.values(zones).reduce((a, z) => a + z.sa, 0); const ga = Object.values(zones).reduce((a, z) => a + z.ga, 0); return { games, sa, ga, zones } }
const GOALIE = mk({ slot: { sa: 100, ga: 20 }, l_circle: { sa: 60, ga: 12 }, r_point: { sa: 200, ga: 28 }, inner_slot: { sa: 30, ga: 12 }, r_circle: { sa: 12, ga: 6 }, crease: { sa: 40, ga: 12 } }, 14)
const ANSWER = { available: true, goalie: GOALIE, league: LEAGUE, leagueSeason: 20269999, leagueFallback: false }

// ── ranking vs the league ──
const w = weakSpots(ANSWER)
check(w.state === 'ok', 'a goalie over the floor with zones above the league reads ok')
check(w.spots.length === 3, 'at most three spots are listed')
check(w.spots.map((s) => s.key).join() === 'slot,r_point,l_circle', 'ranked by goals above the league (+10 slot, +8 right point, +6 left circle), not by the rate')
check(Math.abs(w.spots[0].excess - 10) < 1e-9 && Math.abs(w.spots[0].expected - 10) < 1e-9, 'excess = goals - shots x the league rate (20 - 100 x 10% = 10)')
check(!w.spots.some((s) => s.key === 'r_circle'), 'a zone with fewer than the zone floor of shots is never listed, whatever its rate (6 of 12)')
check(!w.spots.some((s) => s.key === 'crease'), 'a zone at the league rate is not weak')
check(w.spots[0].phrase === 'the slot' && w.spots[2].phrase === 'the left circle', 'zone words are the rink’s')
check(GOALIE_ZONES.every((z) => ZONE_PHRASE[z.key] && ZONE_SHORT[z.key]), 'every named zone has rink words')
const calm = weakSpots({ ...ANSWER, goalie: mk({ slot: { sa: 100, ga: 11 }, l_circle: { sa: 60, ga: 6 } }, 14) })
check(calm.state === 'none' && calm.spots.length === 0, 'a goalie at the league rate everywhere reads none: nothing is invented')
// one standard error: 25 shots, 4 goals vs the league's 10% = +1.5 goals but under one standard error (sqrt(25 x .1 x .9) = 1.5 -> z = 1.0 passes); 25 shots / 3 goals = +0.5 fails the 1-goal gap
check(weakSpots({ ...ANSWER, goalie: mk({ slot: { sa: 25, ga: 3 } }, 14) }).state === 'none', 'a gap under one goal is not a weakness')
check(weakSpots({ ...ANSWER, goalie: mk({ slot: { sa: 400, ga: 41 } }, 14) }).state === 'none', 'a gap under one standard error of a big sample is not a weakness (41 on 400 vs 40 expected)')

// ── the floor ──
check(!clearsFloor({ starts: 7, sa: 149, ga: 10 }) && clearsFloor({ starts: 8, sa: 10, ga: 1 }) && clearsFloor({ starts: 3, sa: 150, ga: 15 }), `the floor is ${WEAK_FLOOR.starts} starts OR ${WEAK_FLOOR.shots} shots`)
const thin = weakSpots({ ...ANSWER, goalie: mk({ slot: { sa: 60, ga: 20 } }, 3) })
check(thin.state === 'thin' && thin.spots.length === 0 && thin.sample.starts === 3 && thin.sample.sa === 60, 'under the floor: state thin, nothing ranked, the sample still reported')
check(weakSpots({ available: false }).state === 'unavailable' && weakSpots(null).state === 'unavailable', 'no zone answer (the SQL has not run): unavailable, nothing guessed')

// ── the season labels ──
check(sampleLabel({ starts: 2, sa: 58, ga: 12 }) === '2 starts · 58 shots this season', 'the sample reads "n starts · n shots this season"')
check(sampleLabel({ starts: 1, sa: 1, ga: 0 }) === '1 start · 1 shot this season', 'the singular reads right')
check(sampleLabel({ starts: 57, sa: 1559, ga: 1 }, 'in 2025-26') === '57 starts · 1559 shots in 2025-26', 'a past season is named, never "this season"')
check(/this season’s league rates/.test(leagueWord({ leagueFallback: false })) && /last season’s league rates/.test(leagueWord({ leagueFallback: true })), 'the league basis is labelled: this season’s, or last season’s when the sample is small')
const fb = weakSpots({ ...ANSWER, leagueFallback: true, leagueSeason: 20259999 })
check(fb.leagueFallback === true && fb.leagueSeason === 20259999, 'a last-season league basis is carried through, not hidden')

// ── an unconfirmed starter: no goalie claim anywhere ──
const BG = { starters: { away: { playerId: 1111111, name: 'Test Goalie A', confirmed: true }, home: { playerId: 2222222, name: 'Test Goalie H', confirmed: false } } }
const WEAK = { 1111111: { state: 'ok', spots: [{ key: 'slot', short: 'Slot', phrase: 'the slot', sa: 100, ga: 20, lg: 0.1 }, { key: 'l_circle', short: 'L circle', phrase: 'the left circle', sa: 60, ga: 12, lg: 0.1 }] }, 2222222: { state: 'ok', spots: [{ key: 'slot', short: 'Slot', phrase: 'the slot', sa: 90, ga: 19, lg: 0.1 }] } }
check(weakZoneCell({ home: true }, BG, WEAK) === 'Slot 20/100 · L circle 12/60', 'a confirmed opposing goalie: the top two zones as goals/shots')
check(weakZoneCell({ home: false }, BG, WEAK) === 'starter not confirmed', 'an unconfirmed opposing goalie: "starter not confirmed" and no zone, though a read for his id exists')
check(weakZoneCell({ home: true }, { starters: null }, WEAK) === 'no starter source' && weakZoneCell({ home: true }, {}, WEAK) === 'no starter source', 'a game with no starter source says so')
check(weakZoneCell({ home: true }, { starters: { away: null, home: null } }, WEAK) === 'starter not confirmed', 'a source with no entry for the side is not a goalie')
check(weakZoneCell({ home: true }, BG, null) === '…', 'while the read loads the cell says so')
check(weakZoneCell({ home: true }, BG, { 1111111: { state: 'thin', spots: [] } }) === 'too few shots', 'a goalie under the floor: "too few shots"')
check(weakZoneCell({ home: true }, BG, { 1111111: { state: 'none', spots: [] } }) === 'none above league', 'a goalie with no zone above the league: said so')
check(weakZoneCell({ home: true }, BG, {}) === '—', 'no read for him: a dash, never a guess')
const col = weakZoneColumn({ open: () => {}, gameOf: () => 5 })
check(col.group === NHL_BOARD_GROUPS.matchup && col.group.label === 'The matchup' && col.key === 'weak_zone', 'the column sits in the group "The matchup"')
check(weakZoneColumn().link({}) === null, 'a column with no opener is not a dead link')
check(!withNhlFullSet([{ _row: { legs: {} }, name: 'x' }], []).columns.some((c) => c.key === 'weak_zone'), 'the column is not in the default set: it is off until the board switches it on')

// ── the shooter-vs-goalie match ──
// TEST shooter: 6 shots from the slot, 3 from the left circle, 1 from the right point, 10 on goal in all (points already turned to attack x = +89)
const pts = [...Array.from({ length: 6 }, () => [75, 0]), ...Array.from({ length: 3 }, () => [70, 30]), [40, -10]]
const zc = zoneCounts(pts)
check(zc.m === 10 && zc.zones.inner_slot === 6 && zc.zones.l_circle === 3 && zc.zones.r_point === 1, 'zone counts follow the named zones (75,0 inner slot; 70,30 left circle; 40,-10 right point)')
const mt = shooterMatch(w.spots, zc)
check(mt.m === 10 && mt.n === 4 && mt.byZone.find((z) => z.key === 'l_circle').n === 3 && mt.byZone.find((z) => z.key === 'r_point').n === 1 && mt.byZone.find((z) => z.key === 'slot').n === 0, 'shots from his weak zones: 4 of 10 (slot 0, right point 1, left circle 3)')
check(shooterMatch(w.spots, { m: 0, zones: {} }) === null && shooterMatch([], zc) === null && shooterMatch(w.spots, null) === null, 'no shots on file, or no weak zone: no match, never a zero that looks like one')

// ── the write-up line ──
const spot = { key: 'slot', phrase: 'the slot', short: 'Slot', sa: 100, ga: 20, lg: 0.0834 }
const s1 = weakSentence('Test Goalie A', spot)
check(s1 === 'Test Goalie A allows more goals than the league from the slot (20 on 100 shots vs the league’s 8.3%).', 'the sentence has the goalie, the zone, goals on shots and the league’s rate')
check(lintWording(s1).length === 0, 'the sentence is clean: no outcome claim, no probability')
check(lintWording('He will score from the slot').length > 0 && lintWording('a 31% chance').length > 0 && lintWording('guaranteed').length > 0, 'the lint catches "will score", a probability word and a guarantee')
const L = weakLine({ playerId: 1111111, name: 'Test Goalie A', confirmed: true }, { 1111111: { state: 'ok', spots: [spot] } })
check(L && L.v.join() === '20,100,8.3' && L.names[0] === 'Test Goalie A' && !/\.$/.test(L.t), 'the line carries every number it prints and the goalie’s name for the checker')
check(weakLine({ playerId: 1111111, name: 'Test Goalie A', confirmed: false }, { 1111111: { state: 'ok', spots: [spot] } }) === null, 'an unconfirmed starter: no line')
check(weakLine(null, { 1111111: { state: 'ok', spots: [spot] } }) === null && weakLine(undefined, null) === null, 'no goalie: no line')
check(weakLine({ playerId: 1111111, name: 'x', confirmed: true }, { 1111111: { state: 'thin', spots: [] } }) === null, 'a goalie under the floor: no line')
check(weakLine({ playerId: 1111111, name: 'x', confirmed: true }, { 1111111: { state: 'none', spots: [] } }) === null && weakLine({ playerId: 1111111, name: 'x', confirmed: true }, {}) === null, 'no zone above the league, or no read: no line')
const GAME = (oppConfirmed) => {
  const row = (team, opp, home, gid, i) => ({ playerId: 8000000 + i, name: `Test Skater ${team}`, team, opp, pos: 'C', home, status: 'called', score: 80 - i, rank: 1, context: { role: i === 0 ? 'TOP' : 'GOAL', nightRank: 3 + i, nightOf: 120, oppGoalie: { playerId: gid, name: `Test Goalie ${opp}`, confirmed: oppConfirmed } }, legs: { shotsPg: 3.1, goalsPg: 0.4, toi: 1100 }, pct: { shotsPg: 80, goalsPg: 70, toi: 80 } })
  return { game: { id: 1, startUtc: '2099-01-01T00:00:00Z', state: 'pre', away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' }, venue: 'Test Arena' }, rows: [row('AAA', 'BBB', false, 2222222, 0), row('BBB', 'AAA', true, 1111111, 1)], spots: {}, starters: BG.starters }
}
const wk = { 1111111: { state: 'ok', spots: [spot] }, 2222222: { state: 'ok', spots: [{ ...spot, sa: 90, ga: 19 }] } }
const wu = buildNhlWriteup(GAME(true), { goalieWeak: wk })
const lines = wu.players.map((p) => p.why.find((l) => /allows more goals than the league/.test(l.t)))
check(lines.every(Boolean), 'both called skaters get the goalie line when both goalies are confirmed and read')
const rend = renderWriteupSafe(wu, { xLimit: 900 })
check(rend.ok && !rend.fellBack && /allows more goals than the league from the slot/.test(rend.full), 'the fact checker accepts the line (goalie name and numbers are in the facts) and the long text carries it')
check(!buildNhlWriteup(GAME(false), { goalieWeak: wk }).players.some((p) => p.why.some((l) => /allows more goals/.test(l.t))), 'unconfirmed starters: no goalie line in the write-up at all')
check(!buildNhlWriteup(GAME(true)).players.some((p) => p.why.some((l) => /allows more goals/.test(l.t))), 'no read passed: the write-up is exactly as before')

// ── the wording of every new surface ──
for (const f of ['components/lamp/GoalieWeakSpots.js', 'lib/nhl/goalieWeak.js', 'lib/nhl/boardColumns.js']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  const strings = (src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|>[^<>{}\n]*[A-Za-z][^<>{}\n]*</g) || []).filter((x) => /[a-z]{3,}\s+[a-z]{3,}/i.test(x))
  const claim = strings.filter((x) => /\bwill (score|beat|get|finish|find)\b|going to score|guaranteed|\bsure thing\b|should score|bound to|\bprobab|\bodds\b|\blikelihood\b/i.test(x) && !/lintWording|\.test\(|RegExp|bad\.push|claims an outcome|a probability word/.test(x))
  check(claim.length === 0, `${f}: no outcome claim or probability in its words${claim.length ? ' -- ' + claim[0].slice(0, 80) : ''}`)
}
process.exit(failed ? 1 : 0)
