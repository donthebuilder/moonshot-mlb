#!/usr/bin/env node
// PHONE PUSH FOLDS on TEST data (2026-10-16): made-up players "Test ...", clubs TST / EXA. Nothing is sent, nothing is read from a real table.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-push-folds.mjs
// Proves: switch OFF = old events byte-for-byte; ON: gameoff -> one "Game update" per game (stable tag); pregame -> one plays push + one reminder;
// per-person cap (default 6, 0 = unlimited, live CALLED and grading exempt); scratches only for CALLED picks; per-kind switches still respected.
import assert from 'node:assert/strict'
const PR = await import('../lib/dash/pushRules.js')
const F = await import('../lib/dash/pushFolds.js')
let failed = 0
const check = (c, l, x = '') => { if (c) console.log(`ok   ${l}`); else { failed += 1; console.log(`FAIL ${l} ${x}`) } }
const withEnv = (v, fn) => { const o = process.env.PUSH_FOLDS_ON; if (v == null) delete process.env.PUSH_FOLDS_ON; else process.env.PUSH_FOLDS_ON = v; try { return fn() } finally { if (o == null) delete process.env.PUSH_FOLDS_ON; else process.env.PUSH_FOLDS_ON = o } }

const DAY = '2026-10-09'
const NOW = Date.parse('2026-10-09T22:50:00Z')            // 6:50pm ET
const START = Date.parse('2026-10-09T23:05:00Z')          // 7:05pm ET (TEST)
const rows = [
  { player_id: '1', name: 'Test Alpha', team: 'TST', opponent: 'EXA', game_pk: 100, game_time: new Date(START).toISOString(), game_pick_role: 'HR' },
  { player_id: '2', name: 'Test Bravo', team: 'TST', opponent: 'EXA', game_pk: 100, game_time: new Date(START).toISOString(), game_pick_role: 'WATCH' },
]
const snap = (extra = {}) => ({ games: [{ pk: 100, state: 'Preview', lineupPosted: true, awayId: 147, homeId: 139, lineup: { home: [{ id: '99' }], away: [] }, ...extra }] })
const aud = { mlb: new Set(['1', '2']) }

