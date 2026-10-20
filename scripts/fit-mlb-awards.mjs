#!/usr/bin/env node
// FIT + HOLD-OUT of MOONSHOT's award races (lib/mlb/awardModel.js). Nothing made up: every input is a public page on disk.
//   node --import ./scripts/_esm-resolve.mjs scripts/fit-mlb-awards.mjs <cacheDir> [--first-test 2020]
// <cacheDir> holds, per season S:
//   hitting_ALL_S.json  pitching_ALL_S.json      statsapi.mlb.com/api/v1/stats?stats=season&group=<g>&season=S&sportId=1&playerPool=ALL&limit=4000
//   hitting_ROOKIES_S.json  pitching_ROOKIES_S.json   the same with playerPool=ROOKIES (who MLB counts as a rookie)
//   st_S.json           statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=S&standingsTypes=regularSeason
//   br_S.html           www.baseball-reference.com/awards/awards_S.shtml   (AL/NL MVP, Cy Young, ROY voting; 4 s between pages)
// One race = one league, one season. Fit: seasons before --first-test. HELD OUT: that season on. The weights printed last
// (all seasons) go in AWARD_FITS.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { AWARD_DEFS, SEASON_GAMES, addRoleVal, blendClubs, racePeople, parseLines, leagueConsts, rawFeatures } from '../lib/mlb/awardModel.js'
import { zScore, softmax, fitSoftmax, fitTemperature } from '../lib/awardCore.js'
import { LEAGUE } from '../lib/mlb/awardModel.js'

const DIR = process.argv[2]
if (!DIR) { console.error('usage: fit-mlb-awards.mjs <cacheDir> [--first-test 2020]'); process.exit(1) }
const fi = process.argv.indexOf('--first-test'); const FIRST_TEST = fi > 0 ? Number(process.argv[fi + 1]) : 2020
const ITERS = { iters: Number(process.env.ITERS || 3000), lr: Number(process.env.LR || 1) }
const SEASONS = []; for (let s = 2012; s <= 2025; s++) SEASONS.push(s)
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'))

export const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')

// ---------- MLB Stats API ----------
const DATA = {}
for (let s = 2011; s <= 2026; s++) {
  if (!existsSync(join(DIR, `hitting_ALL_${s}.json`))) continue
  const lines = parseLines(read(`hitting_ALL_${s}.json`), read(`pitching_ALL_${s}.json`))
  const rookies = new Set([...parseLines(read(`hitting_ROOKIES_${s}.json`), read(`pitching_ROOKIES_${s}.json`)).keys()])
  const clubs = new Map()
  for (const rec of read(`st_${s}.json`).records || []) for (const t of rec.teamRecords || []) clubs.set(t.team.id, { winPct: Number(t.winningPercentage), games: t.wins + t.losses, league: LEAGUE[rec.league?.id] })
  const games = Math.max(...[...clubs.values()].map((c) => c.games))
  DATA[s] = { lines, rookies, clubs, lg: leagueConsts(lines), frac: games / SEASON_GAMES }
}

// ---------- Baseball-Reference ----------
const cells = (tr) => Object.fromEntries([...tr.matchAll(/<(?:td|th)[^>]*data-stat="([a-z_0-9]+)"[^>]*>(.*?)<\/(?:td|th)>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim()]))
function votes(s, lg, br) {
  const f = join(DIR, `br_${s}.html`)
  if (!existsSync(f)) return null
  const h = readFileSync(f, 'utf8').replace(/<!--|-->/g, '')
  const at = h.indexOf(`id="${lg}_${br}_voting"`)
  if (at < 0) return null
  const body = h.slice(at, h.indexOf('</table>', at))
  const rows = [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => cells(m[1])).filter((r) => r.player && /^[0-9.,]+$/.test(r.points_won))
  return rows.length ? rows.map((r) => ({ name: r.player.replace(/\*$/, ''), key: normName(r.player.replace(/\*$/, '')), won: Number(String(r.points_won).replace(/,/g, '')) })) : null
}

// ---------- one award, one league, one season: pool rows with their vote targets ----------
function raceRows(award, s, lg, { lines = 'same' } = {}) {
  const def = AWARD_DEFS[award]
  const V = votes(s, lg, def.br)
  if (!V) return null
  // 'same' = this season's lines (the season-end fit); 'last' = the season before's (the opening-day read)
  const src = lines === 'last' ? s - 1 : s
  const D = DATA[src]
  const rows = []
  for (const r of D.lines.values()) {
    if (r.league !== lg) continue
    if (def.rookies && !D.rookies.has(r.id)) continue
    if (!def.pool(r, D.frac)) continue
    rows.push({ id: r.id, name: r.name, key: normName(r.name), f: rawFeatures(r, D.lg, D.clubs.get(r.teamId)) })
  }
  return target(rows, V, s, lg, def, D.frac)
}

