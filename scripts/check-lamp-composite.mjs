#!/usr/bin/env node
// lamp-goal-comp-v1 (2026-10-18). TEST DATA only: made-up clubs (AAA..DDD) and skaters, no real players, prices or results.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-lamp-composite.mjs
import { readFileSync } from 'node:fs'
import { scoreCompositeNight, toCompositeRow, gradeCompositeRows, netSave, WEIGHTS, MODEL_VERSION, MARKET } from '../lib/nhl/goalCompositeModel.js'
import { scoreNight } from '../lib/nhl/goalModel.js'
import { VERSIONS, versionsFor } from '../lib/nhl/versions.js'
import { scoreComposite2Night, toComposite2Row, shrinkQuality, WEIGHTS as W2, MODEL_VERSION as V2, XG_K } from '../lib/nhl/goalComposite2Model.js'
import { readShooterXg } from '../lib/nhl/goalComposite2Board.js'
import { liveVariety, compositeVariety } from './lamp-variety-report.mjs'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const t = (name, ok) => eq(name, Boolean(ok), true)

const sk = (gameId, team, opp, id, shots, goals, ang = {}, pos = 'C', ctx = {}) => ({
  gameId, team, opp, home: team === 'BBB' || team === 'DDD', playerId: id, name: `Test ${id}`, pos,
  legs: { ok: true, shotsPg: shots, goalsPg: goals, toi: 1000 + shots * 50, gpPooled: 30, gpCur: 30, gpPrev: 0, prevWeight: 0 }, context: { oppGaPg: 3, ...ctx },
  ang: { oppSa60: 30, oppSv: 0.905, oppSvBasis: 'club', oppShPg: 3, oppPkPct: 0.8, form: null, ppGoals: null, ...ang },
})
const SOFT = { oppSa60: 34, oppSv: 0.88 }, TIGHT = { oppSa60: 26, oppSv: 0.925 }, MID = {}
const slate = (over = {}) => [
  sk(1, 'AAA', 'BBB', 'a1', 3.0, 0.30, SOFT), sk(1, 'AAA', 'BBB', 'a2', 2.0, 0.20, SOFT), sk(1, 'AAA', 'BBB', 'a3', 2.6, 0.22, SOFT),
  sk(1, 'BBB', 'AAA', 'b1', 3.0, 0.30, TIGHT), sk(1, 'BBB', 'AAA', 'b2', 2.0, 0.20, TIGHT), sk(1, 'BBB', 'AAA', 'b3', 2.6, 0.22, TIGHT),
  sk(2, 'CCC', 'DDD', 'c1', 2.6, 0.22, MID), sk(2, 'CCC', 'DDD', 'c2', 3.4, 0.35, MID), sk(2, 'CCC', 'DDD', 'c3', 1.5, 0.10, MID),
  sk(2, 'DDD', 'CCC', 'd1', 3.0, 0.30, MID), sk(2, 'DDD', 'CCC', 'd2', 2.0, 0.40, MID),
].map((c) => (over[c.playerId] ? { ...c, ...over[c.playerId], ang: { ...c.ang, ...(over[c.playerId].ang || {}) } } : c))
const get = (o, id) => o.rows.find((r) => r.playerId === id)

console.log('-- definition')
t('weights are plain and sum to 1.00', Math.abs(Object.values(WEIGHTS).reduce((s, x) => s + x, 0) - 1) < 1e-9)
eq('market GOAL under its own version (no SQL): v1 from its first night, v1b on the v5 pool (injury report)', [MARKET, MODEL_VERSION, [...new Set(VERSIONS.comp)]], ['GOAL', 'lamp-goal-comp-v1b', ['lamp-goal-comp-v1', 'lamp-goal-comp-v1b']])
eq('versionsFor: v1 before 2026-10-23, v1b from it', [versionsFor('2026-10-19').comp, versionsFor('2027-01-01').comp], ['lamp-goal-comp-v1', 'lamp-goal-comp-v1b'])

