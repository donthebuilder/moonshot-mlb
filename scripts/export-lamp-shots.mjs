#!/usr/bin/env node
// READ-ONLY export for the lamp-xg fit and eval (2026-10-07): every lamp_shots row, and the dial
// the board really carried (lamp_goal_log legs.goalsPg per game and side), into local JSONL files.
// The fit and eval scripts then run offline on those files.
//
//   node scripts/export-lamp-shots.mjs <out-dir>        (service key in .env.local; writes nothing to the database)
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const dir = process.argv[2]
if (!dir) { console.error('usage: export-lamp-shots.mjs <out-dir>'); process.exit(1) }
mkdirSync(dir, { recursive: true })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function all(table, cols, order) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols)
    for (const o of order) q = q.order(o)
    const { data, error } = await q.range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}
const shots = await all('lamp_shots', 'game_id,event_id,game_date,season,game_type,period,period_type,time_s,player_id,team,goalie_id,x,y,zone,shot_type,result,strength,situation_code', ['game_id', 'event_id'])
writeFileSync(join(dir, 'shots.jsonl'), shots.map((r) => JSON.stringify(r)).join('\n'))
const log = await all('lamp_goal_log', 'game_id,player_id,model_version,game_date,season,game_type,team,opp,home,status,legs,goals', ['game_id', 'player_id'])
writeFileSync(join(dir, 'goal-log.jsonl'), log.map((r) => JSON.stringify(r)).join('\n'))
console.log(`lamp_shots ${shots.length} rows, lamp_goal_log ${log.length} rows -> ${dir}`)