// IN-SEASON CHECKPOINTS: the lines through 30 April (~25 games a club) and 30 June (~80), read exactly as the page reads them
// (lib/mlb/awardModel.js racePeople: this season's pace shrunk toward last season's), against that season's vote. 2020 has
// none (its season began in late July). cp_S_MMDD_<group>.json = stats?stats=byDateRange&startDate=S-03-01&endDate=S-MM-DD.
const CHECKPOINTS = ['0430', '0630']
function checkpointRows(award, s, lg, md) {
  const def = AWARD_DEFS[award]
  const f = (g) => join(DIR, `cp_${s}_${md}_${g}.json`)
  if (!existsSync(f('hitting'))) return null
  const V = votes(s, lg, def.br)
  if (!V) return null
  const cur = parseLines(JSON.parse(readFileSync(f('hitting'), 'utf8')), JSON.parse(readFileSync(f('pitching'), 'utf8')))
  const cc = new Map()
  for (const rec of read(`st_${s}_${md}.json`).records || []) for (const t of rec.teamRecords || []) cc.set(t.team.id, { winPct: Number(t.winningPercentage), games: t.wins + t.losses, league: LEAGUE[rec.league?.id] })
  const games = [...cc.values()].map((c) => c.games).sort((a, b) => a - b)
  const frac = games[games.length >> 1] / SEASON_GAMES
  const clubs = blendClubs(cc, DATA[s - 1].clubs, frac)
  const people = racePeople({ cur, prev: DATA[s - 1].lines, rookies: DATA[s].rookies, clubs, frac, teamOf: (id, c, p) => (c || p).teamId })
  const lgc = leagueConsts(cur)
  const rows = people.filter((x) => x.league === lg && (!def.rookies || x.rookie) && def.pool(x, 1))
    .map((x) => ({ id: x.id, name: x.name, key: normName(x.name), f: rawFeatures(x, lgc, x.club) }))
  return target(rows, V, s, lg, def, frac)
}
function target(rows, V, s, lg, def, frac = 1) {
  const tot = V.reduce((t, v) => t + v.won, 0)
  let matched = 0, outPts = 0
  const byKey = new Map(rows.map((r) => [r.key, r]))
  for (const r of rows) r.t = 0
  for (const v of V) { const r = byKey.get(v.key); if (r) { r.t += v.won / tot; matched++ } else outPts += v.won }
  const kept = rows.reduce((t, r) => t + r.t, 0)
  if (kept > 0) for (const r of rows) r.t /= kept
  const winner = V.reduce((a, b) => (b.won > a.won ? b : a))
  return { season: s, lg, frac, rows: zScore(addRoleVal(rows), def.feats), winner: winner.name, winnerKey: winner.key, matched, voters: V.length, outShare: outPts / tot, outNames: V.filter((v) => !byKey.has(v.key)).map((v) => v.name) }
}

const fmt = (x, d = 3) => (x == null ? '—' : Number(x).toFixed(d))
function score(races, w, T = 1) {
  let top1 = 0, top3 = 0, ll = 0, llUni = 0, wShare = 0, n = 0
  const lines = []
  for (const s of races) {
    const p = softmax(s.rows, w, T)
    const order = s.rows.map((r, i) => [r, p[i]]).sort((a, b) => b[1] - a[1])
    const rank = order.findIndex(([r]) => r.key === s.winnerKey) + 1
    const pw = rank ? order[rank - 1][1] : 0
    n++; if (rank === 1) top1++; if (rank && rank <= 3) top3++
    ll -= Math.log(Math.max(pw, 1e-9)); llUni -= Math.log(1 / s.rows.length); wShare += pw
    lines.push(`    ${s.season} ${s.lg}: winner ${s.winner} ranked ${rank || 'OUT OF POOL'} with ${fmt(pw * 100, 1)}%; model #1 ${order[0][0].name} ${fmt(order[0][1] * 100, 1)}%  (pool ${s.rows.length}, ${s.matched}/${s.voters} matched${s.outShare > 0.01 ? `, ${fmt(s.outShare * 100, 1)}% of points outside: ${s.outNames.join('; ')}` : ''})`)
  }
  return { top1, top3, n, ll: ll / n, llUni: llUni / n, wShare: wShare / n, lines }
}
const byLeague = (sc, races, w, T) => ['AL', 'NL'].map((lg) => { const x = score(races.filter((r) => r.lg === lg), w, T); return `${lg} #1 ${x.top1}/${x.n}, top 3 ${x.top3}/${x.n}` }).join('; ')