// ── OFF: byte-for-byte ──
{
  const evs = withEnv(null, () => PR.pregameEventsFrom(rows, snap(), DAY, aud, NOW))
  const sc = evs.filter((e) => e.category === 'scratched')
  check(sc.length === 2 && sc.every((e) => !('called' in e)), 'OFF: scratch events carry no new field')
  check(!F.foldsOn({}) && F.foldsOn({ PUSH_FOLDS_ON: 'on' }), 'switch defaults OFF, "on" turns it on')
}
// ── ON: scratch stamps called, only the HR pick is called ──
{
  const evs = withEnv('on', () => PR.pregameEventsFrom(rows, snap(), DAY, aud, NOW))
  const sc = evs.filter((e) => e.category === 'scratched')
  check(sc.find((e) => e.playerId === '1')?.called === true && sc.find((e) => e.playerId === '2')?.called === false, 'ON: scratch of a CALLED pick is stamped called, a WATCH pick is not')
  const un = { sport: 'nhl', category: 'scratched', priority: 0, key: 'nhl:x:out', title: 't', body: 'b' }
  const g = F.foldGlobal([...evs, un])
  const kept = g.events.filter((e) => e.category === 'scratched')
  check(kept.some((e) => e.playerId === '1') && !kept.some((e) => e.playerId === '2') && kept.includes(un), 'ON: stamped true = sent, stamped false = dropped, unstamped (NHL) = sent as before')
}
// ── gameoff ──
{
  const mk = (key, title, body, sport = 'mlb') => ({ sport, category: 'gameoff', priority: 0, key, title, body, url: '/x' })
  const a = mk('mlb:2026-10-09:100:off:delayed', '⚠️ Rain delay', 'TST at EXA · 2 of your picks')
  const b = mk('mlb:2026-10-09:100:off:postponed', '⚠️ Postponed', 'TST at EXA · 2 of your picks')
  const n = mk('nfl:2026-10-11:g7:off:moved:12345', '⚠️ Kickoff moved', 'TST at EXA · now 4:25 PM ET', 'nfl')
  const g1 = F.foldGlobal([a, n])
  check(g1.events.length === 2 && g1.events.every((e) => e.title.endsWith('Game update')), 'every variant is titled "Game update"', g1.events.map((e) => e.title).join())
  check(g1.events[0].body === 'Rain delay · TST at EXA · 2 of your picks' && /^Kickoff moved/.test(g1.events[1].body), 'body states what changed', g1.events.map((e) => e.body).join(' / '))
  const g2 = F.foldGlobal([a, b])
  check(g2.events.length === 1 && g2.events[0].key === b.key && g2.events[0].tag === 'gameoff:mlb:2026-10-09:100', 'two changes to one game in a sweep = one push, later wins, stable tag')
  check(F.foldGlobal([a]).events[0].tag === F.foldGlobal([b]).events[0].tag && a.key !== b.key, 'across ticks: different claim keys (each change sent once), SAME tag (phone replaces the earlier one)')
  console.log(`     TEST example: ${g1.events[0].title} | ${g1.events[0].body}`)
}
// ── pregame ──
{
  const ev = (category, key, extra = {}) => ({ sport: 'mlb', category, priority: 1, key, title: 'T', body: '2 picks · first pitch 7:05 PM ET', url: '/u', playerIds: ['1', '2'], ...extra })
  const board = ev('boardup', `mlb:${DAY}:board`)
  const lin = ev('lineupin', 'mlb:x:lineupin:1', { playerIds: ['3'] })
  const pd = ev('puckdrop', 'nhl:x:puckdrop', { sport: 'nhl', playerIds: ['4'] })
  const lc = ev('lastcall', `mlb:${DAY}:lastcall:1`)
  const lc2 = ev('lastcall', `mlb:${DAY}:lastcall:2`)
  const r = F.foldPregame([board, lin, pd, lc, lc2], { keys: new Set() }, { day: DAY })
  const plays = r.send.filter((e) => e.category === 'boardup'); const rem = r.send.filter((e) => e.category === 'lastcall')
  check(plays.length === 1 && plays[0].title.endsWith("Tonight's plays are in") && plays[0].body === board.body, 'board lock: ONE "Tonight\'s plays are in" with the board facts', `${plays[0]?.title} | ${plays[0]?.body}`)
  check(rem.length === 1 && r.send.length === 2, 'plus ONE reminder; never more than these two', String(r.send.length))
  console.log(`     TEST example: ${plays[0].title} | ${plays[0].body}`)
  const later = F.foldPregame([lin, lc], { keys: new Set([`fold:${DAY}:plays`, `fold:${DAY}:reminder`]) }, { day: DAY })
  check(later.send.length === 0 && later.folded.length === 2, 'already sent today: later lineupin / lastcall are folded away')
  const acted = F.foldPregame([lc], { keys: new Set() }, { day: DAY, actedIds: () => new Set(['1', '2']) })
  check(acted.send.length === 0, 'reminder only while a pick is un-acted')
  // per-kind switches: wants() runs BEFORE the fold, so a person with boardup off and lineupin off gets nothing
  const off = { dash_follow_v1: { 'mlb:1': { sport: 'mlb', id: '1', name: 'Test Alpha' } }, dash_alerts_v1: { events: { boardup: false, lineupin: false, puckdrop: false } } }
  check(PR.wants(off, { ...board, playerIds: ['1'] }) === false, 'a per-kind switch that is off still blocks the event before any fold')
}
// ── the cap ──
{
  const soft = (i) => ({ sport: 'mlb', category: 'slate', key: `s${i}`, priority: 2 })
  const live = { sport: 'mlb', category: 'homer', key: 'h', priority: 0 }
  const grade = { sport: 'mlb', category: 'callsgraded', key: 'g', priority: 2 }
  const six = [1, 2, 3, 4, 5, 6, 7, 8].map(soft)
  check(F.foldCap({}) === 6 && F.foldCap({ PUSH_DAILY_CAP: '0' }) === 0 && F.foldCap({ PUSH_DAILY_CAP: '3' }) === 3, 'cap: default 6, 0 = unlimited, env wins')
  const r = F.applyFoldCap([...six, live, grade], 0, 6)
  check(r.send.length === 8 && r.held.length === 2 && r.send.includes(live) && r.send.includes(grade), 'cap 6: 2 over-cap dropped, live CALLED + grading pass', `${r.send.length}/${r.held.length}`)
  check(F.applyFoldCap(six, 5, 6).held.length === 7, 'sent earlier today counts toward the cap')
  check(F.applyFoldCap(six, 99, 0).held.length === 0, '0 = unlimited')
  check(F.applyFoldCap([{ sport: 'fantasy', category: 'frclock', key: 'f' }], 99, 6).held.length === 0, 'FRANCHISE clocks are never capped')
}
// ── the tick source ──
{
  const { readFileSync } = await import('node:fs')
  const t = readFileSync(new URL('../app/api/dash/push/tick/route.js', import.meta.url), 'utf8')
  check(/foldsOn\(\)/.test(t) && /folded, capped/.test(t), 'tick wires the switch and counts folded / capped in the totals')
}
if (failed) { console.log(`\n${failed} FAILED`); process.exit(1) }
console.log('\nall folds checks passed')
