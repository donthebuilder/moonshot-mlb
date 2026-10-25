#!/usr/bin/env node
// ONE-OFF: backfill lamp_box (supabase/migrations/202610252200_lamp_box.sql) for a season's final regular-season games, from the
// NHL's own box scores -- the same rows the tick writes at grade (lib/nhl/box.js). Run from the repo root with the service key
// in .env.local:
//
//   node scripts/backfill-lamp-box.mjs              # 2025-26
//   node scripts/backfill-lamp-box.mjs 20262027     # this season so far
//
// Polite to the free feed: one box score at a time, a pause between, retries on a dropped read. Resumable: a game already in
// lamp_box is skipped, so a stopped run just starts again. Writes only.
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const { boxRowsNhl, writeBox } = await import('../lib/nhl/box.js')
const { NHL_TEAMS } = await import('../lib/nhl/teams.js')

const SEASON = Number(process.argv[2] || 20252026)
const GAP_MS = 400
const API = 'https://api-web.nhle.com/v1'
const UA = { 'User-Agent': 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)', Accept: 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function get(path) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(`${API}${path}`, { headers: UA, redirect: 'follow' })
      if (r.ok) return r.json()
      if (attempt === 4) throw new Error(`${r.status} ${path}`)
    } catch (e) { if (attempt === 4) throw e }
    await sleep(2000 * attempt)
  }
}

const probe = await db.from('lamp_box').select('game_id').limit(1)
if (probe.error) { console.error(`lamp_box isn't there yet (${probe.error.message}) -- run supabase/migrations/202610252200_lamp_box.sql first`); process.exit(1) }

// every final regular-season game, from the 32 club schedules
const ids = new Set()
for (const [abbrev] of NHL_TEAMS) {
  const s = await get(`/club-schedule-season/${abbrev}/${SEASON}`).catch(() => null)
  for (const g of s?.games || []) if (g.gameType === 2 && ['OFF', 'FINAL'].includes(g.gameState)) ids.add(Number(g.id))
  await sleep(GAP_MS)
}
const have = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('lamp_box').select('game_id').eq('season', SEASON).range(from, from + 999)
  if (error) throw new Error(error.message)
  for (const r of data) have.add(Number(r.game_id))
  if (data.length < 1000) break
}
const todo = [...ids].filter((id) => !have.has(id)).sort((a, b) => a - b)
console.log(`${SEASON}: ${ids.size} final games, ${have.size} already in lamp_box, ${todo.length} to read`)
let done = 0, rows = 0, failed = 0
for (const id of todo) {
  try {
    const box = await get(`/gamecenter/${id}/boxscore`)
    const w = await writeBox(db, boxRowsNhl(box))
    if (w.missing) throw new Error('lamp_box missing')
    rows += w.rows; done++
  } catch (e) { failed++; console.log(`  ${id}: ${e?.message} (left for a re-run)`) }
  if ((done + failed) % 100 === 0) console.log(`${done + failed}/${todo.length} · ${rows} rows${failed ? ` · ${failed} failed` : ''}`)
  await sleep(GAP_MS)
}
console.log(`done: ${done} games, ${rows} rows, ${failed} failed`)
