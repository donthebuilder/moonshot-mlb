'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, obj, arr } from '../lib/player'
import { detailUrl } from '../lib/dataSource'
import { rampColor } from './Heatmap'

// Spray field — radar, not a ballpark illustration.
//
// WHERE THE BALL GETS DRAWN. This is the thing that was wrong, and it is worth
// writing down because it looked like a styling problem and wasn't.
//
// Every batted ball carries two different notions of "how far":
//
//   hc_x / hc_y   the landing/fielding coordinate on the Statcast grid
//   distance      hit_distance_sc — the projected carry of the ball in the air
//
// The old chart plotted `distance`. For fly balls those two agree almost
// exactly (mean 314 ft vs 313 ft across the slate; home runs 401 vs 398). For
// GROUND BALLS they do not agree at all: mean coordinate radius 128 ft, mean
// `distance` 33 ft. Ground balls are 8,683 of the 20,377 tracked batted balls —
// 43% — so nearly half of every hitter's chart was being stacked into a small
// smear on top of home plate. That is what made the panel look broken. It
// wasn't the colours or the size; the dots were in the wrong place.
//
// So the radius is now the coordinate, which is what a spray chart has always
// meant: where the ball ended up on the field. `distance` is still shown in the
// hover readout, because for a fly ball how far it carried is the interesting
// number — it just isn't the position.
//
// Two other fixed choices, both for comparability between hitters:
//   - the field is always 450 ft, never scaled to the longest ball
//   - brightness is exit velocity on a fixed 65–110 scale, not per-player
// Per-player scaling on either one makes two charts look alike that aren't.

// Real outfield dimensions, LF / LCF / CF / RCF / RF in feet. The payload gives
// venue_name but no geometry, and a generic arc is the reason the chart didn't
// look like anywhere -- Fenway and Coors are not the same shape, and a ball to
// left means something different in each. Public park dimensions, matched on
// the venue string the bot already publishes.
const PARKS = {
  'Fenway Park':            [310, 379, 390, 420, 302],
  'Yankee Stadium':         [318, 399, 408, 385, 314],
  'Coors Field':            [347, 390, 415, 375, 350],
  'Dodger Stadium':         [330, 385, 395, 385, 330],
  'UNIQLO Field at Dodger Stadium': [330, 385, 395, 385, 330],
  'Oracle Park':            [339, 364, 399, 415, 309],
  'Wrigley Field':          [355, 368, 400, 368, 353],
  'Great American Ball Park': [328, 379, 404, 370, 325],
  'Oriole Park at Camden Yards': [333, 364, 400, 373, 318],
  'Truist Park':            [335, 375, 400, 375, 325],
  'Citi Field':             [335, 358, 408, 398, 330],
  'Petco Park':             [336, 390, 396, 391, 322],
  'Progressive Field':      [325, 370, 405, 375, 325],
  'Rogers Centre':          [328, 375, 400, 375, 328],
  'Daikin Park':            [315, 362, 409, 373, 326],
  'T-Mobile Park':          [331, 378, 401, 381, 326],
  'Angel Stadium':          [330, 387, 396, 370, 330],
  'Tropicana Field':        [315, 370, 404, 370, 322],
  'Sutter Health Park':     [330, 375, 403, 375, 325],
  'Busch Stadium':          [336, 375, 400, 375, 335],
  'American Family Field':  [342, 370, 400, 374, 345],
  'PNC Park':               [325, 383, 399, 375, 320],
  'Kauffman Stadium':       [330, 387, 410, 387, 330],
  'Target Field':           [339, 377, 404, 367, 328],
  'Comerica Park':          [345, 370, 412, 365, 330],
  'Guaranteed Rate Field':  [330, 377, 400, 372, 335],
  'Rate Field':             [330, 377, 400, 372, 335],
  'Nationals Park':         [336, 377, 402, 370, 335],
  'Citizens Bank Park':     [329, 374, 401, 369, 330],
  'loanDepot park':         [345, 386, 400, 387, 335],
  'Chase Field':            [330, 374, 407, 374, 335],
  'Globe Life Field':       [329, 372, 407, 374, 326],
}
const DEFAULT_PARK = [330, 375, 400, 375, 330]

