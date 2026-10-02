// THE NAMED ZONES (BATCH-3D-V2 1h), browser-safe. The same rule as
// public.lamp_zone_of (supabase/migrations/202610020200_lamp_goalie_zones.sql),
// in the shot map's feet after every shot is turned to attack x = +89. Named
// zones people know, not the 5x5 grid: a goalie faces too few shots per cell
// on a 5x5 grid to colour honestly.
export const GOALIE_ZONES = [
  { key: 'crease', label: 'Crease', def: 'within 8 ft of the net mouth' },
  { key: 'inner_slot', label: 'Inner slot', def: 'between the dots, the house' },
  { key: 'slot', label: 'Slot', def: 'the rest of the middle, to the top of the circles' },
  { key: 'l_circle', label: 'Left circle', def: 'outside the dots, the shooter’s left' },
  { key: 'r_circle', label: 'Right circle', def: 'outside the dots, the shooter’s right' },
  { key: 'l_point', label: 'Left point', def: 'the blue line to the top of the circles, left' },
  { key: 'r_point', label: 'Right point', def: 'the blue line to the top of the circles, right' },
  { key: 'perimeter', label: 'Behind the net', def: 'behind the goal line' },
]
export const ZONE_LABEL = Object.fromEntries(GOALIE_ZONES.map((z) => [z.key, z.label]))

/** The SQL's zone rule, in JS (a shot already normalised to attack x = +89). */
export function zoneOf(x, y) {
  if (x <= 89 && Math.hypot(89 - x, y) <= 8) return 'crease'
  if (x > 89) return 'perimeter'
  if (x >= 69 && Math.abs(y) <= 9) return 'inner_slot'
  if (x >= 54 && Math.abs(y) <= 22) return 'slot'
  if (x >= 54) return y > 22 ? 'l_circle' : 'r_circle'
  return y >= 0 ? 'l_point' : 'r_point'
}

// The zones as rings of [x, y] points, NON-OVERLAPPING: each inner zone is a
// hole in the one around it, so a tint never doubles where they meet.
const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const creaseRing = () => {
  const pts = [[89, 8]]
  for (let i = 0; i <= 24; i++) { const a = Math.PI / 2 + (Math.PI * i) / 24; pts.push([89 + 8 * Math.cos(a), 8 * Math.sin(a)]) }
  return pts
}
export const ZONE_SHAPES = {
  crease: { outer: creaseRing(), holes: [] },
  inner_slot: { outer: rect(69, 89, -9, 9), holes: [creaseRing()] },
  slot: { outer: rect(54, 89, -22, 22), holes: [rect(69, 89, -9, 9)] },
  l_circle: { outer: rect(54, 89, 22, 42.5), holes: [] },
  r_circle: { outer: rect(54, 89, -42.5, -22), holes: [] },
  l_point: { outer: rect(25, 54, 0, 42.5), holes: [] },
  r_point: { outer: rect(25, 54, -42.5, 0), holes: [] },
  perimeter: { outer: rect(89, 100, -42.5, 42.5), holes: [] },
}
/** A label spot inside each zone. */
export const ZONE_LABEL_AT = {
  crease: [84.5, 0], inner_slot: [74, 0], slot: [60, 0], l_circle: [72, 33], r_circle: [72, -33],
  l_point: [39, 22], r_point: [39, -22], perimeter: [94, 30],
}

// HIS RATE vs THE LEAGUE'S, PER ZONE. Goals against per shot on goal there,
// his against the league's. Fewer than THIN shots and the zone is "thin": no
// colour. Within EVEN points of the league, no tint (league average).
export const THIN = 15
export const EVEN = 0.015
export const FULL = 0.06
/** { zone: { sa, ga, rate, lg, d, tint: 'worse'|'better'|null, thin } } from the SQL's two answers. */
export function goalieZoneRead(goalie, league) {
  const out = {}
  for (const z of GOALIE_ZONES) {
    const g = goalie?.zones?.[z.key] || { sa: 0, ga: 0 }
    const l = league?.zones?.[z.key] || { sa: 0, ga: 0 }
    const sa = Number(g.sa) || 0, ga = Number(g.ga) || 0
    const lg = Number(l.sa) ? Number(l.ga) / Number(l.sa) : null
    const rate = sa ? ga / sa : null
    const thin = sa < THIN || lg == null
    const d = !thin ? rate - lg : null
    out[z.key] = { sa, ga, rate, lg, d, thin, types: g.types || null, tint: thin || Math.abs(d) < EVEN ? null : d > 0 ? 'worse' : 'better' }
  }
  return out
}
export const tintAlpha = (d) => 0.18 + 0.5 * Math.min(1, Math.abs(d) / FULL)

/** The one sentence over the view, from the real numbers. */
export function overlapSentence(read, shots, goalieName, shooterName, his = 'his') {
  if (!read || !shots?.length) return null
  const n = shots.length
  const share = {}
  for (const sh of shots) { const z = zoneOf(sh[0], sh[1]); share[z] = (share[z] || 0) + 1 }
  // the zone he shoots from most where this goalie is worse than the league
  const cand = GOALIE_ZONES.map((z) => ({ z, r: read[z.key], s: (share[z.key] || 0) / n }))
    .filter((c) => c.r.tint === 'worse' && c.s >= 0.1).sort((a, b) => b.s - a.s)[0]
  const pct = (v) => `${Math.round(v * 1000) / 10}%`
  if (!cand) {
    const top = GOALIE_ZONES.map((z) => ({ z, s: (share[z.key] || 0) / n })).sort((a, b) => b.s - a.s)[0]
    return `No overlap: ${goalieName} is at or better than the league where ${shooterName} shoots most (the ${top.z.label.toLowerCase()}, ${Math.round(top.s * 100)}% of ${his} shots).`
  }
  return `${goalieName} lets in ${pct(cand.r.rate)} from the ${cand.z.label.toLowerCase()} (league ${pct(cand.r.lg)}). ${shooterName} ${his === 'his' ? 'takes' : 'take'} ${Math.round(cand.s * 100)}% of ${his} shots from there.`
}
