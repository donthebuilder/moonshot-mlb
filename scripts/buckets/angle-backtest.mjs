// BUCKETS' BOARD ANGLES, MEASURED, EVERY MARKET (2026-10-05, Donovan: "measure them against last
// year's data and preseason when starters are on the floor" -> "needs to be ran for all sports and
// all props"). Nothing is written but the result file.
//
//   node scripts/buckets/angle-backtest.mjs --cache <folder>     (ESPN reads are kept there)
//
// LAST SEASON (2025-26 regular season, ESPN season 2026), AS OF EACH NIGHT: every player's ESPN
// game log (the All-Star round robin and the Cup final left out -- they aren't season games). Each
// night, each player who played 10+ minutes (the grade's own void rule) is scored by the LIVE model
// -- lib/nba/model legsFor + scoreMarket(market) -- on games BEFORE that night only (this season so
// far, pooled with his 2024-25 line exactly as the board pools), against his opponent's numbers
// allowed so far. First basket needs each game's starters and first made field goal: read once per
// game from ESPN's summary and kept as those two facts only.
//   caveat: the population is who played 10+ minutes -- the board grades the same rows (a DNP or
//   under-10 row is void), but it scores the roster before tip, so the pool here is a little cleaner.
//
// PRESEASON, STARTERS ON THE FLOOR: buckets_log's graded rows (season_type 1) whose player STARTED
// and played 20+ minutes -- the board's own locked scores and percentiles.
//
// THE ANGLES, the same three rules for every market (fixed BEFORE measuring):
//   hiconf   the market's score 85+
//   aligned  his opponent allows the market's stat in the night's top third AND his volume leg
//            (VOLUME below) is in the night's 75th percentile
//   weak     on the board (top third) AND his opponent ranks top 10 of 30 in that stat allowed to
//            his position (G / F / C, per game, as of the night)
// Each: hits / n and the rate, beside the same market's board rows and everyone scored.
await import('../_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const { legsFor, scoreMarket, NBA_MARKETS } = await import('../../lib/nba/model.js')
const { easternDate } = await import('../../lib/data.js')

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const CACHE = arg('--cache')
if (!CACHE) { console.error('usage: --cache <folder>'); process.exit(2) }
fs.mkdirSync(CACHE, { recursive: true })
const UA = 'DASHNetwork/1.0'
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba'
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
async function get(url, key, reduce = (j) => j) {
  const f = path.join(CACHE, `${key}.json`)
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  for (let t = 0; t < 3; t += 1) {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } }).catch(() => null)
    if (r?.ok) { const j = reduce(await r.json()); fs.writeFileSync(f, JSON.stringify(j)); return j }
    await new Promise((res) => setTimeout(res, 800 * (t + 1)))
  }
  return null
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } })); return out }
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
const fam = (p) => { const s = String(p || '').toUpperCase().split(/[-/ ]/)[0]; return /G$/.test(s) ? 'G' : /F$/.test(s) ? 'F' : s === 'C' ? 'C' : null }

// per market: the stat (a box line -> number), the opponent's allowed stat, and the volume leg
const MK = {
  pts: { stat: (l) => l.pts, opp: 'pts', volume: 'fgaPg' },
  reb: { stat: (l) => l.reb, opp: 'reb', volume: 'rebPg' },
  ast: { stat: (l) => l.ast, opp: 'ast', volume: 'astPg' },
  '3pm': { stat: (l) => l.tpm, opp: 'tpm', volume: 'tpaPg' },
  pra: { stat: (l) => (l.pts == null ? null : l.pts + (l.reb || 0) + (l.ast || 0)), opp: 'pts', volume: 'fgaPg' },
  first: { stat: null, opp: 'pts', volume: 'fgaShare' },
}
const STATS = ['pts', 'reb', 'ast', 'tpm']

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
// a game's starters and its first made field goal (lib/nba/api firstBaskets' rule), nothing else kept
function firstFacts(s) {
  const starters = []
  for (const team of s?.boxscore?.players || []) for (const block of team.statistics || []) for (const a of block.athletes || []) if (a.starter === true) starters.push(String(a.athlete?.id || ''))
  let fg = null
  for (const p of s?.plays || []) { if (!p.scoringPlay || /free throw/i.test(String(p.type?.text || p.text || ''))) continue; fg = String(p.participants?.[0]?.athlete?.id || ''); break }
  return { starters, fg }
}

console.log('reading 2025-26 and 2024-25 season lines…')
const cur = await seasonLines(2026)
const prev = await seasonLines(2025)
console.log(`  ${cur.size} players 2025-26, ${prev.size} 2024-25; reading game logs…`)
const logs = new Map(await pool([...cur.keys()], 6, async (id) => [id, logRows(await get(`${WEB}/athletes/${id}/gamelog?season=2026`, `gamelog_2026_${id}`))]))

