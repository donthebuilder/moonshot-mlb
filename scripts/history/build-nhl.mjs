#!/usr/bin/env node
// BUILD hist_nhl (milestones plan step 3, 2026-09-26). The NHL's own stats
// reports, every regular season from 1917-18: skaters and goalies, one row
// per player per FRANCHISE (the report's franchiseId filter counts only the
// games he played for that franchise), plus a TOT row when he played for
// more than one. The league's franchise ids ARE the lineage -- the Atlanta
// Thrashers' seasons sit under the Winnipeg Jets franchise, the Quebec
// Nordiques' under Colorado -- so no hand-kept relocation table.
//
//   node scripts/history/build-nhl.mjs                 # every season, resumable
//   node scripts/history/build-nhl.mjs 20242025        # one season
//
// Polite: at most two report calls a second. Resumable: seasons already in
// hist_nhl are skipped (pass one season to rebuild it).
import { createRequire } from 'node:module'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const B = 'https://api.nhle.com/stats/rest/en'
const GAP = 500
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(path) {
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetch(`${B}${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)' } })
      if (r.ok) { await sleep(GAP); return r.json() }
    } catch { /* retry */ }
    await sleep(2000 * a)
  }
  throw new Error(`nhl stats ${path}`)
}
const q = (season, extra = '') => `?limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${season} and gameTypeId=2${extra}`)}`
const N = (v) => (v == null || v === '' ? null : Number(v))
// Age on Feb 1 of the season's second calendar year (the season's midpoint).
const ageOf = (birth, season) => {
  if (!birth) return null
  const [y, m, d] = String(birth).split('-').map(Number)
  const ref = Number(String(season).slice(4))
  return ref - y - ((m > 2 || (m === 2 && d > 1)) ? 1 : 0)
}

const teams = (await get('/team')).data                       // id -> franchiseId, triCode
const teamById = new Map(teams.map((t) => [t.id, t]))
const seasonsAll = ((await get('/season')).data || []).map((s) => s.id).sort((a, b) => a - b)
const only = process.argv[2] ? [Number(process.argv[2])] : null
const have = new Set()
if (!only) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('hist_nhl').select('season').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data) have.add(r.season)
    if (data.length < 1000) break
  }
}
const now = Number(`${new Date().getUTCFullYear() - 1}${new Date().getUTCFullYear()}`)
const seasons = (only || seasonsAll.filter((s) => s <= now)).filter((s) => only || !have.has(s))
console.log(`[hist nhl] ${seasons.length} seasons to build (${have.size} already stored)`)

for (const season of seasons) {
  const ts = (await get(`/team/summary${q(season)}`)).data || []
  const franchises = new Map()
  for (const t of ts) { const tm = teamById.get(t.teamId); if (tm?.franchiseId) franchises.set(tm.franchiseId, tm.triCode) }
  const bios = new Map()
  for (const kind of ['skater', 'goalie']) for (const b of (await get(`/${kind}/bios${q(season)}`)).data || []) bios.set(b.playerId, b)
  const rows = []
  const base = (r, team, franchise, kind) => {
    const b = bios.get(r.playerId) || {}
    return {
      season, player_id: r.playerId, team, franchise: franchise == null ? null : String(franchise),
      name: r.skaterFullName || r.goalieFullName, position: kind === 'goalie' ? 'G' : r.positionCode,
      age: ageOf(b.birthDate, season), rookie: b.firstSeasonForGameType != null ? b.firstSeasonForGameType === season : null,
      gp: N(r.gamesPlayed),
      g: N(r.goals), a: N(r.assists), pts: N(r.points), ppg: N(r.ppGoals), shg: N(r.shGoals), gwg: N(r.gameWinningGoals), sog: N(r.shots), plus_minus: N(r.plusMinus),
      gl_w: N(r.wins), gl_so: N(r.shutouts), gl_svpct: N(r.savePct),
    }
  }
  for (const [fid, tri] of franchises) {
    for (const kind of ['skater', 'goalie']) {
      for (const r of (await get(`/${kind}/summary${q(season, ` and franchiseId=${fid}`)}`)).data || []) rows.push(base(r, tri, fid, kind))
    }
  }
  // TOT: a player whose line spans teams (teamAbbrevs lists more than one).
  for (const kind of ['skater', 'goalie']) {
    for (const r of (await get(`/${kind}/summary${q(season)}`)).data || []) if (String(r.teamAbbrevs || '').includes(',')) rows.push(base(r, 'TOT', null, kind))
  }
  // One row per (player, team): a skater-and-goalie line never collides, but guard anyway.
  const uniq = [...new Map(rows.map((r) => [`${r.player_id}:${r.team}`, r])).values()]
  for (let i = 0; i < uniq.length; i += 1000) {
    const { error } = await db.from('hist_nhl').upsert(uniq.slice(i, i + 1000).map((r) => ({ ...r, built_at: new Date().toISOString() })), { onConflict: 'season,player_id,team' })
    if (error) throw new Error(`${season}: ${error.message}`)
  }
  console.log(`[hist nhl] ${season}: ${franchises.size} franchises, ${uniq.length} rows`)
}
console.log('[hist nhl] done')
