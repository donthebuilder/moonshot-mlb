// A SKATER'S SEASON LINE AND FORM, AS WORDS (2026-10-17, NHL field audit). Pure, no server imports, so a card, a compare
// table and a Props tile can all show the SAME numbers the board's Season line / Form columns carry (the row's `szn` and `form`,
// lib/nhl/seasonLine.js), instead of each surface leaving them out. Display only: nothing here is a score, nothing is written.
//
//   nhlSeasonRows(r)        -> [{ label, value }] for the card back
//   nhlSeasonFacts(r)       -> ['12 G · 28 PTS · 31 GP', 'L5 2 G · drought 1'] for a tile's fact chips
//   sznFromLeagueRow(s)     -> the `szn` shape from a season-stats row (/api/lamp/seasonstats), for a skater with no board row tonight
//
// A zero is a zero ("0 G"), never a dash. A missing part is simply not listed (never invented).
const fin = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** The board row's `szn` shape (shPct in percent, g60 per 60) from a season-stats skater row (shPct a 0-1 fraction, toi seconds a game). */
export function sznFromLeagueRow(s) {
  const gp = fin(s?.gp)
  if (!s || gp == null || !(gp > 0)) return null
  const toi = fin(s.toi), g = fin(s.g)
  const shPct = fin(s.shPct)
  return {
    gp, g, a: fin(s.a), pts: fin(s.pts), s: fin(s.sog ?? s.shots),
    shPct: shPct == null ? null : Math.round(shPct * 1000) / 10,
    g60: toi != null && toi > 0 && g != null ? Math.round(((g * 3600) / (gp * toi)) * 100) / 100 : null,
  }
}

const gamesWord = (n) => `${n} ${n === 1 ? 'game' : 'games'}`

/** Card-back rows from a board row's season line and form. Empty when the row carries neither. */
export function nhlSeasonRows(r) {
  const z = r?.szn, f = r?.form
  const out = []
  if (z) {
    const gp = fin(z.gp), g = fin(z.g), a = fin(z.a), pts = fin(z.pts), s = fin(z.s), sp = fin(z.shPct), g60 = fin(z.g60)
    if (g != null) out.push({ label: gp != null ? `Season goals (${gp} GP)` : 'Season goals', value: String(g) })
    if (a != null) out.push({ label: 'Season assists', value: String(a) })
    if (pts != null) out.push({ label: 'Season points', value: String(pts) })
    if (s != null) out.push({ label: 'Season shots', value: sp != null ? `${s} (${sp.toFixed(1)}%)` : String(s) })
    if (g60 != null) out.push({ label: 'Goals per 60', value: g60.toFixed(2) })
  }
  if (f) {
    const l5 = fin(f.l5), g5 = fin(f.gp5), l10 = fin(f.l10), g10 = fin(f.gp10), d = fin(f.drought)
    if (l5 != null) out.push({ label: 'Last 5 goals', value: g5 != null && g5 < 5 ? `${l5} in ${gamesWord(g5)}` : String(l5) })
    if (l10 != null) out.push({ label: 'Last 10 goals', value: g10 != null && g10 < 10 ? `${l10} in ${gamesWord(g10)}` : String(l10) })
    if (d != null) out.push({ label: 'Games since a goal', value: f.droughtPlus ? `${d}+` : String(d) })
  }
  return out
}

/** Fact chips: the season line, then the form. [] when the row carries neither. */
export function nhlSeasonFacts(r) {
  const z = r?.szn, f = r?.form
  const out = []
  if (z) {
    const parts = []
    const g = fin(z.g), pts = fin(z.pts), gp = fin(z.gp)
    if (g != null) parts.push(`${g} G`)
    if (pts != null) parts.push(`${pts} PTS`)
    if (gp != null) parts.push(`${gp} GP`)
    if (parts.length) out.push(parts.join(' · '))
  }
  if (f) {
    const parts = []
    const l5 = fin(f.l5), d = fin(f.drought)
    if (l5 != null) parts.push(`L5 ${l5} G`)
    if (d != null) parts.push(`drought ${f.droughtPlus ? `${d}+` : d}`)
    if (parts.length) out.push(parts.join(' · '))
  }
  return out
}
