// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/backfill-nfl-openings.mjs [--season 2026] [--dry] [--limit N]
// TUDDY'S OPENINGS BACKFILL (2026-10-26): every final regular-season and playoff game of a season into opening_games
// (sport 'nfl'), the same row the grade step will write (lib/nfl/openings.js), marked source='backfill'. Idempotent (upsert) and
// resumable: a game already on file is skipped. Gentle on ESPN: one game at a time, a pause between. The scorer's id comes from
// nfl_td_feed (the roster join the live tick already did when it first saw that touchdown): his td_n = 1 row, accepted only when
// its name matches the one in ESPN's scoring play. --dry reads and prints, writes nothing, and says where the first scorer here
// and the feed's disagree. Season 2026 has a feed to join against; other seasons resolve the scorer from nflverse's roster file (one man of that name on that club, else null).
import { createClient } from '@supabase/supabase-js'
import { openingRowNfl, writeOpeningNfl } from '../lib/nfl/openings.js'
import { normName } from '../lib/nfl/oddsMatch.js'
import { unfilledGames, writePreAtt } from '../lib/openings/preAtt.js'
import { canonTeam } from '../lib/injuries/teams.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const SEASON = Number(arg('--season', '2026')), DRY = process.argv.includes('--dry'), LIMIT = Number(arg('--limit', Infinity))
const BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const get = async (url) => { for (let i = 1; i <= 3; i++) { try { const r = await fetch(url); if (r.ok) return r.json(); if (i === 3) throw new Error(`${r.status} ${url}`) } catch (e) { if (i === 3) throw e } await sleep(1500 * i) } }

// THE SCORER'S ID WHEN THERE IS NO LIVE FEED (2026-10-31, TUDDY's first-TD wall for 2025): nflverse's roster file for the season (free, the same
// gsis ids the site keys on) joined on name + club; accepted only when exactly ONE man of that name is on that club's roster, else left null (never guessed).
// 2026 prefers nfl_td_feed's own match (above); this fills what that cannot reach.
const rosters = new Map()
const csvRows = (text) => {
  const rows = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = '' } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' } else if (c !== '\r') cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}
