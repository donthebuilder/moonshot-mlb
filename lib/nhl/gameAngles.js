// BEST ANGLES FOR ONE NHL GAME (the shared game card, components/slate/SlateCard.js; the picker is lib/slate/angles.js).
// PURE. The same sources as the game write-up (lib/writeups/nhl.js), not a second reading:
//   THE WEAK SPOT   first of: (1) a CONFIRMED starting goalie who lets in more goals than the league from a named zone (lib/nhl/goalieWeak.js, the
//                   write-up's weakLine; needs the /api/lamp/goalieweak read and clears its sample floor), (2) a penalty kill under 78%
//                   (spots.pkPct, the write-up's own line), (3) a club allowing 3.3+ goals a game once the season is 10 games old (context.oppGaPg).
//                   None of them: no line.
//   MATCHUP row     the skater of the attacking club who fits it: the most shots a game against a weak net / a leaky defence, or the most
//                   power-play goals against a weak penalty kill (a leg or a field the board row carries).
//   FORM row        the skater balling out: goals in his last 5 games (row.form.l5), then shots a game (legs.shotsPg).
// A score is a rank, never a chance: nothing here prints a model probability. The caller's `hiddenOf` (the member gate) is applied in lib/slate/angles.js.
import { weakLine } from '../writeups/nhl'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
export const PK_WEAK = 0.78
export const GA_WEAK = 3.3
const GA_MIN_GAMES = 10
export const MIN_SHOTS_PG = 3

/** The confirmed starters of a game's two nets: [{ id, team (the club he plays for) }]. For the one /api/lamp/goalieweak read. */
export function confirmedGoalies(bg) {
  const a = bg?.game?.away?.abbrev; const h = bg?.game?.home?.abbrev
  return [['away', a], ['home', h]].map(([side, team]) => ({ e: bg?.starters?.[side], team })).filter(({ e }) => e?.confirmed === true && (e.playerId ?? e.id) != null)
    .map(({ e, team }) => ({ id: String(e.playerId ?? e.id), name: e.name, team }))
}

/** { weak, matchup: [candidate], form: [candidate] }. `goalieWeak` = { [goalieId]: readWeak payload } (may be null). */
export function nhlGameAngles({ bg, goalieWeak = null, hrefOf = () => undefined }) {
  const away = bg?.game?.away?.abbrev; const home = bg?.game?.home?.abbrev
  const rows = bg?.rows || []
  const mk = (r, why, extra) => ({ key: String(r.playerId), pid: r.playerId, name: r.name, team: r.team, why, href: hrefOf(r.playerId), row: r, ...extra })
  const sides = [[away, home, 'away'], [home, away, 'home']]   // [defending club, attacking club, defending side]

  // (1) a confirmed goalie's weak zone: the larger excess first
  let weak = null
  for (const [def, att, side] of sides) {
    const e = bg?.starters?.[side]
    const w = e?.confirmed === true ? goalieWeak?.[String(e.playerId ?? e.id)] : null
    const line = weakLine(e, goalieWeak)
    const ex = num(w?.spots?.[0]?.excess)
    if (line && (!weak || (ex ?? 0) > weak.ex)) weak = { text: `Weak spot: ${line.t}`, att, def, kind: 'goalie', goalie: e.name, ex: ex ?? 0 }
  }
  // (2) the weakest penalty kill under the line
  if (!weak) {
    let pk = null
    for (const [def, att, side] of sides) { const v = num(bg?.spots?.[side]?.pkPct); if (v != null && v < PK_WEAK && (!pk || v < pk.v)) pk = { v, def, att } }
    if (pk) weak = { text: `Weak spot: ${pk.def} penalty kill stops ${(100 * pk.v).toFixed(1)}% of power plays`, att: pk.att, def: pk.def, kind: 'pk', pk: pk.v }
  }
  // (3) goals allowed a game, once the season is old enough to mean it
  if (!weak) {
    let ga = null
    for (const [def, att] of sides) {
      const r = rows.find((x) => x.team === att)
      const v = num(r?.context?.oppGaPg)
      if (v != null && v >= GA_WEAK && (num(r?.legs?.gpCur) ?? 0) >= GA_MIN_GAMES && (!ga || v > ga.v)) ga = { v, def, att }
    }
    if (ga) weak = { text: `Weak spot: ${ga.def} allow ${ga.v.toFixed(2)} goals a game`, att: ga.att, def: ga.def, kind: 'ga' }
  }

  const matchupC = []
  if (weak) {
    for (const r of rows) {
      if (r.team !== weak.att) continue
      if (weak.kind === 'pk') {
        const ppg = num(r.ppg)
        if (ppg != null && ppg >= 1) matchupC.push(mk(r, `${ppg} power-play goal${ppg === 1 ? '' : 's'} this season vs ${weak.def}'s ${(100 * weak.pk).toFixed(1)}% kill`, { fit: ppg }))
      } else {
        const s = num(r.legs?.shotsPg)
        if (s != null && s >= MIN_SHOTS_PG) matchupC.push(mk(r, `${s.toFixed(1)} shots a game against ${weak.kind === 'goalie' ? weak.goalie : `${weak.def}'s defence`}`, { fit: s }))
      }
    }
  }

  const formC = []
  for (const r of rows) {
    const l5 = num(r.form?.l5); const gp5 = num(r.form?.gp5); const s = num(r.legs?.shotsPg)
    if (l5 != null && l5 >= 2 && (gp5 ?? 0) >= 3) formC.push(mk(r, `${l5} goals in last ${gp5} games${s != null ? ` · ${s.toFixed(1)} shots a game` : ''}`, { form: l5 + (s ?? 0) / 10 }))
    else if (s != null && s >= MIN_SHOTS_PG) formC.push(mk(r, `${s.toFixed(1)} shots a game`, { form: s / 10 }))
  }
  return { weak: weak?.text || null, matchup: matchupC, form: formC }
}
