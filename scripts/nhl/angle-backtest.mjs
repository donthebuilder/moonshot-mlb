// LAMP'S BOARD ANGLES, MEASURED, EVERY MARKET (2026-10-05, Donovan: "needs to be ran for all sports
// and all props"). Nothing is written but the result file.
//
//   node scripts/nhl/angle-backtest.mjs --cache <folder>      (NHL stats reads are kept there)
//
// LAST SEASON (2025-26 regular season), AS OF EACH NIGHT: the NHL stats per-game reports (skaters,
// goalies, penalty kill) for the whole season, folded night by night. Each night, every skater who
// dressed is scored by the LIVE pure models -- goalModel pooledLegs + scoreNight (GOAL), sogLegs +
// scoreSogNight (SOG, 3+ shots), pointRates + ptsLegs / astLegs + scorePtsNight / scoreAstNight (PTS
// 1+, AST 1+), scoreGoalPosNight (the goal-position shadow) -- on his games BEFORE that night pooled
// with his 2024-25 line exactly as the board pools; his opponent's goals allowed, shots against per
// 60 and penalty kill likewise as of the night. v2 rules for these dates (no rookie prior), as live.
//   caveats: the population is who dressed (live scores the roster until the lineup posts); live
//   read opponent GA/G and SA/60 from today's tables, so this replay is cleaner than what ran.
//
// THE ANGLES are components/lamp/tabs/Board.js lampAngles, copied (that file is React):
//   aligned  soft opponent (GOAL/PTS/AST: goals allowed; SOG: shots allowed per 60) in the night's top
//            third AND shots per game in the 75th percentile -- PTS / AST rows carry no shots leg,
//            so aligned can't fire there (said in the output)
//   hiconf   score 85+          weak  PP goals this season + opponent's PK in the night's weakest third
//   pp       PP goals > 0       soft  the soft opponent alone
//   rested   opponent on a back-to-back      mins  ice time in the night's top quarter
// Population = the board's own (status not 'off'), as the angle row counts it. Base = the same.
await import('../_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const G = await import('../../lib/nhl/goalModel.js')
const S = await import('../../lib/nhl/sogModel.js')
const P = await import('../../lib/nhl/ptsModel.js')
const A = await import('../../lib/nhl/astModel.js')
const GP = await import('../../lib/nhl/goalPosModel.js')

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const CACHE = arg('--cache')
if (!CACHE) { console.error('usage: --cache <folder>'); process.exit(2) }
fs.mkdirSync(CACHE, { recursive: true })
const STATS = 'https://api.nhle.com/stats/rest/en'
async function get(url, key) {
  const f = path.join(CACHE, `${key}.json`)
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  for (let t = 0; t < 3; t += 1) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } }).catch(() => null)
    if (r?.ok) { const j = await r.json(); fs.writeFileSync(f, JSON.stringify(j)); return j }
    await new Promise((res) => setTimeout(res, 1000 * (t + 1)))
  }
  throw new Error(`failed: ${url}`)
}
const rep = (kind, cay, isGame, key) => get(`${STATS}/${kind}?isAggregate=false&isGame=${isGame}&start=0&limit=-1&cayenneExp=${encodeURIComponent(cay)}`, key).then((j) => j?.data || [])
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const dayBefore = (d) => new Date(Date.parse(`${d}T12:00:00Z`) - 864e5).toISOString().slice(0, 10)
const CUR = 20252026, PREV = 20242025
const MONTHS = [['2025-10-01', '2025-11-01'], ['2025-11-01', '2025-12-01'], ['2025-12-01', '2026-01-01'], ['2026-01-01', '2026-02-01'], ['2026-02-01', '2026-03-01'], ['2026-03-01', '2026-04-01'], ['2026-04-01', '2026-05-01']]
const span = ([a, b]) => `seasonId=${CUR} and gameTypeId=2 and gameDate>="${a}" and gameDate<"${b}"`

