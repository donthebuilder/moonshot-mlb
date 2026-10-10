// THE FOOTBALL DEPTH FOR THE FULL WRITE-UP (2026-10-07, Donovan: "much deeper. NFL:
// coverages, matchups, real route / target / pressure numbers. Only real data").
//
// PURE: (one player row of nfl_week.json, nfl_matchup.json) -> sections of lines.
// Every line is { t, src, v }: the sentence, the file field it was built from, and every
// number the sentence prints. A field that is missing or too thin writes NO line; nothing
// is filled in and nothing is random. scripts/writeups/test-nfl-depth.mjs fails if a
// sentence prints a number that is not in its own `v`, or a `v` that is not in the input.
// Same shape as lib/writeups/nhl.js (line(t, src, ...v)).
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const line = (t, src, ...v) => ({ t, src, v: v.filter((x) => x != null) })
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`
const r1 = (v) => Math.round(v * 10) / 10
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : /(?:ch|sh)$/.test(w) ? 'es' : 's'}`

export const SHELL_WORD = { C0: 'Cover 0', C1: 'Cover 1', C2: 'Cover 2', C3: 'Cover 3', C4: 'Cover 4', C6: 'Cover 6', C9: 'Cover 9', C2M: '2-Man' }
const ROLE_WORD = { WR1: 'WR1s', WR2: 'WR2s', WR3: 'WR3s', TE1: 'TE1s', TE2: 'TE2s', RB1: 'RB1s', RB2: 'RB2s', QB: 'QBs', 'Other WR': 'other WRs', 'Other TE': 'other TEs', 'Other RB': 'other RBs' }
export const MIN_TGT = 10          // a man / zone split under this is not read
export const MIN_SHELL_N = 50      // charted snaps before a defense's shell mix is read

/**
 * @param p        a players[] row of nfl_week.json
 * @param matchup  nfl_matchup.json
 * @returns [{ key, title, lines: [{t, src, v}] }]  (empty sections are dropped)
 */
