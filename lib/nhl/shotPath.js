// WHERE A SHOT GOES WHEN IT PLAYS (BATCH-3D-V2 1g). Hover or tap a puck and it
// moves along this path, on the 2D rink and in the 3D arena alike -- the way
// MOONSHOT's hit flies. The puck's real path is NOT tracked: every path runs
// from where the shot was taken to the net ALONG THE ICE, ending where the
// feed's result and miss reason say it went. Nothing else is invented:
//   GOAL     slides into the net
//   ON NET   stops at the crease (a save)
//   MISS     wide left / right, or off the post, per miss_reason; HIGH and
//            CROSSBAR are the only ones that lift -- the reason says so, and
//            nothing else is known about a shot's height
//   BLOCKED  stops short, with a small bounce back
// Coordinates are the shot map's feet, every shot attacking x = +89.
// Rows are positional: [x, y, result, type, strength, period, ptype, time_s, date, miss_reason].
export const NET_X = 89
const CROSSBAR_FT = 4

/** What the play shows, from the result and miss reason. */
export function shotOutcome(sh) {
  const res = sh?.[2], why = String(sh?.[9] || '')
  if (res === 'goal') return 'goal'
  if (res === 'sog') return 'save'
  if (res === 'block') return 'block'
  if (res === 'miss') {
    if (/wide/.test(why)) return /left/.test(why) ? 'wide-left' : 'wide-right'
    if (/post/.test(why)) return /left/.test(why) ? 'post-left' : 'post-right'
    if (/crossbar/.test(why)) return 'crossbar'
    if (/high|above/.test(why)) return 'high'
    return 'miss'
  }
  return 'miss'
}

const lerp = (a, b, t) => a + (b - a) * t
/** The play as points [x, y, h] (h = feet above the ice; 0 except a lifted miss). */
export function shotPath(sh, n = 28) {
  const x0 = Number(sh[0]), y0 = Number(sh[1])
  const out = shotOutcome(sh)
  const seg = (x1, y1, h1 = 0, from = 0, to = 1, lift = false) => {
    const pts = []
    for (let i = 0; i <= n; i++) {
      const t = from + ((to - from) * i) / n
      // a lifted shot rises along the way, not a straight ramp: up early, level at the net
      const h = lift ? h1 * Math.sin((Math.PI / 2) * t) : 0
      pts.push([lerp(x0, x1, t), lerp(y0, y1, t), h])
    }
    return pts
  }
  switch (out) {
    case 'goal': return seg(NET_X + 1.8, Math.max(-2.4, Math.min(2.4, y0 * 0.12)))
    case 'save': {
      // stops 4 ft out, on the line to the middle of the net
      const d = Math.hypot(NET_X - x0, y0) || 1
      return seg(NET_X, 0, 0, 0, Math.max(0, 1 - 4 / d))
    }
    case 'wide-left': return seg(NET_X + 1, 4.8)
    case 'wide-right': return seg(NET_X + 1, -4.8)
    case 'post-left': return seg(NET_X, 3)
    case 'post-right': return seg(NET_X, -3)
    case 'crossbar': return seg(NET_X, Math.max(-2.5, Math.min(2.5, y0 * 0.12)), CROSSBAR_FT, 0, 1, true)
    case 'high': return seg(NET_X + 1, Math.max(-2.5, Math.min(2.5, y0 * 0.12)), CROSSBAR_FT + 1.6, 0, 1, true)
    case 'block': {
      // 18% of the way to the net, then 5% back
      const fwd = seg(NET_X, 0, 0, 0, 0.18)
      const back = seg(NET_X, 0, 0, 0.18, 0.13).slice(1)
      return [...fwd, ...back]
    }
    default: return seg(NET_X, 0)
  }
}

/** Feet a shot travels on its play (for real-speed timing). */
export const pathFeet = (pts) => pts.slice(1).reduce((d, p, i) => d + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]), 0)

// PACE (Donovan 10-02: "the speed is good unless we have speed data"; then
// "yes, player average, show that"). 0.8 s by default; scaled by HIS average
// shot speed against the league's when NHL EDGE has one (hard shooters look
// harder); a shot that is one of his ten measured hardest plays at its real
// speed. mph -> ft/s is x 1.4667.
export const BASE_MS = 800
export function paceMs(pts, { avg = null, leagueAvg = null, mph = null } = {}) {
  if (mph) return Math.max(90, (pathFeet(pts) / (mph * 1.4667)) * 1000)
  if (avg && leagueAvg) return Math.max(550, Math.min(1100, BASE_MS * (leagueAvg / avg)))
  return BASE_MS
}

// HIS TEN HARDEST, ON THE MAP (BATCH-3D-V2 1g). EDGE's hardest shots carry the
// date, period and clock; a drawn shot carries the same three (sh[8], sh[5],
// sh[7]), so a match is that exact shot. Matched pucks get a ring and play at
// their measured speed; nothing else gets a speed.
const hardKey = (date, period, timeS) => `${date}|${period}|${timeS}`
export function hardestIndex(speed) {
  const m = new Map()
  for (const h of speed?.hardest || []) m.set(hardKey(h.date, h.period, h.timeS), h.mph)
  return m
}
/** The measured mph of this drawn shot, if it is one of the ten hardest; else null. */
export const measuredMph = (idx, sh) => (idx && idx.size ? idx.get(hardKey(sh[8], sh[5], sh[7])) ?? null : null)
