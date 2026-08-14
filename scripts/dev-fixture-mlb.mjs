// Local MLB render fixture — the site reads its slate from the bot's data
// branch, which a sandbox can't reach. This writes a slate + a graded results
// file into public/__devfixture/mlb so the MLB tabs can actually be rendered
// and looked at.
//
//   node scripts/dev-fixture-mlb.mjs
//   NEXT_PUBLIC_DATA_BASE=/__devfixture/mlb npm run dev
//
// Gitignored. Not shipped, not imported by anything.

import { mkdirSync, writeFileSync } from 'fs'

const OUT = 'public/__devfixture/mlb/current'
mkdirSync(OUT, { recursive: true })

const DATE = new Date().toISOString().slice(0, 10)
// Relative to NOW, not to fixed UTC hours — otherwise whether a game reads as
// locked depends on what time of day you happen to run this.
const inMin = (m) => new Date(Date.now() + m * 60000).toISOString()

const GAMES = [
  { pk: 811001, away: 'PHI', home: 'ATL', t: inMin(90) },    // open
  { pk: 811002, away: 'LAD', home: 'SD',  t: inMin(240) },   // open
  { pk: 811003, away: 'NYY', home: 'BOS', t: inMin(-180) },  // started: locked
]

const FIRST = ['Kyle', 'Bryce', 'Trea', 'Nick', 'Alec', 'Brandon', 'Austin', 'Matt',
  'Ozzie', 'Marcell', 'Michael', 'Jarred', 'Riley', 'Corbin', 'Shohei', 'Mookie',
  'Freddie', 'Will', 'Teoscar', 'Max', 'Manny', 'Fernando', 'Jackson', 'Xander',
  'Aaron', 'Juan', 'Giancarlo', 'Anthony', 'Rafael', 'Trevor', 'Masataka', 'Jarren']
const LAST = ['Schwarber', 'Harper', 'Turner', 'Castellanos', 'Bohm', 'Marsh',
  'Riley', 'Olson', 'Albies', 'Ozuna', 'Harris', 'Kelenic', 'Greene', 'Carroll',
  'Ohtani', 'Betts', 'Freeman', 'Smith', 'Hernandez', 'Muncy', 'Machado', 'Tatis',
  'Merrill', 'Bogaerts', 'Judge', 'Soto', 'Stanton', 'Volpe', 'Devers', 'Story',
  'Yoshida', 'Duran']

// Deterministic pseudo-random so reruns produce the same card.
let seed = 20260814
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }

const players = []
let pid = 600000
GAMES.forEach((g, gi) => {
  ;[g.away, g.home].forEach((team, side) => {
    const opp = side === 0 ? g.home : g.away
    for (let i = 0; i < 9; i++) {
      const n = gi * 18 + side * 9 + i
      players.push({
        player_id: pid++,
        player_name: `${FIRST[n % FIRST.length]} ${LAST[n % LAST.length]}`,
        team, opponent: opp, away: g.away, home: g.home,
        game_pk: g.pk, game_time: g.t,
        lineup_spot: i + 1, lineup_confirmed: true,
        hr_score: Math.round((45 + rnd() * 50) * 10) / 10,
        hit_score: Math.round((40 + rnd() * 55) * 10) / 10,
        hrr_score: Math.round((40 + rnd() * 50) * 10) / 10,
        contact_score: Math.round((38 + rnd() * 52) * 10) / 10,
        overall_score: Math.round((45 + rnd() * 45) * 10) / 10,
        game_pick_role: '',
        pitcher_name: `${LAST[(n * 3) % LAST.length]}`,
        pitcher_throws: rnd() > 0.6 ? 'L' : 'R',
        pitcher_era: Math.round((250 + rnd() * 300)) / 100,
        pitcher_hr9: Math.round((80 + rnd() * 90)) / 100,
        pitcher_whip: Math.round((100 + rnd() * 60)) / 100,
      })
    }
  })
})

// One designated pick per role per game, exactly like the bot since 2026-08-06.
// TOP is allowed to double up onto the HR man (the 2026-08-12 redesign).
const ROLE_KEY = { HR: 'hr_score', HIT: 'hit_score', HRR: 'hrr_score', CONTACT: 'contact_score' }
GAMES.forEach((g) => {
  const pool = players.filter((p) => p.game_pk === g.pk)
  const taken = new Set()
  Object.entries(ROLE_KEY).forEach(([role, key]) => {
    const best = [...pool].sort((a, b) => b[key] - a[key]).find((p) => !taken.has(p.player_id))
    if (!best) return
    taken.add(best.player_id)
    best.game_pick_role = best.game_pick_role ? `${best.game_pick_role}/${role}` : role
  })
  // TOP rides along with the HR man on one game, so the double-up path renders.
  const hrMan = pool.find((p) => String(p.game_pick_role).includes('HR'))
  if (hrMan && g.pk === 811001) hrMan.game_pick_role = `TOP/${hrMan.game_pick_role}`
})

writeFileSync(`${OUT}/today_slim.json`, JSON.stringify({
  date: DATE, slate_date: DATE, generated_at: new Date().toISOString(), players,
}, null, 0))

// ── graded results, published shape: ONE ROW PER PICK CATEGORY ───────────────
// Only the two games that have finished get lines, so the tab shows a mix of
// graded and still-pending slots.
// The real file carries ~90 TRACKED candidates a slate, not just the picks —
// so a swap usually has a line to be graded against. Two deep-bench spots are
// deliberately left out so the UNTRACKED path renders too.
const finished = new Set([811003])
const slots = []
players.forEach((p) => {
  if (!finished.has(p.game_pk)) return
  if (p.lineup_spot >= 8) return                     // untracked deep bench
  const roles = String(p.game_pick_role || '').split('/').filter(Boolean)
  if (!roles.length) roles.push('TRACKED')           // tracked, but not a pick
  const r = rnd()
  const ab = r < 0.06 ? 0 : 3 + Math.floor(rnd() * 2)      // ~6% never batted
  const hr = ab && rnd() < 0.17 ? 1 : 0
  const hits = ab ? Math.min(ab, hr + (rnd() < 0.5 ? 1 : 0)) : 0
  const d2 = !hr && hits && rnd() < 0.3 ? 1 : 0
  const tb = hr * 4 + d2 * 2 + Math.max(0, hits - hr - d2)
  const runs = hr || (hits && rnd() < 0.4) ? 1 : 0
  const rbi = hr ? 1 + (rnd() < 0.3 ? 1 : 0) : (rnd() < 0.25 ? 1 : 0)
  roles.forEach((role) => slots.push({
    player_id: p.player_id, player_name: p.player_name, team: p.team,
    game_pk: p.game_pk, game_pick_role: role, pick_type: role,
    actual_ab: ab, actual_hits: hits, actual_hr: hr, actual_tb: tb,
    actual_runs: runs, actual_rbi: rbi, actual_doubles: d2,
    got_hr: hr ? 1 : 0, got_base_hit: hits ? 1 : 0, is_final: 1,
  }))
})

writeFileSync(`${OUT}/results_live.json`, JSON.stringify({
  date: DATE, graded_slots: slots,
}, null, 0))

for (const f of ['pair_builder_latest', 'pair_history_summary', 'backtest_summary']) {
  writeFileSync(`${OUT}/${f}.json`, JSON.stringify({}))
}

console.log(`fixture: ${players.length} players, ${GAMES.length} games, ${slots.length} graded slots -> ${OUT}`)