const games = new Map()
for (const [id, rows] of logs) for (const r of rows) {
  if (!games.has(r.gameId)) games.set(r.gameId, { date: r.date, opps: new Set(), lines: [] })
  const g = games.get(r.gameId); g.opps.add(r.opp); g.lines.push({ id, ...r })
}
for (const g of games.values()) { g.teams = [...g.opps]; for (const l of g.lines) l.team = g.teams.find((t) => t !== l.opp) || null }
const dates = [...new Set([...games.values()].map((g) => g.date))].sort()
console.log(`  ${games.size} games over ${dates.length} nights (${dates[0]} .. ${dates[dates.length - 1]}); reading first baskets…`)
const firsts = new Map(await pool([...games.keys()], 6, async (gid) => [gid, await get(`${SITE}/summary?event=${gid}`, `first_${gid}`, firstFacts)]))

const run = new Map()      // id -> running totals
const club = new Map()     // team -> { g, fga, allowed: {pts,reb,ast,tpm}, byPos: {G:{...},F:{...},C:{...}} }
const T = {}               // market -> angle -> [hits, n]
const add = (m, k, hit) => { T[m] ||= {}; T[m][k] ||= [0, 0]; T[m][k][1] += 1; if (hit) T[m][k][0] += 1 }
const zero = () => ({ pts: 0, reb: 0, ast: 0, tpm: 0 })
for (const d of dates) {
  const tonight = [...games.entries()].filter(([, g]) => g.date === d)
  const cands = []
  for (const [gid, g] of tonight) for (const l of g.lines) {
    if (!(l.min >= 10) || !l.team) continue
    const r = run.get(l.id)
    const c = r && r.gp ? { gp: r.gp, min: r.min / r.gp, pts: r.pts / r.gp, reb: r.reb / r.gp, ast: r.ast / r.gp, fga: r.fga / r.gp, fta: r.fta / r.gp, tpm: r.tpm / r.gp, tpa: r.tpa / r.gp, tpTot: r.tpm, tpaTot: r.tpa } : null
    const a = club.get(l.opp), own = club.get(l.team)
    const opp = a?.g ? { oppPts: a.allowed.pts / a.g, oppReb: a.allowed.reb / a.g, oppAst: a.allowed.ast / a.g, oppTpm: a.allowed.tpm / a.g } : null
    const f = firsts.get(gid)
    cands.push({ playerId: l.id, name: cur.get(l.id)?.name || l.id, team: l.team, opp: l.opp, gameId: gid, pos: fam(cur.get(l.id)?.pos), line: l,
      starter: Boolean(f?.starters?.includes(l.id)), firstFg: f?.fg ? f.fg === l.id : null,
      legs: legsFor(c, prev.get(l.id) || null, opp, { teamFga: own?.g ? own.fga / own.g : null }) })
  }
  if (cands.length) {
    for (const m of Object.keys(MK)) {
      const D = MK[m]
      const rows = scoreMarket(m, cands).filter((r) => r.score != null)
      if (!rows.length) continue
      const allowedPg = (t) => { const a = club.get(t); return a?.g ? a.allowed[D.opp] / a.g : null }
      const oppVals = [...new Set(rows.map((r) => r.opp))].map((t) => [t, allowedPg(t)]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])
      const soft = new Set(oppVals.slice(0, Math.ceil(oppVals.length / 3)).map(([t]) => t))
      const dvp = {}
      for (const f of ['G', 'F', 'C']) {
        const order = [...club.entries()].filter(([, a]) => a.g >= 5).map(([t, a]) => [t, a.byPos[f][D.opp] / a.g]).sort((a, b) => b[1] - a[1])
        dvp[f] = new Map(order.map(([t], i) => [t, i + 1]))
      }
      for (const r of rows) {
        const hit = m === 'first' ? r.firstFg : (D.stat(r.line) ?? 0) >= NBA_MARKETS[m].bar
        if (hit == null) continue
        add(m, 'all', hit)
        const onBoard = r.status === 'board' || r.status === 'called'
        if (onBoard) add(m, 'board', hit)
        if (r.status === 'called') add(m, 'called', hit)
        if (r.score >= 85) add(m, 'hiconf', hit)
        if (soft.has(r.opp) && (r.pct?.[D.volume] ?? 0) >= 75) add(m, 'aligned', hit)
        if (onBoard && r.pos && (dvp[r.pos].get(r.opp) ?? 99) <= 10) add(m, 'weak', hit)
      }
    }
  }
  for (const [, g] of tonight) {
    const tot = Object.fromEntries(g.teams.map((t) => [t, { ...zero(), fga: 0, byPos: { G: zero(), F: zero(), C: zero() } }]))
    for (const l of g.lines) {
      if (l.team && tot[l.team]) {
        const tt = tot[l.team], f = fam(cur.get(l.id)?.pos)
        for (const s of STATS) { tt[s] += l[s] || 0; if (f) tt.byPos[f][s] += l[s] || 0 }
        tt.fga += l.fga || 0
      }
      if (!(l.min > 0)) continue
      const r = run.get(l.id) || { gp: 0, min: 0, pts: 0, fga: 0, fta: 0, tpm: 0, tpa: 0, reb: 0, ast: 0 }
      r.gp += 1; for (const k of ['min', 'pts', 'fga', 'fta', 'tpm', 'tpa', 'reb', 'ast']) r[k] += l[k] || 0
      run.set(l.id, r)
    }
    for (const t of g.teams) {
      const o = g.teams.find((x) => x !== t)
      if (!o) continue
      const a = club.get(t) || { g: 0, fga: 0, allowed: zero(), byPos: { G: zero(), F: zero(), C: zero() } }
      a.g += 1; a.fga += tot[t].fga
      for (const s of STATS) { a.allowed[s] += tot[o][s]; for (const f of ['G', 'F', 'C']) a.byPos[f][s] += tot[o].byPos[f][s] }
      club.set(t, a)
    }
  }
}
const rate = ([h, n]) => ({ hits: h, n, rate: n ? Math.round(1000 * h / n) / 10 : null })
const markets = Object.fromEntries(Object.entries(T).map(([m, a]) => [m, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, rate(v)]))]))

