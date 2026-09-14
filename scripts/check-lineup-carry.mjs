// Lineup carry-forward + auto-fill, against a stub of the Supabase client.
//
// Exists because of two Week 1 defects (2026-09-14):
//  1. autoFillLineups inserted rows with no league_id into a NOT NULL column,
//     so the net never caught anyone all week.
//  2. Nothing carried a lineup into the next week, so every team opened Week 2
//     to nine empty slots.
// Run: node --import ./scripts/_esm-resolve.mjs scripts/check-lineup-carry.mjs
import { autoFillLineups, carryForwardLineups } from '../lib/fantasy/autoLineup.js'

const T1 = 'team-1', T2 = 'team-2', L = 'league-1'
const P = (id, position, team, pts = 10) => ({ id, name: id, position, team, source_payload: { stats: { RUYD: pts * 10 } } })

function stub({ prevSlots = [], curSlots = [], roster = [], games = [] }) {
  const writes = []
  const table = (rows) => ({
    _rows: rows, _f: [],
    select() { return this }, eq(k, v) { this._f.push((r) => r[k] === v); return this },
    in(k, vs) { this._f.push((r) => vs.includes(r[k])); return this },
    is(k, v) { this._f.push((r) => (r[k] ?? null) === v); return this },
    then(res) { res({ data: this._rows.filter((r) => this._f.every((f) => f(r))) }) },
    upsert(rows) { writes.push(...rows); return Promise.resolve({ error: null }) },
  })
  const slots = [...prevSlots.map((r) => ({ ...r, week: 1 })), ...curSlots.map((r) => ({ ...r, week: 2 }))]
  return {
    writes,
    from(name) {
      if (name === 'fantasy_leagues') return table([{ id: L, status: 'active', scoring: 'ppr', has_kicker: true, has_defense: true }])
      if (name === 'fantasy_teams') return table([{ id: T1, league_id: L, name: 'One' }, { id: T2, league_id: L, name: 'Two' }])
      if (name === 'fantasy_lineup_slots') return table(slots.map((r) => ({ season: 2026, ...r })))
      if (name === 'fantasy_roster_entries') return table(roster.map((r) => ({ released_at: null, ...r, player: r.player })))
      if (name === 'nfl_week_games') return table(games)
      throw new Error(`unexpected table ${name}`)
    },
  }
}

let bad = 0
const check = (ok, msg) => { if (!ok) { bad++; console.log('MISS', msg) } else console.log('ok  ', msg) }

// ── carry-forward ──
{
  const qb = P('qb', 'QB', 'BUF'), rb = P('rb', 'RB', 'BAL'), wr = P('wr', 'WR', 'CIN'), gone = P('gone', 'WR', 'DAL')
  const db = stub({
    prevSlots: [
      { team_id: T1, slot: 'QB', slot_index: 1, player_id: 'qb' },
      { team_id: T1, slot: 'RB', slot_index: 1, player_id: 'rb' },
      { team_id: T1, slot: 'WR', slot_index: 1, player_id: 'gone' },   // dropped since
      { team_id: T1, slot: 'BENCH', slot_index: 1, player_id: 'wr' },
    ],
    curSlots: [{ team_id: T1, slot: 'RB', slot_index: 1, player_id: 'wr' }], // manager already moved wr into RB1 this week
    roster: [{ team_id: T1, player_id: 'qb', player: qb }, { team_id: T1, player_id: 'rb', player: rb }, { team_id: T1, player_id: 'wr', player: wr }],
  })
  const r = await carryForwardLineups(db, { season: 2026, week: 2 })
  const got = db.writes.map((w) => `${w.slot}${w.slot_index}=${w.player_id}`).sort()
  check(r.skipped === null && r.rowsCarried === 1, `carry: only the QB carries (${JSON.stringify(got)}) -- RB1 taken, wr already placed, gone off roster`)
  check(got.join() === 'QB1=qb', 'carry: exact rows written')
  check(db.writes.every((w) => w.league_id === L && w.week === 2 && w.season === 2026), 'carry: rows carry league_id, season, week')
  const r1 = await carryForwardLineups(db, { season: 2026, week: 1 })
  check(r1.skipped === 'first_week' && r1.rowsCarried === 0, 'carry: week 1 has nothing to carry from')
}

// ── auto-fill regression: league_id must be on the row ──
{
  const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const qb = P('qb', 'QB', 'BUF'), rb = P('rb', 'RB', 'BAL')
  const db = stub({
    roster: [{ team_id: T1, player_id: 'qb', player: qb }, { team_id: T1, player_id: 'rb', player: rb }],
    games: [{ season: 2026, week: 2, kickoff: soon, status: 'scheduled', home_team: 'BUF', away_team: 'BAL' }],
  })
  const r = await autoFillLineups(db, { season: 2026, week: 2 })
  check(r.skipped === null && r.slotsFilled === 2, `auto-fill: filled QB + RB (${JSON.stringify(r.skipped)} ${r.slotsFilled})`)
  check(db.writes.length === 2 && db.writes.every((w) => w.league_id === L), 'auto-fill: every row carries league_id (was missing -> NOT NULL violation all Week 1)')
}

console.log(bad ? `\n${bad} check(s) failed` : '\nok   lineup carry-forward + auto-fill')
process.exit(bad ? 1 : 0)
