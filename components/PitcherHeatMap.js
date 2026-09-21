'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { savantPitcherBattedBalls, sprayAngle } from '../lib/savant'

// PITCHER HEAT MAP (2026-09-21) — the MLB mirror of TUDDY's field map.
//
// Donovan's own words on that page: "this first heat chart is my favorite
// thing ever." What made it work wasn't the football — it was the rule:
// THE FIELD IS THE CHART, heat only where he actually gets beaten, and the
// answer comes first, in words, before any number. This is that same rule
// pointed at a pitcher instead of a defense.
//
// WHAT THIS IS NOT: MOONSHOT already has a real, deep spray chart
// (components/SprayField.js) — per HITTER, his own contact, real park
// geometry, live pitch coloring. This does not duplicate it. This answers a
// different question a hitter's own chart can't: for ONE PITCHER, where do
// the batters he's actually faced this season do the most damage? Same
// Statcast export SprayField reads (lib/savant.js), searched by
// player_type=pitcher instead of batter, classified into pull/center/oppo
// with the exact sprayAngle() math SprayField already uses — not a second
// definition of "pulled."
//
// SELF-RELATIVE, ON PURPOSE. A true "vs. league" heat-map needs every
// pitcher's batted balls to build the league baseline, which is a much
// bigger fetch than one man's ~200-400 balls in play. Rather than invent a
// league number this page never measured, the comparison is honest and
// smaller: which THIRD of the field, of the contact THIS pitcher has
// actually allowed, has carried the most damage. Real, just narrower than
// TUDDY's — labelled as such in the caption, not hidden.
//
// NO PARK GEOMETRY. TUDDY's field has a fixed geometry (a yard line means
// the same thing everywhere); a pitcher's balls in play were hit across a
// dozen different parks with different fences. Drawing one real park here
// would quietly misrepresent the others, so the outfield arc is a generic
// average distance line (330/375/400/375/330), a background reference
// only — never treated as a measured value the way TUDDY's yard lines are.

const SIDE_LABEL = { pull: 'the pull side', center: 'up the middle', oppo: 'the opposite way' }
const MIN_BALLS = 20

function polar(angleDeg, distance) {
  // angle: Savant's convention, negative = pulled for a RHB, 0 = straight
  // up the middle, clamped to the foul lines. distance capped for plotting
  // only — a ball measured past the cap still counts in the zone math.
  const a = Math.max(-45, Math.min(45, angleDeg)) * (Math.PI / 180)
  const r = Math.min(distance, 420) / 420 // 0..1 of the plot radius
  const x = 250 + Math.sin(a) * r * 230
  const y = 320 - Math.cos(a) * r * 230
  return [x, y]
}

