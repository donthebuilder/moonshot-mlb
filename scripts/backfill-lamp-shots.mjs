#!/usr/bin/env node
// ONE-OFF: backfill lamp_shots for a finished NHL regular season (lamp
// research step 3, 2026-09-26). Run from the repo root with the service key
// in .env.local:
//
//   node scripts/backfill-lamp-shots.mjs            # 2025-26 regular season
//   node scripts/backfill-lamp-shots.mjs 20242025   # another season
//   node scripts/backfill-lamp-shots.mjs graded     # every game LAMP has graded
//                                                   # (preseason included) --
//                                                   # the nights graded before
//                                                   # the tick wrote shots
//
// Polite to the free feed: at most two play-by-play reads a second.
// Resumable: games already in lamp_shots are skipped, so a stopped run just
// starts again. Same rows the tick writes (lib/nhl/shots.js).
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const { shotsFromPlayByPlay, writeShots } = await import('../lib/nhl/shots.js')
const { NHL_TEAMS } = await import('../lib/nhl/teams.js')

const GRADED = process.argv[2] === 'graded'
const SEASON = GRADED ? null : Number(process.argv[2] || 20252026)
const GAP_MS = 500
const API = 'https://api-web.nhle.com/v1'
const UA = { 'User-Agent': 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)', Accept: 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function get(path) {
  // A dropped connection ("fetch failed") is retried like a bad status --
  // on the first 2025-26 run ~15% of reads dropped mid-run and came back.
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(`${API}${path}`, { headers: UA, redirect: 'follow' })
      if (r.ok) return r.json()
      if (attempt === 4) throw new Error(`${r.status} ${path}`)
    } catch (e) {
      if (attempt === 4) throw e
    }
    await sleep(2000 * attempt)
  }
}

const ids = new Set()
if (GRADED) {
  const { data, error } = await db.from('lamp_goal_games').select('game_id').not('graded_at', 'is', null)
  if (error) throw new Error(error.message)
  for (const r of data) ids.add(Number(r.game_id))
} else {
  // Every final regular-season game, from the 32 club schedules.
  for (const [abbrev] of NHL_TEAMS) {
    const s = await get(`/club-schedule-season/${abbrev}/${SEASON}`)
    for (const g of s.games || []) if (g.gameType === 2 && ['OFF', 'FINAL'].includes(g.gameState)) ids.add(Number(g.id))
    await sleep(GAP_MS)
  }
}

// Resume: what is already there (paged -- PostgREST returns 1,000 at most).
const have = new Set()
for (let from = 0; ; from += 1000) {
  let q = db.from('lamp_shots').select('game_id')
  q = GRADED ? q.in('game_id', [...ids]) : q.eq('season', SEASON)
  const { data, error } = await q.range(from, from + 999)
  if (error) throw new Error(error.message)
  for (const r of data) have.add(Number(r.game_id))
  if (data.length < 1000) break
}
const todo = [...ids].filter((id) => !have.has(id)).sort()
console.log(`[backfill] ${GRADED ? 'graded LAMP games' : `season ${SEASON}`}: ${ids.size} games, ${have.size} already stored, ${todo.length} to go`)

let done = 0; let rows = 0; const failed = []
for (const id of todo) {
  try {
    const n = (await writeShots(db, shotsFromPlayByPlay(await get(`/gamecenter/${id}/play-by-play`)))).rows
    rows += n
  } catch (e) {
    failed.push(id); console.error(`[backfill] ${id}: ${e?.message}`)
  }
  done += 1
  if (done % 50 === 0 || done === todo.length) console.log(`[backfill] ${done}/${todo.length} games, ${rows} rows, ${failed.length} failed`)
  await sleep(GAP_MS)
}
console.log(`[backfill] finished: ${rows} rows from ${done - failed.length} games; failed ${failed.length}${failed.length ? ` (${failed.join(', ')}) -- run again to retry` : ''}`)
