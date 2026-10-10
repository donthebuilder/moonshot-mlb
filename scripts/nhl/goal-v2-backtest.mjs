// LAMP GOAL BOARD v2 CANDIDATE, BACKTESTED (2026-10-10, .claude-notes/LAMP-GOAL-V4-DEFINITION.md).
// Nothing is written but the result JSON. No paid feed: the NHL stats per-game reports (free), the
// lamp_shots archive and the lamp_team_game_xg table (our own).
//
//   node scripts/nhl/goal-v2-backtest.mjs --cache <folder> --data <folder> [--pull] [--out file.json]
//     --cache  NHL stats reads are kept here (same cache as scripts/nhl/angle-backtest.mjs)
//     --data   lamp_shots.json + lamp_team_game_xg.json (written by --pull from Supabase; env never printed)
//
// EVERY NIGHT IS SCORED ONLY FROM DATA BEFORE THE NIGHT (as-of): the skater, goalie and penalty reports
// folded night by night, 2024-25 pooled the way the live board pools, the shot archive and the club-game
// table windowed to games before the night's date. One fold is clean: the xG curve and the team model
// were fitted/tuned on games up to 2026-02-01, so the TEST window is 2026-02-01 onward and the new
// model's weights are fitted on the nights before it. The reverse fold (fit on the test window, score
// the early nights) is printed too, with the caveat that the xG curve has seen those nights.
//
// THE QUESTION: does a combiner built from the baseline legs + individual xG + the team model's goals
// tonight (+ ice, rest, penalties) choose better CALLED / ON THE BOARD skaters than the live score
// (the mean percentile of shots/GP, goals/GP and TOI/GP), by more than the noise? Noise = paired
// bootstrap over NIGHTS (the same nights, both models).
await import('../_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const G = await import('../../lib/nhl/goalModel.js')
const TP = await import('../../lib/nhl/teamProj.js')
const XG = await import('../../lib/nhl/xg.js')
const MODEL = (await import('../../lib/nhl/teamProjV1.js')).default

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const CACHE = arg('--cache'); const DATA = arg('--data'); const OUT = arg('--out')
if (!CACHE || !DATA) { console.error('usage: --cache <folder> --data <folder> [--pull] [--out file]'); process.exit(2) }
fs.mkdirSync(CACHE, { recursive: true }); fs.mkdirSync(DATA, { recursive: true })

// ── the archive (our own tables), pulled once ─────────────────────────────
if (process.argv.includes('--pull')) {
  const envText = fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
  const envOf = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.replace(/^["']|["']$/g, '')
  const url = envOf('NEXT_PUBLIC_SUPABASE_URL') || envOf('SUPABASE_URL'); const key = envOf('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) { console.error('--pull needs the Supabase env names in .env.local'); process.exit(2) }
  const pull = async (table, select, order) => {
    let rows = []; let from = 0
    for (;;) {
      const r = await fetch(`${url}/rest/v1/${table}?select=${select}&order=${order}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } })
      if (!r.ok) throw new Error(`${table} ${r.status}`)
      const j = await r.json(); rows = rows.concat(j); if (j.length < 1000) break; from += 1000
    }
    fs.writeFileSync(path.join(DATA, `${table}.json`), JSON.stringify(rows)); console.log(`pulled ${table}: ${rows.length}`)
  }
  await pull('lamp_shots', 'game_id,game_date,season,game_type,player_id,team,goalie_id,x,y,zone,shot_type,result,strength,situation_code', 'game_id,event_id')
  await pull('lamp_team_game_xg', '*', 'game_date,game_id,team')
}
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'))
const SHOTS = readJson('lamp_shots.json'); const TEAMROWS = readJson('lamp_team_game_xg.json')

// ── the league's per-game reports (cached) ────────────────────────────────
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
const CUR = 20252026; const PREV = 20242025
const MONTHS = [['2025-10-01', '2025-11-01'], ['2025-11-01', '2025-12-01'], ['2025-12-01', '2026-01-01'], ['2026-01-01', '2026-02-01'], ['2026-02-01', '2026-03-01'], ['2026-03-01', '2026-04-01'], ['2026-04-01', '2026-05-01']]
const span = ([a, b]) => `seasonId=${CUR} and gameTypeId=2 and gameDate>="${a}" and gameDate<"${b}"`
const cat = async (kind, tag) => (await Promise.all(MONTHS.map((m) => rep(kind, span(m), true, `${tag}_${m[0]}`)))).flat()
console.log('reading 2025-26 per-game reports…')
const skaters = await cat('skater/summary', 'sk')
const toiRows = await cat('skater/timeonice', 'toi')
const goalies = await cat('goalie/summary', 'go')
const pk = await cat('team/penaltykill', 'pk')
const teams = await get(`${STATS}/team`, 'teams').then((j) => new Map((j?.data || []).map((t) => [Number(t.id), t.triCode])))
const prevSk = new Map((await rep('skater/summary', `seasonId=${PREV} and gameTypeId=2`, false, 'sk_prev')).map((r) => [Number(r.playerId), { gp: n(r.gamesPlayed), g: n(r.goals), a: n(r.assists), pts: n(r.points), shots: n(r.shots), toi: n(r.timeOnIcePerGame) }]))
const prevPp = new Map((await rep('skater/timeonice', `seasonId=${PREV} and gameTypeId=2`, false, 'toi_prev')).map((r) => [Number(r.playerId), n(r.ppTimeOnIcePerGame)]))
const ppOf = new Map(toiRows.map((r) => [`${r.playerId}|${r.gameId}`, n(r.ppTimeOnIce)]))

// ── our archive: individual xG per skater-game, and club-game rows per club ─
const ixg = new Map()      // `${player}|${game}` -> xG on his shots on goal
for (const s of SHOTS) {
  if (s.game_type !== 2 || (s.result !== 'sog' && s.result !== 'goal')) continue
  const v = XG.xgShot(s); if (v == null) continue
  const k = `${s.player_id}|${s.game_id}`; ixg.set(k, (ixg.get(k) || 0) + v)
}
const clubRows = {}
for (const r of TEAMROWS) (clubRows[r.team] ||= []).push(r)

// ── the replay ─────────────────────────────────────────────────────────────
const nights = [...new Set(skaters.map((r) => r.gameDate))].sort()
const byNight = new Map(nights.map((d) => [d, skaters.filter((r) => r.gameDate === d)]))
const goBy = new Map(); for (const g of goalies) { if (!goBy.has(g.gameDate)) goBy.set(g.gameDate, []); goBy.get(g.gameDate).push(g) }
const pkBy = new Map(); for (const p of pk) { if (!pkBy.has(p.gameDate)) pkBy.set(p.gameDate, []); pkBy.get(p.gameDate).push(p) }
const played = new Set(skaters.map((r) => `${r.teamAbbrev}|${r.gameDate}`))
const runP = new Map(); const runT = new Map()
const LG_XG_PER_SHOT = MODEL.league.xgPerSog; const LG_GF = MODEL.league.gf
const XG_PRIOR_GAMES = 10
const rows = []   // one per dressed skater-game with a baseline line

for (const d of nights) {
  const todays = byNight.get(d)
  const cands = todays.map((r) => {
    const id = Number(r.playerId); const c = runP.get(id)
    const cur = c ? { gp: c.gp, g: c.g, a: c.a, pts: c.pts, shots: c.shots, toi: c.gp ? c.toiSum / c.gp : 0 } : null
    const legs = G.pooledLegs(cur, prevSk.get(id) || null, null)
    return { gameId: r.gameId, playerId: id, name: r.skaterFullName, pos: r.positionCode, team: r.teamAbbrev, opp: r.opponentTeamAbbrev, home: r.homeRoad === 'H', legs, context: {}, _r: r, _c: c }
  })
  const scored = G.scoreNight(cands)
  // club-level inputs, once per club tonight
  const win = {}; const proj = {}
  const winOf = (t) => (win[t] ||= TP.windowOf(clubRows[t] || [], d))
  const projOf = (t, o) => (proj[`${t}|${o}`] ||= TP.projectTeam(winOf(t), winOf(o)))
  const tsh = (t) => { const x = runT.get(t); return x && x.gp ? x.tsh / x.gp : null }
  // the opposing goalie who actually started (the oracle: tomorrow's source is ESPN's confirmed starter)
  const starter = new Map()
  for (const g of goBy.get(d) || []) if (n(g.gamesStarted) === 1) starter.set(`${g.gameId}|${g.teamAbbrev}`, Number(g.playerId))
  const goalieFactorOf = (oppTeam, gameId) => {
    const id = starter.get(`${gameId}|${oppTeam}`); if (!id) return null
    let ga = 0; let xga = 0
    for (const r of winOf(oppTeam)) { const v = r.goalies?.[String(id)]; if (v) { ga += v[1]; xga += v[2] } }
    return XG.goalieFactor(ga, xga, MODEL.k.goalie)
  }
  for (const s of scored) {
    if (!s.legs?.ok) continue
    const r = s._r; const c = s._c
    const gpCur = c ? c.gp : 0
    const prior = s.legs.shotsPg * LG_XG_PER_SHOT
    const xgPg = ((c ? c.ixg : 0) + XG_PRIOR_GAMES * prior) / (gpCur + XG_PRIOR_GAMES)
    const pp = c && c.gp >= 5 ? c.ppSum / c.gp : (prevPp.get(s.playerId) ?? 0)
    const p = projOf(s.team, s.opp)
    const po = projOf(s.opp, s.team)
    const gfo = goalieFactorOf(s.opp, s.gameId)
    rows.push({
      night: d, gameId: s.gameId, team: s.team, opp: s.opp, pid: s.playerId, name: s.name, pos: s.pos, y: n(r.goals) >= 1 ? 1 : 0,
      base: s.score, baseRank: 0,
      x: {
        goalsPg: s.legs.goalsPg, shotsPg: s.legs.shotsPg, toiMin: (s.legs.toi || 0) / 60,
        xgPg, ppMin: pp / 60, isD: s.pos === 'D' ? 1 : 0,
        teamGoals: p.goals, oppGoals: po.goals, goalieF: p.goalieFactor, goalieStart: gfo ?? p.goalieFactor,
        home: s.home ? 1 : 0, b2bOwn: played.has(`${s.team}|${dayBefore(d)}`) ? 1 : 0, b2bOpp: played.has(`${s.opp}|${dayBefore(d)}`) ? 1 : 0,
        oppTsh: tsh(s.opp) ?? 3.1,
        // one multiplicative number: his xG a game x how many goals his club is projected to score tonight vs the league mean
        eg: xgPg * (p.goals / LG_GF), lnEg: Math.log(xgPg * (p.goals / LG_GF)),
      },
    })
  }
  // fold tonight in
  for (const r of todays) {
    const id = Number(r.playerId)
    const c = runP.get(id) || { gp: 0, g: 0, a: 0, pts: 0, shots: 0, toiSum: 0, ixg: 0, ppSum: 0 }
    c.gp += 1; c.g += n(r.goals); c.a += n(r.assists); c.pts += n(r.points); c.shots += n(r.shots); c.toiSum += n(r.timeOnIcePerGame)
    c.ixg += ixg.get(`${id}|${r.gameId}`) || 0; c.ppSum += ppOf.get(`${id}|${r.gameId}`) || 0
    runP.set(id, c)
  }
  for (const t of new Set(todays.map((r) => r.teamAbbrev))) { const x = runT.get(t) || { gp: 0, tsh: 0 }; x.gp += 1; runT.set(t, x) }
  for (const p of pkBy.get(d) || []) { const t = teams.get(Number(p.teamId)); if (!t) continue; const x = runT.get(t) || { gp: 0, tsh: 0 }; x.tsh += n(p.timesShorthanded); runT.set(t, x) }
}
console.log(`  ${rows.length} scored skater-games over ${new Set(rows.map((r) => r.night)).size} nights`)

// ── the combiner: ridge logistic regression, standardised features ────────
function fitLogit(train, names, ridge = 1) {
  const m = names.length
  const mean = names.map((k) => train.reduce((s, r) => s + r.x[k], 0) / train.length)
  const sd = names.map((k, j) => Math.sqrt(train.reduce((s, r) => s + (r.x[k] - mean[j]) ** 2, 0) / train.length) || 1)
  const X = train.map((r) => [1, ...names.map((k, j) => (r.x[k] - mean[j]) / sd[j])])
  const y = train.map((r) => r.y)
  let w = new Array(m + 1).fill(0); w[0] = Math.log(0.15 / 0.85)
  for (let it = 0; it < 25; it += 1) {
    const g = new Array(m + 1).fill(0); const H = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0))
    for (let i = 0; i < X.length; i += 1) {
      let z = 0; for (let j = 0; j <= m; j += 1) z += w[j] * X[i][j]
      const p = 1 / (1 + Math.exp(-z)); const e = p - y[i]; const v = p * (1 - p)
      for (let j = 0; j <= m; j += 1) { g[j] += e * X[i][j]; for (let k = 0; k <= m; k += 1) H[j][k] += v * X[i][j] * X[i][k] }
    }
    for (let j = 1; j <= m; j += 1) { g[j] += ridge * w[j]; H[j][j] += ridge }
    const dw = solve(H, g); let step = 0
    for (let j = 0; j <= m; j += 1) { w[j] -= dw[j]; step = Math.max(step, Math.abs(dw[j])) }
    if (step < 1e-7) break
  }
  const predict = (r) => { let z = w[0]; names.forEach((k, j) => { z += w[j + 1] * ((r.x[k] - mean[j]) / sd[j]) }); return 1 / (1 + Math.exp(-z)) }
  return { names, w, mean, sd, predict }
}
function solve(A, b) {
  const m = b.length; const M = A.map((r, i) => [...r, b[i]])
  for (let i = 0; i < m; i += 1) {
    let p = i; for (let r = i + 1; r < m; r += 1) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r
    ;[M[i], M[p]] = [M[p], M[i]]
    for (let r = i + 1; r < m; r += 1) { const f = M[r][i] / M[i][i]; for (let c = i; c <= m; c += 1) M[r][c] -= f * M[i][c] }
  }
  const x = new Array(m).fill(0)
  for (let i = m - 1; i >= 0; i -= 1) { let s = M[i][m]; for (let c = i + 1; c < m; c += 1) s -= M[i][c] * x[c]; x[i] = s / M[i][i] }
  return x
}

// ── the board rules, applied to any model's number ─────────────────────────
// CALLED: the top skater on each team in a game. ON THE BOARD: the top third of the night (the live rule).
function board(testRows, score) {
  const byNightMap = new Map()
  for (const r of testRows) { if (!byNightMap.has(r.night)) byNightMap.set(r.night, []); byNightMap.get(r.night).push(r) }
  const out = []
  for (const [night, list] of byNightMap) {
    const s = list.map((r) => ({ r, s: score(r) })).sort((a, b) => (b.s - a.s) || String(a.r.name).localeCompare(String(b.r.name)))
    const cut = Math.ceil(s.length / 3)
    const seen = new Set(); const called = new Set()
    s.forEach(({ r }, i) => { const k = `${r.gameId}|${r.team}`; if (!seen.has(k)) { seen.add(k); called.add(r.pid + '|' + r.gameId) } })
    out.push({ night, rows: s.map(({ r, s: v }, i) => ({ r, s: v, called: called.has(r.pid + '|' + r.gameId), top3rd: i < cut, nightRank: i + 1 })) })
  }
  return out
}
const tally = (nightsB, pick) => { let h = 0; let k = 0; for (const nb of nightsB) for (const x of nb.rows) if (pick(x)) { k += 1; h += x.r.y } return { n: k, h, rate: k ? h / k : 0 } }
function auc(testRows, score) {
  const s = testRows.map((r) => [score(r), r.y]).sort((a, b) => a[0] - b[0])
  let rk = 0; let sumPos = 0; let pos = 0
  for (let i = 0; i < s.length;) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j += 1; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k += 1) if (s[k][1]) { sumPos += avg; pos += 1 } i = j + 1 }
  const neg = s.length - pos; return (sumPos - pos * (pos + 1) / 2) / (pos * neg)
}
function bootstrapDiff(a, b, pick, B = 2000) {
  // paired by night: both boards over the same nights
  const per = (bd) => new Map(bd.map((nb) => { let h = 0; let k = 0; for (const x of nb.rows) if (pick(x)) { k += 1; h += x.r.y } return [nb.night, [h, k]] }))
  const A = per(a); const Bm = per(b); const keys = [...A.keys()]
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const diffs = []
  for (let i = 0; i < B; i += 1) {
    let ha = 0; let ka = 0; let hb = 0; let kb = 0
    for (let j = 0; j < keys.length; j += 1) { const k = keys[Math.floor(rnd() * keys.length)]; ha += A.get(k)[0]; ka += A.get(k)[1]; hb += Bm.get(k)[0]; kb += Bm.get(k)[1] }
    diffs.push(hb / kb - ha / ka)
  }
  diffs.sort((x, y) => x - y)
  return { lo: diffs[Math.floor(B * 0.025)], hi: diffs[Math.floor(B * 0.975)], pBetter: diffs.filter((x) => x > 0).length / B }
}
// mean negative log-likelihood of the goal/no-goal outcome (lower is better): the low-noise yardstick, all 15k rows
function logLoss(rowsT, p) { let s = 0; for (const r of rowsT) { const q = Math.min(0.999, Math.max(0.001, p(r))); s += -(r.y ? Math.log(q) : Math.log(1 - q)) } return s / rowsT.length }
const pct1 = (v) => `${(100 * v).toFixed(1)}%`

const SETS = {
  'A1 legs only (combiner)': ['goalsPg', 'shotsPg', 'toiMin'],
  'A2 + individual xG': ['goalsPg', 'shotsPg', 'toiMin', 'xgPg'],
  'A3 + team model goals tonight': ['goalsPg', 'shotsPg', 'toiMin', 'xgPg', 'teamGoals', 'isD'],
  'A4 + goalie, ice, rest, penalties': ['goalsPg', 'shotsPg', 'toiMin', 'xgPg', 'teamGoals', 'isD', 'goalieF', 'ppMin', 'home', 'b2bOwn', 'b2bOpp', 'oppTsh'],
  'A5 A4 with the actual opposing starter': ['goalsPg', 'shotsPg', 'toiMin', 'xgPg', 'teamGoals', 'isD', 'goalieStart', 'ppMin', 'home', 'b2bOwn', 'b2bOpp', 'oppTsh'],
  'A6 lean: xG + team + ice time': ['xgPg', 'teamGoals', 'toiMin', 'ppMin', 'isD'],
  'A7 one number: expected goals tonight (log)': ['lnEg'],
  'A8 expected goals + ice + position': ['lnEg', 'toiMin', 'ppMin', 'isD'],
  'A9 expected goals + goals/GP + ice + rest': ['lnEg', 'goalsPg', 'toiMin', 'ppMin', 'isD', 'b2bOwn', 'b2bOpp', 'home'],
  // LEAN SETS: nothing the live board does not already read, plus the team model it already prints on the slate
  'L1 legs + team goals + position': ['goalsPg', 'shotsPg', 'toiMin', 'teamGoals', 'isD'],
  'L2 L1 + rest + home': ['goalsPg', 'shotsPg', 'toiMin', 'teamGoals', 'isD', 'b2bOwn', 'b2bOpp', 'home'],
  'L3 L2 + his power-play minutes': ['goalsPg', 'shotsPg', 'toiMin', 'teamGoals', 'isD', 'b2bOwn', 'b2bOpp', 'home', 'ppMin'],
  'L4 legs + team goals only': ['goalsPg', 'shotsPg', 'toiMin', 'teamGoals'],
  'L6 legs + position only (no team model)': ['goalsPg', 'shotsPg', 'toiMin', 'isD'],
  'L5 L2 without shots/GP':['goalsPg', 'toiMin', 'teamGoals', 'isD', 'b2bOwn', 'b2bOpp', 'home'],
}
const result = { built_at: new Date().toISOString(), cutoff: '2026-02-01', folds: {} }
function runFold(label, train, test) {
  console.log(`\n=== ${label}: fit ${new Set(train.map((r) => r.night)).size} nights / ${train.length} skater-games, test ${new Set(test.map((r) => r.night)).size} nights / ${test.length} skater-games (base rate ${pct1(test.reduce((s, r) => s + r.y, 0) / test.length)})`)
  const baseB = board(test, (r) => r.base)
  const fold = { train: { nights: new Set(train.map((r) => r.night)).size, rows: train.length }, test: { nights: new Set(test.map((r) => r.night)).size, rows: test.length, goals: test.reduce((s, r) => s + r.y, 0) }, models: {} }
  const line = (name, B, a, models, ll) => {
    const c = tally(B, (x) => x.called); const b = tally(B, (x) => x.called || x.top3rd); const t3 = tally(B, (x) => x.top3rd)
    const dC = models ? bootstrapDiff(baseB, B, (x) => x.called) : null; const dB = models ? bootstrapDiff(baseB, B, (x) => x.called || x.top3rd) : null
    console.log(`${name.padEnd(42)} CALLED ${String(c.h).padStart(4)}/${String(c.n).padEnd(4)} ${pct1(c.rate).padStart(6)}${dC ? ` (vs live ${((c.rate - tally(baseB, (x) => x.called).rate) * 100).toFixed(1).padStart(5)} pt, 95% ${(dC.lo * 100).toFixed(1)}..${(dC.hi * 100).toFixed(1)})` : ''} | CALLED+BOARD ${String(b.h).padStart(4)}/${String(b.n).padEnd(5)} ${pct1(b.rate).padStart(6)}${dB ? ` (vs live ${((b.rate - tally(baseB, (x) => x.called || x.top3rd).rate) * 100).toFixed(1).padStart(5)} pt, 95% ${(dB.lo * 100).toFixed(1)}..${(dB.hi * 100).toFixed(1)})` : ''} | top third ${pct1(t3.rate)} | AUC ${a.toFixed(3)} | logloss ${ll.toFixed(4)}`)
    return { called: c, calledBoard: b, topThird: t3, auc: a, dCalled: dC, dCalledBoard: dB }
  }
  const liveFit = fitLogit(train.map((r) => ({ ...r, x: { s: r.base, s2: r.base * r.base } })), ['s', 's2'])   // the live score mapped to a number, fitted on the fit nights only
  const liveP = (r) => liveFit.predict({ x: { s: r.base, s2: r.base * r.base } })
  const flat = train.reduce((a, r) => a + r.y, 0) / train.length
  console.log(`log-loss on the test nights (lower is better): flat base rate ${logLoss(test, () => flat).toFixed(4)}; live score ${logLoss(test, liveP).toFixed(4)}`)
  fold.logLoss = { flat: logLoss(test, () => flat), live: logLoss(test, liveP) }
  fold.models['LIVE score'] = line('LIVE score (mean percentile of 3 legs)', baseB, auc(test, (r) => r.base), false, logLoss(test, liveP))
  for (const [name, names] of Object.entries(SETS)) {
    const fit = fitLogit(train, names)
    const sc = (r) => fit.predict(r)
    const ll = logLoss(test, sc); fold.logLoss[name] = ll
    fold.models[name] = { ...line(name, board(test, sc), auc(test, sc), true, ll), logLoss: ll, weights: Object.fromEntries(names.map((k, j) => [k, Number(fit.w[j + 1].toFixed(3))])) }
  }
  result.folds[label] = fold
  return fold
}
const early = rows.filter((r) => r.night >= '2025-11-15' && r.night < '2026-02-01')
const late = rows.filter((r) => r.night >= '2026-02-01')
runFold('FOLD A (clean): fit 11-15..01-31, test 02-01..end', early, late)
runFold('FOLD B (xG has seen these nights): fit 02-01..end, test 11-15..01-31', late, early)

// calibration counts for the leanest strong model on fold A: predicted goal count vs actual, by tenth
{
  const pick = process.argv.includes('--final') ? arg('--final') : 'A4 + goalie, ice, rest, penalties'
  const fit = fitLogit(early, SETS[pick]); const sc = late.map((r) => ({ r, p: fit.predict(r) })).sort((a, b) => a.p - b.p)
  console.log(`\nCALIBRATION, fold A test, ${pick}: tenths of the test skater-games by the model's number, counts`)
  const size = Math.ceil(sc.length / 10); const cal = []
  for (let i = 0; i < 10; i += 1) { const seg = sc.slice(i * size, (i + 1) * size); const exp = seg.reduce((s, x) => s + x.p, 0); const act = seg.reduce((s, x) => s + x.r.y, 0); cal.push({ tenth: i + 1, n: seg.length, expected: Math.round(exp), actual: act }); console.log(`  tenth ${String(i + 1).padStart(2)}: ${seg.length} skater-games, model expects ${Math.round(exp)} goals, actual ${act}`) }
  result.calibration = { model: pick, tenths: cal }
  const baseCal = []; const bs = late.slice().sort((a, b) => a.base - b.base); const bsz = Math.ceil(bs.length / 10)
  console.log('LIVE score tenths of the same rows (counts of skater-games that scored):')
  for (let i = 0; i < 10; i += 1) { const seg = bs.slice(i * bsz, (i + 1) * bsz); baseCal.push({ tenth: i + 1, n: seg.length, actual: seg.reduce((s, x) => s + x.y, 0) }); console.log(`  tenth ${String(i + 1).padStart(2)}: ${seg.length}, scored ${seg.reduce((s, x) => s + x.y, 0)}`) }
  result.calibration.live = baseCal
  // by position and ice time, CALLED+BOARD
  const B = board(late, (r) => fit.predict(r)); const LB = board(late, (r) => r.base)
  const seg = (name, f) => { const a = tally(B, (x) => (x.called || x.top3rd) && f(x.r)); const b = tally(LB, (x) => (x.called || x.top3rd) && f(x.r)); console.log(`  ${name.padEnd(22)} model ${a.h}/${a.n} ${pct1(a.rate)} | live ${b.h}/${b.n} ${pct1(b.rate)}`); return { name, model: a, live: b } }
  console.log('CALLED+BOARD by segment (fold A test):')
  result.segments = [seg('forwards', (r) => r.pos !== 'D'), seg('defence', (r) => r.pos === 'D'), seg('under 15 min', (r) => r.x.toiMin < 15), seg('15-19 min', (r) => r.x.toiMin >= 15 && r.x.toiMin < 19), seg('19+ min', (r) => r.x.toiMin >= 19), seg('home', (r) => r.x.home === 1), seg('away', (r) => r.x.home === 0), seg('own back-to-back', (r) => r.x.b2bOwn === 1), seg('opp back-to-back', (r) => r.x.b2bOpp === 1)]
  const sh = (name, B2) => { const g = {}; for (const nb of B2) for (const x of nb.rows) if (x.called) { g[x.r.gameId] = (g[x.r.gameId] || 0) + x.r.y } const v = Object.values(g); return `${name}: at least one of the 2 calls scored in ${v.filter((k) => k >= 1).length}/${v.length} games, both in ${v.filter((k) => k >= 2).length}` }
  console.log(sh('model', B)); console.log(sh('live ', LB))
}
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`)

// ── lamp-goalw-v1: freeze the coefficients (lib/nhl/goalWeightedV1.js) ─────
// The model is the L6 set (the live legs + position): the one the definition names. It is fitted ONCE on every
// night from 2025-11-15 on; the held-out numbers written beside it are the two folds above (fit on one side,
// scored on the other). A refit is a new version.
const WM = arg('--write-model')
if (WM) {
  const NAMES = SETS['L6 legs + position only (no team model)']
  const all = rows.filter((r) => r.night >= '2025-11-15')
  const fit = fitLogit(all, NAMES)
  const held = {}
  for (const [k, f] of Object.entries(result.folds)) {
    const live = f.models['LIVE score (mean percentile of 3 legs)'] || f.models['LIVE score']; const m = f.models['L6 legs + position only (no team model)']
    held[k] = { test_nights: f.test.nights, test_skater_games: f.test.rows, live: { called: live.called, called_board: live.calledBoard, log_loss: f.logLoss.live }, model: { called: m.called, called_board: m.calledBoard, log_loss: m.logLoss }, paired_vs_live: { called: m.dCalled, called_board: m.dCalledBoard } }
  }
  const body = {
    version: 'lamp-goalw-v1',
    note: 'Written by scripts/nhl/goal-v2-backtest.mjs --write-model. Ridge logistic regression (ridge 1) of "scored 1+ goal" on the live board\'s three legs plus a defenceman flag; features standardised by mean/sd of the fit set. Frozen: a refit is a new model_version.',
    features: NAMES, intercept: Number(fit.w[0].toFixed(5)),
    weights: Object.fromEntries(NAMES.map((k, j) => [k, Number(fit.w[j + 1].toFixed(5))])),
    mean: Object.fromEntries(NAMES.map((k, j) => [k, Number(fit.mean[j].toFixed(5))])),
    sd: Object.fromEntries(NAMES.map((k, j) => [k, Number(fit.sd[j].toFixed(5))])),
    fitted_on: { from: '2025-11-15', to: all[all.length - 1].night, nights: new Set(all.map((r) => r.night)).size, skater_games: all.length, goals: all.reduce((s, r) => s + r.y, 0) },
    held_out: held,
  }
  fs.writeFileSync(WM, `// lamp-goalw-v1, the numbers behind lib/nhl/goalWeightedModel.js. GENERATED -- do not edit by hand.\n// Regenerate: node scripts/nhl/goal-v2-backtest.mjs --cache <dir> --data <dir> --write-model lib/nhl/goalWeightedV1.js\nexport default ${JSON.stringify(body, null, 2)}\n`)
  console.log(`\nwrote ${WM}`)
}