console.log('reading 2025-26 per-game reports and 2024-25 lines…')
const skaters = (await Promise.all(MONTHS.map((m) => rep('skater/summary', span(m), true, `sk_${m[0]}`)))).flat()
const goalies = (await Promise.all(MONTHS.map((m) => rep('goalie/summary', span(m), true, `go_${m[0]}`)))).flat()
const pk = (await Promise.all(MONTHS.map((m) => rep('team/penaltykill', span(m), true, `pk_${m[0]}`)))).flat()
const teams = await get(`${STATS}/team`, 'teams').then((j) => new Map((j?.data || []).map((t) => [Number(t.id), t.triCode])))
const prevSk = new Map((await rep('skater/summary', `seasonId=${PREV} and gameTypeId=2`, false, 'sk_prev')).map((r) => [Number(r.playerId), { gp: n(r.gamesPlayed), g: n(r.goals), a: n(r.assists), pts: n(r.points), shots: n(r.shots), toi: n(r.timeOnIcePerGame) }]))
const prevGo = await rep('goalie/summary', `seasonId=${PREV} and gameTypeId=2`, false, 'go_prev')
// last season's goalies by club (the last club listed), for SA/60 before this season has 5 hours in net
const prevGoBy = new Map()
for (const g of prevGo) { const t = String(g.teamAbbrevs || '').split(',').pop().trim(); if (!prevGoBy.has(t)) prevGoBy.set(t, []); prevGoBy.get(t).push({ sa: n(g.shotsAgainst), toi: n(g.timeOnIce) }) }

const nights = [...new Set(skaters.map((r) => r.gameDate))].sort()
const byNight = new Map(nights.map((d) => [d, skaters.filter((r) => r.gameDate === d)]))
const goBy = new Map(); for (const g of goalies) { const k = g.gameDate; if (!goBy.has(k)) goBy.set(k, []); goBy.get(k).push(g) }
const pkBy = new Map(); for (const p of pk) { const k = p.gameDate; if (!pkBy.has(k)) pkBy.set(k, []); pkBy.get(k).push(p) }
const played = new Set(skaters.map((r) => `${r.teamAbbrev}|${r.gameDate}`))
console.log(`  ${skaters.length} skater-games over ${nights.length} nights (${nights[0]} .. ${nights[nights.length - 1]})`)

