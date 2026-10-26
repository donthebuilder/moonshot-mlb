// ⚾ MOONSHOT'S OPENINGS, COUNTED (2026-10-22). Pure: the stored opening rows (lib/mlb/openings.js -> opening_games /
// opening_players, sport 'mlb') in, the research tables out. Read by /api/mlb/openings and the Openings tab. The same job
// lib/nba/openingsAgg.js does for BUCKETS. Nothing here is a chance or a model: counts and rates of what happened.
//
//   teams    games; scored in the 1st %, allowed a run in the 1st %, 1st-inning runs for / against a game; how often the club
//            scored the game's first run, got its first hit and hit its first homer; its usual leadoff man
//   PLATE APPEARANCES TO THE FIRST (10-26): `paRun` / `paHit` / `paHr`, a club's own plate appearances before the game's first run / hit /
//            homer (that one counts), averaged over its games (opening_games.pre_first_*_home / _away)
//   players  starts, his usual slot, and per start: batted in the 1st %, a hit in the 1st %, a homer in the 1st, a run in the
//            1st %, total bases in the 1st; the game's first hit and first homer he hit (counts and per start)
//
// `where`: 'all' | 'home' | 'away' (his club's side). `last`: only each club's / player's newest N games.

const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null)
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null)
const newestFirst = (a, b) => String(b.game_date).localeCompare(String(a.game_date)) || String(b.game_id).localeCompare(String(a.game_id))

export function aggregateMlbOpenings(games, players, { where = 'all', last = null } = {}) {
  const byGame = new Map(games.map((g) => [String(g.game_id), g]))
  const side = (team, g) => (team === g.home ? 'home' : team === g.away ? 'away' : null)
  const keep = (team, g) => where === 'all' || side(team, g) === where
  const names = new Map(players.map((p) => [String(p.player_id), p.name]))

  // ── teams ──
  const teamGames = new Map()
  for (const g of games) for (const t of [g.home, g.away]) if (t && keep(t, g)) { if (!teamGames.has(t)) teamGames.set(t, []); teamGames.get(t).push(g) }
  const leadoffs = new Map()   // team -> player -> starts in the 1 hole (inside the same window)
  for (const p of players) {
    if (p.bat_order !== 1) continue
    const g = byGame.get(String(p.game_id))
    if (!g || !keep(p.team, g)) continue
    if (!leadoffs.has(p.team)) leadoffs.set(p.team, new Map())
    const m = leadoffs.get(p.team); m.set(String(p.player_id), [...(m.get(String(p.player_id)) || []), g])
  }
  const teams = []
  for (const [t, list0] of teamGames) {
    const list = [...list0].sort(newestFirst).slice(0, last || undefined)
    const inList = new Set(list.map((g) => String(g.game_id)))
    let sc1 = 0, al1 = 0, rf = 0, ra = 0, fr = 0, frN = 0, fh = 0, fhN = 0, fhr = 0, fhrN = 0
    const pa = { run: [0, 0], hit: [0, 0], hr: [0, 0] }   // [sum, games] of his own plate appearances before the first run / hit / homer
    // the game log (10-26, the face wall: components/openings/OpeningViz.js): newest first, [scored the first run 1|0|null,
    // got the first hit 1|0|null, the man who scored that run when it was this club's, or null]
    const log = []
    for (const g of list) {
      log.push([g.first_score_team ? (g.first_score_team === t ? 1 : 0) : null, g.first_hit_team ? (g.first_hit_team === t ? 1 : 0) : null, g.first_score_team === t && g.first_score_player ? String(g.first_score_player) : null])
      const home = t === g.home
      const f = (home ? g.p1_home_pts : g.p1_away_pts) || 0, a = (home ? g.p1_away_pts : g.p1_home_pts) || 0
      if (f > 0) sc1++
      if (a > 0) al1++
      rf += f; ra += a
      for (const [k, col] of [['run', 'att'], ['hit', 'hit'], ['hr', 'hr']]) { const v = g[`pre_first_${col}_${home ? 'home' : 'away'}`]; if (Number.isFinite(v)) { pa[k][0] += v; pa[k][1]++ } }
      if (g.first_score_team) { frN++; if (g.first_score_team === t) fr++ }
      if (g.first_hit_team) { fhN++; if (g.first_hit_team === t) fh++ }
      if (g.first_hr_team) { fhrN++; if (g.first_hr_team === t) fhr++ }
    }
    const n = list.length
    const lo = leadoffs.has(t) ? [...leadoffs.get(t).entries()].map(([id, gs]) => [id, gs.filter((g) => inList.has(String(g.game_id))).length]).sort((a, b) => b[1] - a[1])[0] : null
    teams.push({
      team: t, gp: n, scored1Pct: pct(sc1, n), allowed1Pct: pct(al1, n), r1For: r2(rf / n), r1Ag: r2(ra / n),
      firstRunPct: pct(fr, frN), firstHitPct: pct(fh, fhN), firstHrPct: pct(fhr, fhrN),
      paRun: pa.run[1] ? r1(pa.run[0] / pa.run[1]) : null, paHit: pa.hit[1] ? r1(pa.hit[0] / pa.hit[1]) : null, paHr: pa.hr[1] ? r1(pa.hr[0] / pa.hr[1]) : null,
      log,
      leadoffId: lo && lo[1] ? lo[0] : null, leadoff: lo && lo[1] ? (names.get(lo[0]) || null) : null, leadoffGs: lo ? lo[1] : 0,
    })
  }

  // ── players (his starts) ──
  const per = new Map()
  for (const p of players) {
    const g = byGame.get(String(p.game_id))
    if (!g || !p.starter || !keep(p.team, g)) continue
    const id = String(p.player_id)
    if (!per.has(id)) per.set(id, [])
    per.get(id).push({ p, g })
  }
  const out = []
  for (const [id, list0] of per) {
    const list = [...list0].sort((a, b) => newestFirst(a.g, b.g)).slice(0, last || undefined)
    const n = list.length
    const latest = list[0].p
    const slots = new Map()
    for (const x of list) slots.set(x.p.bat_order, (slots.get(x.p.bat_order) || 0) + 1)
    const top = [...slots.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    const slot = top?.[0] ?? null
    // how many of his starts were in that slot (known issue 68: a man who moves around reads 'leads off' on 45% of his starts)
    const slotPct = top && list.length ? (100 * top[1]) / list.length : null
    const count = (f) => list.filter(f).length
    const firstHit = count((x) => String(x.g.first_hit_player) === id)
    const firstHr = count((x) => String(x.g.first_hr_player) === id)
    const hr1 = list.reduce((a, x) => a + (x.p.p1_hr || 0), 0)
    out.push({
      playerId: id, name: latest.name, team: latest.team, pos: latest.pos, gs: n, slot, slotPct,
      bat1Pct: pct(count((x) => x.p.p1_att > 0), n), hit1Pct: pct(count((x) => x.p.p1_made > 0), n),
      hr1, hr1Pct: pct(count((x) => x.p.p1_hr > 0), n), run1Pct: pct(count((x) => x.p.p1_runs > 0), n),
      tb1: r2(list.reduce((a, x) => a + (x.p.p1_tb || 0), 0) / n),
      firstHit, firstHitPct: pct(firstHit, n), firstHr, firstHrPct: pct(firstHr, n),
    })
  }
  return { teams, players: out, games: games.length }
}