async function rosterIds(season) {
  if (rosters.has(season)) return rosters.get(season)
  const map = new Map()
  try {
    const r = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`, { redirect: 'follow' })
    if (!r.ok) throw new Error(String(r.status))
    const [head, ...rows] = csvRows(await r.text())
    const ix = Object.fromEntries(head.map((h, i) => [h, i]))
    for (const x of rows) {
      const id = x[ix.gsis_id]; if (!id) continue
      for (const nm of [x[ix.full_name], `${x[ix.football_name] || ''} ${x[ix.last_name] || ''}`]) {
        const k = `${normName(nm)}|${canonTeam('nfl', x[ix.team])}`
        if (!map.has(k)) map.set(k, new Set())
        map.get(k).add(id)
      }
    }
  } catch (e) { console.log(`  roster ${season}: ${e?.message} -- scorer ids stay null`) }
  rosters.set(season, map)
  return map
}
const fromRoster = (map, name, team) => { const s = map.get(`${normName(name)}|${canonTeam('nfl', team)}`); return s && s.size === 1 ? [...s][0] : null }

const probe = await db.from('opening_games').select('pre_first_att_home').limit(1)
if (probe.error) { console.error(`pre_first_att isn't there yet (${probe.error.message}) -- run supabase/migrations/202610261100_opening_pre_first_att.sql first`); process.exit(1) }
// --fill-names [--season 2025] [--limit N] [--dry]: games on file with a first TD but no scorer name get it (and his id when it was null and the roster has
// exactly one man of that name on that club). Only first_score_name / first_score_player are written.
if (process.argv.includes('--fill-names')) {
  const todo = []
  for (let from = 0; ; from += 1000) {
    let q = db.from('opening_games').select('game_id, game_date, season, home, away, first_score_player').eq('sport', 'nfl').not('first_score_team', 'is', null).is('first_score_name', null).order('game_id').range(from, from + 999)
    if (process.argv.includes('--season')) q = q.eq('season', SEASON)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    todo.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const list = todo.slice(0, LIMIT)
  console.log(`${list.length} NFL games to name`)
  let ok = 0, ids = 0, bad = 0
  for (const r of list) {
    try {
      const ro = await rosterIds(r.season)
      const row = openingRowNfl(await get(`${BASE}/summary?event=${r.game_id}`), { resolveScorer: (name, team) => r.first_score_player || fromRoster(ro, name, team) })
      if (!row?.first_score_name) { bad++; continue }
      const patch = { first_score_name: row.first_score_name }
      if (!r.first_score_player && row.first_score_player) { patch.first_score_player = row.first_score_player; ids++ }
      if (DRY) console.log(`  ${r.game_date} ${r.away}@${r.home}: ${patch.first_score_name} ${patch.first_score_player || r.first_score_player || '(id unresolved)'}`)
      else { const w = await db.from('opening_games').update(patch).eq('sport', 'nfl').eq('game_id', String(r.game_id)); if (w.error) throw new Error(w.error.message) }
      ok++
    } catch (e) { bad++; console.log(`  ${r.game_id}: ${e?.message} (left for a re-run)`) }
    await sleep(400)
  }
  console.log(`done: ${ok} named${DRY ? ' (dry, nothing written)' : ''}, ${ids} ids newly resolved, ${bad} skipped / failed`)
  process.exit(0)
}

// --fill-pre-att [--season 2026] [--limit N] [--dry]: games already on file that miss a late column (what the first play and touchdown
// were) get it: re-read once, only those columns written (lib/openings/preAtt.js).
if (process.argv.includes('--fill-pre-att')) {
  const todo = (await unfilledGames(db, 'nfl', process.argv.includes('--season') ? SEASON : null)).slice(0, LIMIT)
  console.log(`${todo.length} NFL games to fill`)
  let ok = 0, none = 0, bad = 0
  for (const r of todo) {
    try {
      const row = openingRowNfl(await get(`${BASE}/summary?event=${r.game_id}`))
      if (DRY) { console.log(`  ${r.game_date} ${r.away}@${r.home}: first play ${row?.first_att_type} · first TD ${row?.first_score_type} · ${row?.pre_first_att_away} / ${row?.pre_first_att_home}`); ok++ } else {
        const err = await writePreAtt(db, 'nfl', r.game_id, row)
        if (err === 'no first score') none++; else if (err) throw new Error(err); else ok++
      }
    } catch (e) { bad++; console.log(`  ${r.game_id}: ${e?.message} (left for a re-run)`) }
    await sleep(400)
  }
  console.log(`done: ${ok} filled${DRY ? ' (dry, nothing written)' : ''}, ${none} with no first TD, ${bad} failed`)
  process.exit(0)
}
const on = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('opening_games').select('game_id').eq('sport', 'nfl').eq('season', SEASON).order('game_id').range(from, from + 999)
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
    const ro = await rosterIds(SEASON)
    const row = openingRowNfl(summary, { resolveScorer: (name, team) => (feed?.gsis_id && feed.team === team && normName(feed.scorer_name) === normName(name) ? feed.gsis_id : fromRoster(ro, name, team)) })
    if (!row) { none++; continue }
    if (!feed) noFeed++; else if (feed.team === row.first_score_team) agree++; else { differ++; console.log(`  ${id} ${row.away}@${row.home}: first TD club here ${row.first_score_team}, feed ${feed.team}`) }
    if (DRY) console.log(`  ${row.game_date} ${row.away}@${row.home}: got ball ${row.jump_win_team} · first TD ${row.first_score_team} ${row.first_score_player || '(id unresolved)'} at ${row.first_score_clock_s}s · plays to it ${row.pre_first_att_away} / ${row.pre_first_att_home}`)
    else { const err = await writeOpeningNfl(db, row, 'backfill'); if (err) throw new Error(err) }
    ok++
  } catch (e) { failed++; console.log(`  ${id}: ${e?.message} (left for a re-run)`) }
  await sleep(400)
}
console.log(`done: ${ok} games${DRY ? ' (dry, nothing written)' : ''}, ${none} not stored (not final / preseason / no plays), ${failed} failed · first-TD club vs the feed: ${agree} agree, ${differ} differ, ${noFeed} no feed row`)
