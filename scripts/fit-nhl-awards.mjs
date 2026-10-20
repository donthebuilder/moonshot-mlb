#!/usr/bin/env node
// FIT + HOLD-OUT of LAMP's award races (lib/nhl/awardModel.js). Nothing made up: every input is a public page on disk.
//   node --import ./scripts/_esm-resolve.mjs scripts/fit-nhl-awards.mjs <cacheDir> [--first-test 2021]
// <cacheDir> holds, per season id Y (20112012 ...; the voting page is named for its end year S):
//   skater_Y_r0.json   api.nhle.com/stats/rest/en/skater/summary?isAggregate=false&isGame=false&limit=-1&cayenneExp=seasonId=Y and gameTypeId=2
//   skater_Y_r1.json   the same with "and isRookie='1'"          goalie_Y_r0.json / goalie_Y_r1.json   goalie/summary, the same two
//   team_Y.json        team/summary?limit=-1&cayenneExp=seasonId=Y and gameTypeId=2        teams.json   /team (id -> triCode)
//   hr_S.html          www.hockey-reference.com/awards/voting-S.html   (Hart, Vezina, Norris, Calder voting; 4 s between pages)
// Fit: seasons before --first-test. HELD OUT: that season on. The weights printed last (all seasons) go in AWARD_FITS.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { AWARD_DEFS, goalieLine, leagueSv, skaterLine, rawFeatures, zScore, softmax, fitSoftmax, fitTemperature } from '../lib/nhl/awardModel.js'

const DIR = process.argv[2]
if (!DIR) { console.error('usage: fit-nhl-awards.mjs <cacheDir> [--first-test 2021]'); process.exit(1) }
const fi = process.argv.indexOf('--first-test'); const FIRST_TEST = fi > 0 ? Number(process.argv[fi + 1]) : 2021
const SEASONS = []; for (let s = 2012; s <= 2026; s++) SEASONS.push(s)
const sid = (s) => (s - 1) * 10000 + s

const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')
const lastName = (s) => normName(String(s || '').trim().split(/\s+/).slice(1).join(' '))
const J = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')).data || []
const tri = new Map(J('teams.json').map((t) => [t.id, t.triCode]))

// ---------- the league's reports -> per-game lines ----------
function season(s) {
  const id = sid(s)
  if (!existsSync(join(DIR, `skater_${id}_r0.json`))) return null
  const rookies = new Set([...J(`skater_${id}_r1.json`), ...J(`goalie_${id}_r1.json`)].map((r) => String(r.playerId)))
  const clubs = new Map(J(`team_${id}.json`).map((t) => [tri.get(t.teamId), { games: t.gamesPlayed, pointPct: t.pointPct }]))
  const players = []
  for (const r of J(`skater_${id}_r0.json`)) { const l = skaterLine(r); if (l) players.push({ ...l, rookie: rookies.has(l.id) }) }
  const goalies = J(`goalie_${id}_r0.json`)
  for (const r of goalies) { const l = goalieLine(r); if (l) players.push({ ...l, rookie: rookies.has(l.id) }) }
  return { players, clubs, lgSv: leagueSv(goalies) }
}

// ---------- Hockey-Reference voting ----------
const cells = (tr) => Object.fromEntries([...tr.matchAll(/<(?:td|th)[^>]*data-stat="([a-z_0-9]+)"[^>]*>(.*?)<\/(?:td|th)>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim()]))
function votes(s, award) {
  const f = join(DIR, `hr_${s}.html`)
  if (!existsSync(f)) return null
  const h = readFileSync(f, 'utf8').replace(/<!--|-->/g, '')
  const at = h.indexOf(`id="${award}_stats"`)
  if (at < 0) return null
  const body = h.slice(at, h.indexOf('</table>', at))
  const rows = [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => cells(m[1])).filter((r) => r.player && /^[0-9.,]+$/.test(r.votes || ''))
  return rows.length ? rows.map((r) => ({ name: r.player.replace(/\*$/, ''), key: normName(r.player.replace(/\*$/, '')), last: lastName(r.player), pos: r.pos, won: Number(String(r.votes).replace(/,/g, '')) })) : null
}

