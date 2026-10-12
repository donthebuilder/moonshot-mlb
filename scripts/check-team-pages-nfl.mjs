#!/usr/bin/env node
// THE NFL TEAM PAGE (2026-10-10). TEST data only: every club, name, number and game below is made up ("TEST ...") and
// exists to prove lib/team/nfl.js and the contract; nothing real is read here, nothing reaches the site.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-team-pages-nfl.mjs
//   ... --base http://localhost:3108   also loads all 32 clubs from the live files and /api/nfl/team (a live check, not TEST data)
// Holds: the registry; every club builds with the real files absent (empty states naming the data); the sections fill from
// TEST payloads with their season and sample; roles / injury / status words pass through; our-calls counts; the
// extension points for Defense and Tags; neutral wording.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NFL_TEAMS } from '../lib/nfl/teams.js'
import { sectionsOf, firstSection } from '../lib/team/registry.js'
import { neutralProblems, viewStrings, RESERVED_SECTION_IDS } from '../lib/team/contract.js'
import { buildNflTeam, NFL_CLUBS } from '../lib/team/nfl.js'
import { reduceSchedule } from '../lib/nfl/teamGames.js'
import { STATUS_WORD } from '../lib/callStatus.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }
const NFL = NFL_TEAMS.map((t) => t[0])
const SECTIONS = ['roster', 'schedule', 'stats', 'calls', 'matchup', 'trends', 'special', 'defense']   // Defense is the client-fed slot (tags + defenders): it loads its own numbers

ok('registry: NFL lists eight sections, Players first; Defense is built, Tags ride inside it', () => {
  assert.deepEqual(sectionsOf('nfl').map((s) => s.id), SECTIONS)
  assert.equal(firstSection('nfl'), 'roster')
  assert.deepEqual(RESERVED_SECTION_IDS, ['defense', 'tags'])
  assert.ok(sectionsOf('nfl').some((s) => s.id === 'defense') && !sectionsOf('nfl').some((s) => s.id === 'tags'))   // Defense is built (tags ride inside it)
  assert.match(readFileSync(new URL('../lib/team/registry.js', import.meta.url), 'utf8'), /ADDING A SECTION TO A SPORT/)
  assert.match(readFileSync(new URL('../lib/team/nfl.js', import.meta.url), 'utf8'), /EXTENSION POINTS/)
})
ok('every NFL club builds with the real files absent: header name + logo, seven honest empty states, neutral wording', () => {
  assert.equal(NFL_CLUBS.length, 32)
  for (const c of NFL) {
    const v = buildNflTeam({ team: c })
    assert.ok(v.header.name && v.header.known && /^https:\/\/a\.espncdn\.com/.test(v.header.logo), `${c}: header`)
    assert.deepEqual(v.sections.map((s) => s.id), SECTIONS)
    for (const s of v.sections.filter((x) => x.id !== 'defense')) { assert.equal(s.state, 'empty', `${c}/${s.id}`); assert.ok(s.empty.title && s.empty.note); assert.deepEqual(s.blocks, []) }
    assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
  }
  assert.equal(buildNflTeam({ team: 'ZZZ' }).header.known, false)
})

