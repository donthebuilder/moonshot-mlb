// BUCKETS' BOARD ANGLES, MEASURED (2026-10-05, Donovan: "measure them against last year's data
// and preseason when starters are on the floor"). Nothing is written but the result file.
//
//   node scripts/buckets/angle-backtest.mjs --cache <folder>     (ESPN reads are kept there)
//
// LAST SEASON (2025-26 regular season, ESPN season 2026), AS OF EACH NIGHT: every player's ESPN
// game log, the All-Star round robin and the Cup final left out (they aren't season games). For
// each night, each player who played 10+ minutes (the grade's own void rule) is scored by the LIVE
// model -- lib/nba/model legsFor + scoreMarket('pts') -- on numbers from games BEFORE that night
// only (this season so far, pooled with his 2024-25 line exactly as the board pools), against his
// opponent's points allowed so far. Then each angle is checked against PTS 25+ that night.
//   caveat: the population is who played 10+ minutes -- the board grades the same rows (a DNP or
//   under-10 row is void), but it scores the roster before tip, so the pool here is a little cleaner.
//
// PRESEASON, STARTERS ON THE FLOOR: buckets_log's graded points rows (season_type 1) whose player
// STARTED and played 20+ minutes -- the board's own locked scores, legs and percentiles.
//
// THE ANGLES (rules picked BEFORE looking, from LAMP's three and the board's own legs):
//   hiconf   score 85+
//   aligned  his opponent allows points in the night's top third AND his shots (fgaPg) are in the
//            75th percentile of the night
//   weak     his opponent gives up the most points to his position (G / F / C, per game, as of the
//            night) -- top 10 of 30 -- and he is ON THE BOARD (top third)
// Each: n, hits, rate vs the base rate of the same population (and of the board's rows).
await import('../_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const { legsFor, scoreMarket } = await import('../../lib/nba/model.js')
const { easternDate } = await import('../../lib/data.js')

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const CACHE = arg('--cache')
if (!CACHE) { console.error('usage: --cache <folder>'); process.exit(2) }
fs.mkdirSync(CACHE, { recursive: true })
const UA = 'DASHNetwork/1.0'
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba'
async function get(url, key) {
  const f = path.join(CACHE, `${key}.json`)
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  for (let t = 0; t < 3; t += 1) {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } }).catch(() => null)
    if (r?.ok) { const j = await r.json(); fs.writeFileSync(f, JSON.stringify(j)); return j }
    await new Promise((res) => setTimeout(res, 800 * (t + 1)))
  }
  return null
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } })); return out }
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
const fam = (p) => { const s = String(p || '').toUpperCase().split(/[-/ ]/)[0]; return /G$/.test(s) ? 'G' : /F$/.test(s) ? 'F' : s === 'C' ? 'C' : null }

// ── every player of a season, with his season line (byathlete) ──
async function seasonLines(season) {
  const out = new Map()
  for (let page = 1; page <= 20; page += 1) {
    const j = await get(`${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&season=${season}&seasontype=2&limit=50&page=${page}`, `byathlete_${season}_${page}`)
    if (!j) break
    const namesOf = Object.fromEntries((j.categories || []).map((c) => [c.name, c.names || []]))
    for (const a of j.athletes || []) {
      const v = {}
      for (const c of a.categories || []) (namesOf[c.name] || []).forEach((n, i) => { v[n] = num((c.totals || c.values || [])[i]) })
      out.set(String(a.athlete?.id), { id: String(a.athlete?.id), name: a.athlete?.displayName, pos: a.athlete?.position?.abbreviation || null,
        gp: v.gamesPlayed, min: v.avgMinutes, pts: v.avgPoints, reb: v.avgRebounds, ast: v.avgAssists, fga: v.avgFieldGoalsAttempted, fta: v.avgFreeThrowsAttempted,
        tpm: v.avgThreePointFieldGoalsMade, tpa: v.avgThreePointFieldGoalsAttempted, tpTot: v.threePointFieldGoalsMade, tpaTot: v.threePointFieldGoalsAttempted })
    }
    if (page >= (j.pagination?.pages || 1)) break
  }
  return out
}

const NOT_SEASON = /all-star|cup\s*-\s*(championship|final)/i
function logRows(j) {
  const names = j?.names || []
  const at = (k) => names.indexOf(k)
  const out = []
  for (const st of j?.seasonTypes || []) {
    if (!/regular/i.test(st.displayName || '')) continue
    for (const cat of st.categories || []) for (const ev of cat.events || []) {
      const m = j.events?.[ev.eventId] || {}
      if (NOT_SEASON.test(m.eventNote || '')) continue
      const s = ev.stats || []
      const g = (k) => (at(k) >= 0 ? s[at(k)] : null)
      const pair = (x) => { const r = /^(\d+)-(\d+)$/.exec(String(x || '')); return r ? [Number(r[1]), Number(r[2])] : [null, null] }
      const [, fga] = pair(g('fieldGoalsMade-fieldGoalsAttempted')), [tpm, tpa] = pair(g('threePointFieldGoalsMade-threePointFieldGoalsAttempted')), [, fta] = pair(g('freeThrowsMade-freeThrowsAttempted'))
      out.push({ gameId: String(ev.eventId), date: m.gameDate ? easternDate(Date.parse(m.gameDate)) : null, opp: m.opponent?.abbreviation || null,
        min: num(g('minutes')), pts: num(g('points')), reb: num(g('totalRebounds')), ast: num(g('assists')), fga, fta, tpm, tpa })
    }
  }
  return out.filter((r) => r.date)
}

