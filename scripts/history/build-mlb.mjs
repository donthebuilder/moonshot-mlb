#!/usr/bin/env node
// BUILD hist_mlb (milestones plan step 1, 2026-09-26). One-off backfill plus
// a current-season refresh; resumable by nature (upserts on the primary key).
//
//   node scripts/history/build-mlb.mjs              # Lahman 1871-2025 + StatsAPI 2026
//   node scripts/history/build-mlb.mjs current      # StatsAPI current season only (nightly)
//   node scripts/history/build-mlb.mjs --json FILE  # build, write JSON, touch no database
//
// SOURCES. History: the SABR Lahman Baseball Database (1871-2025), CSVs read
// straight from SABR's published folder (sabr.org/lahman-database). Credit
// "Data: SABR Lahman Baseball Database" wherever a claim built on it shows.
// Current season: MLB StatsAPI season hitting/pitching splits.
//
// ROWS: one per player-season-TEAM (stints with the same team summed), plus a
// TOT row when he played for more than one team. Franchise = Lahman franchID,
// so MON->WSN, FLA->MIA, CAL/ANA->LAA, KCA/OAK->ATH lineages hold. Primary
// position = most games in the field that season (Lahman Fielding; DH when
// he never took the field). Age = on June 30. Rookie = his debut season.
import { createRequire } from 'node:module'
import fs from 'node:fs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')

const args = process.argv.slice(2)
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
const CURRENT_ONLY = args.includes('current')
const SEASON = new Date().getUTCFullYear()
const SHARE = 'y1prhc795jk8zvmelfd3jq7tl389y6cd'   // sabr.org/lahman-database, CSV folder
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── CSV ────────────────────────────────────────────────────────────────────
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
    console.log(`[hist mlb] ${n}: ${out[n].length} rows`)
  }
  return out
}
const N = (v) => (v === '' || v == null ? 0 : Number(v) || 0)
const ageOn = (y, m, d, season) => (y ? season - y - ((m > 6 || (m === 6 && d > 30)) ? 1 : 0) : null)

// ── HISTORY (Lahman) ───────────────────────────────────────────────────────
async function buildHistory() {
  const L = await lahman(['Batting.csv', 'Pitching.csv', 'Fielding.csv', 'People.csv', 'Teams.csv'])
  const franchOf = new Map(L['Teams.csv'].map((t) => [`${t.yearID}:${t.teamID}`, t.franchID]))
  const people = new Map(L['People.csv'].map((p) => [p.playerID, p]))
  const posG = new Map()
  for (const f of L['Fielding.csv']) {
    const k = `${f.playerID}:${f.yearID}`
    const m = posG.get(k) || {}; m[f.POS] = (m[f.POS] || 0) + N(f.G); posG.set(k, m)
  }
  const primary = (pid, y) => { const m = posG.get(`${pid}:${y}`); if (!m) return 'DH'; return Object.entries(m).sort((a, b) => b[1] - a[1])[0][0] }
  const rows = new Map()
  const blank = (pid, y, team) => {
    const p = people.get(pid) || {}
    const season = Number(y)
    return {
      season, source_id: pid, team, franchise: team === 'TOT' ? null : (franchOf.get(`${y}:${team}`) || null), mlbam_id: null,
      name: `${p.nameFirst || ''} ${p.nameLast || ''}`.trim() || pid, position: primary(pid, y),
      age: ageOn(N(p.birthYear), N(p.birthMonth), N(p.birthDay), season), rookie: String(p.debut || '').slice(0, 4) === String(y),
      g: 0, pa: 0, ab: 0, h: 0, d2b: 0, d3b: 0, hr: 0, rbi: 0, r: 0, sb: 0, bb: 0, tb: 0, p_w: 0, p_so: 0, p_sv: 0, p_ipouts: 0, p_er: 0,
    }
  }
  const get = (pid, y, team) => { const k = `${y}:${pid}:${team}`; if (!rows.has(k)) rows.set(k, blank(pid, y, team)); return rows.get(k) }
  for (const b of L['Batting.csv']) {
    const r = get(b.playerID, b.yearID, b.teamID)
    r.g += N(b.G); r.ab += N(b.AB); r.h += N(b.H); r.d2b += N(b['2B']); r.d3b += N(b['3B']); r.hr += N(b.HR)
    r.rbi += N(b.RBI); r.r += N(b.R); r.sb += N(b.SB); r.bb += N(b.BB)
    r.pa += N(b.AB) + N(b.BB) + N(b.HBP) + N(b.SF) + N(b.SH)
    r.tb += N(b.H) + N(b['2B']) + 2 * N(b['3B']) + 3 * N(b.HR)
  }
  for (const p of L['Pitching.csv']) {
    const r = get(p.playerID, p.yearID, p.teamID)
    r.p_w += N(p.W); r.p_so += N(p.SO); r.p_sv += N(p.SV); r.p_ipouts += N(p.IPouts); r.p_er += N(p.ER)
    if (!r.g) r.g = N(p.G)
  }
  addTotals(rows)
  return [...rows.values()]
}