// ── TEST fixtures ───────────────────────────────────────────────────────────
const YEAR = 2026
const mkSt = () => ({ conferences: [
  { abbr: 'AFC', divisions: [{ name: 'AFC East', teams: NFL.slice(0, 4).map((a, i) => ({ abbr: a, nickname: `TEST ${a}`, w: 3 - i, l: i, t: 0, pf: 100 - i * 5, pa: 80 + i * 5, diff: 20 - i * 10, strk: 'W1', home: '2-0', road: '1-1', div: '1-0', conf: '2-1' })) }] },
  { abbr: 'NFC', divisions: [{ name: 'NFC West', teams: NFL.slice(4).map((a, i) => ({ abbr: a, nickname: `TEST ${a}`, w: i % 4, l: 3 - (i % 4), t: 0, pf: 60 + i, pa: 90 - i, diff: 0, strk: 'L1', home: '1-1', road: '0-2', div: '0-1', conf: '1-2' })) }] },
] })
const oppOf = (t) => NFL.find((c) => c !== t)
const mkSlate = (t) => ({ season: YEAR, week: 5, label: 'Week 5', games: [{ game_id: '9001', home: t, away: oppOf(t), state: 'pre' }],
  players: [
    { player_id: `P-${t}-1`, name: 'TEST Back', team: t, opp: oppOf(t), position: 'RB', scores: { TD: 80 }, stats: { xTD: 1.1, RZ: 3 }, role: 'RB1', season_td: 3 },
    { player_id: `P-${t}-2`, name: 'TEST Wideout', team: t, opp: oppOf(t), position: 'WR', scores: { TD: 60 }, stats: { xTD: 0.4 }, role: 'WR1', injury_status: 'Q' },
  ],
  team_defense: { per_game: Object.fromEntries(NFL.map((c, i) => [c, { def_sacks: 2 + i / 32, def_interceptions: 1, def_fumble_recoveries: 0.5, def_touchdowns: 0.1, g: 4 }])) } })
const tend = () => Object.fromEntries(NFL.map((c) => [c, { plays: 200, games: 4, shotgun_pct: 50, play_action_pct: 20, box_avg: 6.4, blitz_pct: 30 }]))
const mkMatchup = (t) => {
  const row = { td: 1, td_rank: 3, recyd_g: 80, recyd_g_rank: 5, rshyd_g: 60, rshyd_g_rank: 9, rz_tgts: 2, rz_tgts_rank: 4, g: 4, s: YEAR }
  const o = oppOf(t)
  return { season: YEAR, dvp_roles: ['WR1', 'RB1'], dvp: { season: Object.fromEntries(NFL.map((c) => [c, { WR1: row, RB1: row }])) }, roles: {},
    snaps: { [`P-${t}-1`]: { name: 'TEST Back', team: t, position: 'RB', side: 'offense', games: 4, snap_pct: 70, recent_pct: 72, trend: 2 } },
    red_zone: { [`P-${t}-1`]: { name: 'TEST Back', touches: 8, tds: 2, rate: 25 } },
    tendencies: { season: YEAR, weeks: [1, 2, 3, 4], offense: tend(), defense: tend(), league: { offense: { shotgun_pct: 50 }, defense: { blitz_pct: 30 } },
      rank: { offense: Object.fromEntries(NFL.map((c, i) => [c, { shotgun_pct: i + 1, play_action_pct: i + 1 }])), defense: Object.fromEntries(NFL.map((c, i) => [c, { blitz_pct: i + 1, box_avg: i + 1 }])) } },
    disruption_team: Object.fromEntries(NFL.map((c, i) => [c, { pressure: { created_pct: 20 + i / 4, allowed_pct: 30 - i / 4 } }])),
    coverage_team: Object.fromEntries(NFL.map((c, i) => [c, { man_pct: 20 + i / 4, zone_pct: 80 - i / 4 }])),
    pass_game: { season: YEAR, corner_season: YEAR, targets: { [t]: [{ player_id: `P-${t}-2`, name: 'TEST Wideout', position: 'WR', games: 4, tgt: 30, share: 25, adot: 10, rec: 20, yds: 250, td: 2 }] }, corners: Object.fromEntries(NFL.map((c) => [c, [{ slot: 'LCB', gsis_id: 'C1', name: 'TEST Corner', games: 4, pd: 3, int: 1 }]])) },
    qb_pressure: { season: YEAR, qbs: { QB1: { name: 'TEST QB', team: t, games: 4, dropbacks: 120, pressure_pct: 25, sacks: 5, hits: 6, blitzed: 20 } }, starter: { [t]: 'QB1' }, rank: { QB1: 12 }, ranked: 32 } }
}
const mkEspn = (t) => {
  const opps = NFL.filter((c) => c !== t)
  return { season: { year: YEAR }, byeWeek: 7, events: Array.from({ length: 8 }, (_, k) => {
    const done = k < 4; const home = k % 2 === 0
    const us = { team: { abbreviation: t }, homeAway: home ? 'home' : 'away', score: { value: done ? 24 : 0 } }
    const them = { team: { abbreviation: opps[k], displayName: `TEST ${opps[k]}` }, homeAway: home ? 'away' : 'home', score: { value: done ? 20 : 0 } }
    return { id: k === 4 ? '9001' : `800${k}`, date: `2026-09-${String(10 + 7 * k).padStart(2, '0')}T17:00Z`, week: { number: k + 1 }, seasonType: { type: 2 }, competitions: [{ venue: { fullName: `TEST Stadium ${k}` }, status: { type: { state: done ? 'post' : 'pre' } }, competitors: [us, them] }] }
  }) }
}
const mkServer = (t) => ({ season: YEAR, schedule: { season: YEAR, bye: 7, games: reduceSchedule(mkEspn(t), t) }, totals: { 9001: { line: 5.9, source: 'projection', projected: 5.9, called: true, rank: 2, of: 14 } },
  tds: [{ day: '2026-09-14', gameId: '8000', playerId: `P-${t}-1`, name: 'TEST Back', opp: 'XXX', kind: 'RUSH', status: 'called' }, { day: '2026-09-21', gameId: '8001', playerId: null, name: 'TEST Other', opp: 'YYY', kind: 'REC', status: 'off' }] })
