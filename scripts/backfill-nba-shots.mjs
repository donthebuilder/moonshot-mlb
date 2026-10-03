// node --env-file=.env.local --import <loader> scripts/backfill-nba-shots.mjs [--from 2025-10-21] [--to 2026-04-12] [--dry]
// BUCKETS' BACKFILL (BUCKETS-PLAN-v2, Donovan 10-02: "backfill last season"):
// every regular-season game's field-goal attempts into buckets_shots, the same
// reader the tick uses (lib/nba/api.js reduceShots). Idempotent (upsert on
// game_id + event_id) and resumable: a game already in the table is skipped.
// Gentle on ESPN: one game at a time, a pause between. Refuses to run until
// QUEUE SQL part 3 has created the table. --dry counts without writing.
import { createClient } from '@supabase/supabase-js'
import { scoreboardFor, reduceScoreboard, summaryFor, reduceShots } from '../lib/nba/api.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const FROM = arg('--from', '2025-10-21'), TO = arg('--to', '2026-04-12'), DRY = process.argv.includes('--dry')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// a REAL read: a head-only count on a missing table answers 204 with no error (probed 10-02)
const probe = await db.from('buckets_shots').select('game_id').limit(1)
if (probe.error) { console.error(`buckets_shots isn't there yet (${probe.error.message}) -- run RUN-IN-SUPABASE-2026-10-03-QUEUE.sql part 3 first`); process.exit(1) }
console.log(`buckets_shots is there; backfilling ${FROM}..${TO}${DRY ? ' (dry)' : ''}`)

let games = 0, skipped = 0, rows = 0, failed = 0
for (let t = Date.parse(`${FROM}T12:00:00Z`); t <= Date.parse(`${TO}T12:00:00Z`); t += 864e5) {
  const date = new Date(t).toISOString().slice(0, 10)
  const day = reduceScoreboard(await scoreboardFor(date).catch(() => null)).filter((g) => g.seasonType === 2 && g.state === 'final')
  for (const g of day) {
    const have = await db.from('buckets_shots').select('event_id', { head: true, count: 'exact' }).eq('game_id', g.id)
    if ((have.count || 0) > 0) { skipped++; continue }
    const s = await summaryFor(g.id, true).catch(() => null)
    if (!s) { failed++; console.log(`  ${date} ${g.away.abbrev}@${g.home.abbrev}: summary failed (left for a re-run)`); continue }
    const shots = reduceShots(s, g.id).map(({ game_id, event_id, player_id, team_id, x, y, shot_type, made, points, three, distance, period, clock }) => ({ game_id, event_id, game_date: date, player_id, team_id: team_id || null, x, y, shot_type, made, points, three, distance, period, clock }))
    games++; rows += shots.length
    if (!DRY && shots.length) {
      const w = await db.from('buckets_shots').upsert(shots, { onConflict: 'game_id,event_id' })
      if (w.error) { failed++; console.log(`  ${date} ${g.id}: write failed ${w.error.message}`) }
    }
    await sleep(400)
  }
  if (day.length) console.log(`${date}: ${day.length} games · running ${games} written, ${skipped} already in, ${rows} shots${failed ? `, ${failed} failed` : ''}`)
}
console.log(`done: ${games} games, ${rows} shots${DRY ? ' (dry, nothing written)' : ''}, ${skipped} already in, ${failed} failed`)
