// Injured starters get benched, and nobody else is touched -- against a stub
// of the Supabase client (TEST DATA, not real players or projections).
//
// Exists because of 2026-09-23 (Donovan: "make sure teams don't start injured
// players. auto just in case"). Defends the four rules that make an automatic
// edit to a filled lineup safe:
//   1. an OUT starter is swapped for the best healthy eligible bench player
//   2. a QUESTIONABLE starter is left alone
//   3. no swap once the injured man's game has kicked off
//   4. no swap when there is no healthy replacement
// and that auto-fill never STARTS an OUT player into an empty slot.
// Run: node --import ./scripts/_esm-resolve.mjs scripts/check-injured-bench.mjs
import { autoFillLineups, benchUnavailableStarters } from '../lib/fantasy/autoLineup.js'
import { isUnavailable } from '../lib/fantasy/injury.js'

let failed = 0
const ok = (name, cond) => { if (!cond) failed++; console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${name}`) }

const L = 'league-1', T = 'team-1', NOW = Date.parse('2026-09-27T15:00:00Z')
const P = (id, position, team, pts, injury_status = null) =>
  ({ id, name: id, position, team, injury_status, source_payload: { stats: { RUYD: pts * 10, RECYD: pts * 10 } } })

function stub({ roster, slots, games }) {
  let rows = slots.map((r, i) => ({ id: `s${i}`, league_id: L, team_id: T, season: 2026, week: 3, locked_at: null, ...r }))
  const tables = {
    nfl_week_games: () => games,
    fantasy_leagues: () => [{ id: L, scoring: 'ppr', has_kicker: false, has_defense: false, status: 'active' }],
    fantasy_teams: () => [{ id: T, league_id: L, name: 'Test' }],
    fantasy_roster_entries: () => roster.map((p) => ({ team_id: T, player_id: p.id, player: p, released_at: null })),
    fantasy_lineup_slots: () => rows,
  }
  const q = (name) => {
    const f = []
    const api = {
      select() { return api }, eq(k, v) { f.push((r) => r[k] === v); return api },
      in(k, vs) { f.push((r) => vs.includes(r[k])); return api }, is(k, v) { f.push((r) => (r[k] ?? null) === v); return api },
      then(res) { res({ data: tables[name]().filter((r) => f.every((x) => x(r))) }) },
      delete() { return { eq(k, v) { rows = rows.filter((r) => r[k] !== v); return Promise.resolve({ error: null }) } } },
      update(patch) { return { eq(k, v) { return { is(k2, v2) { rows = rows.map((r) => r[k] === v && (r[k2] ?? null) === v2 ? { ...r, ...patch } : r); return Promise.resolve({ error: null }) } } } } },
      insert(row) { if (rows.some((r) => r.player_id === row.player_id)) return Promise.resolve({ error: { message: 'dup player' } }); rows.push({ id: `n${rows.length}`, locked_at: null, ...row }); return Promise.resolve({ error: null }) },
      upsert(ins) { rows.push(...ins.map((r, i) => ({ id: `u${i}`, locked_at: null, ...r }))); return Promise.resolve({ error: null }) },
    }
    return api
  }
  return { db: { from: q }, rows: () => rows }
}

const later = [{ season: 2026, week: 3, kickoff: '2026-09-27T17:00:00Z', home_team: 'KC', away_team: 'MIA' }, { season: 2026, week: 3, kickoff: '2026-09-27T20:25:00Z', home_team: 'DAL', away_team: 'BAL' }]

console.log('\ninjury rule')
ok('OUT / D / IR are unavailable', ['OUT', 'D', 'Doubtful', 'IR', 'out'].every((s) => isUnavailable({ injury_status: s })))
ok('Q / questionable / null are available', ['Q', 'questionable', null, ''].every((s) => !isUnavailable({ injury_status: s })))

console.log('\nbench an OUT starter')
{
  const roster = [P('rbOut', 'RB', 'KC', 20, 'OUT'), P('rbBench', 'RB', 'DAL', 12), P('rbBench2', 'RB', 'BAL', 9), P('wrQ', 'WR', 'KC', 15, 'Q')]
  const s = stub({ roster, games: later, slots: [
    { slot: 'RB', slot_index: 1, player_id: 'rbOut' }, { slot: 'WR', slot_index: 1, player_id: 'wrQ' },
    { slot: 'BENCH', slot_index: 1, player_id: 'rbBench2' }, { slot: 'BENCH', slot_index: 2, player_id: 'rbBench' },
  ] })
  const r = await benchUnavailableStarters(s.db, { season: 2026, week: 3, now: NOW })
  const at = (slot, i) => s.rows().find((x) => x.slot === slot && x.slot_index === i)?.player_id
  ok(`one swap (${r.swapped}, ${r.skipped || 'no skip'})`, r.swapped === 1)
  ok('best healthy RB now starts at RB1', at('RB', 1) === 'rbBench')
  ok('the OUT man took his bench slot', at('BENCH', 2) === 'rbOut')
  ok('the questionable WR was not touched', at('WR', 1) === 'wrQ')
  ok('the other bench RB was not touched', at('BENCH', 1) === 'rbBench2')
}

console.log('\nno swap once his game has started')
{
  const roster = [P('rbOut', 'RB', 'KC', 20, 'OUT'), P('rbBench', 'RB', 'DAL', 12)]
  const s = stub({ roster, games: later, slots: [{ slot: 'RB', slot_index: 1, player_id: 'rbOut' }] })
  const r = await benchUnavailableStarters(s.db, { season: 2026, week: 3, now: Date.parse('2026-09-27T17:30:00Z') })
  ok('nothing swapped after KC kicked off', r.swapped === 0 && s.rows()[0].player_id === 'rbOut')
}

console.log('\nafter the last kickoff it reads nothing (egress)')
{
  const roster = [P('rbOut', 'RB', 'KC', 20, 'OUT'), P('rbBench', 'RB', 'DAL', 12)]
  const s = stub({ roster, games: later, slots: [{ slot: 'RB', slot_index: 1, player_id: 'rbOut' }] })
  const reads = []; const from = s.db.from; s.db.from = (n) => { reads.push(n); return from(n) }
  const r = await benchUnavailableStarters(s.db, { season: 2026, week: 3, now: Date.parse('2026-09-28T02:00:00Z') })
  ok(`skipped as all_kicked_off (${r.skipped})`, r.skipped === 'all_kicked_off')
  ok(`no roster read (${reads.join(',')})`, !reads.includes('fantasy_roster_entries'))
}

console.log('\nno replacement, no swap')
{
  const roster = [P('rbOut', 'RB', 'KC', 20, 'OUT'), P('rbAlsoOut', 'RB', 'DAL', 12, 'IR'), P('wr', 'WR', 'DAL', 12)]
  const s = stub({ roster, games: later, slots: [{ slot: 'RB', slot_index: 1, player_id: 'rbOut' }] })
  const r = await benchUnavailableStarters(s.db, { season: 2026, week: 3, now: NOW })
  ok('stays put when the only other RB is also out (a WR cannot play RB)', r.swapped === 0 && s.rows()[0].player_id === 'rbOut')
}

console.log('\nauto-fill never starts an OUT player')
{
  const roster = [P('rbOut', 'RB', 'KC', 30, 'OUT'), P('rbOk', 'RB', 'DAL', 8)]
  const s = stub({ roster, games: later, slots: [] })
  const r = await autoFillLineups(s.db, { season: 2026, week: 3, now: Date.parse('2026-09-27T16:30:00Z'), commit: true })
  const starters = s.rows().filter((x) => x.slot === 'RB').map((x) => x.player_id)
  ok(`RB filled with the healthy man only (${starters.join(',') || 'none'}; ${r.skipped || 'ok'})`, starters.includes('rbOk') && !starters.includes('rbOut'))
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall injured-lineup checks passed')
