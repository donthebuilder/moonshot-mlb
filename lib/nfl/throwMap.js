// THE THROW MAP's numbers (components/nfl/ThrowMap.js). For the offense with the ball: each pass area (left / middle /
// right x behind, short, mid, deep), its share of the offense's targets, who got them there (this season's player_pass,
// the offense's players only), and how the defense does there: its yards a target against the league's, as a % (the
// same `leak` the old field read). Nothing modelled; counts and one ratio.
import { zonesOf } from './gameMatchup'

const MIN_DEF_ATT = 5   // a defense with fewer throws in an area says nothing about it

export function throwMap({ matchup, players = [], off, def }) {
  const f = matchup?.field
  if (!f || !off || !def) return null
  const zones = zonesOf(true)
  const mine = (players || []).filter((p) => p.team === off)
  const by = Object.fromEntries(zones.map((z) => [z, { att: 0, who: [] }]))
  for (const p of mine) {
    const pz = f.player_pass?.[p.player_id]
    if (!pz) continue
    for (const [z, v] of Object.entries(pz)) if (by[z] && v?.att > 0) { by[z].att += v.att; by[z].who.push({ player: p, tgt: v.att }) }
  }
  const tot = zones.reduce((n, z) => n + by[z].att, 0)
  if (!tot) return null
  const out = {}
  for (const z of zones) {
    const d = f.def_pass?.[def]?.[z], l = f.league_pass?.[z]
    const weak = d && l && d.att >= MIN_DEF_ATT && l.ypa ? Math.round(100 * (d.ypa / l.ypa - 1)) : null
    out[z] = { share: Math.round((100 * by[z].att) / tot), att: by[z].att, who: by[z].who.sort((a, b) => b.tgt - a.tgt), weak }
  }
  return { tot, zones: out }
}

/** weak: the defense gives up 10%+ more yards a target there; attack: weak and 15%+ of the offense's targets. */
export const throwFlags = (z) => ({ weak: z.weak != null && z.weak >= 10, atk: z.weak != null && z.weak >= 10 && z.share >= 15, tough: z.weak != null && z.weak <= -20 })
