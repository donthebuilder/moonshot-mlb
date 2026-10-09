#!/usr/bin/env node
// OLD SUM vs TEAM MODEL vs ACTUAL, per game (read side of lib/nfl/gameSnapshot.js).
//   node --import ./scripts/_esm-resolve.mjs scripts/nfl-td-compare.mjs [--season 2026] [--week 5] [--model <model_version>]
//        [--snapshots file.json] [--logs file.json]
// Snapshots come from Supabase (nfl_game_td_snapshots; needs NEXT_PUBLIC_SUPABASE_URL + a key in the environment, read
// only, nothing is printed of them) or --snapshots. "Actual" is the club's touchdowns in nfl_logs.json (tracked
// skill players, the unit both numbers are in) -- from NFL_DATA_BASE or --logs. A game not yet in the logs prints "-".
import fs from 'node:fs'
import { compareSnapshots, SNAPSHOT_TABLE } from '../lib/nfl/gameSnapshot.js'
import { NFL_DATA_BASE } from '../lib/nfl/dataSource.js'

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null }
const season = arg('season'); const week = arg('week'); const model = arg('model')

async function loadSnapshots() {
  if (arg('snapshots')) return JSON.parse(fs.readFileSync(arg('snapshots'), 'utf8'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('no Supabase env (set NEXT_PUBLIC_SUPABASE_URL and a key) -- or pass --snapshots file.json')
  const { createClient } = await import('@supabase/supabase-js')
  let q = createClient(url, key, { auth: { persistSession: false } }).from(SNAPSHOT_TABLE).select('*')
  if (season) q = q.eq('season', Number(season))
  if (week) q = q.eq('week', Number(week))
  const { data, error } = await q
  if (error) throw new Error(`${SNAPSHOT_TABLE}: ${error.message} (has supabase/migrations/202610081300 run? is the key allowed to read it?)`)
  return data
}
async function loadLogs() {
  if (arg('logs')) return JSON.parse(fs.readFileSync(arg('logs'), 'utf8'))
  const r = await fetch(`${NFL_DATA_BASE}/nfl_logs.json`)
  if (!r.ok) throw new Error(`nfl_logs.json: ${r.status}`)
  return r.json()
}

let snaps = await loadSnapshots()
if (model) snaps = snaps.filter((s) => s.model_version === model)
if (!snaps.length) { console.log('No snapshots yet. They are stamped by the NFL tick before each kickoff.'); process.exit(0) }
const { rows, summary: s } = compareSnapshots(snaps, await loadLogs())
const f = (v, d = 1) => (v == null ? '-' : v.toFixed(d))
console.log(['season', 'wk', 'game', 'old sum', 'team model', 'actual', 'old err', 'model err'].join('\t'))
for (const r of rows) console.log([r.season, r.week, r.game, f(r.old_sum), f(r.team_model), r.actual ?? '-', f(r.old_err), f(r.model_err)].join('\t'))
console.log(`\n${s.games} games, ${s.graded} with a result. Mean absolute error: old sum ${f(s.old_mae, 2)}, team model ${f(s.model_mae, 2)}. Mean error (bias): old sum ${f(s.old_bias, 2)}, team model ${f(s.model_bias, 2)}.`)