// A TOT row for every player-season with more than one team.
function addTotals(rows) {
  const by = new Map()
  for (const r of rows.values()) { if (r.team === 'TOT') continue; const k = `${r.season}:${r.source_id}`; (by.get(k) || by.set(k, []).get(k)).push(r) }
  const sum = ['g', 'pa', 'ab', 'h', 'd2b', 'd3b', 'hr', 'rbi', 'r', 'sb', 'bb', 'tb', 'p_w', 'p_so', 'p_sv', 'p_ipouts', 'p_er']
  for (const list of by.values()) {
    if (list.length < 2) continue
    const t = { ...list[0], team: 'TOT', franchise: null }
    for (const k of sum) t[k] = list.reduce((a, r) => a + (r[k] || 0), 0)
    rows.set(`${t.season}:${t.source_id}:TOT`, t)
  }
}

// ── CURRENT SEASON (StatsAPI) ──────────────────────────────────────────────
// "123.1" is 123 and one third innings: whole x 3 + the digit after the point.
const ipOuts = (ip) => { const [w, f = '0'] = String(ip || '0').split('.'); return N(w) * 3 + N(f) }
const POS = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'OF', 8: 'OF', 9: 'OF', 10: 'DH', Y: 'DH' }
async function buildCurrent() {
  // franchise by team name, from Lahman's latest Teams rows (StatsAPI names match)
  const teams = (await lahman(['Teams.csv']))['Teams.csv']
  const lastYear = Math.max(...teams.map((t) => N(t.yearID)))
  const franchByName = new Map(teams.filter((t) => N(t.yearID) === lastYear).map((t) => [t.name, t.franchID]))
  const api = async (p) => (await fetch(`https://statsapi.mlb.com/api/v1${p}`)).json()
  const tm = new Map(((await api(`/teams?sportId=1&season=${SEASON}`)).teams || []).map((t) => [t.id, { abbrev: t.abbreviation, franchise: franchByName.get(t.name) || null }]))
  const rows = new Map()
  const put = (id, name, team, pos, stat, kind, age, debutYear) => {
    const k = `${SEASON}:mlbam:${id}:${team}`
    const r = rows.get(k) || {
      season: SEASON, source_id: `mlbam:${id}`, team, franchise: team === 'TOT' ? null : (tm.get(stat._teamId)?.franchise || null), mlbam_id: id, name,
      position: pos, age, rookie: debutYear === SEASON,
      g: 0, pa: 0, ab: 0, h: 0, d2b: 0, d3b: 0, hr: 0, rbi: 0, r: 0, sb: 0, bb: 0, tb: 0, p_w: 0, p_so: 0, p_sv: 0, p_ipouts: 0, p_er: 0,
    }
    if (kind === 'hitting') Object.assign(r, { g: N(stat.gamesPlayed), pa: N(stat.plateAppearances), ab: N(stat.atBats), h: N(stat.hits), d2b: N(stat.doubles), d3b: N(stat.triples), hr: N(stat.homeRuns), rbi: N(stat.rbi), r: N(stat.runs), sb: N(stat.stolenBases), bb: N(stat.baseOnBalls), tb: N(stat.totalBases) })
    else { Object.assign(r, { p_w: N(stat.wins), p_so: N(stat.strikeOuts), p_sv: N(stat.saves), p_ipouts: ipOuts(stat.inningsPitched), p_er: N(stat.earnedRuns) }); if (!r.g) r.g = N(stat.gamesPlayed) }
    rows.set(k, r)
  }
  const people = new Map()
  for (const kind of ['hitting', 'pitching']) {
    const splits = (await api(`/stats?stats=season&group=${kind}&season=${SEASON}&sportId=1&playerPool=ALL&limit=5000`)).stats?.[0]?.splits || []
    for (const s of splits) {
      const id = s.player.id; const pos = POS[s.position?.code] || s.position?.abbreviation || null
      people.set(id, s.player)
      if ((s.numTeams || 1) > 1) {
        // Traded: one row per team from his own splits, plus the combined TOT.
        const per = (await api(`/people/${id}/stats?stats=season&group=${kind}&season=${SEASON}&sportId=1`)).stats?.[0]?.splits || []
        for (const p of per) if (p.team?.id) put(id, s.player.fullName, tm.get(p.team.id)?.abbrev || String(p.team.id), pos, { ...p.stat, _teamId: p.team.id }, kind, N(s.stat.age) || null, null)
        put(id, s.player.fullName, 'TOT', pos, s.stat, kind, N(s.stat.age) || null, null)
        await sleep(150)
      } else {
        put(id, s.player.fullName, tm.get(s.team?.id)?.abbrev || 'UNK', pos, { ...s.stat, _teamId: s.team?.id }, kind, N(s.stat.age) || null, null)
      }
    }
  }
  return [...rows.values()]
}

// ── WRITE ──────────────────────────────────────────────────────────────────
const history = CURRENT_ONLY ? [] : await buildHistory()
const current = await buildCurrent()
const all = [...history, ...current]
console.log(`[hist mlb] rows: ${history.length} history + ${current.length} ${SEASON}`)
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(all)); console.log(`[hist mlb] wrote ${jsonOut}`); process.exit(0) }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
if (CURRENT_ONLY) await db.from('hist_mlb').delete().eq('season', SEASON)   // a traded player's team rows can change
for (let i = 0; i < all.length; i += 1000) {
  const { error } = await db.from('hist_mlb').upsert(all.slice(i, i + 1000).map((r) => ({ ...r, built_at: new Date().toISOString() })), { onConflict: 'season,source_id,team' })
  if (error) throw new Error(`upsert at ${i}: ${error.message}`)
  if ((i / 1000) % 20 === 0) console.log(`[hist mlb] ${i + Math.min(1000, all.length - i)}/${all.length}`)
}
console.log(`[hist mlb] done: ${all.length} rows`)