// Generic average NL/AL outfield distance by angle, background reference only.
function fenceArcPath() {
  const pts = []
  for (let deg = -45; deg <= 45; deg += 3) {
    const frac = Math.abs(deg) / 45 // 0 at CF, 1 at the lines
    const dist = 400 - frac * frac * 70 // 400 CF tapering to ~330 at the lines
    const [x, y] = polar(deg, dist)
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `M ${pts.join(' L ')}`
}

export default function PitcherHeatMap({ pitcherId, pitcherName }) {
  const [rows, setRows] = useState(undefined) // undefined = loading, [] = loaded empty
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!pitcherId) { setRows([]); return undefined }
    let alive = true
    setRows(undefined)
    savantPitcherBattedBalls(pitcherId)
      .then((r) => { if (alive) setRows(r || []) })
      .catch(() => { if (alive) { setRows([]); setErr(true) } })
    return () => { alive = false }
  }, [pitcherId])

  const zones = useMemo(() => {
    const z = {
      pull: { n: 0, hard: 0, hr: 0, xbh: 0 },
      center: { n: 0, hard: 0, hr: 0, xbh: 0 },
      oppo: { n: 0, hard: 0, hr: 0, xbh: 0 },
    }
    for (const b of rows || []) {
      if (!b.side || !z[b.side]) continue
      z[b.side].n += 1
      z[b.side].hard += b.is_hard_hit
      z[b.side].hr += b.is_hr
      z[b.side].xbh += b.is_xbh
    }
    return z
  }, [rows])

  const total = (rows || []).length
  const worst = useMemo(() => {
    const withRate = Object.entries(zones)
      .map(([k, z]) => ({ k, ...z, rate: z.n ? z.hard / z.n : 0 }))
      .filter((z) => z.n >= 4) // don't call three balls a "weak spot"
    if (!withRate.length) return null
    return withRate.sort((a, b) => b.rate - a.rate || b.hr - a.hr)[0]
  }, [zones])

  if (rows === undefined) {
    return <div style={{ padding: 18, fontSize: TYPE.micro, color: C.text3 }}>Loading balls in play against him…</div>
  }
  if (total < MIN_BALLS) {
    return (
      <div style={{ padding: 18, border: `1px dashed ${C.border}`, borderRadius: 10, fontSize: TYPE.micro, color: C.text3, textAlign: 'center' }}>
        {err ? 'Live Statcast pull failed — try again in a moment.'
          : `Only ${total} ball${total === 1 ? '' : 's'} in play against him this season — too few to call a weak spot yet.`}
      </div>
    )
  }

  return (
    <div>
      <div style={{
        margin: '2px 0 10px', padding: '10px 13px', borderRadius: 10,
        border: `1px solid ${worst ? 'rgba(249,115,22,.35)' : C.border}`,
        background: worst ? 'linear-gradient(155deg, rgba(249,115,22,.08), transparent)' : C.bg2,
      }}>
        <div style={{ fontSize: TYPE.label, fontWeight: 900, color: C.orange, letterSpacing: '.08em', marginBottom: 4 }}>WHERE HE GETS HIT</div>
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.4 }}>
          {worst
            ? <>{pitcherName ? <b>{pitcherName}</b> : 'This pitcher'} gets hurt <b style={{ color: C.orange }}>{SIDE_LABEL[worst.k]}</b> —{' '}
                <b>{worst.hard}</b> of his <b>{total}</b> balls in play there went for hard contact
                {worst.hr ? <> (<b style={{ color: C.red }}>{worst.hr}</b> {worst.hr === 1 ? 'homer' : 'homers'})</> : ''}.</>
            : 'No single side stands out — contact against him has been even across the field.'}
        </div>
      </div>

      <svg viewBox="0 0 500 340" width="100%" style={{ maxWidth: 420, display: 'block', margin: '0 auto' }} role="img"
        aria-label="Field diagram showing which side of the field carries the most hard contact against this pitcher">
        <path d={`M 250,320 L 20,90 A 300 300 0 0 1 480,90 Z`} fill={C.bg2} stroke={C.border} strokeWidth="1" />
        <path d={fenceArcPath()} fill="none" stroke={C.border} strokeWidth="1.5" strokeDasharray="3 3" />
        {['pull', 'center', 'oppo'].map((k) => {
          const z = zones[k]
          if (!z.n) return null
          const rate = z.n ? z.hard / z.n : 0
          const isWorst = worst?.k === k
          const midAngle = k === 'pull' ? -30 : k === 'oppo' ? 30 : 0
          const [cx, cy] = polar(midAngle, 300)
          const r = 60 + Math.min(70, z.n * 2)
          return (
            <circle key={k} cx={cx} cy={cy} r={r}
              fill={isWorst ? 'rgba(249,115,22,.28)' : `rgba(249,115,22,${(0.05 + rate * 0.18).toFixed(2)})`}
              stroke={isWorst ? C.orange : 'transparent'} strokeWidth="1.5" />
          )
        })}
        {(rows || []).map((b, i) => {
          if (b.hc_x == null || b.hc_y == null || !Number.isFinite(b.distance)) return null
          // The dot's real position: the same sprayAngle() SprayField plots a
          // hitter's own contact with, at his own measured distance. No
          // jitter, no binning — the zone shading behind it is the bucket,
          // the dot itself is the actual ball.
          const ang = sprayAngle(b.hc_x, b.hc_y)
          if (ang == null) return null
          const [x, y] = polar(ang, b.distance)
          const color = b.is_hr ? C.red : b.is_hard_hit ? C.orange : C.text3
          return <circle key={i} cx={x} cy={y} r={b.is_hr ? 3.6 : 2.2} fill={color} opacity={b.is_hr ? 1 : 0.65} />
        })}
      </svg>

      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
        {['pull', 'center', 'oppo'].map((k) => {
          const z = zones[k]
          return (
            <span key={k}>
              <b style={{ color: C.text2 }}>{k === 'pull' ? 'Pull' : k === 'oppo' ? 'Oppo' : 'Center'}</b>{' '}
              {z.n} BBE · {z.n ? Math.round((z.hard / z.n) * 100) : 0}% hard · {z.hr} HR
            </span>
          )
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 9.5, color: C.text3, textAlign: 'center', lineHeight: 1.4 }}>
        Balls in play against him this season, live from Statcast · self-relative (his own zones against each other, not vs. league) · outfield line is a generic average, not his actual parks
      </div>
    </div>
  )
}