console.log('reading 2025-26 and 2024-25 season lines…')
const cur = await seasonLines(2026)
const prev = await seasonLines(2025)
console.log(`  ${cur.size} players 2025-26, ${prev.size} 2024-25; reading game logs…`)
const ids = [...cur.keys()]
const logs = new Map(await pool(ids, 6, async (id) => [id, logRows(await get(`${WEB}/athletes/${id}/gamelog?season=2026`, `gamelog_2026_${id}`))]))

// every player-game, and each game's two clubs (the opponent abbreviations seen in it)
const games = new Map()   // gameId -> { date, teams:Set, lines:[{id, opp, ...}] }
for (const [id, rows] of logs) for (const r of rows) {
  if (!games.has(r.gameId)) games.set(r.gameId, { date: r.date, opps: new Set(), lines: [] })
  const g = games.get(r.gameId); g.opps.add(r.opp); g.lines.push({ id, ...r })
}
for (const g of games.values()) { g.teams = [...g.opps]; for (const l of g.lines) l.team = g.teams.find((t) => t !== l.opp) || null }
const dates = [...new Set([...games.values()].map((g) => g.date))].sort()
console.log(`  ${games.size} games over ${dates.length} nights (${dates[0]} .. ${dates[dates.length - 1]})`)

// running, as-of-the-night totals: each player's line, each club's points allowed (in all, and by position)
const run = new Map()      // id -> { gp, min, pts, fga, fta, tpm, tpa, reb, ast }
const allowed = new Map()  // team -> { g, pts, G, F, C }
const tally = { hiconf: [0, 0], aligned: [0, 0], weak: [0, 0], all: [0, 0], board: [0, 0], hiconfBoard: [0, 0] }
const add = (k, hit) => { tally[k][1] += 1; if (hit) tally[k][0] += 1 }
for (const d of dates) {
  const tonight = [...games.entries()].filter(([, g]) => g.date === d)
  // 1. score tonight on the numbers BEFORE tonight
  const cands = []
  for (const [gid, g] of tonight) for (const l of g.lines) {
    if (!(l.min >= 10) || !l.team) continue
    const r = run.get(l.id)
    const c = r && r.gp ? { gp: r.gp, min: r.min / r.gp, pts: r.pts / r.gp, reb: r.reb / r.gp, ast: r.ast / r.gp, fga: r.fga / r.gp, fta: r.fta / r.gp, tpm: r.tpm / r.gp, tpa: r.tpa / r.gp, tpTot: r.tpm, tpaTot: r.tpa } : null
    const a = allowed.get(l.opp)
    const opp = a && a.g ? { oppPts: a.pts / a.g } : null
    cands.push({ playerId: l.id, name: cur.get(l.id)?.name || l.id, team: l.team, opp: l.opp, gameId: gid, pos: fam(cur.get(l.id)?.pos), actual: l.pts, legs: legsFor(c, prev.get(l.id) || null, opp) })
  }
  const rows = scoreMarket('pts', cands).filter((r) => r.score != null)
  if (rows.length) {
    // the night's opponents by points allowed: top third
    const oppVals = [...new Set(rows.map((r) => r.opp))].map((t) => [t, allowed.get(t)?.g ? allowed.get(t).pts / allowed.get(t).g : null]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])
    const softOpp = new Set(oppVals.slice(0, Math.ceil(oppVals.length / 3)).map(([t]) => t))
    // points allowed to each position, per game, as of tonight: rank 1..30
    const dvp = {}
    for (const f of ['G', 'F', 'C']) {
      const order = [...allowed.entries()].filter(([, a]) => a.g >= 5).map(([t, a]) => [t, a[f] / a.g]).sort((a, b) => b[1] - a[1])
      dvp[f] = new Map(order.map(([t], i) => [t, i + 1]))
    }
    for (const r of rows) {
      const hit = r.actual >= 25
      add('all', hit)
      const onBoard = r.status === 'board' || r.status === 'called'
      if (onBoard) add('board', hit)
      if (r.score >= 85) { add('hiconf', hit); if (onBoard) add('hiconfBoard', hit) }
      if (softOpp.has(r.opp) && (r.pct?.fgaPg ?? 0) >= 75) add('aligned', hit)
      if (onBoard && r.pos && (dvp[r.pos].get(r.opp) ?? 99) <= 10) add('weak', hit)
    }
  }
  // 2. then fold tonight into the running totals
  for (const [, g] of tonight) {
    const score = Object.fromEntries(g.teams.map((t) => [t, 0]))
    const byPos = Object.fromEntries(g.teams.map((t) => [t, { G: 0, F: 0, C: 0 }]))
    for (const l of g.lines) {
      if (l.team) { score[l.team] = (score[l.team] || 0) + (l.pts || 0); const f = fam(cur.get(l.id)?.pos); if (f) byPos[l.team][f] += l.pts || 0 }
      if (!(l.min > 0)) continue
      const r = run.get(l.id) || { gp: 0, min: 0, pts: 0, fga: 0, fta: 0, tpm: 0, tpa: 0, reb: 0, ast: 0 }
      r.gp += 1; for (const k of ['min', 'pts', 'fga', 'fta', 'tpm', 'tpa', 'reb', 'ast']) r[k] += l[k] || 0
      run.set(l.id, r)
    }
    for (const t of g.teams) {
      const other = g.teams.find((x) => x !== t)
      if (!other) continue
      const a = allowed.get(t) || { g: 0, pts: 0, G: 0, F: 0, C: 0 }
      a.g += 1; a.pts += score[other] || 0; for (const f of ['G', 'F', 'C']) a[f] += byPos[other]?.[f] || 0
      allowed.set(t, a)
    }
  }
}
const rate = ([h, n]) => ({ hits: h, n, rate: n ? Math.round(1000 * h / n) / 10 : null })
const last = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, rate(v)]))

