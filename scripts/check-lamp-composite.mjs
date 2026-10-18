#!/usr/bin/env node
// lamp-goal-comp-v1 (2026-10-18). TEST DATA only: made-up clubs (AAA..DDD) and skaters, no real players, prices or results.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-lamp-composite.mjs
import { readFileSync } from 'node:fs'
import { scoreCompositeNight, toCompositeRow, gradeCompositeRows, netSave, WEIGHTS, MODEL_VERSION, MARKET } from '../lib/nhl/goalCompositeModel.js'
import { scoreNight } from '../lib/nhl/goalModel.js'
import { VERSIONS, versionsFor } from '../lib/nhl/versions.js'
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
eq('market GOAL under its own version (no SQL), one name from its first night', [MARKET, MODEL_VERSION, [...new Set(VERSIONS.comp)]], ['GOAL', 'lamp-goal-comp-v1', ['lamp-goal-comp-v1']])
eq('versionsFor reads it for any date', [versionsFor('2026-10-19').comp, versionsFor('2027-01-01').comp], ['lamp-goal-comp-v1', 'lamp-goal-comp-v1'])

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

console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
