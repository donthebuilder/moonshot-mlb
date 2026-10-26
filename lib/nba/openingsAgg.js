// 🏀 THE OPENINGS, COUNTED (2026-10-22, Donovan: "let me see a prototype ... buckets first for first basket"). Pure: the stored
// opening rows (lib/nba/openings.js -> opening_games / opening_players) in, the research tables out. Read by
// /api/buckets/openings and the Openings tab. Nothing here is a chance or a model: counts and rates of what happened.
//
//   teams    games, tip won %, scored first %, scored first when he won the tip, points for / against in the first 3 and 6
//            minutes and Q1, and the man who usually jumps for them with his tip record
//   players  games (starts), took the game's first shot %, a top-3 shot %, first baskets, and per game in the first 3 / 6
//            minutes and Q1: shots, points, usage (FGA + 0.44 FTA + TOV over his club's), Q1 rebounds, assists, R+A
//   FG% (2026-10-25, Donovan: "shot percentages in that time"): makes over attempts in each window, summed over the games --
//            a player's own, and a club's from all its players' shots that night (opening_players *_made / *_att)
//
//   SHOTS TO THE FIRST SCORE (10-26): `shotsToFirst`, a club's own field-goal attempts before the game's first made basket (that make
//   counts), averaged over its games; `firstTypes` / `allows`: what the first baskets were (3PT, 2PT Jumper, Layup, Dunk, Hook, Tip) --
//   a club's own, a player's own, and what each defense ALLOWED, by shot type and by the position of the man who scored
//   (opening_games.first_score_type, lib/openings/shotType.js). Shares are of the games with the type on file.
// `where`: 'all' | 'home' | 'away' (his club's side of the floor). `last`: only each club's / player's newest N games.

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null)
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)
const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1 }
/** { word: n } -> [[word, share %, n]] biggest first (top 4), or [] */
const shares = (o) => { const n = Object.values(o).reduce((a, b) => a + b, 0); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => [k, pct(c, n), c]) }

