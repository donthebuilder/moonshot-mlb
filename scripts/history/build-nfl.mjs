#!/usr/bin/env node
// BUILD hist_nfl (milestones plan step 4, 2026-09-26). nflverse weekly
// player stats (stats_player_week_<year>.csv), 1999 on -- the coverage floor,
// so an NFL claim that finds nothing says "since at least 1999", never "ever".
// No pro-football-reference scraping (its terms; Donovan's rule).
//
//   node scripts/history/build-nfl.mjs            # 1999 .. last completed season
//   node scripts/history/build-nfl.mjs 2025       # one season
//
// Rows: REGULAR SEASON weeks only, one per player-season-TEAM (from each
// week's team, so a traded player's games stay with the club he played them
// for), plus TOT when he played for more than one. Franchise follows the
// relocations inside the coverage: STL->LA (Rams), SD->LAC, OAK->LV.
// Rookie = the first season he appears in the data AND that season is after
// 1999 (a 1999 first appearance may be a veteran; left unknown instead).
// total_td = rushing + receiving touchdowns.
import { createRequire } from 'node:module'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const FIRST = 1999
const LAST = new Date().getUTCFullYear() - 1           // the last completed season
const FRANCHISE = { STL: 'LA', SD: 'LAC', OAK: 'LV' }
const only = process.argv[2] ? Number(process.argv[2]) : null
const N = (v) => (v === '' || v == null ? 0 : Number(v) || 0)

function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c; continue }
    if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = '' }
    else f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  const head = rows.shift()
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

const seen = new Map()          // player_id -> first season in the data (for rookie)
const years = only ? [only] : Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i)
// Rookie needs every earlier season, so a one-season rebuild reads the history's first appearances from the table.
if (only) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('hist_nfl').select('player_id, season').lt('season', only).range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data) if (!seen.has(r.player_id) || seen.get(r.player_id) > r.season) seen.set(r.player_id, r.season)
    if (data.length < 1000) break
  }
}
for (const year of years) {
  const res = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${year}.csv`)
  if (!res.ok) { console.error(`[hist nfl] ${year}: ${res.status}`); continue }
  const weeks = parseCsv(await res.text()).filter((w) => w.season_type === 'REG')
  const rows = new Map()
  for (const w of weeks) {
    const team = w.team
    const k = `${w.player_id}:${team}`
    const r = rows.get(k) || {
      season: year, player_id: w.player_id, team, franchise: FRANCHISE[team] || team, name: w.player_display_name || w.player_name,
      position: w.position || null, age: null, rookie: null,
      g: 0, rec_td: 0, rush_td: 0, pass_td: 0, total_td: 0, rec: 0, rec_yds: 0, rush_yds: 0, pass_yds: 0,
    }
    r.g += 1; r.rec_td += N(w.receiving_tds); r.rush_td += N(w.rushing_tds); r.pass_td += N(w.passing_tds)
    r.rec += N(w.receptions); r.rec_yds += N(w.receiving_yards); r.rush_yds += N(w.rushing_yards); r.pass_yds += N(w.passing_yards)
    r.total_td = r.rec_td + r.rush_td
    rows.set(k, r)
  }
  // TOT for a player with more than one team, and rookie from first appearance.
  const byP = new Map()
  for (const r of rows.values()) (byP.get(r.player_id) || byP.set(r.player_id, []).get(r.player_id)).push(r)
  const out = [...rows.values()]
  for (const [pid, list] of byP) {
    if (!seen.has(pid)) seen.set(pid, year)
    const rookie = year > FIRST ? seen.get(pid) === year : null
    for (const r of list) r.rookie = rookie
    if (list.length > 1) {
      const t = { ...list[0], team: 'TOT', franchise: null }
      for (const k of ['g', 'rec_td', 'rush_td', 'pass_td', 'total_td', 'rec', 'rec_yds', 'rush_yds', 'pass_yds']) t[k] = list.reduce((s, r) => s + r[k], 0)
      out.push(t)
    }
  }
  for (let i = 0; i < out.length; i += 1000) {
    const { error } = await db.from('hist_nfl').upsert(out.slice(i, i + 1000).map((r) => ({ ...r, built_at: new Date().toISOString() })), { onConflict: 'season,player_id,team' })
    if (error) throw new Error(`${year}: ${error.message}`)
  }
  console.log(`[hist nfl] ${year}: ${weeks.length} player-weeks -> ${out.length} rows`)
}
console.log('[hist nfl] done')
