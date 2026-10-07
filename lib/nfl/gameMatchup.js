import { C } from './theme'
import { ordinal } from '../format'
import { fieldModel, SIDES, DEPTHS, LANES, phrase, LANE_WORD, HEAT_FULL, SPOT_MIN_DEF_ATT } from './fieldModel'

// THE GAME PAGE'S OFFENSE-vs-DEFENSE MODEL, PURE (2026-10-06, fix5-nflgame).
//
// Donovan: the page must answer, in order, WHERE DOES THIS OFFENSE ATTACK?
// WHERE IS THIS DEFENSE VULNERABLE? DO THEY OVERLAP? Nothing here is a new
// stat. The defense half is fieldModel's own leak (yards per target / carry
// against the league, by zone -- the numbers 'where each defense gets beaten'
// always printed). The offense half is the same field file's player grids
// summed over the team's players: every target / carry the team's receivers
// and runners took, by the same zones. The overlap is their product -- a zone
// only counts when the offense really goes there AND the defense really leaks
// there, so a fluke on either side never rings a tile.

export const zonesOf = (pass) => (pass ? SIDES.flatMap((s) => DEPTHS.map((d) => `${s}|${d}`)) : LANES)

// A ring needs: the offense's real usage (not a handful of plays), a zone it
// uses at least as much as an even split would, and a defense that gives up
// clearly more than the league there.
export const OVERLAP_MIN_PLAYS = 20
export const OVERLAP_MIN_LEAK = 10

const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x)

/** The team's own targets (pass) or carries (run) by zone, from the player grids. */
export function offenseGrid({ field, players, team, pass }) {
  const src = pass ? field?.player_pass : field?.player_rush
  if (!src || !team) return null
  const zones = zonesOf(pass)
  const by = Object.fromEntries(zones.map((z) => [z, { att: 0, td: 0, share: 0 }]))
  let total = 0
  for (const p of players || []) {
    if (p.team !== team) continue
    const g = src[p.player_id]
    if (!g) continue
    for (const z of zones) {
      const c = g[z]
      if (!c) continue
      by[z].att += c.att || 0
      by[z].td += c.td || 0
      total += c.att || 0
    }
  }
  if (!(total > 0)) return null
  for (const z of zones) by[z].share = (100 * by[z].att) / total
  return { by, total }
}

/** One field, one direction: `off` attacking `def`. */
export function gameField({ field, players, off, def, pass }) {
  const zones = zonesOf(pass)
  const dm = fieldModel({ field, defTeam: def, mode: 'def', pass })
  const og = offenseGrid({ field, players, team: off, pass })
  if (!dm && !og) return null
  const even = 100 / zones.length
  const cells = zones.map((z) => {
    const d = dm?.by?.[z] || null
    const o = og?.by?.[z] || null
    const leak = Number.isFinite(d?.leak) ? d.leak : null
    const share = o ? o.share : null
    const ov = share != null && leak != null && leak > 0 ? (share / 100) * Math.min(leak, HEAT_FULL) : 0
    const qual = og != null && og.total >= OVERLAP_MIN_PLAYS && share != null && share >= even && leak != null && leak >= OVERLAP_MIN_LEAK && (d?.att || 0) >= SPOT_MIN_DEF_ATT
    return { z, qual, share, att: o?.att || 0, tdOff: o?.td || 0, leak, defAtt: d?.att || 0, tdDef: d?.tdN || 0, ov, where: d?.where || (pass ? phrase(z) : LANE_WORD[z]) }
  })
  const maxShare = Math.max(0, ...cells.map((c) => c.share || 0))
  // a tile only glows at full strength when it qualifies for the ring; a zone that
  // is merely a little of each stays dim, so "no clear overlap" never shows a bright tile
  const maxOv = Math.max(0, ...cells.filter((c) => c.qual).map((c) => c.ov)) || Math.max(0, ...cells.map((c) => c.ov))
  let ring = null
  for (const c of cells) if (c.qual && (!ring || c.ov > ring.ov)) ring = c
  const topShare = cells.reduce((a, c) => ((c.share || 0) > (a?.share || -1) ? c : a), null)
  const softest = dm?.spot ? cells.find((c) => c.z === dm.spot.z) : null
  return { cells, by: Object.fromEntries(cells.map((c) => [c.z, c])), maxShare, maxOv, ring, topShare, softest, spot: dm?.spot || null, total: og?.total || 0, hasOff: Boolean(og), hasDef: Boolean(dm), even }
}

const pctN = (v) => `${Math.round(v)}%`
const laneBit = (z) => String(LANE_WORD[z] || z).replace(/^runs /, '')

/** The headline, verdict first, in three parts so the key phrase can be bold:
 *  { a, b, c, detail }  ->  a + <b>b</b> + c, then the numbers in `detail`. */
