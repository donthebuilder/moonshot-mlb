#!/usr/bin/env node
// NHL NUMEROLOGY GRADE BACKFILL (2026-10-06, ledger audit P0-3).
//   node --import ./scripts/_esm-resolve.mjs scripts/backfill-numerology-nhl-grades.mjs            DRY RUN (the default; reads, prints, writes nothing)
//   node --import ./scripts/_esm-resolve.mjs scripts/backfill-numerology-nhl-grades.mjs --write    writes
//   ... --day 2026-10-02                                                                           one night only
//
// WHY. The LAMP tick logs numerology for every dressed skater of a game but graded only the board's
// lamp_goal_log rows, so a night's skaters outside the board kept graded_at null for ever and
// lib/numerology/record.js laneNights() never marked the night complete: /api/numerology/lanes said
// nights 0. The tick now grades every logged skater from the boxscore (boxResults). This does the
// same for the nights already logged: for each NHL night with ungraded numerology_log rows, read each
// FINAL game's boxscore from the league feed and grade the logged skaters of its two teams
// (played = on the box, hit = scored 1+, no line on the box = did not dress: played false, hit false).
//
// IT NEVER CHANGES A GRADED ROW: gradeNight updates only rows with graded_at null. Nothing is invented:
// a game whose boxscore is not over and in agreement with the score feed is skipped, and its skaters stay
// ungraded (the night then stays incomplete and the dry run says so). After a write it recomputes the
// night's numerology_lane_nights rows from the log (refreshLaneNights, derived and safe to repeat).
// Reads .env.local for the service key; never prints it.
import { createRequire } from 'node:module'
import { boxResults, gradeNight, refreshLaneNights, ELIGIBLE } from '../lib/numerology/record.js'

const WRITE = process.argv.includes('--write')
const only = process.argv.includes('--day') ? process.argv[process.argv.indexOf('--day') + 1] : null
const req = createRequire(import.meta.url)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const NHL = 'https://api-web.nhle.com/v1'
const get = (path) => fetch(`${NHL}${path}`, { headers: { 'User-Agent': 'dash-network-backfill/1.0' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)

console.log(`${WRITE ? 'WRITE' : 'DRY RUN'} · NHL numerology grade backfill${only ? ` · ${only} only` : ''}`)

// every ungraded eligible row per night (paged; PostgREST stops at 1000)
const rows = []
for (let from = 0; ; from += 1000) {
  let q = db.from('numerology_log').select('day, player_id, team').eq('sport', 'nhl').eq('lane', ELIGIBLE).is('graded_at', null)
    .order('day', { ascending: true }).order('player_id', { ascending: true }).range(from, from + 999)
  if (only) q = q.eq('day', only)
  const { data, error } = await q
  if (error) { console.error(`read numerology_log: ${error.message}`); process.exit(1) }
  rows.push(...(data || []))
  if (!data || data.length < 1000) break
}
const days = [...new Set(rows.map((r) => r.day))].sort()
if (!days.length) console.log('no NHL night has ungraded numerology rows: nothing to do')

let totalGraded = 0
let wouldGrade = 0
for (const day of days) {
  const logged = rows.filter((r) => r.day === day)
  const score = await get(`/score/${day}`)
  const games = score?.games || []
  const done = new Set()
  const results = new Map()
  const lines = []
  for (const g of games) {
    const away = g.awayTeam?.abbrev, home = g.homeTeam?.abbrev
    const box = await get(`/gamecenter/${g.id}/boxscore`)
    const over = box?.playerByGameStats && ['OFF', 'FINAL'].includes(String(box.gameState || '').toUpperCase())
    const agrees = over && Number(box.homeTeam?.score) === Number(g.homeTeam?.score) && Number(box.awayTeam?.score) === Number(g.awayTeam?.score)
    if (!agrees) { lines.push(`    ${away}@${home} (${g.id}): boxscore not final / not in agreement -- skipped, its skaters stay ungraded`); continue }
    const ids = logged.filter((r) => r.team === away || r.team === home).map((r) => String(r.player_id))
    const res = boxResults(box.playerByGameStats, ids)
    let played = 0, hit = 0, sat = 0
    for (const id of ids) { const r = res.get(id); results.set(id, r); done.add(id); if (r.played) played += 1; else sat += 1; if (r.hit) hit += 1 }
    lines.push(`    ${away}@${home} (${g.id}): ${ids.length} logged -> ${played} played, ${hit} scored, ${sat} did not dress`)
  }
  const left = logged.filter((r) => !done.has(String(r.player_id))).length
  console.log(`${day}  ${logged.length} logged skaters ungraded · ${results.size} would be graded · ${left} stay ungraded${left ? ' (the night stays incomplete)' : ' (the night completes)'}`)
  lines.forEach((l) => console.log(l))
  wouldGrade += results.size
  if (WRITE && results.size) {
    const n = await gradeNight(db, 'nhl', day, results)
    const lanes = await refreshLaneNights(db, 'nhl', day)
    totalGraded += n
    console.log(`    wrote ${n} grades (graded rows untouched), recomputed ${lanes} lane rows`)
  }
}
console.log(`${WRITE ? 'wrote' : 'would write'}: ${WRITE ? totalGraded : wouldGrade} grade${(WRITE ? totalGraded : wouldGrade) === 1 ? '' : 's'} across ${days.length} night${days.length === 1 ? '' : 's'}`)
