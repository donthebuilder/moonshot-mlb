#!/usr/bin/env node
// SET hist_nhl.rookie BY THE NHL'S RULE (milestones plan step 3, 2026-09-26).
// "First season in the league" (the bios report's firstSeasonForGameType)
// is not a rookie: Steve Larmer played 4 games in 1980-81 and 3 in 1981-82,
// and 1982-83 -- his Calder season, 43 goals, the Blackhawks' rookie
// record -- came out as NOT a rookie. The league's rule, applied here from
// the stored seasons themselves:
//   a player is a rookie in a season unless, in the seasons BEFORE it, he
//   played 25+ games in any one, or 6+ games in each of any two; and from
//   1990-91 on he must also be younger than 26 on Sep 15 of that season
//   (age is stored as of Feb 1, so a stored 27+ is certainly over; a stored
//   26 is given the benefit of the doubt).
// Goalies and skaters alike. Re-run after build-nhl.mjs.
import { createRequire } from 'node:module'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('hist_nhl').select('season, player_id, team, gp, age, rookie').order('season').order('player_id').order('team').range(from, from + 999)
  if (error) throw new Error(error.message)
  rows.push(...data)
  if (data.length < 1000) break
}
console.log(`[nhl rookies] ${rows.length} rows read`)
// One games-played figure per player-season: TOT when he moved, else his one row.
const season = new Map()
for (const r of rows) {
  const k = `${r.player_id}:${r.season}`
  const cur = season.get(k)
  if (!cur || r.team === 'TOT') season.set(k, { gp: r.gp || 0, age: r.age })
}
const byPlayer = new Map()
for (const [k, v] of season) {
  const [pid, s] = k.split(':').map(Number)
  ;(byPlayer.get(pid) || byPlayer.set(pid, []).get(pid)).push({ season: s, ...v })
}
const rookie = new Map()
for (const [pid, list] of byPlayer) {
  list.sort((a, b) => a.season - b.season)
  let big = false; let six = 0
  for (const x of list) {
    const young = x.season < 19901991 || x.age == null || x.age <= 26
    rookie.set(`${pid}:${x.season}`, !big && six < 2 && young)
    if (x.gp >= 25) big = true
    if (x.gp >= 6) six += 1
  }
}
// Only the player-seasons whose stored flag is wrong, one update each
// (it covers his TOT and team rows together).
const stored = new Map()
for (const r of rows) stored.set(`${r.player_id}:${r.season}`, r.rookie)
const diffs = [...rookie].filter(([k, v]) => stored.get(k) !== v)
console.log(`[nhl rookies] ${diffs.length} player-seasons to correct`)
let n = 0
for (const [k, v] of diffs) {
  const [pid, s] = k.split(':').map(Number)
  const { error } = await db.from('hist_nhl').update({ rookie: v }).eq('season', s).eq('player_id', pid)
  if (error) throw new Error(error.message)
  if (++n % 500 === 0) console.log(`[nhl rookies] ${n}/${diffs.length}`)
}
console.log(`[nhl rookies] done: ${n} player-seasons corrected`)
