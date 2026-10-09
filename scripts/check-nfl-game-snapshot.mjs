#!/usr/bin/env node
// PRE-GAME TD SNAPSHOTS (lib/nfl/gameSnapshot.js). All inputs are TEST data (clubs AAA..DDD), nothing real.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-game-snapshot.mjs
import { compareSnapshots, buildSnapshots, stampSnapshots, playersXtdSum, SNAPSHOT_TABLE, MODEL_VERSION } from '../lib/nfl/gameSnapshot.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const E = (s, w, tm, opp, td) => ({ s, w, tm, opp, d: `${s}-09-0${w}`, g_td: td, h: 0 })
const log = (tm, rows) => ({ log: rows.map(([s, w, opp, td]) => E(s, w, tm, opp, td)) })
const LOGS = { logs: {
  a: log('AAA', [[2025, 1, 'BBB', 4], [2025, 2, 'CCC', 3]]), b: log('BBB', [[2025, 1, 'AAA', 1], [2025, 2, 'DDD', 1]]),
  c: log('CCC', [[2025, 2, 'AAA', 2]]), d: log('DDD', [[2025, 2, 'BBB', 2]]),
} }
const K1 = Date.parse('2026-10-11T17:00:00Z'); const K2 = Date.parse('2026-10-11T20:00:00Z')
const WEEK = {
  season: 2026, week: 5,
  games: [
    { game_id: 'T1', away: 'AAA', home: 'BBB', kickoff: new Date(K1).toISOString() },
    { game_id: 'T2', away: 'CCC', home: 'DDD', kickoff: new Date(K2).toISOString() },
    { game_id: 'T3', away: 'AAA', home: 'CCC', kickoff: 'garbage' },
  ],
  players: [
    { player_id: '1', team: 'AAA', stats: { xTD: 0.5 } }, { player_id: '2', team: 'AAA', stats: { xTD: 0.25 } },
    { player_id: '3', team: 'BBB', stats: { xTD: 0.4 } }, { player_id: '4', team: 'BBB', on_bye: true, stats: { xTD: 9 } },
    { player_id: '5', team: 'CCC', stats: { xTD: 0.3 } }, { player_id: '6', team: 'DDD' },
  ],
}

// pure builder
check(playersXtdSum(WEEK.players, 'AAA') === 0.75 && playersXtdSum(WEEK.players, 'BBB') === 0.4 && playersXtdSum(WEEK.players, 'DDD') === 0, 'players sum skips bye players and players with no stats')
const early = buildSnapshots({ week: WEEK, logs: LOGS, now: K1 - 3600e3 })
check(early.length === 2 && early.map((r) => r.game_id).join() === 'T1,T2', 'both games with a known kickoff are stamped; the one with no kickoff is not')
const r1 = early[0]
check(Math.abs(r1.team_model_total - (r1.team_model_home + r1.team_model_away)) < 1e-12 && r1.players_xtd_sum_home === 0.4 && r1.players_xtd_sum_away === 0.75, 'row carries the model total/home/away and the old sums')
check(r1.week === 5 && r1.season === 2026 && r1.home === 'BBB' && r1.away === 'AAA' && r1.model_version === MODEL_VERSION && r1.stamped_at < r1.kickoff, 'row carries week, clubs, model_version, stamped_at < kickoff')
check(buildSnapshots({ week: WEEK, logs: LOGS, now: K1 }).map((r) => r.game_id).join() === 'T2', 'AT kickoff a game is not stamped (T1), a later one still is')
check(buildSnapshots({ week: WEEK, logs: LOGS, now: K2 + 1 }).length === 0, 'after every kickoff nothing is stamped')
check(buildSnapshots({ week: { ...WEEK, mode: 'preseason' }, logs: LOGS, now: 0 }).length === 0, 'preseason is not stamped')
check(buildSnapshots({ week: WEEK, logs: null, now: 0 }).length === 0, 'no logs -> nothing (no made-up number)')

