#!/usr/bin/env node
// FIT + HOLD-OUT of TUDDY's award races (lib/nfl/awardModel.js). Nothing made up: every input is a public file on disk.
//   node --import ./scripts/_esm-resolve.mjs scripts/fit-nfl-awards.mjs <cacheDir> [--first-test 2020] [--verbose]
//   (quick runs: ONLY=mvp,dpoy one race or two; NOWEEK=1 season's end only; L2=0.1 a stronger shrink. ~10 min in full)
// <cacheDir> holds:
//   nv_S.csv      github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_S.csv   (S = 2011-2025)
//   players.csv   github.com/nflverse/nflverse-data/releases/download/players/players.csv   (rookie_season)
//   games.csv     raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv            (every result)
//   pfr_S.html    pro-football-reference.com/awards/awards_S.htm (S = 2012-2025): the AP's vote points per award, read from
//                 the Internet Archive's copy (web.archive.org/web/2026id_/...), one page a season, never the live site
// Fit: seasons before --first-test. HELD OUT: that season on. Then the same at week W (each season's lines through week W,
// blended with the season before, against its final vote): the blend and the temperature. The weights printed last go in AWARD_FITS.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { AWARD_DEFS, POS_KEYS, parseCsv, seasonLines, clubRecords, rawFeatures, blendLine, positionZ } from '../lib/nfl/awardModel.js'
import { zScore, softmax, fitSoftmax } from '../lib/awardCore.js'

const DIR = process.argv[2]
if (!DIR) { console.error('usage: fit-nfl-awards.mjs <cacheDir> [--first-test 2020]'); process.exit(1) }
const fi = process.argv.indexOf('--first-test'); const FIRST_TEST = fi > 0 ? Number(process.argv[fi + 1]) : 2020
const SEASONS = []; for (let s = 2012; s <= 2025; s++) SEASONS.push(s)
const WEEKS = [0, 3, 6, 9, 12]   // 0 = opening night: last season's lines only
const BLENDS = [0, 0.5, 1, 2, 3, 4, 6, 8]
const L2 = Number(process.env.L2 || 0.01)

// a second key for a vote the full name misses ("Patrick Surtain II" / "Pat Surtain II"): first initial + surname, used only
// when it names one player in the pool
const initialKey = (s) => { const p = String(s || '').replace(/\b(Jr|Sr|II|III|IV|V)\b\.?/g, '').trim().split(/\s+/); return normName(p[0]?.[0] || '') + normName(p.slice(1).join('')) }
export const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '')

// ---------- nflverse ----------
const games = parseCsv(readFileSync(join(DIR, 'games.csv'), 'utf8'))
const rookieSeason = new Map(parseCsv(readFileSync(join(DIR, 'players.csv'), 'utf8')).map((p) => [p.gsis_id, Number(p.rookie_season) || null]))
const LINES = {}, CLUBS = {}
for (let s = 2011; s <= SEASONS.at(-1); s++) {
  const rows = parseCsv(readFileSync(join(DIR, `nv_${s}.csv`), 'utf8'))
  LINES[s] = { full: seasonLines(rows) }
  for (const w of WEEKS) if (w) LINES[s][w] = seasonLines(rows, w)
  const prevFull = s > 2011 ? CLUBS[s - 1].full : null
  CLUBS[s] = { full: clubRecords(games, s, 99, prevFull) }
  // the week-W clubs lean on last season's full record (CLUB_PRIOR games)
  for (const w of WEEKS) CLUBS[s][w] = clubRecords(games, s, w, prevFull)
}

// ---------- the AP's votes (Pro-Football-Reference's tables) ----------
const cells = (tr) => Object.fromEntries([...tr.matchAll(/<(?:td|th)[^>]*data-stat="([a-z_0-9]+)"[^>]*>(.*?)<\/(?:td|th)>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim()]))
function votes(s, id) {
  const f = join(DIR, `pfr_${s}.html`)
  if (!existsSync(f)) return null
  const h = readFileSync(f, 'utf8').replace(/<!--|-->/g, '')
  const at = h.indexOf(`id="${id}"`)
  if (at < 0) return null
  const body = h.slice(at, h.indexOf('</table>', at))
  const rows = [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => cells(m[1])).filter((r) => r.player && /^[0-9.,]+$/.test(r.votes || ''))
  return rows.length ? rows.map((r) => ({ name: r.player, key: normName(r.player), pos: r.pos, won: Number(String(r.votes).replace(/,/g, '')) })) : null
}

