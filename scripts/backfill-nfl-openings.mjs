// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/backfill-nfl-openings.mjs [--season 2026] [--dry] [--limit N]
// TUDDY'S OPENINGS BACKFILL (2026-10-26): every final regular-season and playoff game of a season into opening_games
// (sport 'nfl'), the same row the grade step will write (lib/nfl/openings.js), marked source='backfill'. Idempotent (upsert) and
// resumable: a game already on file is skipped. Gentle on ESPN: one game at a time, a pause between. The scorer's id comes from
// nfl_td_feed (the roster join the live tick already did when it first saw that touchdown): his td_n = 1 row, accepted only when
// its name matches the one in ESPN's scoring play. --dry reads and prints, writes nothing, and says where the first scorer here
// and the feed's disagree. Season 2026 only has a feed to join against; earlier seasons write with the scorer's id left null.
import { createClient } from '@supabase/supabase-js'
import { openingRowNfl, writeOpeningNfl } from '../lib/nfl/openings.js'
import { normName } from '../lib/nfl/oddsMatch.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const SEASON = Number(arg('--season', '2026')), DRY = process.argv.includes('--dry'), LIMIT = Number(arg('--limit', Infinity))
const BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const get = async (url) => { for (let i = 1; i <= 3; i++) { try { const r = await fetch(url); if (r.ok) return r.json(); if (i === 3) throw new Error(`${r.status} ${url}`) } catch (e) { if (i === 3) throw e } await sleep(1500 * i) } }

const probe = await db.from('opening_games').select('pre_first_att_home').limit(1)
if (probe.error) { console.error(`pre_first_att isn't there yet (${probe.error.message}) -- run supabase/migrations/202610261100_opening_pre_first_att.sql first`); process.exit(1) }
const on = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('opening_games').select('game_id').eq('sport', 'nfl').eq('season', SEASON).range(from, from + 999)
  if (error) throw new Error(error.message)
  for (const r of data || []) on.add(String(r.game_id))
  if (!data || data.length < 1000) break
}

// ESPN answers a postseason week it has no games for with the regular season's same-numbered week, so the ids are de-duplicated
// (a Set) and each game's own season type is checked by the parser, which only keeps regular-season and playoff games.
const events = new Set()
for (const [type, weeks] of [[2, 18], [3, 5]]) {
  for (let w = 1; w <= weeks; w++) {
    const sb = await get(`${BASE}/scoreboard?dates=${SEASON}&seasonType=${type}&week=${w}`).catch(() => null)
    for (const e of sb?.events || []) if (e?.status?.type?.completed) events.add(String(e.id))
    await sleep(250)
  }
}
const todo = [...events].filter((id) => !on.has(id)).slice(0, LIMIT)
console.log(`${SEASON}: ${events.size} final games, ${on.size} already on file, ${todo.length} to read`)

let ok = 0, none = 0, failed = 0, agree = 0, differ = 0, noFeed = 0
for (const id of todo) {
  try {
    const summary = await get(`${BASE}/summary?event=${id}`)
    const feed = (await db.from('nfl_td_feed').select('team, scorer_name, gsis_id').eq('game_id', id).eq('td_n', 1).limit(1)).data?.[0] || null
    const row = openingRowNfl(summary, { resolveScorer: (name, team) => (feed?.gsis_id && feed.team === team && normName(feed.scorer_name) === normName(name) ? feed.gsis_id : null) })
    if (!row) { none++; continue }
    if (!feed) noFeed++; else if (feed.team === row.first_score_team) agree++; else { differ++; console.log(`  ${id} ${row.away}@${row.home}: first TD club here ${row.first_score_team}, feed ${feed.team}`) }
    if (DRY) console.log(`  ${row.game_date} ${row.away}@${row.home}: got ball ${row.jump_win_team} · first TD ${row.first_score_team} ${row.first_score_player || '(id unresolved)'} at ${row.first_score_clock_s}s · plays to it ${row.pre_first_att_away} / ${row.pre_first_att_home}`)
    else { const err = await writeOpeningNfl(db, row, 'backfill'); if (err) throw new Error(err) }
    ok++
  } catch (e) { failed++; console.log(`  ${id}: ${e?.message} (left for a re-run)`) }
  await sleep(400)
}
console.log(`done: ${ok} games${DRY ? ' (dry, nothing written)' : ''}, ${none} not stored (not final / preseason / no plays), ${failed} failed · first-TD club vs the feed: ${agree} agree, ${differ} differ, ${noFeed} no feed row`)