// The bot already buckets every ball into five lanes and writes it as `lane`.
// The old panel ignored that and re-derived three lanes from the angle, which
// meant the bars on this chart disagreed with the lane the rest of the site
// used for the same ball. Use the bot's own field.
//
// `lane` turns out to be a pure function of hc_x — 20,368 batted balls, zero
// violations of the ordering — with hard cuts at 90 / 120 / 155 / 185. So the
// lanes are VERTICAL BANDS across the field, not pie wedges out of home plate,
// and they get drawn that way below.
//
// They are also not centred on home plate. Fitting the plate position against
// 4,485 fly balls and home runs (matching the coordinate radius to the
// published carry) puts it at hc_x 126.2, hc_y 198.5 — within 0.8 units of the
// standard 125.42 / 198.27, mean bias 0.3 ft. The bot's bands are centred at
// hc_x 137.5, about 30 ft to the right of that. So its "CF" band actually runs
// from roughly 14 ft left of straightaway centre to 74 ft right of it. That's
// said on the panel rather than quietly corrected here: the lane counts have to
// keep matching the rest of the site, but nobody should read "CF" as centre.
const LANE_ORDER = ['LF', 'LCF', 'CF', 'RCF', 'RF']
const LANE_CUTS = [90, 120, 155, 185]   // hc_x boundaries, verified exactly
const PLATE_X = 125.42
const HC_TO_FT = 2.5

const PITCH_NAMES = {
  FF: '4-seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper',
  CU: 'Curve', KC: 'Knuckle curve', CH: 'Changeup', FS: 'Splitter',
  FA: 'Fastball', SV: 'Slurve', KN: 'Knuckleball', EP: 'Eephus', FO: 'Forkball',
  CS: 'Slow curve',
}

// Fixed exit-velocity ramp. p5 of the slate is 59 mph and p99 is 110, so 65-110
// puts almost every ball on a visible step without one 118 mph outlier pushing
// the rest of a hitter's chart into the floor colour.
const EV_LO = 65
const EV_HI = 110

// Statcast hit coordinates: origin at home plate, y increasing toward the
// outfield but inverted in screen space. 2.5 is the standard scale factor.
function toPolar(h) {
  const x = n(h?.hc_x, null)
  const y = n(h?.hc_y, null)
  if (x == null || y == null) return null
  const dx = x - 125.42
  const dy = 198.27 - y
  const dist = Math.sqrt(dx * dx + dy * dy) * 2.5
  const ang = Math.atan2(dx, dy) * (180 / Math.PI)
  if (!Number.isFinite(dist) || !Number.isFinite(ang)) return null
  return { dist, ang }
}

// `pitcher_primary_mix_vs_lhb` / `_vs_rhb` arrive as a display string:
//   "CU 29% | SI 28% | FF 28% | SL 14%"
// Both are present on 267 of 267 hitters. The object form,
// `pitcher_pitch_usage_pct`, is present on 258 of 267 but is not split by
// batter side, so the string is preferred and the object is the fallback.
function parseMixString(s) {
  const out = {}
  String(s || '').split('|').forEach((part) => {
    const m = part.trim().match(/^([A-Z]{2,3})\s+([\d.]+)\s*%?$/)
    if (m) out[m[1]] = Number(m[2])
  })
  return out
}

const XBH_EVENTS = new Set(['double', 'triple'])
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])

// Marker shape carries pitch type, the way PropFinder's does. Colour is already
// spoken for by exit velocity, and a second colour scale would fight the ramp,
// so shape is the only channel left that reads at this dot size.
const PITCH_SHAPE = {
  FF: 'circle', FA: 'circle',
  SI: 'down',
  SL: 'up', ST: 'up', SV: 'up',
  CH: 'square', FS: 'square', FO: 'square',
  FC: 'diamond',
  CU: 'cross', KC: 'cross', CS: 'cross', EP: 'cross', KN: 'cross',
}
const SHAPE_GLYPH = { circle: '●', down: '▼', up: '▲', square: '■', diamond: '◆', cross: '✚' }
const shapeFor = (code) => PITCH_SHAPE[code] || 'circle'

