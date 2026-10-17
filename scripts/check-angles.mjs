#!/usr/bin/env node
// BEST ANGLES ON THE GAME CARDS, CHECKED (2026-10-17). lib/slate/angles.js picks the card's two rows; the four sport adapters turn their own data into
// candidates (lib/nfl|mlb|nhl|nba/gameAngles.js). Plain node, TEST DATA only (every name, club and number below is made up for this check and labelled TEST).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-angles.mjs
import './_esm-resolve.mjs'
import { readFileSync } from 'node:fs'

const { pickAngles, ANGLE_TAG } = await import('../lib/slate/angles.js')
const { nflGameAngles } = await import('../lib/nfl/gameAngles.js')
const { mlbGameAngles } = await import('../lib/mlb/gameAngles.js')
const { nhlGameAngles, confirmedGoalies } = await import('../lib/nhl/gameAngles.js')
const { nbaGameAngles } = await import('../lib/nba/gameAngles.js')

const fails = []
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${msg}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`) }
const ok = (cond, msg) => { if (!cond) fails.push(msg) }
const keys = (rows) => rows.map((r) => `${r.kind}:${r.key}`)

// ── 1. THE PICKER (TEST candidates) ─────────────────────────────────────────
const c = (key, fit, form) => ({ key, name: `TEST ${key}`, team: 'TST', why: `TEST reason ${key}`, ...(fit != null ? { fit } : {}), ...(form != null ? { form } : {}) })
const M = [c('a', 50), c('b', 80), c('c', 65)]
const F = [c('d', null, 3), c('e', null, 9), c('f', null, 5)]
eq(keys(pickAngles({ matchup: M, form: F })), ['matchup:b', 'form:e'], 'picker: row A is the best matchup, row B the best form')
eq(ANGLE_TAG, { matchup: 'MATCHUP', form: 'FORM' }, 'picker: the two tags')
eq(keys(pickAngles({ matchup: [c('x', 70)], form: [c('x', null, 9), c('y', null, 2)] })), ['matchup:x', 'form:y'], 'picker: never the same man twice (the form row takes the next best)')
eq(keys(pickAngles({ matchup: M, form: F, hiddenOf: (k) => k.key === 'b' })), ['matchup:c', 'form:e'], 'picker: a hidden man is skipped in row A, the next best matchup takes it')
eq(keys(pickAngles({ matchup: M, form: F, hiddenOf: (k) => k.key === 'e' })), ['matchup:b', 'form:f'], 'picker: a hidden man is skipped in row B')
eq(keys(pickAngles({ matchup: M, form: F, hiddenOf: () => true })), [], 'picker: every candidate hidden -> no rows, nobody is invented')
eq(keys(pickAngles({ matchup: [], form: F })), ['form:e'], 'picker: no weak spot -> only the form row')
eq(keys(pickAngles({ matchup: M, form: [] })), ['matchup:b'], 'picker: no form -> only the matchup row')
eq(keys(pickAngles({})), [], 'picker: no data -> empty')
eq(keys(pickAngles({ matchup: [{ key: 'z', name: 'TEST z', why: '', fit: 99 }, { key: 'w', name: 'TEST w', why: 'x', fit: null }, { key: 'v', name: 'TEST v', why: 'x', fit: 'abc' }], form: [] })), [], 'picker: a candidate without a reason or a finite score is not a row')
eq(keys(pickAngles({ matchup: [c('p', 7), c('q', 7)], form: [] })), ['matchup:p'], 'picker: a tie keeps the given order')
eq(keys(pickAngles({ matchup: M, form: F, hiddenOf: undefined })), ['matchup:b', 'form:e'], 'picker: no gate given (a member) -> as chosen')
// not by call status: the picker must not read one, and a called man is not preferred or avoided
eq(keys(pickAngles({ matchup: [{ ...c('called', 10), status: 'called' }, { ...c('plain', 20), status: 'board' }], form: [] })), ['matchup:plain'], 'picker: the better matchup wins whether or not he is called')
eq(keys(pickAngles({ matchup: [{ ...c('called', 30), status: 'called' }, { ...c('plain', 20), status: 'board' }], form: [] })), ['matchup:called'], 'picker: a called man can be the best angle, and is then chosen like anyone')
{
  const src = readFileSync(new URL('../lib/slate/angles.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  ok(!/status|called|role|rank/i.test(src), 'lib/slate/angles.js reads a call status, role or rank (the rows must be chosen by matchup and form only)')
}
{
  const card = readFileSync(new URL('../components/slate/SlateCard.js', import.meta.url), 'utf8')
  const block = card.slice(card.indexOf('BEST ANGLES</div>') - 200, card.indexOf('THE EITHER/OR ROW'))
  ok(block.length > 100 && !/CALLED|called|STATUS_WORD|CallStatusBadge|probab/i.test(block), 'the card draws a called stamp / word / probability in its BEST ANGLES block')
}

// ── 2. NFL (TEST matchup file: 10 clubs, WR1 touchdowns allowed 1..10 and 'WEAKD' 30) ──
const clubs = Array.from({ length: 10 }, (_, i) => `T${i}`)
const dvp = { season: Object.fromEntries([...clubs.map((t, i) => [t, { WR1: { td: i + 1, g: 4 } }]), ['WEAKD', { WR1: { td: 30, g: 4 } }]]) }
const nflMatchup = { season: 2026, slate_season: 2026, dvp, roles: { p1: 'WR1', p2: 'WR1', p3: 'WR1', p4: 'TE1' } }
const nflPlayers = [
  { player_id: 'p1', name: 'TEST Receiver One', team: 'OFF', position: 'WR', scores: { TD: 60 }, stats: {} },
  { player_id: 'p2', name: 'TEST Receiver Two', team: 'OFF', position: 'WR', scores: { TD: 70 }, stats: {} },   // same role as p1: the higher TD score breaks the tie
  { player_id: 'p3', name: 'TEST Other Club WR', team: 'WEAKD', position: 'WR', scores: { TD: 99 }, stats: {} },   // plays FOR the weak defense: not a matchup
  { player_id: 'p4', name: 'TEST Tight End', team: 'OFF', position: 'TE', scores: { TD: 50 }, stats: {} },
]
const logs = { logs: {
  p1: { log: [{ s: 2026, w: 1, g_td: 0, g_rec: 5, g_car: 0 }, { s: 2026, w: 2, g_td: 1, g_rec: 6, g_car: 0 }, { s: 2026, w: 3, g_td: 2, g_rec: 7, g_car: 0 }, { s: 2026, w: 4, g_td: 1, g_rec: 4, g_car: 0 }] },
  p4: { log: [{ s: 2026, w: 3, g_td: 0, g_rec: 2, g_car: 0 }, { s: 2026, w: 4, g_td: 0, g_rec: 1, g_car: 0 }] },
} }
{
  const g = { game_id: 'tg1', away: 'OFF', home: 'WEAKD' }
  const a = nflGameAngles({ matchup: nflMatchup, game: g, players: nflPlayers, logs, hrefOf: (id) => `/TEST/${id}` })
  ok(/^Weak spot: WEAKD gives up 30 touchdowns/.test(a.weak || ''), `nfl: the weak spot names the soft defense and its number (got ${a.weak})`)
  const rows = pickAngles({ matchup: a.matchup, form: a.form })
  eq(keys(rows), ['matchup:p2', 'form:p1'], 'nfl: the matchup row is the WR1 facing the soft defense (higher TD score breaks the tie), the form row the best last three games, never the same man')
  ok(/^No\.1 receiver vs WEAKD: .*on touchdowns/.test(rows[0].why), `nfl: the matchup reason is plain (got ${rows[0].why})`)
  eq(rows[1].why, '4 TD in last 3', 'nfl: the form reason carries the real number from the logs (TEST: 1+2+1 in the last three)')
  ok(rows.every((r) => r.team !== 'WEAKD'), 'nfl: nobody from the soft defense is a matchup angle')
  eq(nflGameAngles({ matchup: nflMatchup, game: { away: 'T1', home: 'T2' }, players: nflPlayers, logs }).weak, null, 'nfl: a game with no standout soft role prints no weak spot')
  eq(keys(pickAngles({ ...nflGameAngles({ matchup: nflMatchup, game: { away: 'T1', home: 'T2' }, players: [], logs: null }) })), [], 'nfl: no players, no logs -> no rows')
  eq(keys(pickAngles({ matchup: a.matchup, form: a.form, hiddenOf: (k) => k.key === 'p2' })), ['matchup:p1'], 'nfl: with the best matchup man hidden the next fit takes row A; the form row is never the same man (no other form candidate here)')
}

// ── 3. MLB (TEST arms and hitters) ──────────────────────────────────────────
{
  const arm = { name: 'TEST Arm', team: 'AAA', hr9: 1.9, thin: false, drivers: [{ label: 'HR/9', text: '1.90' }, { label: 'Barrels', text: '11.0%' }] }
  const mkRow = (id, name, extra) => ({ player_id: id, name, team: 'BBB', pitcher_name: 'TEST Arm', pitcher_throws: 'R', game_pk: 1, ...extra })
  const rows = [
    mkRow(1, 'TEST Bat One', { matchup_power_score: 70, iso_vs_rhp: 0.231, last10_hr: 0, l10_xwoba: 0.31 }),
    mkRow(2, 'TEST Bat Two', { matchup_power_score: 60, iso_vs_rhp: 0.2, last10_hr: 3, l10_xwoba: 0.41 }),
    mkRow(3, 'TEST Bat Three', { matchup_power_score: 40, iso_vs_rhp: 0.1, last10_hr: 0, l10_xwoba: 0.36 }),
  ]
  const a = mlbGameAngles({ rows, arms: [arm, { ...arm, name: 'TEST Arm B', drivers: [] }, { ...arm, name: 'TEST Arm C', drivers: [] }] })
  eq(a.weak, 'Weak spot: TEST Arm (AAA) is among the leakiest arms tonight: HR/9 1.90, Barrels 11.0%', 'mlb: the weak spot is the leaky starter and his two heaviest terms')
  const r = pickAngles({ matchup: a.matchup, form: a.form })
  eq(keys(r), ['matchup:1', 'form:2'], 'mlb: the matchup row is the best matchup power facing the arm, the form row the hottest bat')
  eq(r[0].why, '.231 ISO vs righties · faces Arm, 1.90 HR/9', 'mlb: the matchup reason carries real numbers')
  eq(r[1].why, '3 HR in last 10 · .410 xwOBA', 'mlb: the form reason carries real numbers')
  eq(mlbGameAngles({ rows, arms: [] }).weak, null, 'mlb: no ranked arms, calm air -> no weak spot')
  eq(mlbGameAngles({ rows, arms: [{ ...arm, thin: true }, { ...arm, name: 'x' }, { ...arm, name: 'y' }] }).weak, null, 'mlb: a thin-sample arm is not named')
  eq(keys(pickAngles({ matchup: [], form: mlbGameAngles({ rows: [mkRow(9, 'TEST Cold', { last10_hr: 0, l10_xwoba: 0.3 })], arms: [] }).form })), [], 'mlb: no hot bat, no form row')
}

// ── 4. NHL (TEST board game) ────────────────────────────────────────────────
{
  const row = (id, name, team, shots, extra = {}) => ({ playerId: id, name, team, status: 'board', legs: { shotsPg: shots }, ...extra })
  const bg = {
    game: { id: 7, away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' } },
    starters: { away: null, home: { playerId: 8470000, name: 'TEST Goalie', confirmed: true } },
    spots: { away: { pkPct: 0.74 }, home: { pkPct: 0.85 } },
    rows: [row(1, 'TEST Skater One', 'AAA', 4.4, { form: { l5: 0, gp5: 5 }, ppg: 3 }), row(2, 'TEST Skater Two', 'AAA', 2.1, { form: { l5: 3, gp5: 5 }, ppg: 1 }), row(3, 'TEST Skater Three', 'BBB', 3.6, { form: { l5: 0, gp5: 5 }, ppg: 2 })],
  }
  eq(confirmedGoalies(bg).map((x) => x.id), ['8470000'], 'nhl: the confirmed starters to read')
  const goalieWeak = { 8470000: { state: 'ok', spots: [{ phrase: 'the slot', ga: 9, sa: 40, lg: 0.1, excess: 5 }] } }
  const a = nhlGameAngles({ bg, goalieWeak })
  ok(/^Weak spot: TEST Goalie allows more goals than the league from the slot/.test(a.weak || ''), `nhl: a confirmed goalie's weak zone is the weak spot (got ${a.weak})`)
  const r = pickAngles({ matchup: a.matchup, form: a.form })
  eq(keys(r), ['matchup:1', 'form:2'], 'nhl: the attacking club\'s most shots a game is the matchup row, the hottest scorer the form row')
  eq(r[0].why, '4.4 shots a game against TEST Goalie', 'nhl: the matchup reason carries the real number')
  eq(r[1].why, '3 goals in last 5 games · 2.1 shots a game', 'nhl: the form reason carries the real number')
  const pk = nhlGameAngles({ bg, goalieWeak: null })
  eq(pk.weak, 'Weak spot: AAA penalty kill stops 74.0% of power plays', 'nhl: no goalie read -> the weakest penalty kill under 78%')
  eq(keys(pickAngles({ matchup: pk.matchup, form: [] })), ['matchup:3'], 'nhl: against a weak penalty kill the matchup row is the attacking club\'s power-play scorer (BBB attacks AAA)')
  eq(nhlGameAngles({ bg: { ...bg, starters: null, spots: { away: { pkPct: 0.85 }, home: { pkPct: 0.85 } } } }).weak, null, 'nhl: nothing weak, nothing printed')
  ok(!/probab|chance|odds/i.test(JSON.stringify(a)), 'nhl: no model probability words in the card data')
}

