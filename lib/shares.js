// SHARE OF TEAM, ONE HELPER (Donovan 2026-10-11: "snap share percent or like team share percent needs to be a column, and if
// that is possible for NHL too, do that"). Pure. Used by TUDDY (snap / target / carry / red-zone shares) and LAMP (ice-time /
// shot / goal shares); no table works a share out by itself.
//
// RULES (tested with TEST data in scripts/check-shares.mjs):
//   * a share is 0-100 (percent of the club's total), never a probability.
//   * a missing part or a missing / zero / negative / non-finite whole is BLANK (null), never 0. A zero share is a real zero:
//     a man with 0 shots on a club that took 400 has a 0% shot share.
//   * a club's total is the sum of its players' parts. If any player who played (gp > 0) is missing the part, the total is
//     unknown and every share on that club is blank: a total with a hole in it is not a denominator.
//   * the display rounds shares under 10 to one decimal and the rest to a whole number ("4.6%", "27%").

const fin = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** part / whole as a percent, or null when either is missing, or the whole is not above zero. */
export function sharePct(part, whole) {
  const p = fin(part), w = fin(whole)
  if (p == null || w == null || w <= 0 || p < 0) return null
  return (p / w) * 100
}

/** The stored precision: under 10 one decimal, else whole. (Display and sort agree on it.) */
export function roundShare(v) {
  const x = fin(v)
  if (x == null) return null
  return Math.abs(x) < 10 ? Math.round(x * 10) / 10 : Math.round(x)
}

/** "4.6%" / "27%" / "—". */
export function fmtShare(v) {
  const r = roundShare(v)
  if (r == null) return '—'
  return `${Math.abs(r) < 10 ? r.toFixed(1) : String(r)}%`
}

/** "+1.3" / "-0.4" / "0.0" / "—" : a change in share points (snap trend). */
export function fmtPoints(v) {
  const x = fin(v)
  if (x == null) return '—'
  const r = Math.round(x * 10) / 10
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}`
}

/**
 * A club's skaters -> each one's share of the club total on a few measures.
 * @param lines  [{ id, gp, toi, shots, g }]   toi = seconds per game, shots / g = season totals, all for THIS club
 * @returns Map(id -> { gp, toi, shots, goals })  each a percent, or null when its club total is unknown
 */
export function clubShares(lines = []) {
  const rows = (lines || []).filter((l) => l && l.id !== null && l.id !== undefined && l.id !== '')
  const played = rows.filter((l) => (fin(l.gp) || 0) > 0)
  // the total of one measure over the players who played; null if any of them lacks it
  const total = (valueOf) => {
    let t = 0
    for (const l of played) { const v = valueOf(l); if (v == null) return null; t += v }
    return t > 0 ? t : null
  }
  const toiOf = (l) => (fin(l.toi) != null && fin(l.gp) != null ? l.toi * l.gp : null)
  const totToi = total(toiOf), totShots = total((l) => fin(l.shots)), totGoals = total((l) => fin(l.g))
  const out = new Map()
  for (const l of rows) {
    const gp = fin(l.gp)
    out.set(String(l.id), gp > 0 ? { gp, toi: sharePct(toiOf(l), totToi), shots: sharePct(l.shots, totShots), goals: sharePct(l.g, totGoals) } : { gp: gp ?? null, toi: null, shots: null, goals: null })
  }
  return out
}

/** A snap trend in points -> a glyph: up / down / flat (inside +-1 point) / none. Same bar the table shows, no new threshold. */
export function trendGlyph(points) {
  const x = fin(points)
  if (x == null) return ''
  return x >= 1 ? '▲' : x <= -1 ? '▼' : '▬'
}
