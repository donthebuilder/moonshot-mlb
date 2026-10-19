// THE ATTACK SHEET (Donovan 10-19, picked "G2" on the Chart Lab after "I'm still confused how to use this data or what to
// attack with it"). How a defense plays, one trait a row, each answered by the OTHER offense's player who beats it and the
// number that says so. Every number is read from the payloads (nfl_matchup.json, the week's players); the play-type word
// ("quick throws", "go deep", "run it") is the usual football answer to that trait and is labelled as such on the page.
//
// Traits and their league rank among the 32 (1 = the most of it); a tier is top 8 / middle / bottom 8:
//   pass rush   disruption_team.pressure.created_pct
//   blitz       tendencies.defense.blitz_pct
//   coverage    coverage_team zone_pct or man_pct, whichever this defense plays more
//   deep balls  def_explosive.deep_pct (deep passes caught)
//   big plays   def_explosive.exp_pct (passes of 20+ yards, a share)
//   the box     tendencies.defense.box8_pct (8+ in the box, a share of runs)
// The answers: receivers vs zone / man from coverage_player (20+ targets, the charting season), catches of 20+ from
// player_explosive, the QB's yards a dropback blitzed and not from qb_pressure, the back's rushing yards a game and the
// leading pass catcher's catches a game from the week's players (stats RUYD / REC).

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const r1 = (v) => Math.round(v * 10) / 10
const MIN_TGTS = 20

function rankIn(map, get, v) {
  if (!fin(v)) return null
  return 1 + Object.values(map || {}).map(get).filter((x) => fin(x) && x > v).length
}
const tierOf = (r) => (r == null ? 1 : r <= 8 ? 0 : r >= 25 ? 2 : 1)

function picks(matchup, players, off) {
  const mine = (players || []).filter((p) => p.team === off)
  const cp = matchup?.coverage_player || {}
  const bestVs = (cov) => mine
    .map((p) => ({ p, s: cp[p.player_id]?.[cov] }))
    .filter((x) => x.s && x.s.tgts >= MIN_TGTS && fin(x.s.ypt))
    .sort((a, b) => b.s.ypt - a.s.ypt)[0] || null
  const pe = matchup?.player_explosive || {}
  const deep = mine.map((p) => ({ p, n: pe[p.player_id]?.rec_20 })).filter((x) => fin(x.n) && x.n > 0).sort((a, b) => b.n - a.n)[0] || null
  const rb = mine.filter((p) => p.position === 'RB' && fin(p.stats?.RUYD)).sort((a, b) => b.stats.RUYD - a.stats.RUYD)[0] || null
  const hands = mine.filter((p) => fin(p.stats?.REC)).sort((a, b) => b.stats.REC - a.stats.REC)[0] || null
  const q = matchup?.qb_pressure
  const qbId = q?.starter?.[off]
  const qb = qbId ? q.qbs?.[qbId] : null
  const qbPlayer = qbId ? mine.find((p) => p.player_id === qbId) || null : null
  return { bestVs, deep, rb, hands, qb, qbPlayer }
}