// ── 5. NBA (TEST) ───────────────────────────────────────────────────────────
{
  const game = { id: 'ng1', away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' } }
  const mkr = (id, name, team, opp, pts, min, oppPts) => ({ playerId: id, name, team, opp, gameId: 'ng1', status: 'board', legs: { ptsPg: pts, minPg: min, oppPts } })
  const rows = [mkr('1', 'TEST Guard', 'AAA', 'BBB', 27.5, 34, 118), mkr('2', 'TEST Wing', 'AAA', 'BBB', 15, 28, 118), mkr('3', 'TEST Big', 'BBB', 'AAA', 20, 30, 105),
    mkr('4', 'TEST X', 'CCC', 'DDD', 10, 30, 110), mkr('5', 'TEST Y', 'DDD', 'CCC', 10, 30, 112), mkr('6', 'TEST Z', 'EEE', 'FFF', 10, 30, 100)]
  const hot = [{ playerId: '2', name: 'TEST Wing', team: 'AAA', gameId: 'ng1', pts: { l5: 24.2, szn: 15 } }, { playerId: '3', name: 'TEST Big', team: 'BBB', gameId: 'ng1', pts: { l5: 12, szn: 20 } }]
  const a = nbaGameAngles({ game, rows, hot })
  eq(a.weak, "Weak spot: BBB allow 118.0 points a game, top third of tonight's clubs", 'nba: the soft defence and its number')
  eq(keys(pickAngles({ matchup: a.matchup, form: a.form })), ['matchup:1', 'form:2'], 'nba: matchup = most points a game facing it, form = last 5 above his season')
  eq(nbaGameAngles({ game, rows: rows.slice(0, 2), hot: null }).weak, null, 'nba: fewer than three clubs measured -> no weak spot')
}

if (fails.length) { console.error('check-angles FAILED:\n - ' + fails.join('\n - ')); process.exit(1) }
console.log('check-angles: ok')
