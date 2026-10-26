#!/usr/bin/env node
// ONE-OFF: backfill opening_games (sport 'nhl') for a season's final games, from the NHL's own play-by-play -- the same row the
// tick writes at grade (lib/nhl/openings.js). Run from the repo root with the service key in .env.local:
//
//   node scripts/backfill-nhl-openings.mjs              # 2025-26
//   node scripts/backfill-nhl-openings.mjs 20262027     # this season so far
//
// Polite to the free feed: one game at a time, a pause between, retries on a dropped read. Resumable: a game already in
// opening_games is skipped, so a stopped run just starts again. Writes only. Regular season and playoffs.
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const { writeOpeningNhl, openingRowNhl } = await import('../lib/nhl/openings.js')
const { NHL_TEAMS } = await import('../lib/nhl/teams.js')
const { unfilledGames, writePreAtt } = await import('../lib/openings/preAtt.js')

const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^\d{1,5}$/.test(a))
const SEASON = Number(ARGS[0] || 20252026)
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

// --fill-pre-att [season] [--limit N] [--dry]: games already on file with a first goal but no shots-to-first-goal count get
// that count (re-read once, only those two columns written; lib/openings/preAtt.js). Run once after supabase/migrations/202610261100.
if (process.argv.includes('--fill-pre-att')) {
  const li = process.argv.indexOf('--limit'), DRY = process.argv.includes('--dry')
  const todo = (await unfilledGames(db, 'nhl', ARGS[0] ? SEASON : null)).slice(0, li > 0 ? Number(process.argv[li + 1]) : Infinity)
  console.log(`${todo.length} NHL games to fill`)
  let ok = 0, none = 0, bad = 0
  for (const r of todo) {
    try {
      const row = openingRowNhl(await get(`/gamecenter/${r.game_id}/play-by-play`))
      if (DRY) { console.log(`  ${r.game_date} ${r.away}@${r.home}: ${row?.pre_first_att_away} / ${row?.pre_first_att_home}`); ok++ } else {
        const err = await writePreAtt(db, 'nhl', r.game_id, row)
        if (err === 'no first score') none++; else if (err) throw new Error(err); else ok++
      }
    } catch (e) { bad++; console.log(`  ${r.game_id}: ${e?.message} (left for a re-run)`) }
    await sleep(GAP_MS)
  }
  console.log(`done: ${ok} filled${DRY ? ' (dry, nothing written)' : ''}, ${none} with no goal before the shootout, ${bad} failed`)
  process.exit(0)
}

// every final regular-season and playoff game, from the 32 club schedules
const ids = new Set()
for (const [abbrev] of NHL_TEAMS) {
  const s = await get(`/club-schedule-season/${abbrev}/${SEASON}`).catch(() => null)
  for (const g of s?.games || []) if ([2, 3].includes(g.gameType) && ['OFF', 'FINAL'].includes(g.gameState)) ids.add(String(g.id))
  await sleep(GAP_MS)
}
const have = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('opening_games').select('game_id').eq('sport', 'nhl').eq('season', SEASON).order('game_id').range(from, from + 999)
  if (error) throw new Error(error.message)
  for (const r of data) have.add(String(r.game_id))
  if (data.length < 1000) break
}
const todo = [...ids].filter((id) => !have.has(id)).sort()
console.log(`${SEASON}: ${ids.size} final games, ${have.size} already in opening_games, ${todo.length} to read`)
let done = 0, failed = 0
for (const id of todo) {
  try {
    const err = await writeOpeningNhl(db, await get(`/gamecenter/${id}/play-by-play`), 'backfill')
    if (err) throw new Error(err)
    done++
  } catch (e) { failed++; console.log(`  ${id}: ${e?.message} (left for a re-run)`) }
  if ((done + failed) % 100 === 0) console.log(`${done + failed}/${todo.length}${failed ? ` · ${failed} failed` : ''}`)
  await sleep(GAP_MS)
}
console.log(`done: ${done} games, ${failed} failed`)