export function fieldSentence({ gf, mode, off, def, pass }) {
  const unit = pass ? 'targets' : 'carries'
  const where = (c) => (pass ? phrase(c.z) : laneBit(c.z))
  const verb = pass ? 'throws' : 'runs'
  const tail = pass ? 'a target' : 'a carry'
  const none = (t) => ({ a: t, b: '', c: '', detail: '' })
  if (!gf) return none(`No ${pass ? 'passing' : 'running'} map for ${off} against ${def} yet.`)
  if (mode === 'attack') {
    const t = gf.topShare
    if (!gf.hasOff || !t || !(t.share > 0)) return none(`Not enough ${unit} for ${off} yet to say where they go.`)
    return { a: `${off} ${verb} `, b: where(t), c: '.', detail: `${pctN(t.share)} of its ${unit} go there, its busiest spot.` }
  }
  if (mode === 'defend') {
    const s = gf.softest
    if (!gf.hasDef) return none(`No ${pass ? 'passing' : 'running'} map for ${def} yet.`)
    if (!s) return none(`${def} have no clear weak spot.`)
    return { a: `${def} are weak against `, b: pass ? phrase(s.z) : LANE_WORD[s.z], c: '.', detail: `${pctN(s.leak)} more yards ${tail} than a normal defense${s.tdDef ? `, with ${s.tdDef} touchdown${s.tdDef === 1 ? '' : 's'} allowed` : ''}.` }
  }
  const r = gf.ring
  if (r) return { a: `${off} ${verb} `, b: where(r), c: `. ${def} give it up there.`, detail: `${off} sends ${pctN(r.share)} of its ${unit} there; ${def} give up ${pctN(r.leak)} more yards ${tail} than a normal defense.` }
  const t = gf.topShare
  if (gf.hasOff && gf.total >= OVERLAP_MIN_PLAYS && t && gf.hasDef) {
    const l = t.leak
    return { a: `No clear overlap. ${cap(off)}'s busiest spot is `, b: where(t), c: '.', detail: `${pctN(t.share)} of its ${unit}; there ${def} ${l == null ? 'have too few plays to call it' : l >= 1 ? `give up ${pctN(l)} more than a normal defense` : 'are about normal or better'}.` }
  }
  return none(`Not enough ${unit} yet to say where ${off} and ${def} meet.`)
}

// ── the one hue ramp: TUDDY's accent over the turf ───────────────────────────
const hex = (h) => {
  const s = String(h).replace('#', '')
  const f = s.length === 3 ? s.split('').map((x) => x + x).join('') : s
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}
const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) }

const ACC = hex(C.green)
const GROUND = hex(C.turf2)
const INK_LIGHT = hex(C.text)
const INK_DARK = hex(C.bg)
const A_MIN = 0.14, A_MAX = 0.94

/** heat 0..1 -> { fill, ink } : the accent at an alpha, and whichever of the two inks clears AA on it. */
export function accentRamp(heat) {
  const t = Math.max(0, Math.min(1, heat))
  const a = A_MIN + (A_MAX - A_MIN) * t
  const bg = ACC.map((v, i) => Math.round(v * a + GROUND[i] * (1 - a)))
  const ink = contrast(bg, INK_DARK) >= contrast(bg, INK_LIGHT) ? C.bg : C.text
  return { fill: `color-mix(in srgb, ${C.green} ${Math.round(a * 100)}%, transparent)`, ink, ratio: Math.max(contrast(bg, INK_DARK), contrast(bg, INK_LIGHT)) }
}

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
const mostWord = (r, n) => {
  if (r == null) return null
  if (r === 1) return 'most in the league'
  if (r <= Math.ceil(n / 2)) return `${ordinal(r)} most`
  const k = n + 1 - r
  return k === 1 ? 'fewest in the league' : `${ordinal(k)} fewest`
}

function cell(L, team, text) {
  const v = L.vs.get(team)
  if (!finite(v) || !(L.max > L.min)) return null
  const r = rankIn(L, team)
  // 0..1 along the league's own range, and where the league's middle sits
  const pos = (v - L.min) / (L.max - L.min)
  const mid = (L.mid - L.min) / (L.max - L.min)
  return { team, text, rank: r, word: mostWord(r, L.n), pos, mid }
}

/** [{ key, label, cells: [cell(def A), cell(def B)] }]: pass rush, blitz, zone / man, deep passes. */
export function scoreboardRows(matchup, a, b) {
  const rows = []
  const dis = league(matchup?.disruption_team, (d) => d?.pressure?.created_pct)
  if (dis.n) rows.push({ key: 'rush', label: 'Pass rush', cells: [a, b].map((t) => cell(dis, t, `${t} get to the QB on ${pctN(dis.vs.get(t) ?? 0)} of dropbacks`)) })
  const bl = league(matchup?.tendencies?.defense, (d) => d?.blitz_pct)
  if (bl.n) {
    const g = (t) => matchup?.tendencies?.defense?.[t]?.games
    rows.push({ key: 'blitz', label: 'Blitz', cells: [a, b].map((t) => { const c = cell(bl, t, `${t} send extra rushers on ${pctN(bl.vs.get(t) ?? 0)} of dropbacks`); if (c && finite(g(t)) && g(t) < 4) c.early = g(t); return c }) })
  }
  const cov = (t) => matchup?.coverage_team?.[t]
  const dom = (t) => (cov(t) && finite(cov(t).zone_pct) && finite(cov(t).man_pct) ? (cov(t).zone_pct >= cov(t).man_pct ? 'zone' : 'man') : null)
  const covCell = (t) => {
    const d = dom(t)
    if (!d) return null
    const L = league(matchup?.coverage_team, (x) => x?.[`${d}_pct`])
    return cell(L, t, `${t} play ${d} on ${pctN(cov(t)[`${d}_pct`])} of passes`)
  }
  const cc = [a, b].map(covCell)
  if (cc.some(Boolean)) rows.push({ key: 'cover', label: 'Zone or man', cells: cc })
  const ex = league(matchup?.def_explosive, (d) => d?.pass_20)
  if (ex.n) rows.push({ key: 'deep', label: 'Long passes allowed', cells: [a, b].map((t) => cell(ex, t, `${t} have allowed ${ex.vs.get(t)} passes of 20+ yards`)) })
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
