#!/usr/bin/env node
// FIT + HOLD-OUT of BUCKETS' award races (lib/nba/awardModel.js). Nothing made up: every input is a public page on disk.
//   node --import ./scripts/_esm-resolve.mjs scripts/fit-nba-awards.mjs <cacheDir> [--first-test 2021]
// <cacheDir> holds, per season S (ESPN's end year, 2026 = 2025-26):
//   espn_S_<page>.json  site.web.api.espn.com/.../nba/statistics/byathlete?season=S&seasontype=2&limit=50&page=<page>
//   st_S.json           site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=S&seasontype=2
//   br_S.html           www.basketball-reference.com/awards/awards_S.html   (MVP / ROY / DPOY / MIP voting)
//   br_fmvp.html        www.basketball-reference.com/awards/finals_mvp.html
// Fit: seasons before --first-test. HELD OUT: that season on. The weights printed last (all seasons) go in AWARD_FITS.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { AWARD_DEFS, defPerPoss, rawFeatures, zScore, softmax, fitSoftmax, fitTemperature } from '../lib/nba/awardModel.js'

const DIR = process.argv[2]
if (!DIR) { console.error('usage: fit-nba-awards.mjs <cacheDir> [--first-test 2021]'); process.exit(1) }
const fi = process.argv.indexOf('--first-test'); const FIRST_TEST = fi > 0 ? Number(process.argv[fi + 1]) : 2021
const SEASONS = []; for (let s = 2012; s <= 2026; s++) SEASONS.push(s)

export const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')

// ---------- ESPN ----------
function espnSeason(s) {
  const out = []
  for (const f of readdirSync(DIR).filter((n) => n.startsWith(`espn_${s}_`))) {
    const j = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
    const namesOf = Object.fromEntries((j.categories || []).map((c) => [c.name, c.names || []]))
    for (const a of j.athletes || []) {
      const v = {}
      for (const c of a.categories || []) (namesOf[c.name] || []).forEach((n, i) => { const x = Number((c.totals || c.values || [])[i]); v[n] = Number.isFinite(x) ? x : null })
      out.push({
        id: String(a.athlete?.id), name: a.athlete?.displayName, key: normName(a.athlete?.displayName), team: a.athlete?.teamShortName,
        debut: a.athlete?.debutYear ?? null,
        gp: v.gamesPlayed, min: v.avgMinutes, pts: v.avgPoints, reb: v.avgRebounds, ast: v.avgAssists, stl: v.avgSteals, blk: v.avgBlocks,
        fga: v.avgFieldGoalsAttempted, fta: v.avgFreeThrowsAttempted,
      })
    }
  }
  return new Map(out.map((p) => [p.id, p]))
}
function standings(s) {
  const j = JSON.parse(readFileSync(join(DIR, `st_${s}.json`), 'utf8'))
  const entries = []
  const walk = (n) => { if (n?.standings?.entries) entries.push(...n.standings.entries); for (const c of n?.children || []) walk(c) }
  walk(j)
  const clubs = new Map()
  for (const e of entries) {
    const st = Object.fromEntries((e.stats || []).map((x) => [x.name, x.value]))
    clubs.set(e.team.abbreviation, { games: (st.wins || 0) + (st.losses || 0), winPct: st.winPercent, pa: st.avgPointsAgainst })
  }
  // TEAM DEFENCE, PACE TAKEN OUT: points allowed per opponent possession (FGA + 0.44 FTA + TOV - OREB), from ESPN's byteam
  // read (teams_S.json, the same read lib/nba/stats.js makes live), as points per 100 below the league
  const t = JSON.parse(readFileSync(join(DIR, `teams_${s}.json`), 'utf8'))
  const namesOf = Object.fromEntries((t.categories || []).filter((c) => (c.names || []).length).map((c) => [c.name, c.names]))
  for (const tm of t.teams || []) {
    const opp = {}
    for (const c of tm.categories || []) if (/^Opponent/i.test(c.displayName || '')) (namesOf[c.name] || []).forEach((n, i) => { opp[n] = Number((c.totals || c.values || [])[i]) })
    const club = clubs.get(tm.team.abbreviation)
    if (club) club.oppPerPoss = defPerPoss(opp)
  }
  const rated = [...clubs.values()].filter((c) => c.oppPerPoss != null)
  const lg = rated.reduce((x, c) => x + c.oppPerPoss, 0) / rated.length
  for (const c of clubs.values()) c.defVsLeague = c.oppPerPoss == null ? null : (lg - c.oppPerPoss) * 100
  return clubs
}