// ── PRESEASON, STARTERS ON THE FLOOR (buckets_log), every market ──
let pre = null
try {
  const { adminClient } = await import('../../lib/supabase/admin.js')
  const db = adminClient()
  if (db) {
    const { data, error } = await db.from('buckets_log').select('game_date, market, model_version, opp, pos, starter, minutes, hit, score, status, pct, legs')
      .in('model_version', Object.values(NBA_MARKETS).map((x) => x.version)).eq('season_type', 1).not('graded_at', 'is', null)
    if (error) throw new Error(error.message)
    const rows = (data || []).filter((r) => r.starter === true && Number(r.minutes) >= 20 && r.hit != null)
    pre = { rows: rows.length, nights: new Set(rows.map((r) => r.game_date)).size, markets: {} }
    for (const r of rows) {
      const m = r.market === 'first_fg' ? 'first' : r.market
      const P = (pre.markets[m] ||= { all: [0, 0], hiconf: [0, 0] })
      P.all[1] += 1; if (r.hit) P.all[0] += 1
      if (r.score >= 85) { P.hiconf[1] += 1; if (r.hit) P.hiconf[0] += 1 }
    }
    for (const m of Object.keys(pre.markets)) pre.markets[m] = Object.fromEntries(Object.entries(pre.markets[m]).map(([k, v]) => [k, rate(v)]))
  }
} catch (e) { pre = { error: String(e?.message || e) } }

// an angle EARNS its place when it beats the same market's board rows
const verdict = (x, base) => (x && base && x.n >= 30 && x.rate > base.rate ? 'edge' : 'no edge')
for (const [m, a] of Object.entries(markets)) for (const k of ['hiconf', 'aligned', 'weak']) if (a[k]) a[k].verdict = verdict(a[k], a.board)
const out = {
  built_at: new Date().toISOString(),
  method: "Last season: every 2025-26 regular-season night replayed as of that night -- the live model (legsFor + scoreMarket per market) on games before it only, pooled with 2024-25 as the board pools; population = who played 10+ minutes; first basket from each game's starters and first made field goal (ESPN summaries). Preseason: buckets_log rows, starters who played 20+ minutes. Rules fixed before measuring: hiconf = score 85+; aligned = opponent allows the market's stat in the night's top third AND his volume leg 75th percentile+; weak = on the board AND his opponent top 10 of 30 in that stat allowed to his position (G/F/C). An angle has an edge when it beats the market's board rows (30+ rows).",
  lastSeason: { season: '2025-26', nights: dates.length, games: games.size, markets },
  preseason: pre,
}
fs.writeFileSync(new URL('../../lib/nba/angleBacktest.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`)
const cell = (x) => (x ? `${x.hits}/${x.n}=${x.rate}%${x.verdict ? ` ${x.verdict === 'edge' ? '✓' : '✗'}` : ''}` : '—')
console.log(`LAST SEASON ${dates.length} nights, ${games.size} games`)
for (const [m, a] of Object.entries(markets)) console.log(`  ${m.padEnd(6)} board ${cell(a.board)} · all ${cell(a.all)} · hiconf ${cell(a.hiconf)} · aligned ${cell(a.aligned)} · weak ${cell(a.weak)}`)
console.log(`PRESEASON starters 20+ min: ${pre?.error || `${pre?.rows} rows over ${pre?.nights} nights`}`)
