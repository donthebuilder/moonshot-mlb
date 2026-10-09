#!/usr/bin/env node
// ONE-OFF: fill lamp_team_game_xg (lamp-team-v1) from the lamp_shots archive. Run AFTER
// supabase/migrations/202610081200_lamp_team_game_xg.sql has run. Reads lamp_shots (read-only),
// writes the club-game rows lib/nhl/teamXg.js builds (the same function the tick uses). Idempotent:
// a rerun upserts the same values.
//
//   node --import ./scripts/_esm-resolve.mjs scripts/backfill-lamp-team-xg.mjs            # every season in the archive
//   node --import ./scripts/_esm-resolve.mjs scripts/backfill-lamp-team-xg.mjs 20252026   # one season
import { createRequire } from 'node:module'
const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const { teamGameRows, writeTeamGames } = await import('../lib/nhl/teamXg.js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const only = process.argv[2] ? Number(process.argv[2]) : null

const COLS = 'game_id,event_id,game_date,season,game_type,team,goalie_id,x,y,zone,shot_type,result,strength,situation_code,period_type'
const probe = await db.from('lamp_team_game_xg').select('game_id', { head: true, count: 'exact' })
if (probe.error) { console.error(`lamp_team_game_xg is not there: ${probe.error.message}\nRun supabase/migrations/202610081200_lamp_team_game_xg.sql first.`); process.exit(1) }

// game ids first (a narrow read), then each 40 games' shots, so memory stays small
const ids = new Set()
for (let from = 0; ; from += 1000) {
  let q = db.from('lamp_shots').select('game_id').order('game_id').range(from, from + 999)
  if (only) q = q.eq('season', only)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  data.forEach((r) => ids.add(r.game_id))
  if (data.length < 1000) break
}
const list = [...ids].sort((a, b) => a - b)
console.log(`${list.length} games in lamp_shots${only ? ` (season ${only})` : ''}`)
let written = 0
for (let i = 0; i < list.length; i += 40) {
  const chunk = list.slice(i, i + 40); const shots = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('lamp_shots').select(COLS).in('game_id', chunk).order('game_id').order('event_id').range(from, from + 999)
    if (error) throw new Error(error.message)
    shots.push(...data)
    if (data.length < 1000) break
  }
  written += (await writeTeamGames(db, teamGameRows(shots))).rows
  if ((i / 40) % 10 === 9) console.log(`  ${Math.min(i + 40, list.length)} / ${list.length} games`)
}
console.log(`wrote ${written} club-game rows`)
