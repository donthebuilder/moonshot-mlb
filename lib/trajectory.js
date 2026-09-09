// 🪁 Ball flight, reconstructed — so "did it clear the fence" can account for
// the fence's HEIGHT (park overlay fix, 2026-08-29).
//
// The overlay used to answer `h.r > wallAt(ang)` — landing radius past the
// fence line — and call that "would it have gone out here". That is the wrong
// question wherever a wall is tall: a ball can land past Fenway's 308-ft line
// in left and still be a double off a 37-ft Monster. Height was never in the
// math. This module supplies the missing half.
//
// WHAT THIS IS, AND IS NOT
// Statcast publishes a tracked trajectory for PITCHES, not for batted balls.
// So the arc is FIT, not measured: real projectile motion with quadratic drag,
// integrated RK4, with the drag coefficient solved so the ball lands exactly at
// the distance we already plot it at. It leaves the bat at the true exit
// velocity and launch angle and comes down where the dot is; the shape between
// is physics, not telemetry.
//
// The solved coefficient is an EFFECTIVE drag. A real batted ball carries
// backspin, and the resulting lift extends carry — Statcast does not publish
// batted-ball spin, so the fit absorbs it. Fine for "how high was this ball when
// it got to the wall". Not something to present as measured trajectory data.
// Reference: Alan Nathan, "The Physics of Baseball" (Illinois).
//
// FEED IT THE PLOTTED RADIUS, NOT hit_distance_sc. SprayField positions every
// ball at the toPolar() radius and keeps hit_distance_sc as `carry` for the
// readout only. Fitting to carry would end the arc somewhere the dot is not,
// and would run the fence test in a different coordinate space than the wall
// polygon is drawn in.
//
// Mirrors bots/trajectory.py. If one changes, change both.

const G = 9.80665
const MPH_TO_MS = 0.44704
const M_TO_FT = 3.280839895
const FT_TO_M = 1 / M_TO_FT
const CONTACT_H_FT = 3.0

// dt=0.02 sits 0.0016 ft from a dt=0.002 reference on height-at-the-fence, at a
// tenth of the cost. Measured, not guessed — don't "improve" it without doing so.
const DT = 0.02
const MAX_T = 12
// 22 passes at a 0.25 ft range tolerance. Stopping at 1 ft (the obvious-looking
// choice) leaves the fitted drag slightly off and moves height-at-the-fence by
// half a foot — measured against bots/trajectory.py, not assumed. Costs ~0.5 ms
// per ball, so there is nothing to save by loosening it.
const BISECT = 22

function fly(v0, th, k, y0) {
  let x = 0, y = y0, vx = v0 * Math.cos(th), vy = v0 * Math.sin(th)
  const samp = [[0, y0]]
  let apex = y0, t = 0
  const steps = Math.round(MAX_T / DT)
  for (let i = 0; i < steps; i++) {
    const d = (sx, sy, svx, svy) => {
      const sp = Math.hypot(svx, svy)
      return [svx, svy, -k * sp * svx, -G - k * sp * svy]
    }
    const a = d(x, y, vx, vy)
    const b = d(x + 0.5 * DT * a[0], y + 0.5 * DT * a[1], vx + 0.5 * DT * a[2], vy + 0.5 * DT * a[3])
    const c = d(x + 0.5 * DT * b[0], y + 0.5 * DT * b[1], vx + 0.5 * DT * b[2], vy + 0.5 * DT * b[3])
    const e = d(x + DT * c[0], y + DT * c[1], vx + DT * c[2], vy + DT * c[3])
    const px = x, py = y
    x += (DT / 6) * (a[0] + 2 * b[0] + 2 * c[0] + e[0])
    y += (DT / 6) * (a[1] + 2 * b[1] + 2 * c[1] + e[1])
    vx += (DT / 6) * (a[2] + 2 * b[2] + 2 * c[2] + e[2])
    vy += (DT / 6) * (a[3] + 2 * b[3] + 2 * c[3] + e[3])
    t += DT
    if (y > apex) apex = y
    samp.push([x, y])
    if (y <= 0) {
      const f = py / (py - y || 1)
      const xh = px + f * (x - px)
      samp[samp.length - 1] = [xh, 0]
      return { range: xh, apex, hang: t - DT + f * DT, samp }
    }
  }
  return { range: x, apex, hang: t, samp }
}

function toFt(samp) {
  const o = new Array(samp.length)
  for (let i = 0; i < samp.length; i++) o[i] = [samp[i][0] * M_TO_FT, samp[i][1] * M_TO_FT]
  return o
}