// ---------- one award, one season, one week: pool rows with their vote targets ----------
let clubMiss = 0
function seasonRows(award, s, { week = null, k = 3 } = {}) {
  const def = AWARD_DEFS[award]
  const V = votes(s, def.pfr)
  if (!V) return null
  const rows = []
  if (week == null) {
    // season's end: his own lines
    for (const l of LINES[s].full.values()) {
      if (def.rookies && rookieSeason.get(l.id) !== s) continue
      const club = CLUBS[s].full[l.team]
      if (!club) clubMiss++
      const line = { ...l, gpFrac: club?.games ? Math.min(1, l.gp / club.games) : null }
      if (!def.pool(line)) continue
      rows.push({ id: l.id, name: l.name, key: normName(l.name), group: l.group, f: rawFeatures(line, club) })
    }
  } else {
    // week W: who has played this season (opening night: last season's players), each line blended with last season's
    const cur = week ? LINES[s][week] : new Map()
    const prev = LINES[s - 1].full
    const ids = week ? [...cur.keys()] : [...prev.keys()]
    for (const id of ids) {
      const rookie = rookieSeason.get(id) === s
      if (def.rookies && !rookie) continue
      const c = cur.get(id) || null, p = rookie ? null : prev.get(id) || null
      const team = c?.team || p?.team
      const club = CLUBS[s][week]?.[team]
      const line = blendLine(c, p, club?.games || 0, k)
      if (!line || !def.pool(line)) continue
      rows.push({ id, name: line.name, key: normName(line.name), group: line.group, f: rawFeatures(line, club) })
    }
  }
  positionZ(rows, POS_KEYS)
  const tot = V.reduce((t, v) => t + v.won, 0)
  let matched = 0, unmatchedPts = 0
  const byKey = new Map()
  const byInit = new Map()
  for (const r of rows) {
    r.t = 0
    if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push(r)
    const ik = initialKey(r.name); if (!byInit.has(ik)) byInit.set(ik, []); byInit.get(ik).push(r)
  }
  const unmatched = []
  for (const v of V) {
    const list = byKey.get(v.key) || (byInit.get(initialKey(v.name))?.length === 1 ? byInit.get(initialKey(v.name)) : null)
    // two players of one name in a pool: the bigger season gets the vote (yards + defensive plays)
    const r = list?.sort((a, b) => (b.f.yds + 30 * (b.f.sacks + b.f.defInt)) - (a.f.yds + 30 * (a.f.sacks + a.f.defInt)))[0]
    if (r) { r.t += v.won / tot; matched++ } else { unmatchedPts += v.won; unmatched.push(`${v.name} (${v.pos}, ${v.won})`) }
  }
  const kept = rows.reduce((t, r) => t + r.t, 0)
  if (kept > 0) for (const r of rows) r.t /= kept
  const winner = V.reduce((a, b) => (b.won > a.won ? b : a))
  return { season: s, rows: zScore(rows, def.feats), winner: winner.name, winnerKey: winner.key, matched, voters: V.length, unmatchedShare: unmatchedPts / tot, unmatched }
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
    lines.push(`    ${s.season}: winner ${s.winner} ranked ${rank || 'OUT OF POOL'} with ${fmt(pw * 100, 1)}%; model #1 ${order[0][0].name} ${fmt(order[0][1] * 100, 1)}%  (pool ${s.rows.length}, ${s.matched}/${s.voters} vote-getters matched${s.unmatchedShare > 0.01 ? `, ${fmt(s.unmatchedShare * 100, 1)}% of points outside the pool: ${s.unmatched.join('; ')}` : ''})`)
  }
  return { top1, top3, n, ll: ll / n, llUni: llUni / n, wShare: wShare / n, lines }
}