// ---------- Basketball-Reference ----------
const cells = (tr) => Object.fromEntries([...tr.matchAll(/<(?:td|th)[^>]*data-stat="([a-z_0-9]+)"[^>]*>(.*?)<\/(?:td|th)>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim()]))
function brTable(html, id) {
  const h = html.replace(/<!--|-->/g, '')
  const at = h.indexOf(`id="${id}"`)
  if (at < 0) return []
  const body = h.slice(at, h.indexOf('</table>', at))
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => cells(m[1])).filter((r) => r.player && /^[0-9.,]+$/.test(r.points_won))
}
function votes(s, award) {
  const f = join(DIR, `br_${s}.html`)
  if (!existsSync(f)) return null
  const rows = brTable(readFileSync(f, 'utf8'), award)
  if (!rows.length) return null
  return rows.map((r) => ({ name: r.player.replace(/\*$/, ''), key: normName(r.player.replace(/\*$/, '')), team: r.team_id, won: Number(String(r.points_won).replace(/,/g, '')) }))
}

// ---------- one award, one season: pool rows with their vote targets ----------
const DATA = {}
for (let s = 2005; s <= SEASONS.at(-1); s++) DATA[s] = { players: espnSeason(s), clubs: existsSync(join(DIR, `st_${s}.json`)) ? standings(s) : new Map() }
// A ROOKIE = first season on ESPN's list (lists from 2004-05 on; ESPN's debutYear is blank for most players after 2020).
// Live, the roster's experience.years === 0 says the same thing.
const seenBefore = new Map()
{ const seen = new Set(); for (let s = 2005; s <= SEASONS.at(-1); s++) { seenBefore.set(s, new Set(seen)); for (const id of DATA[s].players.keys()) seen.add(id) } }
let clubMiss = 0

function seasonRows(award, s, { lines = 'same' } = {}) {
  const def = AWARD_DEFS[award]
  const V = votes(s, def.br)
  if (!V) return null
  // 'same' = this season's own lines (the season-end fit); 'last' = the season before's (the opening-night read)
  const src = lines === 'last' ? s - 1 : s
  const { players, clubs } = DATA[src]
  const prevOf = DATA[src - 1]?.players
  const rows = []
  for (const p of players.values()) {
    if (def.rookies && (seenBefore.get(src).has(p.id) || (p.debut != null && p.debut !== src - 1))) continue
    const prev = prevOf?.get(p.id) || null
    if (!def.pool(p, prev)) continue
    if (!clubs.get(p.team)) clubMiss++
    rows.push({ id: p.id, name: p.name, key: p.key, f: rawFeatures(p, clubs.get(p.team), prev) })
  }
  const tot = V.reduce((t, v) => t + v.won, 0)
  let matched = 0, unmatchedPts = 0
  const byKey = new Map(rows.map((r) => [r.key, r]))
  for (const r of rows) r.t = 0
  for (const v of V) {
    const r = byKey.get(v.key)
    if (r) { r.t += v.won / tot; matched++ } else unmatchedPts += v.won
  }
  // a vote-getter outside the pool: his share is dropped and the rest renormalised (counted, printed below)
  const kept = rows.reduce((t, r) => t + r.t, 0)
  if (kept > 0) for (const r of rows) r.t /= kept
  const winner = V.reduce((a, b) => (b.won > a.won ? b : a))
  return { season: s, rows: zScore(rows, def.feats), winner: winner.name, winnerKey: winner.key, matched, voters: V.length, unmatchedShare: unmatchedPts / tot }
}

