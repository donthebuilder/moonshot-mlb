import { mostWord } from '../format'
import { SIDES, DEPTHS, LANES } from './fieldModel'

// THE GAME PAGE'S MATCHUP NUMBERS, PURE. The zone keys (zonesOf) and the scoreboard's rows. The old one-field
// offense-vs-defense model (gameField / fieldSentence) left with the big field, 10-19: the small field
// (components/nfl/GameFieldSmall.js) reads lib/nfl/throwMap.js and the field file's grids directly.

export const zonesOf = (pass) => (pass ? SIDES.flatMap((s) => DEPTHS.map((d) => `${s}|${d}`)) : LANES)

// ── THE SCOREBOARD'S ROWS (2026-10-06) ───────────────────────────────────────
// Four numbers that decide a game, each said as one plain phrase per defense,
// ranked against the other 31 clubs, read from the matchup file's own tables.
// rank 1 = the most of it in the league.
const finite = (v) => typeof v === 'number' && Number.isFinite(v)
function league(map, pick) {
  const vs = Object.entries(map || {}).map(([t, d]) => [t, pick(d)]).filter(([, v]) => finite(v))
  const sorted = vs.map(([, v]) => v).sort((a, b) => a - b)
  const mid = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null
  return { vs: new Map(vs), min: sorted[0], max: sorted[sorted.length - 1], mid, n: sorted.length }
}
const rankIn = (L, team) => {
  const v = L.vs.get(team)
  return finite(v) ? 1 + [...L.vs.values()].filter((x) => x > v).length : null
}
// 1 = the most in the league. The top half says "Nth most", the bottom half
// counts from the other end ("9th fewest") so no number ever reads as a score.
// (lib/format.js mostWord: the same rule, shared with the other pages that say "Nth most")

function cell(L, team, text, chip = null) {
  const v = L.vs.get(team)
  if (!finite(v) || !(L.max > L.min)) return null
  const r = rankIn(L, team)
  // 0..1 along the league's own range, and where the league's middle sits
  const pos = (v - L.min) / (L.max - L.min)
  const mid = (L.mid - L.min) / (L.max - L.min)
  return { team, text, chip, rank: r, word: mostWord(r, L.n), pos, mid }
}

/** [{ key, label, cells: [cell(def A), cell(def B)] }]: pass rush, blitz, zone / man, deep passes. */
export function scoreboardRows(matchup, a, b) {
  const rows = []
  const dis = league(matchup?.disruption_team, (d) => d?.pressure?.created_pct)
  if (dis.n) rows.push({ key: 'rush', label: 'Pass rush', cells: [a, b].map((t) => cell(dis, t, `${t} get to the QB on ${pctN(dis.vs.get(t) ?? 0)} of dropbacks`, { value: pctN(dis.vs.get(t) ?? 0), label: 'pass rush' })) })
  const bl = league(matchup?.tendencies?.defense, (d) => d?.blitz_pct)
  if (bl.n) {
    const g = (t) => matchup?.tendencies?.defense?.[t]?.games
    rows.push({ key: 'blitz', label: 'Blitz', cells: [a, b].map((t) => { const c = cell(bl, t, `${t} send extra rushers on ${pctN(bl.vs.get(t) ?? 0)} of dropbacks`, { value: pctN(bl.vs.get(t) ?? 0), label: 'blitz' }); if (c && finite(g(t)) && g(t) < 4) c.early = g(t); return c }) })
  }
  const cov = (t) => matchup?.coverage_team?.[t]
  const dom = (t) => (cov(t) && finite(cov(t).zone_pct) && finite(cov(t).man_pct) ? (cov(t).zone_pct >= cov(t).man_pct ? 'zone' : 'man') : null)
  const covCell = (t) => {
    const d = dom(t)
    if (!d) return null
    const L = league(matchup?.coverage_team, (x) => x?.[`${d}_pct`])
    return cell(L, t, `${t} play ${d} on ${pctN(cov(t)[`${d}_pct`])} of passes`, { value: pctN(cov(t)[`${d}_pct`]), label: `${d} coverage` })
  }
  const cc = [a, b].map(covCell)
  if (cc.some(Boolean)) rows.push({ key: 'cover', label: 'Zone or man', cells: cc })
  const ex = league(matchup?.def_explosive, (d) => d?.pass_20)
  if (ex.n) rows.push({ key: 'deep', label: 'Long passes allowed', cells: [a, b].map((t) => cell(ex, t, `${t} have allowed ${ex.vs.get(t)} passes of 20+ yards`, { value: String(ex.vs.get(t)), label: 'passes of 20+ yds allowed' })) })
  return rows.filter((r) => r.cells.some(Boolean))
}

/** Edge word for a pass offense against a defense: how many yards that defense allows a team's top receiver. */
export function receiverEdge(matchup, off, def) {
  const wr1 = matchup?.dvp?.season?.[def]?.WR1
  const r = wr1?.recyd_g_rank
  const n = Object.keys(matchup?.dvp?.season || {}).length
  if (!finite(wr1?.recyd_g) || !finite(r) || !n) return null
  // rank 1 = the most yards allowed
  const third = Math.ceil(n / 3)
  const word = r <= third ? `Edge: ${off}` : r > n - third ? `Edge: ${def}` : 'Even'
  return { word, yds: wr1.recyd_g, rank: r, n, side: r <= third ? off : r > n - third ? def : null }
}
