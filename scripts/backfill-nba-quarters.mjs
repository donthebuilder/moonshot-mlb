// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/backfill-nba-quarters.mjs [--season 2026] [--dry]
// BUCKETS' QUARTER SPLITS BACKFILL (2026-10-22): every regular-season and playoff game already on file in opening_games (written
// from the same ESPN summary at grade time) gets its per-player period rows in buckets_quarters (lib/nba/quarters.js), marked
// source='backfill'. Idempotent (upsert) and resumable: a game already in buckets_quarters is skipped. Gentle on ESPN: three
// games at a time, a pause between. --season limits it to one ESPN season year (2026 = 2025-26); --dry counts without writing.
import { createClient } from '@supabase/supabase-js'
import { summaryFor } from '../lib/nba/api.js'
import { quarterLines, writeQuarters } from '../lib/nba/quarters.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const SEASON = arg('--season', null), DRY = process.argv.includes('--dry')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const probe = await db.from('buckets_quarters').select('game_id').limit(1)
if (probe.error) { console.error(`buckets_quarters isn't there yet (${probe.error.message}) -- run supabase/migrations/202610230100_buckets_quarters.sql first`); process.exit(1) }

const paged = async (q) => { const out = []; for (let from = 0; ; from += 1000) { const r = await q().range(from, from + 999); if (r.error) throw new Error(r.error.message); out.push(...r.data); if (r.data.length < 1000) return out } }
let list = await paged(() => { let q = db.from('opening_games').select('game_id, game_date, season, season_type').eq('sport', 'nba').in('season_type', [2, 3]).order('game_date').order('game_id'); if (SEASON) q = q.eq('season', Number(SEASON)); return q })
const have = new Set((await paged(() => db.from('buckets_quarters').select('game_id').eq('period', 1).order('game_id').order('player_id'))).map((r) => r.game_id))
list = list.filter((g) => !have.has(String(g.game_id)))
console.log(`${list.length} games to fill${SEASON ? ` (season ${SEASON})` : ''}; ${have.size} already on file`)

let games = 0, rows = 0, failed = 0, i = 0
await Promise.all(Array.from({ length: 3 }, async () => {
  while (i < list.length) {
    const g = list[i++]
    const s = await summaryFor(g.game_id, true).catch(() => null)
    if (!s) { failed++; console.log(`  ${g.game_date} ${g.game_id}: summary failed (left for a re-run)`); continue }
    const game = { gameId: g.game_id, gameDate: g.game_date, season: g.season, seasonType: g.season_type }
    const n = quarterLines(s).length
    const err = DRY ? (n ? null : 'no plays') : await writeQuarters(db, s, game, 'backfill')
    if (err) { failed++; console.log(`  ${g.game_date} ${g.game_id}: ${err}`) } else { games++; rows += n }
    if (games % 100 === 0 && !err) console.log(`  ${games} games, ${rows} rows`)
    await sleep(250)
  }
}))
console.log(`done: ${games} games, ${rows} period rows${DRY ? ' (dry, nothing written)' : ''}, ${failed} failed`)
