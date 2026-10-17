// BEST ANGLES FOR ONE NBA GAME (BUCKETS' slate card, components/slate/SlateCard.js; the picker is lib/slate/angles.js). Shown only while BUCKETS is public.
// PURE. The same fields as BUCKETS' Weak spots card (components/buckets/BucketsWeakSpots.js) and the hot hands feed (lib/nba/hot.js):
//   THE WEAK SPOT   a defence whose points allowed a game (the board's oppPts leg) is in tonight's top third of the clubs playing, with that number.
//   MATCHUP row     the man of the club facing it with the most points a game (at least MIN_MINUTES a night).
//   FORM row        the man of the game scoring the most over his last 5 games, when that is above his own season average (the hot hands feed).
// A score is a rank, never a chance. The caller's `hiddenOf` (the member gate) is applied in lib/slate/angles.js.
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
export const MIN_MINUTES = 20

/** { weak, matchup: [candidate], form: [candidate] }. `rows` = the points board's rows for the whole night; `hot` = /api/buckets/hot rows (may be null). */
export function nbaGameAngles({ game, rows = [], hot = null, hrefOf = () => undefined }) {
  const away = game?.away?.abbrev; const home = game?.home?.abbrev
  const mk = (r, why, extra) => ({ key: String(r.playerId), pid: r.playerId, name: r.name, team: r.team, why, href: hrefOf(r.playerId), row: r, ...extra })
  const allow = new Map()
  for (const r of rows) { const v = num(r.legs?.oppPts); if (v != null) allow.set(r.opp, v) }
  const vals = [...allow.values()].sort((a, b) => a - b)
  let weak = null
  if (vals.length >= 3) {
    const cut = vals[Math.floor((vals.length - 1) * (2 / 3))]
    for (const [def, att] of [[home, away], [away, home]]) {
      const pa = allow.get(def)
      if (pa != null && pa >= cut && (!weak || pa > weak.pa)) weak = { def, att, pa }
    }
  }
  const matchupC = []
  if (weak) {
    for (const r of rows) {
      if (r.gameId !== game.id || r.team !== weak.att) continue
      const p = num(r.legs?.ptsPg); const m = num(r.legs?.minPg)
      if (p != null && m != null && m >= MIN_MINUTES) matchupC.push(mk(r, `${p.toFixed(1)} points a game against ${weak.def}, who allow ${weak.pa.toFixed(1)}`, { fit: p }))
    }
  }
  const formC = []
  for (const h of hot || []) {
    if (h.gameId !== game?.id) continue
    const l5 = num(h.pts?.l5); const szn = num(h.pts?.szn)
    if (l5 != null && szn != null && l5 > szn && l5 >= 15) formC.push(mk(h, `${l5.toFixed(1)} points a game in his last 5 (${szn.toFixed(1)} on the season)`, { form: l5 }))
  }
  return { weak: weak ? `Weak spot: ${weak.def} allow ${weak.pa.toFixed(1)} points a game, top third of tonight's clubs` : null, matchup: matchupC, form: formC }
}