function Marker({ shape, x, y, r, fill, stroke, sw, opacity, dashed }) {
  const common = {
    fill, stroke, strokeWidth: sw, opacity,
    strokeDasharray: dashed ? '1.5 1.5' : undefined,
  }
  if (shape === 'square') {
    return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={0.5} {...common} />
  }
  if (shape === 'diamond') {
    return <polygon points={`${x},${y - r * 1.2} ${x + r * 1.2},${y} ${x},${y + r * 1.2} ${x - r * 1.2},${y}`} {...common} />
  }
  if (shape === 'up') {
    const s = r * 1.35
    return <polygon points={`${x},${y - s} ${x + s * 0.9},${y + s * 0.7} ${x - s * 0.9},${y + s * 0.7}`} {...common} />
  }
  if (shape === 'down') {
    const s = r * 1.35
    return <polygon points={`${x},${y + s} ${x + s * 0.9},${y - s * 0.7} ${x - s * 0.9},${y - s * 0.7}`} {...common} />
  }
  if (shape === 'cross') {
    // A plus, not a star. An 8-point star at HR size turns into a spiky blob
    // once it's filled — it read as noise on the field rather than a pitch.
    const a = r * 1.35, b = r * 0.44
    return (
      <polygon
        points={`${x - b},${y - a} ${x + b},${y - a} ${x + b},${y - b} ${x + a},${y - b} ${x + a},${y + b} ${x + b},${y + b} ${x + b},${y + a} ${x - b},${y + a} ${x - b},${y + b} ${x - a},${y + b} ${x - a},${y - b} ${x - b},${y - b}`}
        {...common}
      />
    )
  }
  return <circle cx={x} cy={y} r={r} {...common} />
}

// Windows are measured back from the most recent tracked ball, not from the
// wall clock. The payload can lag a day or two, and "last 5 days" counted off
// today would quietly return fewer games than it says on days when it does.
const RANGES = [
  { key: 'all', label: 'All', days: null },
  { key: 'd15', label: 'L15d', days: 15 },
  { key: 'd30', label: 'L30d', days: 30 },
  { key: 'd60', label: 'L60d', days: 60 },
  { key: 'd90', label: 'L90d', days: 90 },
]

const BB_TYPES = [
  { key: 'ground_ball', label: 'GB' },
  { key: 'line_drive',  label: 'LD' },
  { key: 'fly_ball',    label: 'FB' },
  { key: 'popup',       label: 'PU' },
]

const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)