const runP = new Map()   // playerId -> { gp, g, a, pts, shots, toiSum, ppg }
const runT = new Map()   // team -> { gp, ga, sa, saSecs, tsh, ppga }
const T = {}
const add = (m, k, hit) => { T[m] ||= {}; T[m][k] ||= [0, 0]; T[m][k][1] += 1; if (hit) T[m][k][0] += 1 }
function cut(vals, q) { const v = vals.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) * q)] : Infinity }
for (const d of nights) {
  const rows = byNight.get(d)
  const teamT = (t) => runT.get(t) || { gp: 0, ga: 0, sa: 0, saSecs: 0, tsh: 0, ppga: 0 }
  const oppGa = (t) => { const x = teamT(t); return x.gp ? x.ga / x.gp : null }
  const oppSa = (t) => S.saPer60(teamT(t).saSecs ? [{ sa: teamT(t).sa, toi: teamT(t).saSecs }] : [], prevGoBy.get(t) || [])
  const pkPct = (t) => { const x = teamT(t); return x.tsh ? 1 - x.ppga / x.tsh : null }
  const b2b = (t) => played.has(`${t}|${dayBefore(d)}`)
  // candidates: every skater who dressed tonight, on his numbers before tonight
  const cands = rows.map((r) => {
    const id = Number(r.playerId), c = runP.get(id)
    const cur = c ? { gp: c.gp, g: c.g, a: c.a, pts: c.pts, shots: c.shots, toi: c.gp ? c.toiSum / c.gp : 0 } : null
    const prev = prevSk.get(id) || null
    const legs = G.pooledLegs(cur, prev, null)
    return { gameId: r.gameId, playerId: id, name: r.skaterFullName, pos: r.positionCode, team: r.teamAbbrev, opp: r.opponentTeamAbbrev, home: r.homeRoad === 'H',
      legs, rates: P.pointRates(legs, cur, prev), ppg: c?.ppg || 0, actual: r, context: { oppGaPg: oppGa(r.opponentTeamAbbrev) } }
  })
  const markets = {
    GOAL: { rows: G.scoreNight(cands), hit: (a) => n(a.goals) >= 1 },
    SOG: { rows: S.scoreSogNight(cands.map((c) => ({ ...c, legs: S.sogLegs(c.legs, oppSa(c.opp)), context: { ...c.context, oppSaPg: oppSa(c.opp) } }))), hit: (a) => n(a.shots) >= S.BAR, soft: (r) => r.legs?.oppSaPg },
    PTS: { rows: P.scorePtsNight(cands.map((c) => ({ ...c, legs: P.ptsLegs(c.legs, c.rates, c.context.oppGaPg) }))), hit: (a) => n(a.points) >= 1 },
    AST: { rows: A.scoreAstNight(cands.map((c) => ({ ...c, legs: A.astLegs(c.legs, c.rates, c.context.oppGaPg) }))), hit: (a) => n(a.assists) >= 1 },
    GOALPOS: { rows: GP.scoreGoalPosNight(cands), hit: (a) => n(a.goals) >= 1, toi: (r) => r.legs?.toiSec },
  }
  for (const [m, M] of Object.entries(markets)) {
    const flat = M.rows.filter((r) => r.status !== 'off' && r.score != null)
    const soft = M.soft || ((r) => r.context?.oppGaPg)
    const toi = M.toi || ((r) => r.legs?.toi)
    const softCut = cut(flat.map(soft), 2 / 3), toiCut = cut(flat.map(toi), 0.75)
    const pkCut = cut([...new Set(flat.map((r) => r.opp))].map(pkPct), 1 / 3)
    for (const r of M.rows) {
      if (r.score == null) continue
      const hit = M.hit(r.actual)
      add(m, 'all', hit)
      if (r.status === 'off') continue
      add(m, 'board', hit)
      if (r.status === 'called') add(m, 'called', hit)
      const isSoft = Number.isFinite(soft(r)) && soft(r) >= softCut
      if (isSoft && Number(r.pct?.shotsPg) >= 75) add(m, 'aligned', hit)
      if (Number(r.score) >= 85) add(m, 'hiconf', hit)
      const opk = pkPct(r.opp)
      if (r.ppg > 0 && Number.isFinite(opk) && opk <= pkCut) add(m, 'weak', hit)
      if (r.ppg > 0) add(m, 'pp', hit)
      if (isSoft) add(m, 'soft', hit)
      if (b2b(r.opp)) add(m, 'rested', hit)
      if (Number.isFinite(toi(r)) && toi(r) >= toiCut) add(m, 'mins', hit)
    }
  }
  // fold tonight in
  const gaBy = new Map()
  for (const r of rows) {
    const id = Number(r.playerId), c = runP.get(id) || { gp: 0, g: 0, a: 0, pts: 0, shots: 0, toiSum: 0, ppg: 0 }
    c.gp += 1; c.g += n(r.goals); c.a += n(r.assists); c.pts += n(r.points); c.shots += n(r.shots); c.toiSum += n(r.timeOnIcePerGame); c.ppg += n(r.ppGoals)
    runP.set(id, c)
    gaBy.set(r.opponentTeamAbbrev, (gaBy.get(r.opponentTeamAbbrev) || 0) + n(r.goals))
  }
  const teamsTonight = new Set(rows.map((r) => r.teamAbbrev))
  for (const t of teamsTonight) { const x = teamT(t); x.gp += 1; x.ga += gaBy.get(t) || 0; runT.set(t, x) }
  for (const g of goBy.get(d) || []) { const x = teamT(g.teamAbbrev); x.sa += n(g.shotsAgainst); x.saSecs += n(g.timeOnIce); runT.set(g.teamAbbrev, x) }
  for (const p of pkBy.get(d) || []) { const t = teams.get(Number(p.teamId)); if (!t) continue; const x = teamT(t); x.tsh += n(p.timesShorthanded); x.ppga += n(p.ppGoalsAgainst); runT.set(t, x) }
}
const rate = ([h, k]) => ({ hits: h, n: k, rate: k ? Math.round(1000 * h / k) / 10 : null })
const markets = Object.fromEntries(Object.entries(T).map(([m, a]) => [m, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, rate(v)]))]))
const ANGLES = ['aligned', 'hiconf', 'weak', 'pp', 'soft', 'rested', 'mins']
for (const a of Object.values(markets)) for (const k of ANGLES) if (a[k]) a[k].verdict = a[k].n >= 30 && a[k].rate > a.board.rate ? 'edge' : 'no edge'
const out = {
  built_at: new Date().toISOString(),
  method: "2025-26 regular season replayed as of each night from the NHL stats per-game reports: every dressed skater scored by the live pure models (GOAL, SOG 3+, PTS 1+, AST 1+, the goal-position shadow) on games before the night pooled with 2024-25 as the board pools; opponent GA/G, SA/60 and PK% as of the night. Angles = components/lamp/tabs/Board.js lampAngles' rules over the board's own population (status not off). An angle has an edge when it beats that market's board rows (30+ rows). PTS / AST rows carry no shots leg, so aligned can't fire there.",
  lastSeason: { season: '2025-26', nights: nights.length, skaterGames: skaters.length, markets },
}
fs.writeFileSync(new URL('../../lib/nhl/angleBacktest.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`)
const cell = (x) => (x ? `${x.rate}%${x.verdict ? (x.verdict === 'edge' ? '✓' : '✗') : ''} (${x.n})` : '—')
console.log(`LAST SEASON ${nights.length} nights`)
for (const [m, a] of Object.entries(markets)) console.log(`  ${m.padEnd(8)} board ${cell(a.board)} | ${ANGLES.map((k) => `${k} ${cell(a[k])}`).join(' | ')}`)