function wrap(samplesFt, apexFt, hangS) {
  const S = samplesFt
  const D = S[S.length - 1][0]
  return {
    distanceFt: D,
    apexFt,
    hangS,
    // Height (ft) when the ball had travelled `d` ft horizontally.
    // null when it never got that far — treat as "landed short", NOT as zero.
    heightAt(d) {
      if (!(d >= 0) || d > D) return null
      let lo = 0, hi = S.length - 1
      while (lo < hi - 1) {
        const m = (lo + hi) >> 1
        if (S[m][0] <= d) lo = m; else hi = m
      }
      const [x0, y0] = S[lo], [x1, y1] = S[hi]
      return x1 === x0 ? y0 : y0 + ((d - x0) / (x1 - x0)) * (y1 - y0)
    },
    // 🎞 A time-indexed profile for animating this one flight — the hover
    // "moving thing" (Donovan, 2026-08-29). `S` is indexed by DISTANCE, not
    // time, and RK4 steps are fixed-DT, so index i in the raw solve corresponds
    // to t = i*DT for every point except the interpolated landing one. Rebuilt
    // here rather than threaded through `fly`/`toFt` so the fence-height path
    // above (called once per ball, every render, for the overlay test) stays
    // exactly as cheap as it was — this only runs for whichever ball is
    // actually hovered.
    //
    // Returns `n+1` evenly-TIME-spaced samples, each { t: 0..1 fraction of
    // hang time, distFrac: 0..1 fraction of total distance, heightFrac: 0..1
    // of this ball's OWN apex } — heightFrac is relative, not absolute feet,
    // so a checked swing's 8-ft pop-up and a moonshot's 110-ft arc both read
    // as a full up-and-down sweep instead of the checked swing looking flat.
    timeFrames(n = 24) {
      const out = []
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const idx = Math.min(S.length - 1, t * (S.length - 1))
        const lo = Math.floor(idx), hi = Math.min(S.length - 1, lo + 1)
        const f = idx - lo
        const [x0, y0] = S[lo], [x1, y1] = S[hi]
        const dist = x0 + f * (x1 - x0)
        const h = y0 + f * (y1 - y0)
        out.push({ t, distFrac: D > 0 ? dist / D : 0, heightFrac: apexFt > 0 ? Math.max(0, h / apexFt) : 0 })
      }
      return out
    },
  }
}

/**
 * Fit a flight whose range equals `distFt`.
 * Returns null when the inputs cannot describe one — no exit velocity, a launch
 * angle at or below horizontal, no distance. Callers must fall back rather than
 * pretend, because a ball with no launch angle has no honest fence height.
 */
export function solveFlight(evMph, laDeg, distFt) {
  if (!(evMph > 0) || !(laDeg > 0.5) || !(distFt > 0)) return null
  const v0 = evMph * MPH_TO_MS
  const th = (laDeg * Math.PI) / 180
  const y0 = CONTACT_H_FT * FT_TO_M
  const target = distFt * FT_TO_M

  // k=0 is the vacuum case and the longest possible carry. If the plotted
  // radius exceeds it, no drag reproduces it (wind, altitude, or a coordinate
  // that disagrees with the launch data) — use the vacuum arc and move on.
  const vac = fly(v0, th, 0, y0)
  if (target >= vac.range) return wrap(toFt(vac.samp), vac.apex * M_TO_FT, vac.hang)

  let lo = 0, hi = 0.02
  for (let g = 0; g < 20; g++) {
    if (fly(v0, th, hi, y0).range <= target) break
    hi *= 2
    if (hi > 5) break
  }
  let best = vac
  for (let i = 0; i < BISECT; i++) {
    const mid = 0.5 * (lo + hi)
    const res = fly(v0, th, mid, y0)
    best = res
    if (Math.abs(res.range - target) * M_TO_FT < 0.25) break
    if (res.range > target) lo = mid; else hi = mid
  }
  return wrap(toFt(best.samp), best.apex * M_TO_FT, best.hang)
}

/**
 * Memoised solver. Flights don't depend on the park, so one solve per ball
 * serves every park in the picker — switching parks after the first is free.
 */
export function makeFlightCache() {
  const cache = new Map()
  return function flightFor(hit) {
    if (cache.has(hit)) return cache.get(hit)
    const f = solveFlight(hit.ev, hit.la, hit.r)
    cache.set(hit, f)
    return f
  }
}