export default function SprayField({ player, height = 340, slateMode }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState('idle')
  const [only, setOnly] = useState('all')
  const [picked, setPicked] = useState(null)   // null = all pitches; else Set
  const [hover, setHover] = useState(null)
  const [range, setRange] = useState('all')
  const [bbPick, setBbPick] = useState(null)   // null = all batted-ball types

  const pid = player?.player_id || player?.id

  useEffect(() => {
    if (!pid) return
    let alive = true
    setState('loading'); setData(null); setPicked(null); setOnly('all')
    setRange('all'); setBbPick(null)
    fetch(detailUrl(pid, slateMode))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setState('done') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [pid, slateMode])

  const hits = useMemo(() => arr(data?.spray_chart).map((h) => {
    const p = toPolar(h)
    if (!p) return null
    const event = clean(h?.event || h?.result, '').toLowerCase()
    const pitch = clean(h?.pitch_type, '')
    return {
      // RADIUS IS THE COORDINATE, not hit_distance_sc. See the note at the top.
      r: p.dist,
      ang: p.ang,
      hr: !!h?.is_hr || event === 'home_run',
      xbh: XBH_EVENTS.has(event) || (!!h?.is_xbh && event !== 'home_run'),
      hit: HIT_EVENTS.has(event),
      hard: !!h?.is_hard_hit,
      barrel: !!h?.is_barrel,
      ev: n(h?.ev, 0),
      la: n(h?.launch_angle ?? h?.la, 0),
      carry: n(h?.distance, 0),     // projected carry — readout only
      lane: clean(h?.lane, ''),
      stand: clean(h?.stand, ''),
      bb: clean(h?.bb_type, ''),
      pitch: pitch === 'nan' ? '' : pitch,
      date: clean(h?.date, ''),
      event,
    }
  }).filter(Boolean), [data])

  // Everything below the date window works off this, so a range change moves
  // the chip counts too rather than leaving them describing a wider sample
  // than what's drawn. Rates that don't move with the filter are the classic
  // way a panel like this ends up lying.
  const newest = useMemo(
    () => hits.reduce((m, h) => (h.date && h.date > m ? h.date : m), ''),
    [hits],
  )
  const inRange = useMemo(() => {
    const spec = RANGES.find((r) => r.key === range)
    if (!spec?.days || !newest) return hits
    return hits.filter((h) => h.date && dayDiff(h.date, newest) <= spec.days)
  }, [hits, range, newest])

  // Which side he stands on, taken from the batted balls themselves rather than
  // a roster field — a switch hitter's answer depends on the arm he faced, and
  // this is the only place that's actually recorded per pitch.
  const standVsTonight = useMemo(() => {
    const arm = clean(player?.pitcher_throws, '').toUpperCase().slice(0, 1)
    const counts = {}
    hits.forEach((h) => { if (h.stand) counts[h.stand] = (counts[h.stand] || 0) + 1 })
    const seen = Object.keys(counts)
    if (seen.length > 1 && (arm === 'L' || arm === 'R')) return arm === 'R' ? 'L' : 'R'
    return seen.sort((a, b) => counts[b] - counts[a])[0] || clean(player?.bats, '').toUpperCase().slice(0, 1) || ''
  }, [hits, player])

  // Tonight's starter's mix, matched to the side he'll be standing on.
  const tonight = useMemo(() => {
    const side = standVsTonight === 'L' ? 'lhb' : standVsTonight === 'R' ? 'rhb' : null
    if (side) {
      const parsed = parseMixString(player?.[`pitcher_primary_mix_vs_${side}`])
      if (Object.keys(parsed).length) return { mix: parsed, side }
    }
    const usage = obj(player?.pitcher_pitch_usage_pct)
    const mix = {}
    Object.entries(usage).forEach(([k, v]) => { if (Number.isFinite(Number(v))) mix[k] = Number(v) })
    return { mix, side: null }
  }, [player, standVsTonight])

  const pitches = useMemo(() => {
    const by = new Map()
    inRange.forEach((h) => {
      if (!h.pitch) return
      by.set(h.pitch, (by.get(h.pitch) || 0) + 1)
    })
    const t = inRange.length || 1
    return [...by.entries()]
      .map(([k, v]) => ({
        k, n: v, pct: (100 * v) / t,
        hr: inRange.filter((h) => h.pitch === k && h.hr).length,
        tonight: n(tonight.mix[k], 0),
      }))
      .sort((a, b) => b.n - a.n)
  }, [inRange, tonight])

  const bbShares = useMemo(() => {
    const t = inRange.length || 1
    return BB_TYPES.map((b) => {
      const c = inRange.filter((h) => h.bb === b.key).length
      return { ...b, n: c, pct: (100 * c) / t }
    })
  }, [inRange])

  // Default the chips to what tonight's arm actually throws, once the data
  // lands. Intersected with what he's actually put in play — a chip for a pitch
  // he has zero batted balls against would filter the chart to nothing.
  const matchable = useMemo(
    () => pitches.filter((p) => p.tonight > 0).map((p) => p.k),
    [pitches],
  )
  useEffect(() => {
    if (state === 'done' && picked === null && matchable.length) {
      setPicked(new Set(matchable))
    }
  }, [state, matchable, picked])

  // Result classes. The old version called every non-XBH ball an "Out", which
  // labelled 4,311 singles across the slate as outs. Group on `event`.
  const classes = useMemo(() => {
    const t = inRange.length || 1
    const of = (f) => inRange.filter(f).length
    return [
      { k: 'all',    label: 'All',    n: inRange.length,                     col: C.text2 },
      { k: 'hr',     label: 'HR',     n: of((h) => h.hr),                    col: C.orange },
      { k: 'xbh',    label: 'XBH',    n: of((h) => h.xbh),                   col: '#fb9d3a' },
      { k: 'single', label: 'Single', n: of((h) => h.event === 'single'),    col: '#d76b0d' },
      { k: 'out',    label: 'Out',    n: of((h) => !h.hit),                  col: C.text3 },
      { k: 'hard',   label: 'Hard',   n: of((h) => h.hard),                  col: '#c9640f' },
    ].map((c) => ({ ...c, pct: (100 * c.n) / t }))
  }, [inRange])

  const shown = useMemo(() => inRange.filter((h) => {
    const okClass = only === 'all' ? true
      : only === 'hr' ? h.hr
      : only === 'xbh' ? h.xbh
      : only === 'single' ? h.event === 'single'
      : only === 'hard' ? h.hard
      : !h.hit
    const okPitch = !picked || picked.size === 0 || (h.pitch && picked.has(h.pitch))
    const okBB = !bbPick || bbPick.size === 0 || (h.bb && bbPick.has(h.bb))
    return okClass && okPitch && okBB
  }), [inRange, only, picked, bbPick])

  const reset = () => { setOnly('all'); setPicked(null); setBbPick(null); setRange('all') }

  if (!pid) return null
  if (state === 'loading') {
    return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading batted balls…</div>
  }
  if (state === 'error') {
    return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Couldn&apos;t load his batted-ball detail.</div>
  }
  if (!hits.length) {
    return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>No tracked batted balls for this hitter.</div>
  }

  // Fixed 450 ft field, drawn out to ±58° so foul-territory balls have somewhere
  // honest to sit. About one ball in ten lands past the foul line — a caught
  // pop into the seats-side of third is a real batted ball, and the old chart
  // drew it floating in empty space outside the wedge.
  const R = 450
  const EDGE = 58
  const W = 440, H = 312
  const cx = W / 2, cy = H - 22
  const scale = Math.min((cy - 16) / R, (cx - 10) / (R * Math.sin((EDGE * Math.PI) / 180)))
  const pt = (dist, ang) => {
    const rad = (ang * Math.PI) / 180
    return [cx + Math.sin(rad) * dist * scale, cy - Math.cos(rad) * dist * scale]
  }
  const wedge = (a0, a1, rad) => {
    const steps = []
    for (let a = a0; a <= a1; a += 2) steps.push(pt(typeof rad === 'function' ? rad(a) : rad, a))
    steps.push(pt(typeof rad === 'function' ? rad(a1) : rad, a1))
    return `M ${cx} ${cy} L ${steps.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`
  }

  // Wall polygon from the five listed distances, interpolated across the arc.
  const venue = clean(player?.venue_name, '')
  const dims = PARKS[venue] || DEFAULT_PARK
  const knownPark = !!PARKS[venue]
  const wallAt = (ang) => {
    const t = (Math.max(-45, Math.min(45, ang)) + 45) / 90
    const i = Math.min(3, Math.max(0, Math.floor(t * 4)))
    const f = t * 4 - i
    return dims[i] + (dims[i + 1] - dims[i]) * f
  }

  const laneCounts = LANE_ORDER.map((key) => ({
    key,
    n: inRange.filter((h) => h.lane === key).length,
    hr: inRange.filter((h) => h.hr && h.lane === key).length,
  }))

  const foulCount = inRange.filter((h) => Math.abs(h.ang) > 45).length
  const chipBtn = (on, col) => ({
    padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6,
    cursor: 'pointer', fontFamily: NUM_FONT,
    border: `1px solid ${on ? col : C.border}`,
    background: on ? `${col}22` : 'transparent',
    color: on ? col : C.text3,
  })

  const pitcherName = clean(player?.pitcher_name, '')
  const allPicked = !picked || picked.size === pitches.length
  const matchedOn = picked && matchable.length
    && matchable.every((k) => picked.has(k)) && picked.size === matchable.length

  return (
    <div>
      {/* Date window. Counts everywhere else on the panel follow it. */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Range</span>
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)} style={{ ...chipBtn(range === r.key, C.orange), padding: '2px 8px', fontSize: 9.5 }}>
            {r.label}
          </button>
        ))}
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
          {inRange.length} of {hits.length} BBE
          {newest ? ` · through ${newest}` : ''}
        </span>
        <button onClick={reset} style={{ ...chipBtn(false, C.text3), padding: '2px 8px', fontSize: 9.5, marginLeft: 'auto' }}>
          Reset
        </button>
      </div>

      {inRange.length === 0 && (
        <div style={{ fontSize: 10.5, color: C.orange, marginBottom: 6 }}>
          No tracked batted balls in this window — his last one was {newest || 'unknown'}. Widen the range.
        </div>
      )}

      {/* Result chips: label, count and share on the chip itself. Click to
          filter. No separate legend to fall out of step with the chart. */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
        {classes.map((c) => (
          <button
            key={c.k}
            onClick={() => setOnly(c.k)}
            disabled={c.n === 0}
            style={{ ...chipBtn(only === c.k, c.col), opacity: c.n ? 1 : 0.35, cursor: c.n ? 'pointer' : 'default' }}
          >
            <span style={{ color: only === c.k ? c.col : C.text2 }}>{c.label}</span>{' '}
            {c.n}
            <span style={{ opacity: 0.65 }}> · {c.pct.toFixed(0)}%</span>
          </button>
        ))}
      </div>

      {/* Pitch chips. This is the question the panel exists for: does he only
          do damage against one pitch, and does tonight's arm throw it? The
          chips now come up pre-set to the starter's mix against this side. */}
      {pitches.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 7, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Pitch</span>
          <button onClick={() => setPicked(null)} style={chipBtn(allPicked, C.orange)}>All</button>
          {matchable.length > 0 && (
            <button
              onClick={() => setPicked(new Set(matchable))}
              title={`${pitcherName || "Tonight's starter"}'s mix${tonight.side ? ` vs ${tonight.side.toUpperCase()}` : ''}`}
              style={chipBtn(matchedOn, C.orange)}
            >
              ⌖ Match {pitcherName ? pitcherName.split(' ').slice(-1)[0] : 'starter'} mix
            </button>
          )}
          {pitches.map((p) => {
            const on = !!picked && picked.has(p.k)
            return (
              <button
                key={p.k}
                onClick={() => setPicked((s) => {
                  const next = new Set(s || pitches.map((x) => x.k))
                  if (next.has(p.k)) next.delete(p.k); else next.add(p.k)
                  return next.size ? next : null
                })}
                title={`${PITCH_NAMES[p.k] || p.k} · ${p.n} batted balls · ${p.hr} HR${p.tonight ? ` · ${p.tonight.toFixed(0)}% of tonight's mix` : " · not in tonight's mix"}`}
                style={{ ...chipBtn(on, C.orange), padding: '2px 8px', fontSize: 9.5 }}
              >
                {p.tonight > 0 && <span style={{ color: C.orange, marginRight: 3 }}>•</span>}
                <span style={{ opacity: 0.8 }}>{SHAPE_GLYPH[shapeFor(p.k)]}</span>{' '}
                {p.k} <span style={{ opacity: 0.65 }}>{p.pct.toFixed(0)}%</span>
                {p.hr > 0 && <span style={{ color: C.orange }}> {p.hr}HR</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Batted-ball type. Ground balls are 43% of a typical hitter's tracked
          balls and tell you nothing about power, so being able to drop them is
          the difference between a spray chart and a fielding chart. */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 7, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Contact</span>
        <button onClick={() => setBbPick(null)} style={{ ...chipBtn(!bbPick, C.orange), padding: '2px 8px', fontSize: 9.5 }}>All</button>
        {bbShares.map((b) => {
          const on = !!bbPick && bbPick.has(b.key)
          return (
            <button
              key={b.key}
              disabled={b.n === 0}
              onClick={() => setBbPick((s) => {
                const next = new Set(s || BB_TYPES.map((x) => x.key))
                if (next.has(b.key)) next.delete(b.key); else next.add(b.key)
                return next.size ? next : null
              })}
              style={{ ...chipBtn(on, C.orange), padding: '2px 8px', fontSize: 9.5, opacity: b.n ? 1 : 0.35 }}
            >
              {b.label} <span style={{ opacity: 0.65 }}>{b.pct.toFixed(0)}%</span>
            </button>
          )
        })}
        <button
          onClick={() => setBbPick(new Set(['line_drive', 'fly_ball']))}
          title="Line drives and fly balls only — the contact that can leave the yard"
          style={{ ...chipBtn(!!bbPick && bbPick.size === 2 && bbPick.has('fly_ball') && bbPick.has('line_drive'), C.orange), padding: '2px 8px', fontSize: 9.5 }}
        >Air only</button>
      </div>

      {matchable.length > 0 && (
        <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 7, lineHeight: 1.5 }}>
          Dotted chips are pitches {pitcherName || "tonight's starter"} actually throws
          {tonight.side ? ` to ${tonight.side === 'lhb' ? 'left' : 'right'}-handed bats` : ''}
          {tonight.side
            ? ', from his split mix.'
            : ' — no side split published for him, so this is his overall usage.'}
          {' '}They start selected, so what you see first is the balls he put in play against
          pitches he&apos;ll see tonight.
        </div>
      )}

      <div style={{
        display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start',
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10,
      }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 460, height, flexShrink: 0 }}>
          {/* Foul ground, then fair ground, then this park's actual wall. */}
          <path d={wedge(-EDGE, EDGE, R)} fill="rgba(255,255,255,0.018)" />
          <path d={wedge(-45, 45, R)} fill="rgba(255,255,255,0.028)" />
          <path d={wedge(-45, 45, wallAt)} fill="rgba(249,115,22,0.055)" stroke={C.border2} strokeWidth="1.2" />

          {/* distance arcs instead of grass */}
          {[150, 250, 350, 450].map((d) => {
            const [lx, ly] = pt(d, -EDGE)
            const [rx, ry] = pt(d, EDGE)
            return (
              <g key={d}>
                <path
                  d={`M ${lx} ${ly} A ${d * scale} ${d * scale} 0 0 1 ${rx} ${ry}`}
                  fill="none" stroke={C.border} strokeWidth="1"
                />
                <text x={cx} y={pt(d, 0)[1] + 9} fill={C.text3} fontSize="7.5"
                  fontFamily={NUM_FONT} textAnchor="middle">{d}</text>
              </g>
            )
          })}
          {/* foul lines */}
          {[-45, 45].map((a) => {
            const [x, y] = pt(R, a)
            return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke={C.border2} strokeWidth="1" />
          })}
          {/* Lane dividers, drawn where the bot's cuts actually fall: vertical
              bands in hc_x, clipped to the field. Radial spokes would be a lie
              about how the lane field is computed. */}
          <defs>
            <clipPath id="sprayfield-clip">
              <path d={wedge(-EDGE, EDGE, R)} />
            </clipPath>
          </defs>
          <g clipPath="url(#sprayfield-clip)">
            {LANE_CUTS.map((hx) => {
              const x = cx + (hx - PLATE_X) * HC_TO_FT * scale
              return (
                <line key={hx} x1={x} y1={cy} x2={x} y2={cy - R * scale}
                  stroke={C.border} strokeWidth="0.5" strokeDasharray="2 4" />
              )
            })}
            {/* Straightaway centre, for contrast with the bands above. */}
            <line x1={cx} y1={cy} x2={cx} y2={cy - R * scale}
              stroke={C.border2} strokeWidth="0.5" opacity="0.5" />
          </g>

          {shown.map((h, i) => {
            const ang = Math.max(-EDGE, Math.min(EDGE, h.ang))
            const [x, y] = pt(Math.min(h.r, R), ang)
            const col = rampColor(h.ev, EV_LO, EV_HI) || C.text3
            const on = hover === i
            const foul = Math.abs(h.ang) > 45
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <Marker
                  shape={shapeFor(h.pitch)}
                  x={x} y={y}
                  r={h.hr ? 4.6 : h.xbh ? 3.6 : h.hit ? 3.0 : 2.5}
                  fill={h.hr ? col : h.hit ? `${col}66` : 'none'}
                  stroke={col}
                  sw={h.hr ? 1.2 : 1.3}
                  opacity={on ? 1 : h.hr ? 0.95 : foul ? 0.4 : 0.68}
                  dashed={foul}
                />
                {h.hr && <circle cx={x} cy={y} r="8.5" fill="none" stroke={col} strokeWidth="0.6" opacity={on ? 0.9 : 0.35} />}
              </g>
            )
          })}

          {/* Wall distances at the three points people actually quote. */}
          {[[-45, dims[0]], [0, dims[2]], [45, dims[4]]].map(([a, d]) => {
            const [x, y] = pt(d + 26, a)
            return (
              <text key={a} x={x} y={y} fill={C.text3} fontSize="7.5" fontFamily={NUM_FONT}
                textAnchor="middle" opacity="0.8">{d}&apos;</text>
            )
          })}
          <circle cx={cx} cy={cy} r="2.5" fill={C.text3} />

          {/* Shape key, on the chart rather than beside it so it can't drift
              out of step with what's actually plotted. */}
          {[...new Set(shown.map((h) => shapeFor(h.pitch)))].slice(0, 6).map((sh, i) => (
            <g key={sh}>
              <Marker shape={sh} x={14} y={16 + i * 13} r={3.2} fill="none" stroke={C.text3} sw={1.1} opacity={0.85} />
              <text x={22} y={19 + i * 13} fill={C.text3} fontSize="7" fontFamily={NUM_FONT}>
                {[...new Set(shown.filter((h) => shapeFor(h.pitch) === sh).map((h) => h.pitch))].filter(Boolean).join('/')}
              </text>
            </g>
          ))}
        </svg>

        <div style={{ flex: 1, minWidth: 160 }}>
          {hover != null && shown[hover] ? (
            <div style={{ fontFamily: NUM_FONT, fontSize: 10.5, lineHeight: 1.7 }}>
              <div style={{ color: C.orange, fontWeight: 800, fontSize: 11 }}>
                {(shown[hover].event || 'batted ball').replace(/_/g, ' ').toUpperCase()}
              </div>
              <div style={{ color: C.text2 }}>
                {shown[hover].ev.toFixed(1)} mph · {shown[hover].la.toFixed(0)}°
                {shown[hover].carry ? ` · ${shown[hover].carry.toFixed(0)} ft carry` : ''}
              </div>
              <div style={{ color: C.text3 }}>
                {PITCH_NAMES[shown[hover].pitch] || shown[hover].pitch || 'pitch n/a'}
                {' · '}{shown[hover].lane || '—'}
                {' · '}{shown[hover].date}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6 }}>
              Hover a ball for pitch, exit velo and carry.
              {' '}Showing <b style={{ color: C.text2 }}>{shown.length}</b> of {hits.length} batted balls.
            </div>
          )}

          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {laneCounts.map((l) => {
              const pctv = hits.length ? (100 * l.n) / hits.length : 0
              const bg = rampColor(pctv, 0, 45)
              return (
                <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                  <span style={{ width: 26, color: C.text3, fontFamily: NUM_FONT }}>{l.key}</span>
                  <div style={{ flex: 1, height: 11, background: C.bg3, borderRadius: 2 }}>
                    <div style={{ width: `${Math.max(2, pctv)}%`, height: '100%', background: bg, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: NUM_FONT, color: C.text2, minWidth: 52, textAlign: 'right' }}>
                    {pctv.toFixed(0)}%{l.hr > 0 && <span style={{ color: C.orange }}> {l.hr}HR</span>}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 9, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
            Lanes are the bot&apos;s own <code>lane</code> field, so the counts match the rest of
            the site. Read the labels loosely: the bot cuts lanes as vertical bands centred
            about 30 ft right of home plate, so its <b style={{ color: C.text2 }}>CF</b> runs from
            just left of straightaway centre out to right-centre, and <b style={{ color: C.text2 }}>LF</b>{' '}
            covers everything past 88 ft to the pull side of a righty. The dashed lines show
            where those cuts really fall; the solid line is true centre.
          </div>

          <div style={{ fontSize: 9, color: C.text3, marginTop: 9, lineHeight: 1.55 }}>
            <b style={{ color: C.text2 }}>{knownPark ? venue : 'Generic park'}</b>
            {knownPark
              ? ' — the wall is this park’s real shape, so a ball to left means what it means here.'
              : ' — no dimensions on file for this venue, so a standard outline is drawn.'}
            {' '}Position is where the ball was fielded, not how far it carried — a 30 ft
            chopper that a shortstop takes at 130 ft belongs at 130 ft. Carry is in the hover.
            Filled rings are home runs, half-filled are hits, hollow are outs. Brightness is
            exit velocity on a fixed 65–110 scale, and the field is a fixed 450 ft for every
            hitter, so two players stay directly comparable.
            {foulCount > 0 && (
              <> {foulCount} of these {hits.length} landed in foul ground; they&apos;re drawn
              dashed, outside the lines, rather than hidden.</>
            )}
            {hits.length < 25 && (
              <> <b style={{ color: C.orange }}>Only {hits.length} tracked batted balls</b> — too
              few to read a spray tendency off.</>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