export function nflDepth(p, matchup, slateSeason = null) {
  if (!p?.player_id || !matchup) return []
  const id = p.player_id, opp = p.opp
  const s = p.stats || {}
  const out = []
  // EVERY LINE SAYS WHICH SEASON (2026-10-10): the stats tables (snaps, red zone, pressure, explosive plays, defense-vs-position) are the file's
  // `season`; coverage, routes and the defense's pressure mix are the charting clock's `chart_season` (published once a year). A line is tagged
  // "(this season)" or "(last season)" against the slate's season, from the file's own year, never assumed. No slate season, no tag.
  const slate = num(slateSeason)
  const word = (yr) => (slate && num(yr) ? (num(yr) >= slate ? ' (this season)' : num(yr) === slate - 1 ? ' (last season)' : ` (${num(yr)})`) : '')
  const dvpRow = (opp2, role2) => matchup.dvp?.season?.[opp2]?.[role2]
  const seasonTag = (l) => {
    const src = l.src || ''
    if (/^(route_value|coverage_|disruption_team)/.test(src)) return word(matchup.chart_season)
    if (/^dvp\.season\./.test(src)) { const [, , o, r] = src.split('.'); return word(dvpRow(o, r)?.s ?? matchup.season) }
    if (/^(snaps|red_zone|qb_pressure|player_explosive|def_explosive)/.test(src)) return word(matchup.season)
    return ''
  }
  const add = (key, title, lines) => { const l = lines.filter(Boolean).map((x) => { const w = seasonTag(x); return w ? { ...x, t: x.t + w } : x }); if (l.length) out.push({ key, title, lines: l }) }

  // ── usage: snaps, targets, routes ──
  const sn = matchup.snaps?.[id]
  const usage = []
  if (sn && num(sn.snap_pct) != null && num(sn.games) != null) usage.push(line(`On the field for ${sn.snap_pct}% of his team's snaps over ${plural(sn.games, 'game')}`, 'snaps[id].snap_pct / games', sn.snap_pct, sn.games))
  if (sn && num(sn.trend) != null && Math.abs(sn.trend) >= 3 && num(sn.recent_pct) != null) usage.push(line(`${sn.trend > 0 ? 'Up' : 'Down'} to ${sn.recent_pct}% in his recent games`, 'snaps[id].recent_pct / trend', sn.recent_pct))
  if (p.position !== 'RB' && p.position !== 'QB' && num(s['TGT%']) != null) {
    const sh = r1(100 * s['TGT%'])
    usage.push(line(`${sh}% of his team's targets${num(s.TGT) != null ? `, ${s.TGT} a game` : ''}`, "stats['TGT%'] / stats.TGT", sh, num(s.TGT)))
  } else if (p.position === 'RB' && num(s.CAR) != null) usage.push(line(`${s.CAR} carries a game`, 'stats.CAR', s.CAR))
  const rv = matchup.route_value?.[id]
  const routes = rv?.routes ? Object.entries(rv.routes).filter(([, r]) => num(r.targets) != null).sort((a, b) => b[1].targets - a[1].targets) : []
  if (routes[0] && routes[0][1].targets >= 8) usage.push(line(`His most-targeted route is the ${routes[0][0].toLowerCase()}: ${routes[0][1].targets} targets, ${routes[0][1].yds_per_tgt} yards a target`, 'route_value[id].routes', routes[0][1].targets, num(routes[0][1].yds_per_tgt)))
  if (rv?.best_route && num(rv.best_yds_per_tgt) != null && rv.routes?.[rv.best_route]?.targets >= 8 && rv.best_route !== routes[0]?.[0]) usage.push(line(`His best route by yards a target is the ${rv.best_route.toLowerCase()}, ${rv.best_yds_per_tgt}`, 'route_value[id].best_route', rv.best_yds_per_tgt))
  add('usage', 'ROLE AND USAGE', usage)

  // ── coverage he faces ──
  const cov = matchup.coverage_player?.[id], oc = matchup.coverage_team?.[opp]
  const covL = []
  for (const k of ['zone', 'man']) {
    const c = cov?.[k]
    if (c && num(c.tgts) >= MIN_TGT && num(c.ypt) != null) covL.push(line(`Against ${k}: ${c.tgts} targets, ${c.ypt} yards a target, ${c.catch_pct}% caught${c.td ? `, ${plural(c.td, 'touchdown')}` : ''}`, `coverage_player[id].${k}`, c.tgts, c.ypt, num(c.catch_pct), num(c.td) || null))
  }
  if (oc && num(oc.man_pct) != null && num(oc.zone_pct) != null) covL.push(line(`${opp} play ${oc.zone_pct}% zone and ${oc.man_pct}% man`, 'coverage_team[opp].zone_pct / man_pct', oc.zone_pct, oc.man_pct))
  if (oc?.shells && num(oc.shell_n) >= MIN_SHELL_N) {
    const top = Object.entries(oc.shells).sort((a, b) => b[1] - a[1]).slice(0, 2)
    if (top.length === 2) covL.push(line(`Their shells: ${SHELL_WORD[top[0][0]] || top[0][0]} ${top[0][1]}%, then ${SHELL_WORD[top[1][0]] || top[1][0]} ${top[1][1]}% (${oc.shell_n} charted snaps)`, 'coverage_team[opp].shells / shell_n', top[0][1], top[1][1], oc.shell_n))
  }
  if (cov?.zone && cov?.man && cov.zone.tgts >= MIN_TGT && cov.man.tgts >= MIN_TGT) {
    const d = cov.zone.ypt - cov.man.ypt
    if (Math.abs(d) >= 1) {
      const better = d > 0 ? 'zone' : 'man'
      const share = better === 'zone' ? oc?.zone_pct : oc?.man_pct
      covL.push(line(`He is better against ${better}${share != null ? `, and ${opp} play it ${share}% of the time` : ''}`, 'coverage_player[id] ypt gap >= 1 / coverage_team[opp]', share != null ? share : null))
    }
  }
  add('coverage', 'COVERAGE HE FACES', covL)

  // ── pressure ──
  const pr = []
  const qp = matchup.qb_pressure?.qbs?.[id]
  if (qp && num(qp.dropbacks) >= 30 && num(qp.pressure_pct) != null) pr.push(line(`Pressured on ${qp.pressure_pct}% of ${qp.dropbacks} dropbacks, ${plural(qp.sacks, 'sack')} taken`, 'qb_pressure.qbs[id]', qp.pressure_pct, qp.dropbacks, num(qp.sacks)))
  const dis = matchup.disruption_team?.[opp]?.pressure
  if (dis && num(dis.created_pct) != null && num(dis.created_plays) != null) pr.push(line(`${opp} brought pressure on ${dis.created_pct}% of ${dis.created_plays} plays`, 'disruption_team[opp].pressure.created_pct / created_plays', dis.created_pct, dis.created_plays))
  add('pressure', 'PRESSURE', pr)

  // ── red zone and the air ──
  const rz = []
  const red = matchup.red_zone?.[id]
  if (red && num(red.touches) >= 3) rz.push(line(`${plural(red.touches, 'red-zone touch')}, ${plural(red.tds, 'touchdown')}`, 'red_zone[id].touches / tds', red.touches, num(red.tds)))
  if (num(s.RZ) != null && num(s.GL) != null && s.RZ > 0) rz.push(line(`${s.RZ} red-zone touches a game, ${s.GL} at the goal line`, 'stats.RZ / stats.GL', s.RZ, s.GL))
  const ex = matchup.player_explosive?.[id]
  if (ex && num(ex.tgts) >= MIN_TGT) {
    if (num(ex.rec_20) != null) rz.push(line(`${plural(ex.rec_20, 'catch')} of 20+ yards, longest ${ex.lng}`, 'player_explosive[id].rec_20 / lng', ex.rec_20, 20, num(ex.lng)))
  }
  if (num(s.AIRYD) != null) rz.push(line(`${s.AIRYD} air yards a game`, 'stats.AIRYD', s.AIRYD))
  if (num(s.WOPR) != null) rz.push(line(`Receiver opportunity rating (WOPR) ${s.WOPR}`, 'stats.WOPR', s.WOPR))
  add('rz', 'RED ZONE AND AIR YARDS', rz)

  // ── what the opponent allows to his chair ──
  const role = matchup.roles?.[id]
  const d = role && matchup.dvp?.season?.[opp]?.[role]
  const al = []
  if (d && num(d.g) >= 1) {
    const w = ROLE_WORD[role] || role
    if (num(d.td_rank) != null) al.push(line(`${opp} rank ${ord(d.td_rank)} of 32 for touchdowns allowed to ${w}, ${plural(d.g, 'game')}${d.g < 3 ? ', early' : ''}`, `dvp.season.${opp}.${role}.td_rank`, d.td_rank, 32, d.g))
    const ys = p.position === 'RB' ? 'rshyd_g' : 'recyd_g'
    if (num(d[ys]) != null && num(d[`${ys}_rank`]) != null) al.push(line(`They allow ${d[ys]} ${p.position === 'RB' ? 'rushing' : 'receiving'} yards a game to ${w}, ${ord(d[`${ys}_rank`])}-most`, `dvp.season.${opp}.${role}.${ys}`, d[ys], d[`${ys}_rank`]))
  }
  const de = matchup.def_explosive?.[opp]
  if (de && num(de.pass_20) != null && p.position !== 'RB') al.push(line(`${opp} have allowed ${de.pass_20} pass plays of 20+ yards${num(de.deep_pct) != null && num(de.deep_att) >= 8 ? `; deep throws against them are caught ${de.deep_pct}% of the time (${de.deep_att} attempts)` : ''}`, 'def_explosive[opp].pass_20 / deep_pct', de.pass_20, 20, num(de.deep_pct) != null && num(de.deep_att) >= 8 ? de.deep_pct : null, num(de.deep_att) >= 8 ? de.deep_att : null))
  add('allowed', 'WHAT THE DEFENSE ALLOWS', al)

  return out
}

/** Every integer or decimal in a sentence, as numbers (a "20+" counts as 20). */
export function numbersIn(text) {
  return (String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number)
}