const fmt = (x, d = 3) => (x == null ? '—' : Number(x).toFixed(d))
function score(seasons, w, T = 1) {
  let top1 = 0, top3 = 0, ll = 0, llUni = 0, wShare = 0, n = 0
  const lines = []
  for (const s of seasons) {
    const p = softmax(s.rows, w, T)
    const order = s.rows.map((r, i) => [r, p[i]]).sort((a, b) => b[1] - a[1])
    const rank = order.findIndex(([r]) => r.key === s.winnerKey) + 1
    const pw = rank ? order[rank - 1][1] : 0
    n++; if (rank === 1) top1++; if (rank && rank <= 3) top3++
    ll -= Math.log(Math.max(pw, 1e-9)); llUni -= Math.log(1 / s.rows.length); wShare += pw
    lines.push(`    ${s.season}: winner ${s.winner} ranked ${rank || 'OUT OF POOL'} with ${fmt(pw * 100, 1)}%; model #1 ${order[0][0].name} ${fmt(order[0][1] * 100, 1)}%  (pool ${s.rows.length}, ${s.matched}/${s.voters} vote-getters matched${s.unmatchedShare > 0.01 ? `, ${fmt(s.unmatchedShare * 100, 1)}% of points outside the pool` : ''})`)
  }
  return { top1, top3, n, ll: ll / n, llUni: llUni / n, wShare: wShare / n, lines }
}

const out = {}
for (const award of Object.keys(AWARD_DEFS)) {
  const def = AWARD_DEFS[award]
  const all = SEASONS.map((s) => seasonRows(award, s)).filter(Boolean)
  const fit = all.filter((s) => s.season < FIRST_TEST), test = all.filter((s) => s.season >= FIRST_TEST)
  const w = fitSoftmax(fit, def.feats.length)
  const sc = score(test, w)
  // a one-number baseline: the first feature alone (points for MVP/ROY, blocks for DPOY, points gained for MIP)
  const base = fitSoftmax(fit.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, z: [r.z[0]] })) })), 1)
  const bs = score(test.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, z: [r.z[0]] })) })), base)
  console.log(`\n=== ${def.title} (${award}) features ${def.feats.join(', ')}`)
  console.log(`  fit ${fit.map((s) => s.season).join(',')}  ->  weights ${w.map((x) => fmt(x, 2)).join(', ')}`)
  console.log(`  HELD OUT ${test.map((s) => s.season).join(',')}: winner #1 in ${sc.top1}/${sc.n}, top 3 in ${sc.top3}/${sc.n}, winner's share avg ${fmt(sc.wShare * 100, 1)}%, log loss ${fmt(sc.ll, 2)} (uniform over the pool ${fmt(sc.llUni, 2)}; ${def.feats[0]} alone ${fmt(bs.ll, 2)}, #1 ${bs.top1}/${bs.n})`)
  sc.lines.forEach((l) => console.log(l))
  const wAll = fitSoftmax(all, def.feats.length)
  let T0 = null
  if (award === 'mvp' || award === 'dpoy') {
    // OPENING NIGHT: last season's lines, this season's vote (players who retired or did not play are in the pool, as they are live)
    const openAll = SEASONS.map((s) => seasonRows(award, s, { lines: 'last' })).filter(Boolean)
    const oFit = openAll.filter((s) => s.season < FIRST_TEST), oTest = openAll.filter((s) => s.season >= FIRST_TEST)
    const T = fitTemperature(oFit, w)
    const os = score(oTest, w, T)
    console.log(`  OPENING NIGHT (last season's lines): temperature ${T} fitted on ${oFit.length} seasons; HELD OUT winner #1 ${os.top1}/${os.n}, top 3 ${os.top3}/${os.n}, share avg ${fmt(os.wShare * 100, 1)}%, log loss ${fmt(os.ll, 2)} (uniform ${fmt(os.llUni, 2)})`)
    os.lines.forEach((l) => console.log(l))
    T0 = fitTemperature(openAll, wAll)
  }
  out[award] = { w: wAll.map((x) => Math.round(x * 1000) / 1000), T0, seasons: `${all[0].season}-${all.at(-1).season}`, heldOut: `${sc.top1}/${sc.n} #1, ${sc.top3}/${sc.n} top 3` }
}