/** The rows for OFF attacking DEF, most extreme trait first. Each row: { k, word, val, rank, tier, player, name, why }. */
export function attackRows(matchup, players, off, def) {
  if (!matchup || !off || !def) return []
  const P = picks(matchup, players, off)
  const rows = []
  const add = (k, word, val, rank, who, why) => { if (who && why) rows.push({ k, word, val, rank, tier: tierOf(rank), player: who.player || null, name: who.name, why }) }
  const asWho = (p) => (p ? { player: p, name: p.name } : null)

  const dis = matchup.disruption_team || {}
  const pr = dis[def]?.pressure?.created_pct
  if (fin(pr)) {
    const r = rankIn(dis, (x) => x?.pressure?.created_pct, pr)
    const t = tierOf(r)
    if (t === 0 && P.hands) add('rush', 'GETS HOME', `${pr}%`, r, asWho(P.hands), `quick throws: ${r1(P.hands.stats.REC)} catches a game`)
    else if (t === 2 && P.deep) add('rush', 'NO PASS RUSH', `${pr}%`, r, asWho(P.deep.p), `time to go deep: ${P.deep.n} catches of 20+`)
    else if (P.qb && fin(P.qb.pressure_pct)) add('rush', 'AVERAGE RUSH', `${pr}%`, r, { player: P.qbPlayer, name: P.qb.name }, `pressured on ${P.qb.pressure_pct}% of dropbacks`)
  }

  const td = matchup.tendencies?.defense || {}
  const bl = td[def]?.blitz_pct
  if (fin(bl) && P.qb?.blitz?.n >= 10 && P.qb?.no_blitz?.n >= 10) {
    const r = rankIn(td, (x) => x?.blitz_pct, bl)
    const beats = P.qb.blitz.ypd >= P.qb.no_blitz.ypd
    add('blitz', ['BLITZ-HEAVY', 'BLITZES SOME', 'SITS BACK'][tierOf(r)], `${bl}%`, r, { player: P.qbPlayer, name: P.qb.name },
      `${P.qb.blitz.ypd} yds a dropback blitzed (${P.qb.no_blitz.ypd} not): ${beats ? 'he beats it' : 'it hurts him'}`)
  }

  const ct = matchup.coverage_team || {}
  const c = ct[def]
  if (c && fin(c.zone_pct) && fin(c.man_pct)) {
    const cov = c.zone_pct >= c.man_pct ? 'zone' : 'man'
    const v = c[`${cov}_pct`]
    const r = rankIn(ct, (x) => x?.[`${cov}_pct`], v)
    const b = P.bestVs(cov)
    if (b) add('cover', (cov === 'zone' ? ['ZONE TEAM', 'MOSTLY ZONE', 'LIGHT ZONE'] : ['MAN TEAM', 'MOSTLY MAN', 'LIGHT MAN'])[tierOf(r)], `${v}% ${cov}`, r, asWho(b.p), `${b.s.ypt} yds a target vs ${cov}`)
  }

  const ex = matchup.def_explosive || {}
  const dp = ex[def]?.deep_pct
  if (fin(dp)) {
    const r = rankIn(ex, (x) => x?.deep_pct, dp)
    const t = tierOf(r)
    if (t === 2 && P.hands) add('deep', 'CLOSES DEEP', `${dp}%`, r, asWho(P.hands), `go underneath: ${r1(P.hands.stats.REC)} catches a game`)
    else if (P.deep) add('deep', t === 0 ? 'BEATABLE DEEP' : 'AVERAGE DEEP', `${dp}%`, r, asWho(P.deep.p), `deep threat: ${P.deep.n} catches of 20+`)
  }
  const xp = ex[def]?.exp_pct
  if (fin(xp)) {
    const r = rankIn(ex, (x) => x?.exp_pct, xp)
    const t = tierOf(r)
    if (t === 2 && P.rb) add('big', 'NO BIG PLAYS', `${xp}%`, r, asWho(P.rb), `grind it: ${r1(P.rb.stats.RUYD)} rush yds a game`)
    else if (P.deep) add('big', t === 0 ? 'GIVES UP BIG PLAYS' : 'SOME BIG PLAYS', `${xp}%`, r, asWho(P.deep.p), `${P.deep.n} catches of 20+`)
  }

  const b8 = td[def]?.box8_pct
  if (fin(b8)) {
    const r = rankIn(td, (x) => x?.box8_pct, b8)
    const t = tierOf(r)
    const cov = c && fin(c.zone_pct) && fin(c.man_pct) ? (c.zone_pct >= c.man_pct ? 'zone' : 'man') : null
    const b = cov ? P.bestVs(cov) : null
    if (t === 0 && b) add('box', 'STACKS THE BOX', `${b8}%`, r, asWho(b.p), `throw it: ${b.s.ypt} yds a target vs ${cov}`)
    else if (P.rb) add('box', t === 2 ? 'LIGHT BOXES' : 'NORMAL BOX', `${b8}%`, r, asWho(P.rb), `run it: ${r1(P.rb.stats.RUYD)} rush yds a game`)
  }

  return rows.sort((a, b) => Math.abs(b.rank - 16.5) - Math.abs(a.rank - 16.5))
}