// ── PRESEASON, STARTERS ON THE FLOOR (buckets_log) ──
let pre = null
try {
  const { adminClient } = await import('../../lib/supabase/admin.js')
  const db = adminClient()
  if (db) {
    const { data } = await db.from('buckets_log').select('game_id, game_date, team, opp, pos, starter, minutes, actual, hit, score, status, pct, legs')
      .eq('market', 'pts').eq('model_version', 'buckets-pts-v1').eq('season_type', 1).not('graded_at', 'is', null)
    const rows = (data || []).filter((r) => r.starter === true && Number(r.minutes) >= 20 && r.hit != null)
    const t = { all: [0, 0], hiconf: [0, 0], aligned: [0, 0], weak: [0, 0] }
    const byDate = new Map(); for (const r of rows) { if (!byDate.has(r.game_date)) byDate.set(r.game_date, []); byDate.get(r.game_date).push(r) }
    // weak: last season's final points-allowed-by-position table (preseason has none of its own)
    const dvp = {}
    for (const f of ['G', 'F', 'C']) { const order = [...allowed.entries()].map(([tm, a]) => [tm, a[f] / a.g]).sort((a, b) => b[1] - a[1]); dvp[f] = new Map(order.map(([tm], i) => [tm, i + 1])) }
    for (const list of byDate.values()) {
      const opps = [...new Set(list.map((r) => r.opp))].map((o) => [o, list.find((r) => r.opp === o)?.legs?.oppPts]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])
      const soft = new Set(opps.slice(0, Math.ceil(opps.length / 3)).map(([o]) => o))
      for (const r of list) {
        const ad = (k) => { t[k][1] += 1; if (r.hit) t[k][0] += 1 }
        ad('all')
        if (r.score >= 85) ad('hiconf')
        if (soft.has(r.opp) && (r.pct?.fgaPg ?? 0) >= 75) ad('aligned')
        if ((r.status === 'board' || r.status === 'called') && fam(r.pos) && (dvp[fam(r.pos)].get(r.opp) ?? 99) <= 10) ad('weak')
      }
    }
    pre = { nights: byDate.size, rows: rows.length, ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, rate(v)])) }
  }
} catch (e) { pre = { error: String(e?.message || e) } }

const out = {
  built_at: new Date().toISOString(),
  method: "Last season: every 2025-26 regular-season night replayed as of that night -- the live model (legsFor + scoreMarket 'pts') on games before it only, pooled with 2024-25 as the board pools; population = who played 10+ minutes. Preseason: buckets_log points rows, starters who played 20+ minutes. Hit = 25+ points. Rules fixed before measuring: hiconf = score 85+; aligned = opponent allows points in the night's top third AND shots (fgaPg) 75th percentile+; weak = on the board AND his opponent ranks top 10 of 30 in points allowed to his position (G/F/C).",
  lastSeason: { season: '2025-26', nights: dates.length, games: games.size, ...last },
  preseason: pre,
}
fs.writeFileSync(new URL('../../lib/nba/angleBacktest.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`)
const line = (k, x) => (x ? `  ${k.padEnd(12)} ${x.hits}/${x.n} = ${x.rate}%` : `  ${k}: —`)
console.log(`LAST SEASON ${out.lastSeason.nights} nights`); for (const k of ['all', 'board', 'hiconf', 'hiconfBoard', 'aligned', 'weak']) console.log(line(k, last[k]))
console.log(`PRESEASON (starters, 20+ min) ${pre?.nights ?? 0} nights, ${pre?.rows ?? 0} rows${pre?.error ? ` -- ${pre.error}` : ''}`); if (pre && !pre.error) for (const k of ['all', 'hiconf', 'aligned', 'weak']) console.log(line(k, pre[k]))