export function aggregateOpenings(games, players, { where = 'all', last = null } = {}) {
  const byGame = new Map(games.map((g) => [String(g.game_id), g]))
  const teamOfIn = new Map()   // game -> player -> his club that night
  for (const p of players) { const k = String(p.game_id); if (!teamOfIn.has(k)) teamOfIn.set(k, new Map()); teamOfIn.get(k).set(String(p.player_id), p.team) }
  const posAt = new Map(players.map((p) => [`${p.game_id}|${p.player_id}`, p.pos]))   // the position of the man who scored the first basket
  const playersOf = (gameId) => teamOfIn.get(String(gameId)) || new Map()
  const side = (team, g) => (team === g.home ? 'home' : team === g.away ? 'away' : null)
  const keep = (team, g) => where === 'all' || side(team, g) === where
  const newestFirst = (a, b) => String(b.game_date).localeCompare(String(a.game_date))

  // each club's shots that night, made / taken, per window (for the club FG%)
  const clubShots = new Map()
  for (const p of players) {
    const k = `${p.game_id}|${p.team}`
    const x = clubShots.get(k) || { w1m: 0, w1a: 0, w2m: 0, w2a: 0, q1m: 0, q1a: 0 }
    x.w1m += p.win1_made || 0; x.w1a += p.win1_att || 0; x.w2m += p.win2_made || 0; x.w2a += p.win2_att || 0; x.q1m += p.p1_made || 0; x.q1a += p.p1_att || 0
    clubShots.set(k, x)
  }

  // ── teams ──
  const teamGames = new Map()
  for (const g of games) for (const t of [g.home, g.away]) if (t && keep(t, g)) { if (!teamGames.has(t)) teamGames.set(t, []); teamGames.get(t).push(g) }
  const jumps = new Map()   // team -> player -> { j, w }
  const names = new Map(players.map((p) => [String(p.player_id), p.name]))
  const teams = []
  for (const [t, list0] of teamGames) {
    const list = [...list0].sort(newestFirst).slice(0, last || undefined)
    let tip = 0, tipKnown = 0, first = 0, firstKnown = 0, firstWhenTip = 0
    const s = { w1f: 0, w1a: 0, w2f: 0, w2a: 0, q1f: 0, q1a: 0 }
    const fg = { w1m: 0, w1a: 0, w2m: 0, w2a: 0, q1m: 0, q1a: 0 }
    // the game log (10-25, for the face wall, components/openings/OpeningViz.js): newest first, [scored first 1|0|null,
    // won the tip 1|0|null, the man who scored it when it was this club's, or null]
    const log = []
    let preSum = 0, preN = 0, aN = 0
    const ownTypes = {}, allowTypes = {}, allowPos = {}
    for (const g of list) {
      log.push([g.first_score_team ? (g.first_score_team === t ? 1 : 0) : null, g.jump_win_team ? (g.jump_win_team === t ? 1 : 0) : null, g.first_score_team === t && g.first_score_player ? String(g.first_score_player) : null])
      const home = t === g.home
      const pre = home ? g.pre_first_att_home : g.pre_first_att_away
      if (Number.isFinite(pre)) { preSum += pre; preN++ }
      if (g.first_score_team === t) bump(ownTypes, g.first_score_type)
      else if (g.first_score_team) { aN++; bump(allowTypes, g.first_score_type); bump(allowPos, posAt.get(`${g.game_id}|${g.first_score_player}`)) }
      if (g.jump_win_team) { tipKnown++; if (g.jump_win_team === t) tip++ }
      if (g.first_score_team) { firstKnown++; if (g.first_score_team === t) { first++; if (g.jump_win_team === t) firstWhenTip++ } }
      s.w1f += (home ? g.win1_home_pts : g.win1_away_pts) || 0; s.w1a += (home ? g.win1_away_pts : g.win1_home_pts) || 0
      s.w2f += (home ? g.win2_home_pts : g.win2_away_pts) || 0; s.w2a += (home ? g.win2_away_pts : g.win2_home_pts) || 0
      s.q1f += (home ? g.p1_home_pts : g.p1_away_pts) || 0; s.q1a += (home ? g.p1_away_pts : g.p1_home_pts) || 0
      const cs = clubShots.get(`${g.game_id}|${t}`)
      if (cs) for (const k of Object.keys(fg)) fg[k] += cs[k]
      // his club's jumper: the one of the two jumpers who played for this club that night
      const mine = (g.jump_players || []).find((id) => playersOf(g.game_id).get(String(id)) === t)
      if (mine) {
        if (!jumps.has(t)) jumps.set(t, new Map())
        const m = jumps.get(t); const x = m.get(String(mine)) || { j: 0, w: 0 }
        x.j++; if (g.jump_win_team === t) x.w++; m.set(String(mine), x)
      }
    }
    const n = list.length
    const top = jumps.has(t) ? [...jumps.get(t).entries()].sort((a, b) => b[1].j - a[1].j)[0] : null
    teams.push({
      team: t, gp: n, tipPct: pct(tip, tipKnown), firstPct: pct(first, firstKnown), firstWhenTipPct: pct(firstWhenTip, tip),
      w1For: r1(s.w1f / n), w1Ag: r1(s.w1a / n), w2For: r1(s.w2f / n), w2Ag: r1(s.w2a / n), q1For: r1(s.q1f / n), q1Ag: r1(s.q1a / n),
      w1FgPct: pct(fg.w1m, fg.w1a), w2FgPct: pct(fg.w2m, fg.w2a), q1FgPct: pct(fg.q1m, fg.q1a),
      shotsToFirst: preN ? r1(preSum / preN) : null, firstTypes: shares(ownTypes), allows: { n: aN, types: shares(allowTypes), pos: shares(allowPos) },
      log,
      jumperId: top ? top[0] : null, jumper: top ? (names.get(top[0]) || null) : null, jumperJ: top ? top[1].j : 0, jumperW: top ? top[1].w : 0,
    })
  }

  // ── players ──
  // a club's totals each game, for usage shares
  const teamTot = new Map()
  for (const p of players) {
    const k = `${p.game_id}|${p.team}`
    const x = teamTot.get(k) || { w1: 0, w2: 0, q1: 0 }
    x.w1 += (p.win1_att || 0) + 0.44 * (p.win1_fta || 0) + (p.win1_tov || 0)
    x.w2 += (p.win2_att || 0) + 0.44 * (p.win2_fta || 0) + (p.win2_tov || 0)
    x.q1 += (p.p1_att || 0) + 0.44 * (p.p1_fta || 0) + (p.p1_tov || 0)
    teamTot.set(k, x)
  }
  const per = new Map()
  for (const p of players) {
    const g = byGame.get(String(p.game_id))
    if (!g || !keep(p.team, g)) continue
    const id = String(p.player_id)
    if (!per.has(id)) per.set(id, [])
    per.get(id).push({ p, g })
  }
  const out = []
  for (const [id, list0] of per) {
    const list = [...list0].sort((a, b) => newestFirst(a.g, b.g)).slice(0, last || undefined)
    const latest = list[0].p
    const n = list.length
    const sum = (f) => list.reduce((a, x) => a + (Number(f(x)) || 0), 0)
    const use = (w) => {
      const mine = sum((x) => (x.p[`${w}_att`] || 0) + 0.44 * (x.p[`${w}_fta`] || 0) + (x.p[`${w}_tov`] || 0))
      const club = sum((x) => teamTot.get(`${x.p.game_id}|${x.p.team}`)?.[w === 'win1' ? 'w1' : w === 'win2' ? 'w2' : 'q1'] || 0)
      return club ? Math.round((1000 * mine) / club) / 10 : null
    }
    const firstFg = list.filter((x) => String(x.g.first_score_player) === id).length
    const myTypes = {}
    for (const x of list) if (String(x.g.first_score_player) === id) bump(myTypes, x.g.first_score_type)
    // HIS FIRST SHOT (10-25, Donovan: "when they personally shoot the ball, it goes in"): of the games he took the game's first
    // shot, how many went in -- the first score is his, at the same clock second. (Whole-second clock: his own putback inside
    // that second would also count; no flag for the first shot's result is stored.)
    const tookFirst = list.filter((x) => x.p.first_att_order === 1)
    const firstShotMade = tookFirst.filter((x) => String(x.g.first_score_player) === id && x.g.first_score_clock_s != null && x.g.first_score_clock_s === x.g.first_att_clock_s).length
    out.push({
      playerId: id, name: latest.name, team: latest.team, pos: latest.pos, gp: n, gs: list.filter((x) => x.p.starter).length,
      firstShotPct: pct(tookFirst.length, n), firstShots: tookFirst.length, firstShotMade, firstShotMadePct: pct(firstShotMade, tookFirst.length),
      top3ShotPct: pct(list.filter((x) => x.p.first_att_order && x.p.first_att_order <= 3).length, n),
      firstFg, firstFgPct: pct(firstFg, n), firstTypes: shares(myTypes),
      w1Fga: r1(sum((x) => x.p.win1_att) / n), w1Pts: r1(sum((x) => x.p.win1_pts) / n), w1Use: use('win1'),
      w2Fga: r1(sum((x) => x.p.win2_att) / n), w2Pts: r1(sum((x) => x.p.win2_pts) / n), w2Use: use('win2'),
      q1Fga: r1(sum((x) => x.p.p1_att) / n), q1Pts: r1(sum((x) => x.p.p1_pts) / n), q1Use: use('p1'),
      w1FgPct: pct(sum((x) => x.p.win1_made), sum((x) => x.p.win1_att)), w2FgPct: pct(sum((x) => x.p.win2_made), sum((x) => x.p.win2_att)),
      q1FgPct: pct(sum((x) => x.p.p1_made), sum((x) => x.p.p1_att)),
      q1Reb: r1(sum((x) => x.p.p1_reb) / n), q1Ast: r1(sum((x) => x.p.p1_ast) / n), q1Ra: r1(sum((x) => (x.p.p1_reb || 0) + (x.p.p1_ast || 0)) / n),
    })
  }
  return { teams, players: out, games: games.length }
}