const DATA = {}
for (let s = 2011; s <= SEASONS.at(-1); s++) DATA[s] = season(s)
let clubMiss = 0

function seasonRows(award, s, { lines = 'same' } = {}) {
  const def = AWARD_DEFS[award]
  const V = votes(s, def.hr)
  if (!V) return null
  const src = lines === 'last' ? s - 1 : s
  const D = DATA[src]
  if (!D) return null
  const rows = []
  for (const p of D.players) {
    if (def.rookies && !p.rookie) continue
    const c = D.clubs.get(p.team)
    if (!c) clubMiss++
    const f = rawFeatures(p, c, D.lgSv)
    if (!def.pool(p, f)) continue
    rows.push({ id: p.id, name: p.name, key: normName(p.name), last: lastName(p.name), team: p.team, f })
  }
  const tot = V.reduce((t, v) => t + v.won, 0)
  let matched = 0, unmatchedPts = 0
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const byLast = new Map(); for (const r of rows) byLast.set(r.last, byLast.has(r.last) ? null : r)
  for (const r of rows) r.t = 0
  const missed = []
  for (const v of V) {
    // the full name first, then a surname that is unique in the pool (Hockey-Reference and the league spell some first names apart)
    const r = byKey.get(v.key) || byLast.get(v.last)
    if (r) { r.t += v.won / tot; v.key = r.key; matched++ } else { unmatchedPts += v.won; missed.push(v.name) }
  }
  const kept = rows.reduce((t, r) => t + r.t, 0)
  if (kept > 0) for (const r of rows) r.t /= kept
  const winner = V.reduce((a, b) => (b.won > a.won ? b : a))
  return { season: s, rows: zScore(rows, def.feats), winner: winner.name, winnerKey: winner.key, matched, voters: V.length, unmatchedShare: unmatchedPts / tot, missed }
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
    lines.push(`    ${s.season}: winner ${s.winner} ranked ${rank || 'OUT OF POOL'} with ${fmt(pw * 100, 1)}%; model #1 ${order[0][0].name} ${fmt(order[0][1] * 100, 1)}%  (pool ${s.rows.length}, ${s.matched}/${s.voters} vote-getters matched${s.unmatchedShare > 0.01 ? `, ${fmt(s.unmatchedShare * 100, 1)}% of points outside the pool: ${s.missed.join(', ')}` : ''})`)
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
  const one = (list) => list.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, z: [r.z[0]] })) }))
  const bs = score(one(test), fitSoftmax(one(fit), 1))
  console.log(`\n=== ${def.title} (${award}) features ${def.feats.join(', ')}`)
  console.log(`  fit ${fit.map((s) => s.season).join(',')}  ->  weights ${w.map((x) => fmt(x, 2)).join(', ')}`)
  console.log(`  HELD OUT ${test.map((s) => s.season).join(',')}: winner #1 in ${sc.top1}/${sc.n}, top 3 in ${sc.top3}/${sc.n}, winner's share avg ${fmt(sc.wShare * 100, 1)}%, log loss ${fmt(sc.ll, 2)} (uniform over the pool ${fmt(sc.llUni, 2)}; ${def.feats[0]} alone ${fmt(bs.ll, 2)}, #1 ${bs.top1}/${bs.n})`)
  sc.lines.forEach((l) => console.log(l))
  const wAll = fitSoftmax(all, def.feats.length)
  let T0 = null
  if (!def.rookies) {
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
console.log(`\nplayer rows whose club was not in the team report (left at the pool mean): ${clubMiss}`)
console.log('\nAWARD_FITS =', JSON.stringify(out, null, 2))