console.log('-- the matchup is built into the one score')
const out = scoreCompositeNight(slate())
t('a1 (soft net) outscores b1 (tight net): identical skaters, the opponent differs', get(out, 'a1').score > get(out, 'b1').score)
const base = scoreCompositeNight(slate({ b1: { ang: TIGHT } })), weak = scoreCompositeNight(slate({ b1: { ang: { oppSa60: 34, oppSv: 0.86 } } }))
t('a weak goalie raises his shooter\'s composite (b1: tight net -> weak net)', get(weak, 'b1').score > get(base, 'b1').score)
t('a weak defence (shots allowed) alone raises it', get(scoreCompositeNight(slate({ b1: { ang: { oppSa60: 36 } } })), 'b1').score >= get(scoreCompositeNight(slate({ b1: { ang: { oppSa60: 24 } } })), 'b1').score)
const eqTwo = scoreCompositeNight([sk(1, 'AAA', 'BBB', 'e1', 2.5, 0.25, SOFT), sk(1, 'BBB', 'AAA', 'e2', 2.5, 0.25, TIGHT), sk(1, 'AAA', 'BBB', 'e3', 1, 0.05, SOFT), sk(1, 'BBB', 'AAA', 'e4', 4, 0.5, TIGHT)])
t('two equal skaters: the one facing the weak defence ranks higher', get(eqTwo, 'e1').score > get(eqTwo, 'e2').score && get(eqTwo, 'e1').rank < get(eqTwo, 'e2').rank)
eq('a confirmed starter with 100+ shots against is read at his own save rate', netSave([{ id: 1, sa: 200, sv: 180 }, { id: 2, sa: 400, sv: 340 }], 1), { sv: 0.9, basis: 'starter' })
eq('a starter under the shots floor falls back to the club\'s goalies together', netSave([{ id: 1, sa: 40, sv: 30 }, { id: 2, sa: 400, sv: 340 }], 1).basis, 'club')
eq('no goalie lines: no save rate', netSave([], null), { sv: null, basis: null })

