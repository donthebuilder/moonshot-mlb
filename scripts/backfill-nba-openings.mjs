// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/backfill-nba-openings.mjs [--from 2025-10-21] [--to 2026-06-30] [--dry]
// BUCKETS' OPENINGS BACKFILL (2026-10-22, plan claude/BATCH-FIRSTS-PLAN-2026-10-22.txt step 2): every regular-season and
// playoff game's opening (the tip, the first shot and basket, every man's first 3 / 6 minutes and Q1) into opening_games and
// opening_players, the same rows the grade tick writes (lib/nba/openings.js), marked source='backfill'. Idempotent (upsert)
// and resumable: a game already in opening_games is skipped. Gentle on ESPN: one game at a time, a pause between. All-Star
// games are dropped (a side outside the 30 clubs). Run it twice: once for 2025-26 (the default dates), once with
// --from 2026-10-21 --to <yesterday> for this season so far. --dry counts without writing.
import { createClient } from '@supabase/supabase-js'
import { scoreboardFor, reduceScoreboard, summaryFor } from '../lib/nba/api.js'
import { openingRows, writeOpening } from '../lib/nba/openings.js'
import { nbaTeam } from '../lib/nba/teams.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const FROM = arg('--from', '2025-10-21'), TO = arg('--to', '2026-06-30'), DRY = process.argv.includes('--dry')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const probe = await db.from('opening_games').select('game_id').limit(1)
if (probe.error) { console.error(`opening_games isn't there yet (${probe.error.message}) -- run supabase/migrations/202610221300_openings.sql first`); process.exit(1) }
let games = 0, players = 0, failed = 0, skipped = 0

for (let t = Date.parse(`${FROM}T12:00:00Z`); t <= Date.parse(`${TO}T12:00:00Z`); t += 864e5) {
  const date = new Date(t).toISOString().slice(0, 10)
  const day = reduceScoreboard(await scoreboardFor(date).catch(() => null)).filter((g) => (g.seasonType === 2 || g.seasonType === 3) && g.state === 'final')
  for (const g of day) {
    if (!nbaTeam(g.home.abbrev) || !nbaTeam(g.away.abbrev)) { skipped++; continue }
    const have = await db.from('opening_games').select('game_id', { head: true, count: 'exact' }).eq('sport', 'nba').eq('game_id', String(g.id))
    if ((have.count || 0) > 0) { skipped++; continue }
    const s = await summaryFor(g.id, true).catch(() => null)
    if (!s) { failed++; console.log(`  ${date} ${g.away.abbrev}@${g.home.abbrev}: summary failed (left for a re-run)`); continue }
    const game = { gameId: g.id, gameDate: date, season: g.seasonYear || null, seasonType: g.seasonType, home: g.home.abbrev, away: g.away.abbrev }
    if (DRY) {
      const r = openingRows(s, game)
      if (r) { games++; players += r.players.length } else { failed++; console.log(`  ${date} ${g.id}: no first-quarter plays`) }
    } else {
      const err = await writeOpening(db, s, game, 'backfill')
      if (err) { failed++; console.log(`  ${date} ${g.id}: ${err}`) } else { games++; players += (openingRows(s, game)?.players.length || 0) }
    }
    await sleep(400)
  }
  if (day.length) console.log(`${date}: ${day.length} games · running ${games} written, ${players} player rows${failed ? `, ${failed} failed` : ''}`)
}
console.log(`done: ${games} games, ${players} player rows${DRY ? ' (dry, nothing written)' : ''}, ${skipped} skipped, ${failed} failed`)