const mkArchive = (t) => ({
  '2026_w01': { season: YEAR, week: 1, mode: 'week', card: { TD: { rungs: [{ player_id: `P-${t}-1`, name: 'TEST Back', team: t, opp: 'ZZZ', rank: 1, hit: true, actual: 1 }, { player_id: 'OTHER', name: 'TEST Else', team: 'AAA', opp: 'BBB', rank: 2, hit: false }] } } },
  '2026_w02': { season: YEAR, week: 2, mode: 'week', card: { TD: { rungs: [{ player_id: `P-${t}-2`, name: 'TEST Wideout', team: t, opp: 'ZZZ', rank: 3, hit: false, actual: 0 }, { player_id: `P-${t}-1`, name: 'TEST Back', team: t, opp: 'ZZZ', rank: 1, void: true }] } } },
})
const all = (t) => buildNflTeam({ team: t, slate: mkSlate(t), matchup: mkMatchup(t), logs: null, st: mkSt(), server: mkServer(t), archive: mkArchive(t), picks: null, gameCalls: null, statusOf: (p) => (p.position === 'RB' ? 'called' : 'board') })
const sec = (v, id) => v.sections.find((s) => s.id === id)

ok('every NFL club fills all seven sections from TEST payloads; season and sample on each; a group on every column; neutral wording', () => {
  for (const c of NFL) {
    const v = all(c)
    for (const s of v.sections) {
      assert.equal(s.state, 'ok', `${c}/${s.id}: ${s.empty?.title} ${s.empty?.note}`)
      if (s.id !== 'matchup') assert.match(s.window, /2026/, `${c}/${s.id}: ${s.window}`)
      for (const b of s.blocks) if (b.type === 'table') for (const col of b.columns) assert.ok(col.group, `${c}/${s.id}/${b.id}: ${col.key} needs a group`)
    }
    assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
  }
})
ok('header: record, standing, home / road / div / conf and streak from the standings; next game and last five from the schedule', () => {
  const h = all(NFL[0]).header
  assert.equal(h.record, '3-0'); assert.match(h.standing, /1st in the AFC East/)
  assert.ok(h.summary.some((x) => /^Home 2-0/.test(x)) && h.summary.some((x) => /^Streak W1/.test(x)))
  assert.equal(h.last5.length, 4); assert.ok(h.next && ['9001', '8004'].includes(h.next.gameId))
  assert.ok(h.chips.some((c) => c.label === 'PF-PA'))
})
ok('players: roles are the depth chart\'s (RB1 / WR1), availability is the injury word, status is the board\'s', () => {
  const s = all(NFL[0]).sections[0]
  const rows = s.blocks.find((b) => b.id === 'players').rows
  const back = rows.find((r) => r.name === 'TEST Back'); const wr = rows.find((r) => r.name === 'TEST Wideout')
  assert.equal(back.role, 'RB1'); assert.equal(wr.role, 'WR1'); assert.equal(wr.inj, 'Q'); assert.equal(back.status, 'called'); assert.equal(wr.status, 'board')
  assert.equal(back.sh_snap, 70); assert.equal(back.rz_touch, 8)   // Snap % is the full set's single definition (lib/nfl/boardColumns.js sh_snap)
  assert.ok(Object.keys(STATUS_WORD).includes(back.status))
  assert.match(s.status, /1 CALLED · 1 ON THE BOARD/)
  // the shared injury report sits after the table (the first row does not move) on Players and on Defense
  const ix = s.blocks.findIndex((b) => b.type === 'slot' && b.slot === 'injuries')
  assert.ok(ix > s.blocks.findIndex((b) => b.id === 'players'), 'Players: injuries slot after the table')
  assert.deepEqual(s.blocks[ix].props.clubs, [NFL[0]])
  const d = all(NFL[0]).sections.find((x) => x.id === 'defense')
  assert.ok(d.blocks.some((b) => b.type === 'slot' && b.slot === 'defense') && d.blocks.some((b) => b.type === 'slot' && b.slot === 'injuries'))
})
ok('stats: ranks of 32, fewest allowed is best, the division table, no team-yards claim', () => {
  const s = sec(all(NFL[0]), 'stats')
  assert.ok(sec(all(NFL[0]), 'stats').blocks.find((b) => b.id === 'stats-defence').rows.some((r) => /Points against/.test(r.label) && /of 32/.test(r.rankTxt)))
  assert.ok(s.blocks.some((b) => b.id === 'stats-division'))
  assert.ok(s.blocks.some((b) => b.type === 'note' && /not published/.test(b.text)))
})
ok('calls: graded TD calls counted (hit / miss / did not play); the board\'s words on scorers; none yet is its own empty state', () => {
  const s = sec(all(NFL[0]), 'calls')
  const sum = s.blocks.find((b) => b.id === 'calls-sum').rows[0]
  assert.equal(sum.n, 2); assert.equal(sum.hit, 1)
  assert.deepEqual(s.blocks.find((b) => b.id === 'calls-last').rows.map((r) => r.word).sort(), ['DID NOT PLAY', 'HIT', 'MISSED'])
  assert.deepEqual(s.blocks.find((b) => b.id === 'tds-seen').rows.map((r) => r.word).sort(), ['CALLED', 'NOT ON THE BOARD'])
  const none = sec(buildNflTeam({ team: NFL[0], slate: mkSlate(NFL[0]), server: { ...mkServer(NFL[0]), tds: [] }, archive: {} }), 'calls')
  assert.equal(none.state, 'empty'); assert.match(none.empty.title, /NO CALLS/)
})
ok('matchup: defense vs position with its season label, corners, QB pressure, pass rush; the model number only for a slate game', () => {
  const t = NFL[0]
  const v = buildNflTeam({ team: t, slate: { ...mkSlate(t), games: [{ game_id: '8004', home: t, away: NFL[1], state: 'pre' }] }, matchup: mkMatchup(t), logs: null, st: mkSt(), server: mkServer(t) })
  const s = sec(v, 'matchup')
  for (const id of ['mu-dvp', 'mu-corners', 'mu-qb', 'mu-press']) assert.ok(s.blocks.some((b) => b.id === id), id)
  assert.ok(s.blocks.some((b) => b.type === 'note' && /4 games this season/.test(b.text)))
  assert.ok(s.blocks.some((b) => b.type === 'note' && /No team-model number/.test(b.text)))
  assert.match(s.window, /^Next game · Week \d · 2026-/)
})
ok('trends: home / away / last 5 / division / conference / rest with the games behind each; rest carries no claim', () => {
  const s = sec(all(NFL[0]), 'trends')
  const by = Object.fromEntries(s.blocks.find((b) => b.id === 'trend-splits').rows.map((r) => [r.split, r]))
  assert.equal(by.Home.gp + by.Away.gp, 4); assert.equal(by['Last 5'].gp, 4)
  assert.ok(s.blocks.some((b) => b.type === 'note' && /nothing here reads it as a lean/.test(b.text)))
})
ok('tendencies & usage: offence / defence ranks, pressure and coverage, snap leaders, red zone, target share', () => {
  const s = sec(all(NFL[0]), 'special')
  for (const id of ['tend-off', 'tend-def', 'tend-press', 'use-snaps', 'use-rz', 'use-targets']) assert.ok(s.blocks.some((b) => b.id === id), id)
})
ok('schedule: only a game on the slate opens; the opponent is a team link; the ESPN feed reduces to the club\'s own view', () => {
  const t = NFL[0]
  const g = reduceSchedule(mkEspn(t), t)
  assert.equal(g.length, 8); assert.equal(g[0].result, 'W'); assert.equal(g[0].us, 24); assert.equal(g[5].state, 'pre')
  const s = sec(all(t), 'schedule')
  assert.deepEqual(s.blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows).filter((r) => !r.noOpen).map((r) => r.gameId), ['9001'])
  assert.equal(s.blocks[0].columns.find((c) => c.key === 'oppText').link, 'team')
})
ok('the page is shared: TUDDY\'s tab renders TeamPage, takes sec= and never names a sport', () => {
  const t = readFileSync(new URL('../components/nfl/tabs/Team.js', import.meta.url), 'utf8')
  assert.match(t, /TeamPage/); assert.match(t, /buildNflTeam/); assert.match(t, /\/api\/nfl\/team/)
  assert.match(readFileSync(new URL('../components/nfl/NflDashboard.js', import.meta.url), 'utf8'), /sec: new Set\(\['team'\]\)/)
})