// ---------- Finals MVP: within the champion, share ∝ (his share of the club's pts+reb+ast) ^ a ----------
const fm = readFileSync(join(DIR, 'br_fmvp.html'), 'utf8').replace(/<!--|-->/g, '')
const fmRows = [...fm.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => cells(m[1])).filter((r) => r.season && r.player)
const fmBy = new Map(fmRows.map((r) => [Number(String(r.season).slice(0, 4)) + 1, { name: r.player, key: normName(r.player), team: r.team_id }]))
const fmSeasons = []
for (const s of SEASONS) {
  const f = fmBy.get(s); if (!f) continue
  const players = [...DATA[s].players.values()]
  const champ = players.find((p) => p.key === f.key)
  if (!champ) { console.log(`  finals MVP ${s}: ${f.name} not on ESPN's list`); continue }
  const roster = players.filter((p) => p.team === champ.team && p.gp > 0)
  const prod = roster.map((p) => ({ p, v: (p.pts + p.reb + p.ast) * p.gp }))
  const tot = prod.reduce((t, x) => t + x.v, 0)
  fmSeasons.push({ season: s, winner: f.name, rows: prod.map(({ p, v }) => ({ name: p.name, key: p.key, share: v / tot, t: p.key === f.key ? 1 : 0 })) })
}
const fmLoss = (a, list) => list.reduce((t, s) => { const e = s.rows.map((r) => r.share ** a); const z = e.reduce((x, y) => x + y, 0); const i = s.rows.findIndex((r) => r.t); return t - Math.log(e[i] / z) }, 0)
const bestA = (list) => { let b = [1, Infinity]; for (let a = 0.5; a <= 12.001; a += 0.1) { const l = fmLoss(a, list); if (l < b[1]) b = [Math.round(a * 10) / 10, l] } return b[0] }
let fmTop1 = 0, fmLL = 0
console.log(`\n=== Finals MVP: within the champion's roster, his share of the club's points + rebounds + assists ^ a (leave one season out)`)
for (const s of fmSeasons) {
  const a = bestA(fmSeasons.filter((x) => x !== s))
  const e = s.rows.map((r) => r.share ** a); const z = e.reduce((x, y) => x + y, 0)
  const order = s.rows.map((r, i) => [r, e[i] / z]).sort((x, y) => y[1] - x[1])
  const rank = order.findIndex(([r]) => r.t) + 1
  if (rank === 1) fmTop1++
  fmLL -= Math.log(order[rank - 1][1])
  console.log(`    ${s.season}: ${s.winner} ranked ${rank} on his club with ${fmt(order[rank - 1][1] * 100, 1)}% (a=${a}); club #1 ${order[0][0].name}`)
}
console.log(`  LEAVE-ONE-OUT: the club's top share won ${fmTop1}/${fmSeasons.length}; log loss ${fmt(fmLL / fmSeasons.length, 2)}`)
out.fmvp = { a: bestA(fmSeasons), seasons: `${fmSeasons[0].season}-${fmSeasons.at(-1).season}`, heldOut: `${fmTop1}/${fmSeasons.length} #1 (leave one out)` }

console.log(`\nplayers whose club was not in the standings (feature left at the pool mean): ${clubMiss}`)
console.log('\nAWARD_FITS =', JSON.stringify(out, null, 2))