// fake db: a table with the primary key (game_id, model_version) and ignore-duplicates
function fakeDb({ missing = false } = {}) {
  const rows = []; const calls = { select: 0, upsert: 0 }
  return {
    rows, calls,
    from(t) {
      if (t !== SNAPSHOT_TABLE) throw new Error('wrong table ' + t)
      const q = {
        select() { q._sel = true; return q },
        eq() { return q },
        then(res) { calls.select += 1; res(missing ? { data: null, error: { code: '42P01', message: 'relation does not exist' } } : { data: rows.map((r) => ({ game_id: r.game_id })), error: null }) },
        upsert(batch, opts) {
          calls.upsert += 1
          if (!opts?.ignoreDuplicates) throw new Error('upsert without ignoreDuplicates would rewrite')
          for (const b of batch) if (!rows.some((r) => r.game_id === b.game_id && r.model_version === b.model_version)) rows.push(b)
          return Promise.resolve({ error: null })
        },
      }
      return q
    },
  }
}
const logsOnce = () => { let n = 0; return { get: async () => { n += 1; return LOGS }, n: () => n } }

const db = fakeDb(); const L = logsOnce()
check((await stampSnapshots(db, { week: WEEK, getLogs: L.get, now: K1 - 1000 })) === 'stamped 2' && db.rows.length === 2, 'first pass before kickoff stamps both games')
const snapshot = JSON.stringify(db.rows)
check((await stampSnapshots(db, { week: WEEK, getLogs: L.get, now: K1 - 500 })) === 'all-stamped' && L.n() === 1 && db.calls.upsert === 1, 'second pass is idempotent and does not even read the logs')
const WEEK2 = { ...WEEK, players: WEEK.players.map((p) => ({ ...p, stats: p.stats ? { xTD: 5 } : p.stats })) }
await stampSnapshots(db, { week: WEEK2, getLogs: L.get, now: K1 - 400 })
check(JSON.stringify(db.rows) === snapshot, 'changed inputs later never rewrite a stored row')
const db2 = fakeDb()
await stampSnapshots(db2, { week: WEEK, getLogs: L.get, now: K1 + 60e3 })
check(db2.rows.length === 1 && db2.rows[0].game_id === 'T2', 'a tick after T1 kicks off stamps only T2 (T1 stays unstamped, never late)')
check((await stampSnapshots(fakeDb(), { week: WEEK, getLogs: L.get, now: K2 + 1 })) === 'nothing-before-kickoff', 'after the last kickoff: nothing written')
const rm = await stampSnapshots(fakeDb({ missing: true }), { week: WEEK, getLogs: L.get, now: 0 })
check(/^table-missing/.test(rm), 'a missing table degrades to a message, no throw')
check(/^error/.test(await stampSnapshots({ from() { throw new Error('boom') } }, { week: WEEK, getLogs: L.get, now: 0 })), 'any failure is returned, never thrown')

// the read side: old sum vs team model vs actual (TEST rows)
const cmp = compareSnapshots([
  { game_id: 'X1', season: 2025, week: 2, home: 'BBB', away: 'AAA', model_version: 'v', team_model_total: 4, players_xtd_sum_home: 1, players_xtd_sum_away: 2.5 },
  { game_id: 'X2', season: 2026, week: 9, home: 'BBB', away: 'AAA', model_version: 'v', team_model_total: 4, players_xtd_sum_home: 1, players_xtd_sum_away: 2 },
], LOGS)
check(cmp.rows[0].actual === 4 && cmp.rows[0].old_err === -0.5 && cmp.rows[0].model_err === 0, 'compare: actual = both clubs\' logged touchdowns that week; errors are number minus actual')
check(cmp.rows[1].actual === null && cmp.summary.graded === 1 && cmp.summary.model_mae === 0, 'compare: a game with no result yet is left out of the error totals')

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