// ── optional: the live files, every club (--base http://localhost:3108) ────────
const ix = process.argv.indexOf('--base')
if (ix > 0) {
  const base = process.argv[ix + 1]
  const RAW = 'https://raw.' + 'github' + 'usercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current/'
  const j = async (u) => { try { const r = await fetch(u); return r.ok ? r.json() : null } catch { return null } }
  const [slate, matchup, logs, picks, gameCalls, stRaw] = await Promise.all([j(`${RAW}nfl_week.json`), j(`${RAW}nfl_matchup.json`), j(`${RAW}nfl_logs.json`), j(`${RAW}nfl_picks.json`), j(`${RAW}nfl_game_calls.json`), j('https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?level=3')])
  const { reduceNflStandings } = await import('../lib/nfl/standings.js')
  const { tdStatusFor } = await import('../lib/nfl/tdStatus.js'); const { tdPool } = await import('../lib/nfl/tdPool.js'); const { withRoles } = await import('../lib/nfl/roles.js')
  const st = stRaw ? reduceNflStandings(stRaw) : null
  const slateR = withRoles(slate, matchup)
  const archive = {}
  for (let w = 1; w <= (slate?.week || 0); w += 1) { const p = await j(`${RAW}nfl_results_${slate.season}_w${String(w).padStart(2, '0')}.json`); if (p) archive[`${slate.season}_w${String(w).padStart(2, '0')}`] = p }
  const statusOf = slateR ? tdStatusFor({ picksCard: picks?.card, gameCalls, games: slateR.games, board: tdPool(slateR).rows }).statusOf : null
  let filled = 0
  for (const c of NFL) {
    try {
      const server = await j(`${base}/api/nfl/team?team=${c}`)
      const v = buildNflTeam({ team: c, slate: slateR, matchup, logs, st, server, archive, picks, gameCalls, statusOf })
      assert.ok(v.header.name && v.header.logo); assert.equal(v.sections.length, 7)
      assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
      const empties = v.sections.filter((s) => s.state !== 'ok').map((s) => `${s.id}(${s.empty?.title})`)
      filled += 7 - empties.length
      console.log(`ok   live ${c}: ${7 - empties.length}/7${empties.length ? ` empty: ${empties.join(', ')}` : ''}${server ? '' : ' [no server data]'}`)
    } catch (e) { fail += 1; console.log(`FAIL live ${c}: ${e.message}`) }
  }
  console.log(`live: ${filled} of ${NFL.length * 7} sections filled`)
}

console.log(fail ? `\n${fail} FAILED` : '\nall NFL team-page checks passed')
process.exit(fail ? 1 : 0)