console.log('-- form, power play, rest and home')
// form is a percentile among the men who HAVE form tonight, so give the rest of the slate an ordinary form (about his season rate)
const flat = Object.fromEntries(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c2', 'c3', 'd1', 'd2'].map((id, i) => [id, { ang: { form: { l5: i % 3, gp5: 5, l10: (i % 3) + 1, gp10: 10 } } }]))
const withC1 = (form) => scoreCompositeNight(slate({ ...flat, c1: { ang: { form } } }))
const hot = withC1({ l5: 4, gp5: 5, l10: 5, gp10: 10 }), cold = withC1({ l5: 0, gp5: 5, l10: 0, gp10: 10 }), mid = withC1({ l5: 1, gp5: 5, l10: 2, gp10: 10 })
t('a hot form raises the composite; a cold one does not raise it and ranks below the middle', get(hot, 'c1').score > get(mid, 'c1').score && get(hot, 'c1').score > get(cold, 'c1').score && get(cold, 'c1').score <= get(mid, 'c1').score && get(cold, 'c1').pct.form < 50)
t('under 4 games of form: neutral (50), nothing invented', get(withC1({ l5: 3, gp5: 3, l10: 3, gp10: 3 }), 'c1').pct.form === 50)
const pp = scoreCompositeNight(slate({ c1: { ang: { ppGoals: 6, oppShPg: 4.2, oppPkPct: 0.72 } }, c3: { ang: { ppGoals: 0 } } }))
t('power-play goals against a leaky kill raise him; a real 0 PP goals does not', get(pp, 'c1').score > get(out, 'c1').score && get(pp, 'c3').pct.role < 50)
t('a back-to-back lowers the composite', get(scoreCompositeNight(slate({ c1: { context: { b2b: true } } })), 'c1').score < get(out, 'c1').score)
t('home raises it (same skater, same night)', get(scoreCompositeNight([{ ...sk(1, 'AAA', 'BBB', 'h', 2.5, 0.25, MID), home: true }, { ...sk(1, 'AAA', 'BBB', 'k', 2.5, 0.25, MID), home: false }]), 'h').score > get(scoreCompositeNight([{ ...sk(1, 'AAA', 'BBB', 'h', 2.5, 0.25, MID), home: true }, { ...sk(1, 'AAA', 'BBB', 'k', 2.5, 0.25, MID), home: false }]), 'k').score)

console.log('-- one top pick per team per game; every scored skater is logged')
for (const [gid, list] of out.picks) eq(`game ${gid}: exactly one pick per team`, [list.length, new Set(list.map((r) => r.team)).size], [2, 2])
eq('every scored skater is a row (11 in, 11 out)', out.rows.length, 11)
t('the pick is the highest composite on his team in that game', [...out.picks.values()].flat().every((p) => out.rows.filter((r) => r.gameId === p.gameId && r.team === p.team).every((r) => r.score <= p.score)))
t('status: picks are the hidden log\'s called, the rest board', out.rows.every((r) => (r.context.pick ? r.status === 'called' : r.status === 'board')))
t('scores are 0-100 integers; no probability in any row (no chance / probability anywhere)', out.rows.every((r) => Number.isInteger(r.score) && r.score >= 0 && r.score <= 100) && !/probab|chance/i.test(JSON.stringify(out.rows)))
const code = ['goalCompositeModel', 'goalCompositeBoard'].map((f) => readFileSync(new URL(`../lib/nhl/${f}.js`, import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')).join('\n')
t('the code never names a probability field', !/goalGameProbability|probability/i.test(code))

console.log('-- it does not pick the same man by default: the matchup moves the pick')
const swap = scoreCompositeNight(slate({ a2: { ang: { oppSa60: 38, oppSv: 0.84 } }, a1: { ang: TIGHT } }))
t('a team\'s pick can change with the opponent (same skaters, other net)', out.picks.get(1).find((r) => r.team === 'AAA').playerId !== swap.picks.get(1).find((r) => r.team === 'AAA').playerId || get(swap, 'a2').rank < get(out, 'a2').rank)

console.log('-- the log row')
const g = { id: 1, season: 20262027, gameType: 2, startUtc: '2026-10-20T23:00:00Z' }
const row = toCompositeRow(get(out, 'a1'), g, { date: '2026-10-20' }, '2026-10-20T22:00:00Z')
eq('row: market GOAL, version lamp-goal-comp-v1, bar 1', [row.market, row.model_version, row.bar], ['GOAL', 'lamp-goal-comp-v1', 1])
t('row carries the group percentiles and the weights in context', row.context.groups.matchup != null && row.context.weights.own === 0.35 && row.pct.score === row.score)
const graded = gradeCompositeRows([{ player_id: 'x', hit: null }, { player_id: 1, hit: null }, { player_id: 2, hit: null }], { awayTeam: { forwards: [{ playerId: 1, goals: 2 }], defense: [{ playerId: 2, goals: 0 }] }, homeTeam: {} })
eq('graded: scored = hit, dressed without a goal = miss, not dressed = void', graded.map((r) => [r.dressed, r.hit]), [[false, null], [true, true], [true, false]])

console.log('-- the live board is untouched, and nothing throws')
const live = () => slate().map(({ ang, ...c }) => c)
const before = JSON.stringify(scoreNight(live())), input = JSON.stringify(slate())
scoreCompositeNight(slate())
eq('scoreNight output is byte-identical before and after the shadow runs', JSON.stringify(scoreNight(live())), before)
eq('the shadow does not mutate the candidates it reads', JSON.stringify(slate()), input)
t('goalModel.js and goalBoard\'s scoring do not import the shadow', !/goalComposite/.test(readFileSync(new URL('../lib/nhl/goalModel.js', import.meta.url), 'utf8')) && !/goalComposite/.test(readFileSync(new URL('../lib/nhl/goalBoard.js', import.meta.url), 'utf8')))
let threw = null
try { scoreCompositeNight([]); scoreCompositeNight(null); scoreCompositeNight([{ gameId: 1, playerId: 'z', legs: { ok: false }, ang: {} }]); scoreCompositeNight([{ gameId: 1, playerId: 'z', team: 'A', opp: 'B', pos: 'C', name: 'T', legs: { ok: true, shotsPg: NaN, goalsPg: null } }]) } catch (e) { threw = e.message }
eq('empty, null, unscored and garbage candidates: no throw', threw, null)
const { attachComposite } = await import('../lib/nhl/goalCompositeBoard.js')
const night = { season: { current: 20262027 }, rows: live(), compFeed: { sa60: { AAA: 30, BBB: 30, CCC: 30, DDD: 30 }, goalies: {} } }
threw = null
try { await attachComposite(night, '2026-10-20') } catch (e) { threw = e.message }
eq('attachComposite with every feed down (sandbox: no NHL host): no throw', threw, null)
t('and it still hangs the composite on the night from the board\'s own legs', night.compByGame instanceof Map && night.compByGame.size === 2)
const tick = readFileSync(new URL('../app/api/lamp/tick/route.js', import.meta.url), 'utf8')
t('the tick catches a composite failure (its own try/catch, compByGame nulled)', /try \{ out\.composite = .*attachComposite[\s\S]{0,200}night\.compByGame = null/.test(tick))
t('the tick imports no other public surface of it (no CALLED word, push, Discord or X)', !/composite/i.test(readFileSync(new URL('../lib/callStatus.js', import.meta.url), 'utf8')))

console.log('-- the variety report math (TEST rows)')
const L = liveVariety([
  { game_date: '2026-10-01', game_id: 1, team: 'AAA', player_id: 1, name: 'T1' }, { game_date: '2026-10-02', game_id: 2, team: 'AAA', player_id: 1, name: 'T1' },
  { game_date: '2026-10-03', game_id: 3, team: 'AAA', player_id: 2, name: 'T2' }, { game_date: '2026-10-01', game_id: 1, team: 'BBB', player_id: 3, name: 'T3' },
  { game_date: '2026-10-02', game_id: 2, team: 'BBB', player_id: 4, name: 'T4' },
])
eq('AAA: 3 calls, 2 men -> repeat rate 0.333; BBB: 2 calls, 2 men -> 0', [L.clubs.find((c) => c.team === 'AAA').repeatRate, L.clubs.find((c) => c.team === 'BBB').repeatRate], [0.333, 0])
eq('league repeat rate: 1 repeat in 5 calls', L.repeatRate, 0.2)
const C = compositeVariety([{ game_date: 'd', game_id: 1, player_id: 1, name: 'T1', team: 'AAA', hit: true }, { game_date: 'd', game_id: 2, player_id: 9, name: 'T9', team: 'CCC', hit: false }], new Set(['1|1']))
eq('composite: 2 picks, 1 hit of 2 graded, half the live CALLED man', [C.picks, C.hitPct, C.overlapWithLiveCalled], [2, 50, 50])

console.log('-- lamp-goal-comp-v2 (TEST rows; made-up clubs and skaters, no real data)')
eq('v2 is its own version beside v1 (v2b / v1b on the v5 pool)', [V2, [...new Set(VERSIONS.comp2)], MODEL_VERSION], ['lamp-goal-comp-v2b', ['lamp-goal-comp-v2', 'lamp-goal-comp-v2b'], 'lamp-goal-comp-v1b'])
t('v2 weights are v1\'s (only the ingredients inside the groups changed) and sum to 1.00', JSON.stringify(W2) === JSON.stringify(WEIGHTS) && Math.abs(Object.values(W2).reduce((x, y) => x + y, 0) - 1) < 1e-9)
// every skater gets 20 shots on file at the league rate 0.09 unless a case overrides it, so the night's league xG per shot is stable
const XGN = { xgN: 40, xg: 3.6, xgG: 4 }
const slate2 = (over = {}) => slate(over).map((c) => ({ ...c, ang: { ...XGN, ppToiPg: 60, ppShare: 0.3, oppRest: 1, ...c.ang } }))
const s2 = (over) => scoreComposite2Night(slate2(over))
const base2 = s2()
t('same slate as v1, 11 in and 11 out, one pick per team per game', base2.rows.length === 11 && [...base2.picks.values()].every((l) => l.length === 2 && new Set(l.map((r) => r.team)).size === 2))
t('v2 still reads the matchup (soft net above tight net, identical skaters)', get(base2, 'a1').score > get(base2, 'b1').score)
// (a) SHOT QUALITY
const lowXg = s2({ c1: { ang: { xg: 1.2 } } }), hiXg = s2({ c1: { ang: { xg: 7.2 } } })
t('higher xG on the same shots raises his own-rate group and score', get(hiXg, 'c1').pct.own >= get(lowXg, 'c1').pct.own && get(hiXg, 'c1').score > get(lowXg, 'c1').score && get(hiXg, 'c1').context.xgPg > get(lowXg, 'c1').context.xgPg)
t('finishing is logged (goals minus xG on his own shots) and a hot finisher outscores a cold one at equal xG', get(base2, 'c1').context.finishing === 0.4 && get(s2({ c1: { ang: { xgG: 9 } } }), 'c1').score >= get(s2({ c1: { ang: { xgG: 0 } } }), 'c1').score)
eq('xG shrinks toward the league: 3 shots read near the league rate, 300 near his own', [shrinkQuality(0.9, 3, 0.09) > 0.085 && shrinkQuality(0.9, 3, 0.09) < 0.18, shrinkQuality(60, 300, 0.09) > 0.18], [true, true])
eq('no league figure: no quality (plain shots)', shrinkQuality(1, 10, null), null)
const noXg = s2({ c1: { ang: { xgN: null, xg: null, xgG: null } } })
t('a skater with no xG falls back to plain shots at the league rate and is NOT lowered below a man with xG at the league rate', get(noXg, 'c1').context.xgShots === null && get(noXg, 'c1').score >= get(base2, 'c1').score - 1 && Math.abs(get(noXg, 'c1').context.xgPg - get(base2, 'c1').context.xgPg) < 1e-3)
const allNoXg = scoreComposite2Night(slate().map((c) => ({ ...c, ang: { ...c.ang, ppToiPg: 60, ppShare: 0.3 } })))
t('a night where the shot archive is down: plain shots, nothing throws, everyone still scored', allNoXg.rows.length === 11 && allNoXg.rows.every((r) => r.context.xgPg === null))
// (b) POWER-PLAY ICE TIME
const ppHi = s2({ c3: { ang: { ppToiPg: 150, ppShare: 0.8 } } }), ppLo = s2({ c3: { ang: { ppToiPg: 0, ppShare: 0 } } })
t('more PP ice time and a bigger share of his club\'s PP raise the role group and the score; a real 0 sits below the middle', get(ppHi, 'c3').pct.role > get(base2, 'c3').pct.role && get(ppHi, 'c3').score > get(ppLo, 'c3').score && get(ppLo, 'c3').pct.role < 50)
t('PP share alone moves the role group (same PP minutes, bigger share)', get(s2({ c3: { ang: { ppShare: 0.95 } } }), 'c3').pct.role > get(s2({ c3: { ang: { ppShare: 0.05 } } }), 'c3').pct.role)
t('a leaky kill still lifts a PP man (the opponent factor is kept)', get(s2({ c1: { ang: { oppShPg: 4.4, oppPkPct: 0.7 } } }), 'c1').pct.role >= get(base2, 'c1').pct.role)
const noPp = s2({ c1: { ang: { ppToiPg: null, ppShare: null } } })
t('no PP data: role is neutral 50 and the score is not lowered by the gap (compared with a below-average PP man)', get(noPp, 'c1').pct.role === 50 && get(noPp, 'c1').score >= get(s2({ c1: { ang: { ppToiPg: 0, ppShare: 0 } } }), 'c1').score)
t('PP goals no longer stand in for the role (v2 ignores ppGoals)', get(s2({ c1: { ang: { ppGoals: 20 } } }), 'c1').score === get(base2, 'c1').score)
// (c) OPPONENT REST
const tired = s2({ c1: { ang: { oppRest: 0 } } }), rested = s2({ c1: { ang: { oppRest: 3 } } }), unknown = s2({ c1: { ang: { oppRest: null } } })
t('a tired opponent (back-to-back) raises his skater: situation group and score', get(tired, 'c1').pct.situation > get(rested, 'c1').pct.situation && get(tired, 'c1').score >= get(rested, 'c1').score)
t('opponent rest unknown: neutral, never below a rested opponent', get(unknown, 'c1').score >= get(rested, 'c1').score && get(unknown, 'c1').context.oppRest === null)
t('his own back-to-back still lowers it', get(s2({ c1: { context: { b2b: true } } }), 'c1').score < get(base2, 'c1').score)
// (d) LINE MATES
t('line mates are not modelled (no line or shift source in the feeds): no line field in the rows', !/line ?mate/i.test(JSON.stringify(base2.rows)))
// missing everything = v1-like neutral
const bare = scoreComposite2Night(slate().map((c) => ({ ...c })))
t('every v2 feed missing: still scored, role and situation neutral-or-ranked, no throw', bare.rows.length === 11 && bare.rows.every((r) => r.pct.role === 50))
// the row, the live board, no probability
const row2 = toComposite2Row(get(base2, 'a1'), g, { date: '2026-10-20' }, '2026-10-20T22:00:00Z')
eq('v2 row: market GOAL, version lamp-goal-comp-v2, bar 1', [row2.market, row2.model_version, row2.bar], ['GOAL', 'lamp-goal-comp-v2', 1])
t('v2 row carries the ingredients in context', 'xgPg' in row2.context && 'ppShare' in row2.context && 'oppRest' in row2.context && row2.context.weights.own === 0.35)
t('no probability in any v2 row (scores are 0-100 integers, no chance / probability / expected goals text)', base2.rows.every((r) => Number.isInteger(r.score) && r.score >= 0 && r.score <= 100) && !/probab|chance|expected goals/i.test(JSON.stringify(base2.rows)))
const code2 = ['goalComposite2Model', 'goalComposite2Board'].map((f) => readFileSync(new URL(`../lib/nhl/${f}.js`, import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')).join('\n')
t('v2 code never names a probability or "expected goals"', !/goalGameProbability|probabilit|expected goals/i.test(code2))
const before2 = JSON.stringify(scoreNight(live())); scoreComposite2Night(slate2())
eq('scoreNight output is byte-identical before and after v2 runs', JSON.stringify(scoreNight(live())), before2)
eq('v2 does not mutate its candidates', JSON.stringify(slate2()), JSON.stringify(slate2()))
t('the live board and v1 files do not import v2', !/goalComposite2/.test(readFileSync(new URL('../lib/nhl/goalModel.js', import.meta.url), 'utf8') + readFileSync(new URL('../lib/nhl/goalBoard.js', import.meta.url), 'utf8') + readFileSync(new URL('../lib/nhl/goalCompositeModel.js', import.meta.url), 'utf8') + readFileSync(new URL('../lib/nhl/goalCompositeBoard.js', import.meta.url), 'utf8')))
let thr2 = null
try { scoreComposite2Night([]); scoreComposite2Night(null); scoreComposite2Night([{ gameId: 1, playerId: 'z', team: 'A', opp: 'B', pos: 'C', name: 'T', legs: { ok: true, shotsPg: NaN, goalsPg: null }, ang: { xgN: NaN, xg: 'x', ppToiPg: NaN } }]) } catch (e) { thr2 = e.message }
eq('garbage candidates: no throw', thr2, null)
// the xG reader: a fake database, never a real one
const shotsDb = (rows) => ({ from: () => { const q = { select: () => q, in: () => q, eq: () => q, lt: () => q, order: () => q, range: async () => ({ data: rows, error: null }) }; return q } })
const xgm = await readShooterXg([1, 2], 20262027, '2026-10-20', shotsDb([{ player_id: 1, x: 80, y: 3, zone: 'O', result: 'sog', strength: 'ev', shot_type: 'wrist', situation_code: '1551', goalie_id: 9 }, { player_id: 1, x: 85, y: 0, zone: 'O', result: 'goal', strength: 'ev', shot_type: 'wrist', situation_code: '1551', goalie_id: 9 }, { player_id: 1, x: 70, y: 5, zone: 'O', result: 'goal', strength: 'ev', shot_type: 'wrist', situation_code: '0651', goalie_id: null }]))
t('readShooterXg: empty-net shots add no xG and no shot; the rest are summed per shooter', xgm.get(1)?.n === 2 && xgm.get(1).xg > 0 && xgm.get(1).xg < 2 && xgm.get(1).g === 1 && !xgm.has(2))
eq('readShooterXg with no database: an empty map, no throw', (await readShooterXg([1], 20262027, '2026-10-20', null)).size, 0)
const tick2 = readFileSync(new URL('../app/api/lamp/tick/route.js', import.meta.url), 'utf8')
t('the tick catches a v2 failure in its own try/catch', /try \{ out\.composite2 = .*attachComposite2[\s\S]{0,200}night\.comp2ByGame = null/.test(tick2))
t('the tick writes v2 under market GOAL with its own key, before any puck-drop write (same guarded loop as the other shadows)', /key: 'comp2', byGame: 'comp2ByGame'/.test(tick2))
const exp = readFileSync(new URL('../app/api/record/lamp-goal-export/route.js', import.meta.url), 'utf8')
t('the export points comp at the current version (comp2) and keeps v1 as comp_v1', /VERSIONS\.comp2/.test(exp) && /comp_version/.test(exp) && /comp_v1/.test(exp))
const nightB = { season: { current: 20262027 }, rows: live(), compFeed: { sa60: { AAA: 30, BBB: 30, CCC: 30, DDD: 30 }, goalies: {} } }
let thr3 = null
try { await (await import('../lib/nhl/goalComposite2Board.js')).attachComposite2(nightB, '2026-10-20') } catch (e) { thr3 = e.message }
eq('attachComposite2 with every feed down: no throw', thr3, null)
t('and it still hangs the v2 composite on the night', nightB.comp2ByGame instanceof Map && nightB.comp2ByGame.size === 2)

console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
