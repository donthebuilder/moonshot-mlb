#!/usr/bin/env node
/**
 * dev-fixture.mjs — a fake slate, so the site can be rendered without the bot.
 *
 * moonshot-mlb reads everything from the STREAMLIT repo's `data` branch. That
 * means anyone working on the UI without network access to that branch — a
 * sandbox, an offline plane, a CI screenshot job — gets "No players found" on
 * every tab and can't see a single change they make.
 *
 * This writes twelve players into public/__devfixture/ with the field shape
 * the site actually reads, INCLUDING the pictograph-bearing role strings the
 * bot publishes ("🏆 HR Bet", "⛔ True Avoid"), because those are exactly the
 * thing you need to see rendering to know a badge change worked.
 *
 *   node scripts/dev-fixture.mjs
 *   NEXT_PUBLIC_DATA_BASE=/__devfixture npm run build && npm start
 *
 * public/__devfixture/ is gitignored. Nothing fake is ever served in
 * production, and the generator is the artifact rather than the output.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'public/__devfixture/current'
mkdirSync(OUT, { recursive: true })

// Deterministic — a fixture that changes every run can't be diffed between
// screenshots, which is most of what it's for.
let seed = 7
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const between = (lo, hi, dp = 2) => Number((lo + rnd() * (hi - lo)).toFixed(dp))

const GAMES = [['NYY', 'BOS'], ['LAD', 'SD'], ['ATL', 'PHI']]
const ROLES = ['🏆 HR Bet', '🔥 HR Lean', '🏁 HRR', '🔭 Power Watch', '💠 Contact', '⛔ True Avoid']
const BETS  = ['🏆 HR Bet', '🔥 HR Lean', '🏁 HRR', '💠 Contact', 'Avoid HR']
const PICKS = ['TOP', 'HR', 'HRR', 'HIT', 'CONTACT', '']
const NAMES = ['Aaron Judge', 'Juan Soto', 'Shohei Ohtani', 'Mookie Betts', 'Rafael Devers',
  'Bryce Harper', 'Matt Olson', 'Freddie Freeman', 'Kyle Schwarber', 'Yordan Alvarez',
  'Corey Seager', 'Pete Alonso']

const rows = NAMES.map((name, i) => {
  const [team, opponent] = GAMES[i % GAMES.length]
  return {
    game_pk: 700000 + (i % 3), team, opponent, venue_name: 'Dev Park',
    player_id: 1000 + i, name, bats: i % 3 ? 'R' : 'L',
    lineup_spot: (i % 9) + 1, lineup_confirmed: true,
    hr_score: between(28, 72, 1), hit_score: between(30, 70, 1),
    hrr_score: between(30, 70, 1), contact_score: between(30, 70, 1),
    overall_score: between(30, 70, 1), hrw_score: between(35, 85, 1),
    season_avg: between(0.22, 0.31, 3), season_iso: between(0.14, 0.30, 3),
    season_hr: Math.round(between(8, 42, 0)), season_pa: Math.round(between(300, 600, 0)),
    last5_hits: Math.round(between(2, 8, 0)), last5_hr: Math.round(between(0, 3, 0)),
    recent_350_num: Math.round(between(0, 6, 0)), recent_350_den: 20,
    recent_barrel_rate: between(0.05, 0.20, 3), recent_ev: between(88, 95, 1),
    recent_ideal_hr_contact: between(0.04, 0.30, 3),
    // The whole point of the fixture: roles as the bot really sends them.
    final_hr_role: ROLES[i % ROLES.length],
    best_bet_type: BETS[i % BETS.length],
    game_pick_role: PICKS[i % PICKS.length],
    pitcher_name: 'Dev Pitcher', pitcher_throws: i % 2 ? 'R' : 'L',
    weather_temp_f: 78, weather_wind_mph: 6,
  }
})

writeFileSync(`${OUT}/today_slim.json`, JSON.stringify(rows))
writeFileSync(`${OUT}/tomorrow_slim.json`, JSON.stringify(rows))
for (const f of ['results_live.json', 'results_final.json', 'pair_builder_latest.json',
                 'pair_history_summary.json', 'backtest_summary.json']) {
  writeFileSync(`${OUT}/${f}`, '{}')
}
console.log(`wrote ${rows.length} fixture players to ${OUT}`)