const out = {}
for (const award of Object.keys(AWARD_DEFS)) {
  const def = AWARD_DEFS[award]
  // trying another feature set: FEATS_mvp=batRuns,teamWin (the first is still the baseline)
  if (process.env[`FEATS_${award}`]) def.feats = process.env[`FEATS_${award}`].split(',')
  const all = SEASONS.flatMap((s) => ['AL', 'NL'].map((lg) => raceRows(award, s, lg))).filter(Boolean)
  const fit = all.filter((s) => s.season < FIRST_TEST), test = all.filter((s) => s.season >= FIRST_TEST)
  const w = fitSoftmax(fit, def.feats.length, ITERS)
  const sc = score(test, w)
  // FEATURE CHOICE LOOKS ONLY AT THE FIT SEASONS: leave one season out inside them (both leagues' races go together)
  const cvLL = (rs) => { let ll = 0, n = 0; for (const s of [...new Set(rs.map((r) => r.season))]) { const tr = rs.filter((r) => r.season !== s), te = rs.filter((r) => r.season === s); const sc2 = score(te, fitSoftmax(tr, tr[0].rows[0].z.length, ITERS)); ll += sc2.ll * sc2.n; n += sc2.n } return ll / n }
  const one = (rs) => rs.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, z: [r.z[0]] })) }))
  const base = fitSoftmax(one(fit), 1)
  const bs = score(one(test), base)
  console.log(`\n=== ${def.title} (${award}) features ${def.feats.join(', ')}`)
  console.log(`  CV inside the fit seasons (leave one season out): log loss ${fmt(cvLL(fit), 3)}`)
  console.log(`  fit ${fit.length} races (${fit[0].season}-${fit.at(-1).season})  ->  weights ${w.map((x) => fmt(x, 2)).join(', ')}`)
  console.log(`  HELD OUT ${test.length} races (${test[0].season}-${test.at(-1).season}): winner #1 in ${sc.top1}/${sc.n}, top 3 in ${sc.top3}/${sc.n} (${byLeague(sc, test, w)}), winner's share avg ${fmt(sc.wShare * 100, 1)}%, log loss ${fmt(sc.ll, 2)} (uniform over the pool ${fmt(sc.llUni, 2)}; ${def.feats[0]} alone ${fmt(bs.ll, 2)}, #1 ${bs.top1}/${bs.n})`)
  sc.lines.forEach((l) => console.log(l))
  const wAll = fitSoftmax(all, def.feats.length)
  let T0 = null
  if (!def.rookies) {
    // OPENING DAY: last season's lines, this season's vote (anyone who did not pitch or hit this season is in the pool, as live)
    const openAll = SEASONS.flatMap((s) => ['AL', 'NL'].map((lg) => raceRows(award, s, lg, { lines: 'last' }))).filter(Boolean)
    const oFit = openAll.filter((s) => s.season < FIRST_TEST), oTest = openAll.filter((s) => s.season >= FIRST_TEST)
    const T = fitTemperature(oFit, w)
    const os = score(oTest, w, T)
    console.log(`  OPENING DAY (last season's lines): temperature ${T} fitted on ${oFit.length} races; HELD OUT winner #1 ${os.top1}/${os.n}, top 3 ${os.top3}/${os.n}, share avg ${fmt(os.wShare * 100, 1)}%, log loss ${fmt(os.ll, 2)} (uniform ${fmt(os.llUni, 2)})`)
    T0 = fitTemperature(openAll, wAll)
  }
  // in-season checkpoints: the season-end weights, a temperature fitted on the fit seasons' checkpoint, scored held out
  const Ts = {}
  for (const md of CHECKPOINTS) {
    const cpAll = SEASONS.flatMap((s) => ['AL', 'NL'].map((lg) => checkpointRows(award, s, lg, md))).filter(Boolean)
    const cFit = cpAll.filter((s) => s.season < FIRST_TEST), cTest = cpAll.filter((s) => s.season >= FIRST_TEST)
    const T = fitTemperature(cFit, w)
    const cs = score(cTest, w, T)
    const fr = cpAll.reduce((t, s) => t + s.frac, 0) / cpAll.length
    console.log(`  THROUGH ${md.slice(0, 2)}-${md.slice(2)} (~${Math.round(fr * SEASON_GAMES)} games a club): temperature ${T}; HELD OUT ${cs.n} races: winner #1 ${cs.top1}/${cs.n}, top 3 ${cs.top3}/${cs.n}, share avg ${fmt(cs.wShare * 100, 1)}%, log loss ${fmt(cs.ll, 2)} (uniform ${fmt(cs.llUni, 2)})`)
    Ts[md] = { frac: Math.round(fr * 1000) / 1000, T: fitTemperature(cpAll, wAll), heldOut: `${cs.top1}/${cs.n} #1, ${cs.top3}/${cs.n} top 3, log loss ${fmt(cs.ll, 2)} vs uniform ${fmt(cs.llUni, 2)}` }
  }
  out[award] = { w: wAll.map((x) => Math.round(x * 1000) / 1000), T0, Ts, races: all.length, heldOut: `${sc.top1}/${sc.n} #1, ${sc.top3}/${sc.n} top 3` }
}
console.log('\nAWARD_FITS =', JSON.stringify(out, null, 2))