const out = {}
const verbose = process.argv.includes('--verbose')
for (const award of Object.keys(AWARD_DEFS).filter((a) => !process.env.ONLY || process.env.ONLY.split(',').includes(a))) {
  const def = AWARD_DEFS[award]
  const all = SEASONS.map((s) => seasonRows(award, s)).filter(Boolean)
  const fit = all.filter((s) => s.season < FIRST_TEST), test = all.filter((s) => s.season >= FIRST_TEST)
  const w = fitSoftmax(fit, def.feats.length, { l2: L2 })
  // one-stat baselines: total yards (offence) / sacks (defence) alone
  const bKey = def.feats.includes('sacks') || def.feats.includes('sacksPos') ? 'sacks' : 'yds'
  const base = (list) => list.map((s) => ({ ...s, rows: zScore(s.rows, [bKey]) }))
  const bs = score(base(test), fitSoftmax(base(fit), 1))
  // LEAVE ONE FIT SEASON OUT: chooses features without touching the held-out seasons, and measures how far the fitted
  // shares should be spread on a season the fit has not seen (Tcal; the softmax alone is overconfident on 8 seasons)
  const loo = (list) => list.map((s) => ({ s, w: fitSoftmax(list.filter((x) => x !== s), def.feats.length, { l2: L2 }) }))
  const calT = (folds) => { let b = [1, Infinity]; for (let T = 0.5; T <= 12.0001; T += 0.05) { let l = 0; for (const { s, w: ww } of folds) { const p = softmax(s.rows, ww, T); s.rows.forEach((r, i) => { if (r.t > 0) l -= r.t * Math.log(Math.max(p[i], 1e-12)) }) } if (l < b[1]) b = [Math.round(T * 100) / 100, l] } return b[0] }
  const folds = loo(fit)
  let cv = 0
  for (const { s, w: ww } of folds) { const p = softmax(s.rows, ww); const i = s.rows.findIndex((r) => r.key === s.winnerKey); cv -= Math.log(Math.max(i >= 0 ? p[i] : 0, 1e-9)) }
  cv /= fit.length
  const Tcal = calT(folds)
  console.log(`\n=== ${def.title} (${award}) features ${def.feats.join(', ')}`)
  console.log(`  fit ${fit.map((s) => s.season).join(',')}  ->  weights ${w.map((x) => fmt(x, 2)).join(', ')}; leave-one-fit-season-out log loss ${fmt(cv, 2)}`)
  const sc = score(test, w, Tcal)
  console.log(`  calibration temperature (leave one fit season out) ${Tcal}`)
  console.log(`  HELD OUT ${test.map((s) => s.season).join(',')}: winner #1 in ${sc.top1}/${sc.n}, top 3 in ${sc.top3}/${sc.n}, winner's share avg ${fmt(sc.wShare * 100, 1)}%, log loss ${fmt(sc.ll, 2)} (uniform over the pool ${fmt(sc.llUni, 2)}; ${bKey} alone ${fmt(bs.ll, 2)}, #1 ${bs.top1}/${bs.n})`)
  sc.lines.forEach((l) => console.log(l))
  if (verbose) score(fit, w).lines.forEach((l) => console.log('  (fit)' + l))
  const wAll = fitSoftmax(all, def.feats.length, { l2: L2 })
  if (process.env.NOWEEK) continue
  // every season's weights fitted WITHOUT it (inside the fit seasons for the hold-out; across all seasons for the shipped numbers)
  const foldFit = new Map(folds.map(({ s, w: ww }) => [s.season, ww]))
  const foldAll = new Map(loo(all).map(({ s, w: ww }) => [s.season, ww]))
  const TcalAll = calT(all.map((s) => ({ s, w: foldAll.get(s.season) })))
  const tempOf = (ss, fm) => calT(ss.filter((s) => fm.has(s.season)).map((s) => ({ s, w: fm.get(s.season) })))

  // ---------- THE SEASON SO FAR: lines through week W, blended with last season by k games ----------
  // k is chosen on the fit seasons (weeks 3 and 6 together), then each week's temperature (each fit season scored with weights
  // fitted without it); HELD OUT scored once per week with the fit seasons' weights.
  let bestK = [null, Infinity]
  for (const k of BLENDS) {
    let loss = 0
    for (const wk of [3, 6]) {
      const ss = SEASONS.filter((s) => s < FIRST_TEST).map((s) => seasonRows(award, s, { week: wk, k })).filter(Boolean)
      const T = tempOf(ss, foldFit)
      for (const s of ss) { const p = softmax(s.rows, foldFit.get(s.season), T); const i = s.rows.findIndex((r) => r.key === s.winnerKey); loss -= Math.log(Math.max(i >= 0 ? p[i] : 0, 1e-9)) }
    }
    if (loss < bestK[1]) bestK = [k, loss]
  }
  const k = bestK[0]
  const TWall = {}, weekly = {}
  for (const wk of WEEKS) {
    if (def.rookies && wk === 0) continue   // a rookie has no line on opening night
    const ss = SEASONS.map((s) => seasonRows(award, s, { week: wk, k })).filter(Boolean)
    const sf = ss.filter((s) => s.season < FIRST_TEST), st = ss.filter((s) => s.season >= FIRST_TEST)
    const T = tempOf(sf, foldFit)
    const r = score(st, w, T)
    TWall[wk] = tempOf(ss, foldAll)
    weekly[wk] = { top1: r.top1, top3: r.top3, n: r.n, ll: Math.round(r.ll * 100) / 100, llUni: Math.round(r.llUni * 100) / 100 }
    console.log(`  WEEK ${wk}${wk ? '' : ' (opening night, last season\'s lines)'}: blend ${k} games, temperature ${T}; HELD OUT winner #1 ${r.top1}/${r.n}, top 3 ${r.top3}/${r.n}, log loss ${fmt(r.ll, 2)} (uniform ${fmt(r.llUni, 2)})`)
    if (verbose) r.lines.forEach((l) => console.log('  ' + l))
  }
  out[award] = { w: wAll.map((x) => Math.round(x * 1000) / 1000), T: TcalAll, k, TW: TWall, seasons: `${all[0].season}-${all.at(-1).season}`, heldOut: { end: `${sc.top1}/${sc.n} #1, ${sc.top3}/${sc.n} top 3, ll ${fmt(sc.ll, 2)} (uniform ${fmt(sc.llUni, 2)}, one stat ${fmt(bs.ll, 2)})`, weekly } }
}
console.log(`\nplayers whose club was not in the results (feature left at the pool mean): ${clubMiss}`)
console.log('\nAWARD_FITS =', JSON.stringify(out, null, 2))
