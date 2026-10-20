// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/backfill-nba-box.mjs [--from 2025-10-21] [--to 2026-04-12] [--season 2026] [--jsonl file] [--dry]
// BUCKETS' BOX BACKFILL (2026-10-19, defense vs position): every regular-season game's box score into buckets_box,
// the same row shape the tick writes (lib/nba/defPos.js boxRows over lib/nba/api.js reduceBox). Idempotent (upsert
// on game_id + player_id) and resumable: a game already in the table is skipped. Gentle on ESPN: one game at a time,
// a pause between. All-Star games are dropped (a side outside the 30 clubs). --jsonl reads box scores already pulled
// from the same ESPN summaries (one game a line: {id, date, home:{abbrev,score}, away:{abbrev,score}, players:[{id,n,t,p,s,min,pts,reb,ast,tpm,stl,blk}]})
// instead of fetching them again. --dry counts without writing. Writes only; it reads nothing back but a head count.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox } from '../lib/nba/api.js'
import { boxRows } from '../lib/nba/defPos.js'
import { nbaTeam } from '../lib/nba/teams.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const FROM = arg('--from', '2025-10-21'), TO = arg('--to', '2026-04-12'), SEASON = Number(arg('--season', '2026')), JSONL = arg('--jsonl', null), DRY = process.argv.includes('--dry')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const probe = await db.from('buckets_box').select('game_id').limit(1)
if (probe.error) { console.error(`buckets_box isn't there yet (${probe.error.message}) -- run supabase/migrations/202610200100_buckets_box.sql first`); process.exit(1) }
const real = (g) => nbaTeam(g.home) && nbaTeam(g.away)
let games = 0, rows = 0, failed = 0, skipped = 0

async function write(rs, label) {
  rows += rs.length; games++
  if (DRY || !rs.length) return
  const w = await db.from('buckets_box').upsert(rs, { onConflict: 'game_id,player_id' })
  if (w.error) { failed++; console.log(`  ${label}: write failed ${w.error.message}`) }
}

if (JSONL) {
  const lines = fs.readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  for (const g of lines) {
    const game = { gameId: g.id, gameDate: g.date, season: SEASON, seasonType: 2, home: g.home.abbrev, away: g.away.abbrev, homeScore: g.home.score, awayScore: g.away.score }
    if (!real(game) || g.date < FROM || g.date > TO) { skipped++; continue }
    const box = g.players.map((p) => ({ id: p.id, name: p.n, team: p.t, pos: p.p, starter: p.s, dnp: false, min: p.min, pts: p.pts, reb: p.reb, ast: p.ast, tpm: p.tpm, stl: p.stl, blk: p.blk }))
    await write(boxRows(game, box), `${g.date} ${g.id}`)
    if (games % 100 === 0) console.log(`${games} games, ${rows} rows`)
  }
} else {
  for (let t = Date.parse(`${FROM}T12:00:00Z`); t <= Date.parse(`${TO}T12:00:00Z`); t += 864e5) {
    const date = new Date(t).toISOString().slice(0, 10)
    const day = reduceScoreboard(await scoreboardFor(date).catch(() => null)).filter((g) => g.seasonType === 2 && g.state === 'final')
    for (const g of day) {
      const game = { gameId: g.id, gameDate: date, season: g.seasonYear || SEASON, seasonType: 2, home: g.home.abbrev, away: g.away.abbrev, homeScore: g.home.score, awayScore: g.away.score }
      if (!real(game)) { skipped++; continue }
      const have = await db.from('buckets_box').select('player_id', { head: true, count: 'exact' }).eq('game_id', g.id)
      if ((have.count || 0) > 0) { skipped++; continue }
      const s = await summaryFor(g.id, true).catch(() => null)
      if (!s) { failed++; console.log(`  ${date} ${g.away.abbrev}@${g.home.abbrev}: summary failed (left for a re-run)`); continue }
      await write(boxRows(game, reduceBox(s)), `${date} ${g.id}`)
      await sleep(400)
    }
    if (day.length) console.log(`${date}: ${day.length} games · running ${games} written, ${rows} rows${failed ? `, ${failed} failed` : ''}`)
  }
}
console.log(`done: ${games} games, ${rows} rows${DRY ? ' (dry, nothing written)' : ''}, ${skipped} skipped, ${failed} failed`)
