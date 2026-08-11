// 🎯 HOMER SHAPE — what KIND of home run it was.
//
// 2026-08-11. Donovan has asked for this since the handoff: "line drive HR,
// fly ball HR, moonshots, lasers." It was unanswerable until today because
// every archived homer said `actual_hr: 1` and nothing about the ball. The
// backfill (bots/backfill_hr_events.py) attached launch speed, launch angle
// and distance to all 872 archived homers, and these bands come from that
// distribution — 801 homers with all three fields, across 60 nights.
//
// ── READ THIS BEFORE CHANGING A NUMBER ──────────────────────────────────
//
// THE BANDS ARE PERCENTILES, NOT PHYSICS. Both distributions are a single
// hump, not clusters. Launch angle runs 16-49° with the mass at 26-32°;
// distance runs 326-471ft with the mass at 390-420. Nothing in the data
// separates on its own, so these cuts are slices of one continuous blob and
// have to be described that way. Anyone reading 366 or 428 as a physical
// constant will draw a conclusion the data does not support.
//
//   wall-scraper   distance <366ft   p10     10.0%   med EV  99.1  med 356ft
//   laser          angle    <25°     p23     16.5%   med EV 107.1  med 394ft
//   standard       the middle                45.9%   med EV 103.9  med 403ft
//   moonshot       angle    >=34°    p79     16.5%   med EV 103.7  med 391ft
//   no-doubter     distance >=428ft  p90     11.1%   med EV 109.1  med 436ft
//
// Ordered so every homer lands in exactly one band, and the distance rules
// are tested FIRST: a 440ft ball at 36° is a no-doubter before it is a
// moonshot, because how far it went is the less ambiguous fact.
//
// WHY THE HANDOFF'S PROPOSED CUTS WERE DROPPED. It suggested laser <24°,
// moonshot >32° AND 400ft+, wall-scraper <360ft. Checked against the real
// distribution those leave 70.5% of homers — 565 of 801 — in no band at all.
// Worse, "moonshot" required BOTH high angle and 400ft+, and those two fight
// each other: distance peaks at 28-31° (406ft) and falls away above it, so
// homers at 34°+ travel a median 18ft SHORTER than the 25-34° group. Only 28%
// of 34°+ homers reach 400ft. A moonshot is HIGH, not FAR, and asking for
// both caught almost nothing.
//
// THE BANDS ARE REAL, not relabelled noise. A wall-scraper leaves the bat 8.0
// mph slower than a laser — it is a weakly hit ball that just cleared. And a
// laser and a moonshot land at effectively the same distance (394 vs 391ft)
// off 23° vs 36°: two genuinely different ways to reach the same fence, which
// is the distinction Donovan asked for in the first place.
//
// SAMPLE: 60 nights, 801 homers, ~/Desktop/results. Not the full season.

export const HR_BANDS = {
  'wall-scraper': { label: 'Wall-scraper', color: '#9ca3af', short: 'WALL',
    blurb: 'Just cleared — 8 mph slower off the bat than a laser. The park and the air did real work here.' },
  laser: { label: 'Laser', color: '#22d3ee', short: 'LASER',
    blurb: 'Low and hot — under 25°, and it still got out. Struck harder than any band but a no-doubter.' },
  standard: { label: 'Standard', color: '#a1a1aa', short: 'STD',
    blurb: 'The middle of the distribution — the shape most home runs actually are.' },
  moonshot: { label: 'Moonshot', color: '#a78bfa', short: 'MOON',
    blurb: 'High, not far. Steep homers travel a median 18ft SHORTER than flatter ones — height costs distance.' },
  'no-doubter': { label: 'No-doubter', color: '#fb923c', short: 'NODBT',
    blurb: 'Out of any park — top-decile distance and the hardest-struck band on the board.' },
}

// The percentile cuts, named so they can be re-derived rather than trusted.
export const HR_CUTS = { shortFt: 366, longFt: 428, flatDeg: 25, steepDeg: 34 }

const num = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/**
 * Which band a single homer falls in.
 * Takes an hr_events entry (or anything with launch_angle / total_distance).
 * Returns null when the ball was not tracked — never a guess, because an
 * untracked homer and a wall-scraper are different claims.
 */
export function hrShape(e) {
  const la = num(e?.launch_angle ?? e?.la)
  const d = num(e?.total_distance ?? e?.dist)
  if (d == null && la == null) return null
  if (d != null && d < HR_CUTS.shortFt) return 'wall-scraper'
  if (d != null && d >= HR_CUTS.longFt) return 'no-doubter'
  if (la == null) return d == null ? null : 'standard'
  if (la < HR_CUTS.flatDeg) return 'laser'
  if (la >= HR_CUTS.steepDeg) return 'moonshot'
  return 'standard'
}

export const hrShapeMeta = (e) => {
  const k = hrShape(e)
  return k ? { key: k, ...HR_BANDS[k] } : null
}

/** One-line description of a tracked homer: "412ft · 106.3 mph · 31°". */
export function hrLine(e) {
  const bits = []
  const d = num(e?.total_distance ?? e?.dist)
  const v = num(e?.launch_speed ?? e?.ev)
  const la = num(e?.launch_angle ?? e?.la)
  if (d != null) bits.push(`${Math.round(d)}ft`)
  if (v != null) bits.push(`${v.toFixed(1)} mph`)
  if (la != null) bits.push(`${Math.round(la)}°`)
  return bits.join(' · ')
}

/**
 * The mix across a set of homers, as counts and shares.
 *
 * CAUTION, and it is the reason this is not wired into any score: a per-hitter
 * mix needs a sample this archive does not have. Across 60 nights the median
 * hitter has TWO tracked homers and only 87 have four or more — at that size a
 * single wall-scraper swings a hitter's "mix" by 25 points. Use this for a
 * population (a team, a park, the bot's own picks), not for one bat, until
 * season Statcast is joined in via spray_cache.
 */
export function shapeMix(events = []) {
  const out = { total: 0 }
  Object.keys(HR_BANDS).forEach((k) => { out[k] = 0 })
  ;(events || []).forEach((e) => {
    const k = hrShape(e)
    if (!k) return
    out[k] += 1
    out.total += 1
  })
  return out
}
