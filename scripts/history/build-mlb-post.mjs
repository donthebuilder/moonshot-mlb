#!/usr/bin/env node
// BUILD hist_mlb_post (HISTORY WATCH 2 step 4, 2026-09-27). One-off backfill
// of SABR Lahman BattingPost (1884-2025); rerun after Lahman's next release.
// Upserts on the primary key, so it is safe to run twice.
//
//   node scripts/history/build-mlb-post.mjs              # build + upsert
//   node scripts/history/build-mlb-post.mjs --json FILE  # build, write JSON, touch no database
//
// ROWS: one per player-season-TEAM, every round that postseason summed
// (rounds = the round codes, in the order they are played). Franchise =
// Lahman franchID from Teams.csv, the same lineage key hist_mlb uses.
// Credit "Data: SABR Lahman Baseball Database" wherever a claim shows.
// The CSV reader is build-mlb.mjs's, copied (that script runs on import).
import { createRequire } from 'node:module'
import fs from 'node:fs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')

const args = process.argv.slice(2)
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
const SHARE = 'y1prhc795jk8zvmelfd3jq7tl389y6cd'   // sabr.org/lahman-database, CSV folder

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
  const head = rows.shift().map((h) => h.replace(/^﻿/, ''))
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}
async function lahman(names) {
  const page = await (await fetch(`https://sabr.box.com/s/${SHARE}`)).text()
  const ids = {}
  for (const m of page.matchAll(/"typedID":"f_(\d+)"[^{}]*?"name":"([^"]+)"/g)) ids[m[2]] = m[1]
  const out = {}
  for (const n of names) {
    if (!ids[n]) throw new Error(`Lahman ${n} not in the SABR folder`)
    const r = await fetch(`https://sabr.box.com/index.php?rm=box_download_shared_file&shared_name=${SHARE}&file_id=f_${ids[n]}`)
    if (!r.ok) throw new Error(`Lahman ${n}: ${r.status}`)
    out[n] = parseCsv(await r.text())
    console.log(`[hist mlb post] ${n}: ${out[n].length} rows`)
  }
  return out
}
const N = (v) => (v === '' || v == null ? 0 : Number(v) || 0)
// Order the rounds are played in; anything unknown sorts after, alphabetically.
const ROUND_ORDER = ['ALWC', 'NLWC', 'AEDIV', 'AWDIV', 'NEDIV', 'NWDIV', 'ALDS1', 'ALDS2', 'NLDS1', 'NLDS2', 'ALCS', 'NLCS', 'CS', 'WS']
const roundRank = (r) => { const i = ROUND_ORDER.indexOf(r); return i < 0 ? 99 : i }

const L = await lahman(['BattingPost.csv', 'People.csv', 'Teams.csv'])
const franchOf = new Map(L['Teams.csv'].map((t) => [`${t.yearID}:${t.teamID}`, t.franchID]))
const people = new Map(L['People.csv'].map((p) => [p.playerID, p]))
const rows = new Map()
for (const b of L['BattingPost.csv']) {
  const k = `${b.yearID}:${b.playerID}:${b.teamID}`
  if (!rows.has(k)) {
    const p = people.get(b.playerID) || {}
    rows.set(k, {
      season: Number(b.yearID), source_id: b.playerID, team: b.teamID, franchise: franchOf.get(`${b.yearID}:${b.teamID}`) || null,
      name: `${p.nameFirst || ''} ${p.nameLast || ''}`.trim() || b.playerID, rounds: [],
      g: 0, ab: 0, h: 0, d2b: 0, hr: 0, rbi: 0, sb: 0, tb: 0,
    })
  }
  const r = rows.get(k)
  if (!r.rounds.includes(b.round)) r.rounds.push(b.round)
  r.g += N(b.G); r.ab += N(b.AB); r.h += N(b.H); r.d2b += N(b['2B']); r.hr += N(b.HR)
  r.rbi += N(b.RBI); r.sb += N(b.SB)
  r.tb += N(b.H) + N(b['2B']) + 2 * N(b['3B']) + 3 * N(b.HR)
}
const all = [...rows.values()].map((r) => ({ ...r, rounds: r.rounds.sort((a, b) => roundRank(a) - roundRank(b) || a.localeCompare(b)).join(',') }))
const noFr = all.filter((r) => !r.franchise).length
console.log(`[hist mlb post] ${all.length} player-season-team rows, ${all.reduce((a, r) => a + r.hr, 0)} HR, ${noFr} without a franchise`)

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(all))
  console.log(`[hist mlb post] wrote ${jsonOut}`)
} else {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  for (let i = 0; i < all.length; i += 1000) {
    const { error } = await db.from('hist_mlb_post').upsert(all.slice(i, i + 1000).map((r) => ({ ...r, built_at: new Date().toISOString() })), { onConflict: 'season,source_id,team' })
    if (error) throw new Error(`upsert at ${i}: ${error.message}`)
  }
  const { count } = await db.from('hist_mlb_post').select('season', { count: 'exact', head: true })
  console.log(`[hist mlb post] upserted; table now ${count} rows`)
}
