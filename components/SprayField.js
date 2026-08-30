'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { C, NUM_FONT } from '../lib/theme'
import { alpha, catColor, verdictInk } from '../lib/scales'
import { n, clean, obj, arr } from '../lib/player'
import { detailUrl, archiveDetailUrl } from '../lib/dataSource'
import { chipColor } from './Heatmap'
// Pitch colours shared with ZoneMap and the live feed parser, so a sinker is
// the same orange on the spray chips as it is on the strike-zone dots.
// isDeepFlyOut too (Pass 3, 2026-08-14): the 📏 DEEP gate has ONE definition
// (a 370ft+ fly ball that did not land for a hit) and this chart borrows it
// rather than approximating a second one.
import { pitchColor, isDeepFlyOut } from '../lib/livePitches'
// The tonight-only filters speak the SAME Result/Quality language as the
// Batted Ball Log at the top of the At The Plate page (Pass 3, 2026-08-14,
// Donovan's redesign screenshots) — categories imported from that file, not
// copied, so the two surfaces can't drift apart.
import { outcomeOf, OUTCOME_TABS, QUALITY_TABS } from './BattedBallLog'
// Real park geometry: distances + wall HEIGHTS, one source, regenerable
// from Baseball Savant (bots/fetch_park_dimensions.py in the bot repo).
import { PARK_WALLS as PARKS } from '../lib/parkWalls'

// 🏟 The stadium view rides in on demand — three.js is ~600KB and belongs in
// nobody's first paint. ssr:false because it is a WebGL canvas with no server
// render, and the 2D chart below stays regardless (Donovan, 2026-08-29: the
// 2D chart is the fallback and the screen-reader version).
const SprayFieldStadium = dynamic(() => import('./SprayFieldStadium'), { ssr: false })
import { windRead } from '../lib/conditions'
import { solveFlight } from '../lib/trajectory'

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

// Real outfield dimensions AND wall heights, LF / LCF / CF / RCF / RF in feet.
// Was a hand-typed object living in this file; pulled out to lib/parkWalls.js
// (2026-08-29) as the one source, regenerable from Baseball Savant by
// bots/fetch_park_dimensions.py, so this component and anything else that
// needs a real wall (lib/walls.js's distance-only statsapi pull included)
// can eventually read the same numbers instead of two sources disagreeing.
const DEFAULT_PARK = [330, 375, 400, 375, 330]
// Heights are only consulted for the SELECTED test park, which always comes
// from PARKS — this is the fallback for a venue we only know by distance.
const DEFAULT_HEIGHTS = [8, 8, 8, 8, 8]

// Flight solves are memoised per batted ball. A flight does not depend on the
// park, so one solve serves every park in the picker. WeakMap, and module
// scope on purpose: SprayField early-returns above the overlay code, so a
// hook here would be called conditionally.
const FLIGHT_CACHE = new WeakMap()
function flightFor(h) {
  if (FLIGHT_CACHE.has(h)) return FLIGHT_CACHE.get(h)
  const f = solveFlight(h.ev, h.la, h.r)
  FLIGHT_CACHE.set(h, f)
  return f
}

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

// Windows are counted in GAMES, not calendar days, and measured back from his
// most recent tracked ball rather than from the wall clock. Days would be the
// wrong unit twice over: the payload can lag, and a hitter who sat three of the
// last five days has a "last 5 days" that means something different from
// everyone else's. Counting his own dates keeps the window comparable between
// hitters.
//
// Caveat worth knowing, and said on the panel: a "game" here is a date on which
// he has at least one tracked batted ball. A game where he walked twice and
// struck out leaves no row, so it isn't counted — these are his last N games
// with contact, which run slightly further back than his last N games.
const RANGES = [
  { key: 'g5',  label: 'L5',  games: 5 },
  { key: 'g10', label: 'L10', games: 10 },
  { key: 'g15', label: 'L15', games: 15 },
  { key: 'g25', label: 'L25', games: 25 },
  { key: 'all', label: 'All', games: null },
]

const BB_TYPES = [
  { key: 'ground_ball', label: 'GB' },
  { key: 'line_drive',  label: 'LD' },
  { key: 'fly_ball',    label: 'FB' },
  { key: 'popup',       label: 'PU' },
]



// ── COLOUR ON THIS CHART IS CATEGORICAL, NOT MAGNITUDE ───────────────────────
//
// Everywhere else on this site colour means "how much" and the orange ramp is
// the right tool. A spray chart is the exception: the question is "what
// happened", which is a category, and eight shades of one hue cannot answer it.
// The old version shaded every dot by exit velocity, so a field of orange dots
// sat on an orange-tinted wedge and nothing could be picked out — that is the
// "hard to read" problem, and no amount of contrast tuning fixes it while the
// only channel in use is brightness.
//
// So: colour = result, shape = pitch type, size = how far it went. Three
// independent channels, all readable at once. Exit velocity moved to the hover
// and the EV Log, where it can be a number instead of a shade.
// ORANGE IS THE FIELD, NOT THE DOTS.
//
// This is the inversion that makes the chart feel like part of this site rather
// than a borrowed one. Orange is the brand colour, so it becomes the SURFACE —
// the playing field is warm brown-orange with a bright orange rim, which is
// instantly recognisable as ours. The markers then take the rest of the palette
// in lib/theme.js, every one of which is already used elsewhere here:
//
//   red    home run   the event the whole site is for
//   purple triple
//   green  double
//   blue   single
//   grey   out        62% of contact, kept nearly silent
//
// Outs staying near-black is the load-bearing choice. They're the majority of
// every hitter's batted balls, and a chart that paints the common case loudly
// is a chart you can't read — the eye should land on the red and it does.
//
// Barrels get a ring. `is_barrel` is on every tracked ball, and a barrel is the
// launch-angle/EV combination that actually produces damage, so ringing them
// surfaces "he squared these up" independently of whether they fell in.
// ── REGISTRY RECONCILIATION (2026-08-24) ────────────────────────────────────
//
// lib/scales.js's CAT.result was built with this exact five-key set in mind
// -- its own comment names "SprayField's five, which is the one categorical
// set on the site where colour is currently the sole encoding" -- and maps
// home_run: 'orange', triple: 'purple', double: 'cyan', single: 'blue',
// out: 'text3'. Two of five are already byte-identical to what this file
// draws (triple, single) and now route through catColor() below. The other
// three are NOT byte-identical, and forcing them through would be a real
// visual change, not just plumbing, for reasons specific to this file:
//
//   home_run: registry says C.orange. This file's whole point, a few
//   paragraphs up, is "ORANGE IS THE FIELD, NOT THE DOTS" -- the wall, the
//   foul lines, the distance arcs and the warning track are already orange.
//   A home run, the ball most likely to land right at that wall, drawn in
//   the same hue as the wall it just cleared risks exactly the "hard to
//   read, nothing can be picked out" failure this file's own rewrite exists
//   to prevent. Same shape as Results.js's flagged TOP case (commit
//   81d12e2): the registry and an established, deliberate file-local choice
//   disagree, and picking a side is a product call, not a colour-plumbing
//   one.
//
//   double: registry says C.cyan, this file says C.green. No field-collision
//   risk (cyan isn't used elsewhere on this chart), but it's still a real
//   hue change from what ships today, so it's flagged rather than silently
//   swapped.
//
//   out: registry says C.text3. This one has a documented reason to actually
//   want the swap: the 2026-08-22 audit (claude/moonshot-colour-chart-
//   system-audit.md) names this literal specifically -- "on a light page the
//   out dots become the loudest marks on the chart" -- because this literal
//   reads near-black (quiet) against this file's dark field but reads as a hard
//   dark mark against a LIGHT theme's page. C.text3 is designed to stay a
//   quiet mid-tone against whichever theme is active, which is what "kept
//   nearly silent" is actually asking for across all five themes, not just
//   ember. Not swapped here unilaterally anyway, both because it shares an
//   object with the two flagged keys above and because "reads quiet" is
//   exactly the property in question -- worth Donovan's eyes on how it
//   actually looks in light mode, not just a diff.
//
// All three flagged in place below, same as Results.js's TOP case: reported,
// not resolved.
const RESULT_COLORS = {
  home_run: '#f87171',   // C.red — NOT catColor('result','home_run') (=C.orange); see the flag above
  double:   '#4ade80',   // C.green — NOT catColor('result','double') (=C.cyan); see the flag above
  out:      '#3f3f46',   // near-black grey, the majority case kept silent — NOT catColor('result','out') (=C.text3); see the flag above
}
// triple/single ARE byte-identical to the registry (catColor('result',
// 'triple') resolves to C.purple, catColor('result','single') resolves to
// C.blue -- both match the literals this file used to hardcode here, in
// every theme they were ever checked against), so they route through it,
// resolved at CALL TIME inside resultColor/liveColor below, deliberately
// NOT baked into the RESULT_COLORS object above. That distinction is
// load-bearing here: lib/theme.js's own note says never hoist a C-derived
// colour to module scope,
// because applyTheme() mutates C in place AFTER hydration, while a plain
// object literal only ever evaluates once, at import, before that mutation
// has happened (see components/tabs/Pitchers.js's identical note and
// claude/moonshot-HANDOFF-2026-08-22.md's "the earned trap"). Reading
// catColor() inside a function body re-resolves it on every call, which is
// what these two functions need since they're invoked fresh every render.
const resultColor = (h) => h.hr ? RESULT_COLORS.home_run
  : h.event === 'triple' ? catColor('result', 'triple')
  : h.event === 'double' ? RESULT_COLORS.double
  : h.event === 'single' ? catColor('result', 'single')
  : RESULT_COLORS.out

// Real outfield distances. PRECEDENCE FLIPPED 2026-08-04: the curated PARKS
// table now wins over the bot's park_fit.dimensions, because the published
// dims were checked against the live payload and they're wrong where it
// matters most — the corners and the quirks. Verified that day:
//
//   Camden Yards   bot lf=384 · the actual left-field LINE is 333 (the deep
//                  left-center number is sitting in the LF slot)
//   Daikin Park    bot 330/375/400/375/330 · the generic default, missing
//                  the 315 Crawford Boxes that define the park
//   Fenway         bot rcf=380 · no 420 triangle
//
// A spray chart drawn on those walls showed corners 50 ft from where they
// are, which is exactly what it exists to get right. The bot's dims remain
// the fallback for any venue the table doesn't list, and the footer says
// which source drew the wall. park_fit's short_side / hr_friendly_side reads
// are unaffected — those are relative judgements, not geometry.
//
function dimsFor(player) {
  const venue = clean(player?.venue_name, '')
  if (PARKS[venue]) return { dims: PARKS[venue].d, heights: PARKS[venue].h, source: 'table' }
  const d = obj(obj(player?.park_fit).dimensions)
  const vals = [d.lf, d.lcf, d.cf, d.rcf, d.rf].map((v) => n(v, 0))
  if (vals.every((v) => v > 200)) return { dims: vals, heights: DEFAULT_HEIGHTS, source: 'bot' }
  return { dims: DEFAULT_PARK, heights: DEFAULT_HEIGHTS, source: 'default' }
}

// ── TONIGHT'S BALLS ON THE SAME FIELD ───────────────────────────────────────
//
// 2026-08-10, Donovan: "there's no way to just use the spray and strike map we
// already have as the live ones as well?" — so the live feed's batted balls
// come HERE rather than to a second chart with its own look. They ride the
// same wall, the same arcs, the same colour language (colour = what happened);
// the only thing that separates them from the season dots is a white ring,
// because they are the ones that happened tonight.
//
// The coordinates are the identical Statcast grid the bot publishes for its
// tracked balls (plate at 125.42 / 198.27, 2.5 ft per unit, y inverted), so
// they go through the same toPolar() and land in the same places. Nothing is
// re-scaled and nothing is modeled.
const liveIsHR = (b) => /home_run/i.test(b?.event || '')
// Same split as resultColor() just above: triple/single read live off the
// registry, home_run/double/out stay the flagged literals.
const liveColor = (b) => (liveIsHR(b) ? RESULT_COLORS.home_run
  : /triple/i.test(b?.event || '') ? catColor('result', 'triple')
  : /double/i.test(b?.event || '') ? RESULT_COLORS.double
  : /single/i.test(b?.event || '') ? catColor('result', 'single')
  : RESULT_COLORS.out)

// ── liveOnly: THE AT-THE-PLATE SKIN ─────────────────────────────────────────
//
// 2026-08-10, Donovan on the At the Plate page: "for the spray and the strike
// map I want those to be at-the-plate specific, no outside data on those."
//
// He is right, and the reason is that page's job. Everywhere else this chart
// answers "what does this hitter do" — a season of tracked contact, filtered by
// pitch and window. On At the Plate the question is "what is happening in this
// game, right now", and a field of 300 season dots with tonight's four ringed
// in white buries the four that matter under the three hundred that don't.
//
// So `liveOnly` keeps everything that IS the picture — the park's real wall,
// the warning track, the distance arcs, the lanes, the wind, the result colour
// language — and drops every dot, chip, share and lane bar that came from the
// season sample. The season detail fetch is not even made: there is nothing on
// screen for it to feed, so it isn't requested.
//
// Nothing about the player modal, the EV Log or the Power board changes: the
// prop defaults to false, and the season chart is untouched.
export default function SprayField({
  player, height = 340, slateMode, liveOnly = false,
  liveBalls = null, liveFocusId = null, liveLabel = '',
}) {
  const [data, setData] = useState(null)
  const [state, setState] = useState('idle')
  const [only, setOnly] = useState('all')
  const [picked, setPicked] = useState(null)   // null = all pitches; else Set
  const [hover, setHover] = useState(null)
  // Bumped on every hover-enter so the flight animation below remounts
  // (SVG key change) and restarts from home plate instead of continuing
  // mid-flight or not playing again on the same dot (Donovan, 2026-08-29:
  // "see trajectory for single event like a moving thing when i hover").
  const [hoverNonce, setHoverNonce] = useState(0)
  // The methodology essays live behind this now — see the cleanliness pass.
  const [showHelp, setShowHelp] = useState(false)
  // L5 BY DEFAULT (2026-08-08, "auto spray to last 5 · auto open"): the
  // chart opens on his last five games — the window that answers "what is
  // he RIGHT NOW". If L5 turns out empty for this hitter (fresh call-up,
  // tracking gap), it widens itself to All once, before he ever sees the
  // empty state — but only if he hasn't touched the picker himself.
  const [range, setRange] = useState('g5')
  const rangeTouched = useRef(false)
  const [bbPick, setBbPick] = useState(null)   // null = all batted-ball types
  const [armPick, setArmPick] = useState('ALL')  // ALL | L | R — pitcher hand
  const [sidePick, setSidePick] = useState('ALL') // ALL | pull | center | oppo
  const [deepPick, setDeepPick] = useState('ALL') // ALL | 375 | 400 | pullair
  // PARK OVERLAY (2026-08-28, addendum N3: "would it have gone out here").
  // '' = off, showing only his real park's wall like every chart before this.
  // A selected park name re-tests every dot on screen against THAT park's
  // fence at the same landing angle, using the exact same wallAt() math —
  // see dimsFor()'s own note on why the curated PARKS table (not a live
  // fetch) is the source of truth here: it was checked against the real
  // payload and found to be RIGHT where the bot's own numbers were wrong
  // (Camden, Daikin, Fenway), so testing against anything else would be
  // testing against dimensions already known to be worse.
  const [testPark, setTestPark] = useState('')
  const [stadium, setStadium] = useState(false)
  // tonight's layer
  const [live, setLive] = useState(false)   // drawn from a live Savant pull, not the bot's cache
  const [hoverLive, setHoverLive] = useState(null)
  const [liveOn, setLiveOn] = useState(true)
  // Tonight-only cuts: contact quality and the pitch that produced the ball.
  // Result (single-select) + Quality (multi-select, OR within, AND against
  // Result) — the exact filter grammar BattedBallLog established, replacing
  // the old 4-chip single-select (All/HH/Barrels/XBH) that offered a
  // DIFFERENT category set for the same balls (Pass 3, 2026-08-14).
  const [liveRes, setLiveRes] = useState('all')      // all | hr | 3b | 2b | 1b | out
  const [liveQual, setLiveQual] = useState(new Set()) // of: hh | barrel | ev100 | deepFly
  const [livePitch, setLivePitch] = useState(null) // null = every pitch type

  const pid = player?.player_id || player?.id

  useEffect(() => {
    // liveOnly draws no season dots, so it asks for no season data.
    if (!pid || liveOnly) return
    let alive = true
    setState('loading'); setData(null); setPicked(null); setOnly('all')
    setRange('all'); setBbPick(null)
    // OFF-SLATE PLAYERS (2026-08-28): a QuickSearch result has no slate
    // detail file — it was never on tonight's board — so asking for
    // detailUrl() would just be a guaranteed 404. archiveDetailUrl() is the
    // league-wide, slate-independent archive spray_archive.py fills in
    // gradually (see lib/dataSource.js). Same fetch/shape either way — the
    // rest of this component doesn't know or care which source answered.
    const url = player?.api_only ? archiveDetailUrl(pid) : detailUrl(pid, slateMode)
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return
        // ── 🔴 THE SAME LIVE PULL THE EV LOG HAS HAD SINCE 2026-08-08 ──────
        // Donovan, on a hitter sitting at #146 of tonight's 303: "this should
        // never happen for a player. all stats and spray chart, ev and pitch
        // log should come up. fix that. still should have a tag as not on the
        // bot, but all the stats need to be shown."
        //
        // He is right, and the fix belongs here rather than in the copy. The
        // EV Log already falls back to a live Statcast pull when the bot has
        // no cached file — same season, same batted balls, straight from
        // Savant — and it has been quietly doing that for three weeks while
        // this chart, one tab across, rendered "No tracked batted balls" for
        // the same man. One panel resourceful and its neighbour helpless is
        // not a data problem, it is a wiring one.
        //
        // The published file still WINS whenever it exists: this only fires
        // when there is nothing cached, and the chart says out loud which pipe
        // it drew from. lib/savant.js now returns hc_x/hc_y and the same flags
        // spray_cache.py writes, so the live rows go through exactly the same
        // transform as cached ones and every filter keeps working.
        const cached = Array.isArray(j?.spray_chart) ? j.spray_chart : []
        if (cached.length) { setData(j); setState('done'); setLive(false); return }
        import('../lib/savant')
          .then(({ savantBattedBalls }) => savantBattedBalls(pid))
          .then((rows) => {
            if (!alive) return
            if (rows && rows.length) { setData({ ...(j || {}), spray_chart: rows }); setLive(true) }
            else { setData(j); setLive(false) }
            setState('done')
          })
          .catch(() => { if (alive) { setData(j); setLive(false); setState('done') } })
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [pid, slateMode, liveOnly, player?.api_only])

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
      // ── FIELDS THE CHART HAD AND NEVER FILTERED ON (2026-08-29) ─────────
      // Donovan: "make sure the spray chart filters are good and add more if
      // needed." The gap that mattered: the EV Log has had an ARM filter
      // since it shipped and this chart never did — so the one question you
      // most want a spray chart for, "where does he hit it against the hand
      // he faces tonight", could not be asked here. `arm` is on every batted
      // ball in the payload already; so are the direction and distance flags
      // used below.
      arm: clean(h?.arm || h?.pitcher_throws, ''),
      side: clean(h?.spray_side, '').toLowerCase(),
      far375: !!h?.is_375_plus,
      far400: !!h?.is_400_plus,
      pullAir: !!h?.is_pull_air,
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
  // Every date he has a tracked ball on, newest first. This is the game list.
  const gameDates = useMemo(
    () => [...new Set(hits.map((h) => h.date).filter(Boolean))].sort().reverse(),
    [hits],
  )
  useEffect(() => {
    if (rangeTouched.current || range !== 'g5' || !hits.length) return
    const keep = new Set(gameDates.slice(0, 5))
    if (!hits.some((h) => keep.has(h.date))) setRange('all')
  }, [hits, gameDates, range])
  const inRange = useMemo(() => {
    const spec = RANGES.find((r) => r.key === range)
    if (!spec?.games) return hits
    const keep = new Set(gameDates.slice(0, spec.games))
    return hits.filter((h) => keep.has(h.date))
  }, [hits, range, gameDates])
  const gamesShown = useMemo(
    () => new Set(inRange.map((h) => h.date).filter(Boolean)).size,
    [inRange],
  )

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
  // THE "ALL" BUTTON BUG (2026-08-08, "the All button is glitchy"): this
  // effect used to re-apply the starter's mix whenever picked was null —
  // which is exactly what the All chip sets. Click All, the effect snapped
  // the selection straight back to the mix, so the button looked dead and
  // the chart flickered. The default now applies ONCE per player; after
  // that, null means all and stays meaning all.
  const mixApplied = useRef(null)
  useEffect(() => {
    if (state !== 'done' || mixApplied.current === pid) return
    if (matchable.length) {
      setPicked(new Set(matchable))
      mixApplied.current = pid
    }
  }, [state, matchable, pid])

  // Result classes. The old version called every non-XBH ball an "Out", which
  // labelled 4,311 singles across the slate as outs. Group on `event`.
  // Filter-CHIP colours, not the dot legend: an orange-intensity ladder for
  // button emphasis, independent of RESULT_COLORS. Note 'single' below is
  // dark orange while a single DOT (RESULT_COLORS.single / catColor('result',
  // 'single')) is blue -- deliberately different concepts (chip emphasis vs.
  // outcome identity), not an inconsistency to fix here. xbh/single/hard have
  // no exact C token match (all three are hand-picked orange shades) and stay
  // literal; all/hr/out already read tokens (C.text2/C.orange/C.text3).
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
    // A ball with no arm stamped is KEPT rather than hidden: the field is not
    // guaranteed on older cached rows, and silently dropping them would make
    // the chart quietly under-report instead of saying so.
    const okArm = armPick === 'ALL' || !h.arm || h.arm === armPick
    const okSide = sidePick === 'ALL' || (h.side && h.side === sidePick)
    const okDeep = deepPick === 'ALL'
      || (deepPick === '375' && h.far375)
      || (deepPick === '400' && h.far400)
      || (deepPick === 'pullair' && h.pullAir)
    return okClass && okPitch && okBB && okArm && okSide && okDeep
  }), [inRange, only, picked, bbPick, armPick, sidePick, deepPick])

  // Tonight's balls, through the same transform as the season ones.
  // res/deepFly stamped here once (Pass 3) so the filter rows below and the
  // counts on their chips all read the same precomputed answer.
  const liveHits = useMemo(() => (Array.isArray(liveBalls) ? liveBalls : []).map((b) => {
    const p = toPolar({ hc_x: b?.cx, hc_y: b?.cy })
    if (!p) return null
    return {
      ...b, r: p.dist, ang: p.ang, hr: liveIsHR(b),
      res: outcomeOf(b?.event),
      deepFly: isDeepFlyOut(b?.traj, b?.dist, b?.event),
    }
  }).filter(Boolean), [liveBalls])

  const reset = () => { setOnly('all'); setPicked(null); setBbPick(null); setArmPick('ALL'); setSidePick('ALL'); setDeepPick('ALL'); setRange('all'); setLiveRes('all'); setLiveQual(new Set()); setLivePitch(null); setTestPark('') }

  const liveN = liveHits.length
  // In liveOnly the ● Tonight chip isn't rendered (it lives in the season
  // window row), so the live layer is always on — otherwise the toggle would
  // be the only thing between this chart and a permanently empty field.
  // ── TONIGHT-ONLY FILTERS (2026-08-09) ────────────────────────────────────
  // Donovan: "at plate spray need pitches and hh barrels xbh filters."
  // Four cuts on the same 53-dot picture, plus the pitch that produced each
  // ball. Every flag is computed in lib/livePitches.js from the ball's own
  // exit velo / launch angle / result event — see that file for the barrel
  // definition, which is the published one and not an approximation.
  //
  // COUNTS ARE ALWAYS SHOWN ON THE CHIP. A filter that can return zero without
  // warning you is a filter that reads as a broken chart, and this sample is
  // small enough that "Barrels 0" is a normal, true answer.
  // Chip rows in BattedBallLog's own grammar: OUTCOME_TABS / QUALITY_TABS are
  // imported from that file, counts computed against tonight's balls here.
  const liveResTabs = useMemo(() => OUTCOME_TABS.map((t) => ({
    ...t,
    n: t.key === 'all' ? liveHits.length : liveHits.filter((b) => b.res === t.key).length,
    // Filter-chip emphasis for the HR tab only -- a near-orange accent, not
    // an exact C token (Tailwind orange-400 vs C.orange's orange-500) and
    // not routed through catColor('result', ...): OUTCOME_TABS' keys ('hr',
    // '3b','2b','1b','out', from BattedBallLog) don't match CAT.result's
    // ('home_run','triple','double','single','out'), so only two of five
    // would even resolve. Left literal.
    col: t.key === 'hr' ? '#fb923c' : C.text2,
  })), [liveHits])
  const liveQualTabs = useMemo(() => {
    const gate = { hh: (b) => b.hh, barrel: (b) => b.barrel, ev100: (b) => (b.ev || 0) >= 100, deepFly: (b) => b.deepFly }
    // Quality-flag colours, not RESULT_COLORS -- 'barrel' and 'deepFly' are
    // batted-ball QUALITY flags (lib/livePitches.js), not outcome categories,
    // so neither routes through catColor('result', ...) either; there's no
    // CAT concept for them. barrel and deepFly were already byte-identical
    // to C.red/C.purple, so those two read the token directly instead of a
    // duplicate literal. hh and ev100 have no exact token match (both are
    // near-misses on C.orange/C.yellow, off by one Tailwind step) and stay
    // literal.
    const col = { hh: '#fb923c', barrel: C.red, ev100: '#fbbf24', deepFly: C.purple }
    return QUALITY_TABS.map((t) => ({
      ...t,
      n: liveHits.filter(gate[t.key] || (() => false)).length,
      col: col[t.key] || C.text2,
    }))
  }, [liveHits])
  // Pitch types present in tonight's contact, so the row can never offer a
  // filter that would return nothing.
  const livePitchTypes = useMemo(() => {
    const m = new Map()
    liveHits.forEach((b) => { if (b.type) m.set(b.type, (m.get(b.type) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [liveHits])

  const liveFiltered = useMemo(() => liveHits.filter((b) => {
    // Same AND/OR grammar as BattedBallLog's filteredRows: Result narrows,
    // Quality (when anything is ticked) passes a ball matching ANY tick.
    const okRes = liveRes === 'all' || b.res === liveRes
    const okQual = !liveQual.size
      || (liveQual.has('hh') && b.hh)
      || (liveQual.has('barrel') && b.barrel)
      || (liveQual.has('ev100') && (b.ev || 0) >= 100)
      || (liveQual.has('deepFly') && b.deepFly)
    const okPitch = !livePitch || b.type === livePitch
    return okRes && okQual && okPitch
  }), [liveHits, liveRes, liveQual, livePitch])

  const liveDrawn = liveOnly || liveOn ? liveFiltered : []
  const fid = Number(liveFocusId) || null
  const anyFocus = fid ? liveHits.some((b) => Number(b.batterId) === fid) : false

  // HONEST EMPTY STATE for the tonight-only skin. There is no season fallback
  // to quietly show instead — that is the whole point of the skin — so an empty
  // game says so in plain words rather than drawing a bare field.
  if (liveOnly && !liveN) {
    return (
      <div style={{ fontSize: 11, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>
        No balls in play from this game yet tonight — this chart is <b style={{ color: C.text2 }}>tonight
        only</b>, so it stays empty until somebody makes contact. It fills in on its own.
      </div>
    )
  }

  if (!pid && !liveN) return null
  if (state === 'loading' && !liveN) {
    return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading batted balls…</div>
  }
  if (state === 'error' && !liveN) {
    return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Couldn&apos;t load his batted-ball detail.</div>
  }
  if (!hits.length && !liveN) {
    return (
      <div style={{ fontSize: 11, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>
        No tracked batted balls for this hitter — nothing in the bot&apos;s cache, and the live
        Statcast pull came back empty too. That is every source this chart has.
      </div>
    )
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
  const { dims, heights, source: dimSource } = dimsFor(player)
  const knownPark = dimSource !== 'default'
  const wallAt = (ang) => {
    const t = (Math.max(-45, Math.min(45, ang)) + 45) / 90
    const i = Math.min(3, Math.max(0, Math.floor(t * 4)))
    const f = t * 4 - i
    return dims[i] + (dims[i + 1] - dims[i]) * f
  }

  // PARK OVERLAY — same interpolation as wallAt(), against the SELECTED
  // park's dims instead of his own. Undefined (not '') when no park is
  // picked, so every call site below can just check `wallAtTest &&`.
  const testDims = testPark ? PARKS[testPark] : null
  const lerp5 = (arr, ang) => {
    const t = (Math.max(-45, Math.min(45, ang)) + 45) / 90
    const i = Math.min(3, Math.max(0, Math.floor(t * 4)))
    return arr[i] + (arr[i + 1] - arr[i]) * (t * 4 - i)
  }
  const wallAtTest = testDims ? (ang) => lerp5(testDims.d, ang) : null
  const wallHeightAtTest = testDims ? (ang) => lerp5(testDims.h, ang) : null

  // ── DOES IT CLEAR? (2026-08-29) ────────────────────────────────────────────
  // This was `h.r > wallAtTest(h.ang)` — landing radius past the fence LINE —
  // labelled "would it have gone out here". Those are different questions
  // wherever a wall is tall: a ball can land past Fenway's 308-ft line in left
  // and still be a double off 37 feet of Monster. Height is in the math now.
  //
  // Only balls that actually reached the fence get a flight solved, and the
  // solve is memoised per ball, so the first park costs a few ms and every
  // park after it is free.
  const clearsTest = wallAtTest && wallHeightAtTest ? (h) => {
    const wd = wallAtTest(h.ang)
    if (!(h.r > wd)) return false            // came down short of the fence line
    const wh = wallHeightAtTest(h.ang)
    if (!(wh > 0)) return true
    const f = flightFor(h)
    const ht = f ? f.heightAt(wd) : null
    // No launch angle on this ball means no honest height. Fall back to the
    // old distance-only answer rather than inventing one.
    return ht == null ? true : ht > wh
  } : null

  // The payoff number: of what's ON SCREEN right now (the same `shown` set
  // the dots below are drawn from — the range/pitch/bb-type filters apply
  // here too, on purpose, so the summary always describes what's visible),
  // how many real homers would still clear the selected park, and how many
  // balls that did NOT clear his own wall would clear this one instead.
  // Landing-coordinate radius vs. the wall at that same angle — exactly
  // what "did it clear the fence" means geometrically, no distance-vs-carry
  // ambiguity (see the note at toPolar() on why radius, not hit_distance_sc,
  // is the right number for a location question).
  const parkTest = clearsTest ? shown.reduce((acc, h) => {
    const clears = clearsTest(h)
    if (h.hr) { acc.realHR += 1; if (clears) acc.stillClears += 1; else if (h.r > wallAtTest(h.ang)) acc.offWall += 1 }
    else if (clears) acc.wouldBeHR += 1
    return acc
  }, { realHR: 0, stillClears: 0, wouldBeHR: 0, offWall: 0 }) : null

  const laneCounts = LANE_ORDER.map((key) => ({
    key,
    n: inRange.filter((h) => h.lane === key).length,
    hr: inRange.filter((h) => h.hr && h.lane === key).length,
  }))

  const foulCount = inRange.filter((h) => Math.abs(h.ang) > 45).length
  // WIND IS DRIVEN BY THE LABEL, NOT THE DEGREES.
  //
  // weather_wind_deg is a COMPASS bearing. Every ballpark faces a different way
  // and that orientation isn't published anywhere in this payload, so there is
  // no way to turn 113° into "toward right field" for a given park. Drawing the
  // streaks off the degrees would have pointed them in a direction unrelated to
  // the field underneath them — confidently wrong, which is worse than absent.
  //
  // weather_wind_direction_label IS park-relative. Six values across the slate:
  //   out to CF (53) · out to CF/corner (36) · in from CF (36)
  //   in from CF/corner (54) · crosswind (out) (18) · crosswind (in) (18)
  //
  // So the arrow shows the component that actually matters for carry — out,
  // in, or across — and does not pretend to a precise bearing. Left-to-right
  // vs right-to-left on a crosswind isn't in the data either, so a crosswind is
  // drawn on the axis without claiming a side.
  //
  // ── MOVED TO lib/conditions.js (2026-08-30) ─────────────────────────────
  // The 3D stadium needed the same bearing and the same colour, and this
  // block was the only place either existed. windRead() is a straight lift —
  // same regexes, same 28/152 corner bearings, same verdictInk pair — so the
  // 2D chart's numbers are unchanged; it just stopped being the only owner of
  // them. The essay above travelled with the function.
  const _wind = windRead(player)
  const windMph = _wind.mph
  const windLabel = _wind.label
  const windOut = _wind.out
  const windIn = _wind.in
  const windCross = _wind.cross
  const windTo = _wind.to
  // This IS the site-wide verdict pair, not a one-off ternary: the footer a
  // few hundred lines down spells out the same good/bad framing in words
  // ("helping carry" / "hurting carry" / "pushing sideways"), and the two
  // non-neutral colours were already, byte-for-byte, C.orange and C.blue.
  // verdictInk(null) resolves the crosswind/no-wind case to C.text3 rather
  // than the old literal C.text2 -- one shade quieter, matching how every
  // other null verdict on the site reads. windOut is checked before windIn
  // here, same precedence as the ternary this replaces, so "crosswind (out)"
  // labels still resolve to the warm/true side exactly as before -- no
  // branching logic changed, only the colour source.
  const windCol = _wind.color
  const hasWind = _wind.has
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
      {/* TONIGHT ONLY — the At the Plate skin says what it is instead of
          offering season windows it doesn't draw. */}
      {liveOnly && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.08em',
            // Game-state signal ("this view is live"), not a win/loss verdict
            // -- same call Games.js's e7c5fd3 pass made for its identical
            // live/posted badges. Byte-identical to the old literal and its
            // rgba(...) forms in ember, now theme-resolved. The other
            // three "● Tonight"/"TONIGHT ONLY" state labels below (the ●
            // Tonight toggle chip, the hover readout, the footer) are the
            // same state colour, same reasoning, not re-commented each time.
            color: C.green, border: `1px solid ${alpha(C.green, 0.5)}`, background: alpha(C.green, 0.10),
            borderRadius: 999, padding: '2px 9px',
          }}>● TONIGHT ONLY</span>
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {liveN} ball{liveN === 1 ? '' : 's'} in play this game · no season sample on this chart
          </span>
        </div>
      )}

      {/* Result + Quality, each on its own labelled row — the same
          one-concept-per-row pattern the season chart already uses below,
          AND the same two categories the Batted Ball Log at the top of the
          page filters by (Pass 3, 2026-08-14 — the tabs are imported from
          that file, so the two surfaces literally cannot offer different
          category sets). Result is single-select; Quality is multi-select
          and ticking two reads as "either", exactly like the log. Counts
          ride on every chip so an empty result reads as an answer, not a
          bug; a zero-count chip is dimmed rather than offered. */}
      {liveOnly && liveN > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Result</span>
          {liveResTabs.map((c) => (
            <button key={c.key} onClick={() => setLiveRes(c.key)}
              title={c.key === 'all' ? 'Every ball in play from this game.' : c.key === 'out' ? 'Everything that didn’t land for a hit — outs, errors, fielder’s choices.' : undefined}
              disabled={c.n === 0 && c.key !== 'all'}
              style={{
                ...chipBtn(liveRes === c.key, c.col), padding: '2px 8px', fontSize: 9.5,
                opacity: c.n === 0 && c.key !== 'all' ? 0.3 : 1,
                cursor: c.n === 0 && c.key !== 'all' ? 'default' : 'pointer',
              }}>
              {c.label} <b style={{ fontFamily: NUM_FONT }}>{c.n}</b>
            </button>
          ))}
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginLeft: 'auto' }}>
            showing {liveFiltered.length} of {liveN}
          </span>
          <button onClick={reset} style={{ ...chipBtn(false, C.text3), padding: '2px 8px', fontSize: 9.5 }}>
            Reset
          </button>
        </div>
      )}
      {liveOnly && liveN > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Quality</span>
          {liveQualTabs.map((c) => {
            const on = liveQual.has(c.key)
            return (
              <button key={c.key} title={c.title}
                onClick={() => setLiveQual((prev) => {
                  const next = new Set(prev)
                  if (next.has(c.key)) next.delete(c.key)
                  else next.add(c.key)
                  return next
                })}
                disabled={c.n === 0}
                style={{
                  ...chipBtn(on, c.col), padding: '2px 8px', fontSize: 9.5,
                  opacity: c.n === 0 ? 0.3 : 1,
                  cursor: c.n === 0 ? 'default' : 'pointer',
                }}>
                {c.label} <b style={{ fontFamily: NUM_FONT }}>{c.n}</b>
              </button>
            )
          })}
          {liveQual.size > 1 && (
            <span style={{ fontSize: 8.5, color: C.text3 }}>either one counts</span>
          )}
        </div>
      )}

      {/* The pitch that produced the ball — its own row now too, same reason
          as above. Only appears once there's more than one type to tell
          apart, same gate as before. */}
      {liveOnly && liveN > 0 && livePitchTypes.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Pitch</span>
          {livePitchTypes.map(([code, ct]) => (
            <button key={code}
              onClick={() => setLivePitch((v) => (v === code ? null : code))}
              title={`${PITCH_NAMES[code] || code} — ${ct} ball${ct === 1 ? '' : 's'} in play off it tonight. The pitch and the batted ball come off the same play event, so this is the pitch that was actually hit.`}
              style={{ ...chipBtn(livePitch === code, pitchColor(code)), padding: '2px 8px', fontSize: 9.5 }}>
              {PITCH_NAMES[code] || code} <b style={{ fontFamily: NUM_FONT }}>{ct}</b>
            </button>
          ))}
        </div>
      )}

      {/* A cut that empties the field says so — the picture alone can't. */}
      {liveOnly && liveN > 0 && liveFiltered.length === 0 && (
        <div style={{ fontSize: 10.5, color: C.orange, marginBottom: 6, lineHeight: 1.5 }}>
          Nothing in this game matches that combination yet — {liveN} ball{liveN === 1 ? '' : 's'} in play,
          none of them{liveRes !== 'all' ? ` a ${(OUTCOME_TABS.find((t) => t.key === liveRes) || {}).label || liveRes}` : ''}
          {liveQual.size ? `${liveRes !== 'all' ? ' that was also' : ''} ${[...liveQual].map((k) => (QUALITY_TABS.find((t) => t.key === k) || {}).label || k).join(' or ')}` : ''}
          {livePitch ? ` off a ${PITCH_NAMES[livePitch] || livePitch}` : ''}. That&apos;s the answer, not an error.
        </div>
      )}

      {/* Date window. Counts everywhere else on the panel follow it. */}
      {!liveOnly && (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Games</span>
        {RANGES.map((r) => {
          // A window wider than he has games in is just "All" wearing a smaller
          // number, so it's dimmed rather than offered as a real choice.
          const redundant = r.games != null && r.games >= gameDates.length
          return (
            <button
              key={r.key}
              onClick={() => { rangeTouched.current = true; setRange(r.key) }}
              title={r.games ? `His last ${r.games} games with a tracked batted ball` : `All ${gameDates.length} games on file`}
              style={{
                ...chipBtn(range === r.key, C.orange),
                padding: '2px 8px', fontSize: 9.5,
                opacity: redundant && range !== r.key ? 0.35 : 1,
              }}
            >{r.label}</button>
          )
        })}
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
          {gamesShown}G · {inRange.length} of {hits.length} BBE
          {newest ? ` · through ${newest}` : ''}
        </span>
        {liveN > 0 && (
          <button
            onClick={() => setLiveOn((v) => !v)}
            title="Tonight's tracked balls in play from the live feed, on this same field. Ringed in white so they can't be mistaken for the season sample."
            style={{ ...chipBtn(liveOn, C.green), padding: '2px 8px', fontSize: 9.5 }}
          >● Tonight {liveN}</button>
        )}
        <button onClick={reset} style={{ ...chipBtn(false, C.text3), padding: '2px 8px', fontSize: 9.5, marginLeft: 'auto' }}>
          Reset
        </button>
      </div>
      )}

      {inRange.length === 0 && hits.length > 0 && (
        <div style={{ fontSize: 10.5, color: C.orange, marginBottom: 6 }}>
          No tracked batted balls in this window — his last one was {newest || 'unknown'}. Widen the range.
        </div>
      )}
      {!liveOnly && hits.length === 0 && liveN > 0 && (
        <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 6, lineHeight: 1.5 }}>
          No tracked batted balls on file for this hitter — the field below is
          tonight&apos;s live contact only.
        </div>
      )}
      {range !== 'all' && inRange.length > 0 && inRange.length < 20 && (
        <div style={{ fontSize: 9.5, color: C.orange, marginBottom: 6, lineHeight: 1.5 }}>
          {inRange.length} batted balls over {gamesShown} game{gamesShown === 1 ? '' : 's'} — too few
          to read a spray tendency off. At this size one ball moves a lane share by five points, so
          treat the shape as a look at recent contact, not a profile.
        </div>
      )}

      {/* Result chips: label, count and share on the chip itself. Click to
          filter. No separate legend to fall out of step with the chart. */}
      {!liveOnly && (
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
      )}

      {/* WHICH PIPE THIS CAME DOWN. Same badge the EV Log has carried since
          the live fallback shipped — a reader must never have to guess whether
          a chart is the bot's own cache or a live pull, because the two are
          the same data and NOT the same provenance. */}
      {!liveOnly && live && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
          marginBottom: 7, padding: '5px 9px', borderRadius: 8,
          border: '1px solid rgba(248,113,113,.3)', background: 'rgba(248,113,113,.07)',
          fontSize: 9.5, color: C.text3, lineHeight: 1.5,
        }}>
          <span style={{ color: '#f87171', fontWeight: 900 }}>🔴 Live Statcast pull</span>
          <span>
            he isn&apos;t in the bot&apos;s cache for this slate, so these {hits.length} batted balls came
            straight from Savant just now — same season, same balls, different pipe. Barrel,
            hard-hit and pull use Savant&apos;s own definitions.
          </span>
        </div>
      )}

      {/* ── ARM, DIRECTION, DISTANCE (2026-08-29) ───────────────────────────
          Donovan: "make sure the spray chart filters are good and add more if
          needed."

          ARM is the one that was actually missing: the EV Log has had a
          pitcher-hand filter since it shipped and this chart never did, so
          the single most useful question you bring to a spray chart — where
          does he hit it against the hand he faces tonight — could not be
          asked on the chart itself.

          SIDE and the distance row are the same fields the EV Log's new
          tiles read. Nothing here is computed: spray_side, is_375_plus,
          is_400_plus and is_pull_air are flags spray_cache.py already writes
          per batted ball. Every count beside a chip is over the balls
          currently in the window, so a chip can never describe a wider
          sample than the field is drawing. */}
      {!liveOnly && (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 7, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Arm</span>
        {[['ALL', 'All'], ['L', 'vs LHP'], ['R', 'vs RHP']].map(([k, label]) => {
          const n = k === 'ALL' ? inRange.length : inRange.filter((h) => h.arm === k).length
          return (
            <button key={k} onClick={() => setArmPick(k)} disabled={n === 0 && k !== 'ALL'}
              title={k === 'ALL' ? 'Every batted ball in the window' : `Only balls he hit off a ${k === 'L' ? 'left' : 'right'}-handed pitcher. Balls with no pitcher hand recorded are kept rather than hidden.`}
              style={{ ...chipBtn(armPick === k, C.orange), opacity: (n || k === 'ALL') ? 1 : 0.35 }}>
              {label}{k !== 'ALL' && <span style={{ opacity: 0.65 }}> {n}</span>}
            </button>
          )
        })}
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', marginLeft: 6 }}>Side</span>
        {[['ALL', 'All'], ['pull', 'Pull'], ['center', 'Centre'], ['oppo', 'Oppo']].map(([k, label]) => {
          const n = k === 'ALL' ? inRange.length : inRange.filter((h) => h.side === k).length
          return (
            <button key={k} onClick={() => setSidePick(k)} disabled={n === 0 && k !== 'ALL'}
              title={k === 'ALL' ? 'Every direction' : `Only balls he hit to the ${k === 'oppo' ? 'opposite field' : k} side. Direction only — where it went, not how hard.`}
              style={{ ...chipBtn(sidePick === k, '#fb9d3a'), opacity: (n || k === 'ALL') ? 1 : 0.35 }}>
              {label}{k !== 'ALL' && <span style={{ opacity: 0.65 }}> {n}</span>}
            </button>
          )
        })}
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', marginLeft: 6 }}>Distance</span>
        {[['ALL', 'All'], ['375', '375+ ft'], ['400', '400+ ft'], ['pullair', 'Pull-air']].map(([k, label]) => {
          const n = k === 'ALL' ? inRange.length
            : k === '375' ? inRange.filter((h) => h.far375).length
              : k === '400' ? inRange.filter((h) => h.far400).length
                : inRange.filter((h) => h.pullAir).length
          return (
            <button key={k} onClick={() => setDeepPick(k)} disabled={n === 0 && k !== 'ALL'}
              title={k === 'ALL' ? 'Every batted ball in the window'
                : k === 'pullair' ? 'Pulled AND in the air — the batted-ball shape that actually leaves buildings. The bot\u2019s own flag.'
                  : `Balls that travelled ${k}+ feet — the same tiers the pitcher panel reports as distance given up.`}
              style={{ ...chipBtn(deepPick === k, '#c084fc'), opacity: (n || k === 'ALL') ? 1 : 0.35 }}>
              {label}{k !== 'ALL' && <span style={{ opacity: 0.65 }}> {n}</span>}
            </button>
          )
        })}
      </div>
      )}

      {/* PARK OVERLAY (addendum N3, 2026-08-28, "would it have gone out
          here"). Off by default — picking a park re-tests every ball on
          screen against that park's real fence, drawn as a second, dashed
          wall alongside his own. Season mode only, same as the other
          filters above; At the Plate's liveOnly skin stays untouched. */}
      {!liveOnly && (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 7, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Test vs. park
        </span>
        <select
          value={testPark}
          onChange={(e) => setTestPark(e.target.value)}
          style={{
            background: C.bg3, color: C.text2, border: `1px solid ${C.border}`,
            borderRadius: 6, fontSize: 10.5, fontFamily: NUM_FONT, padding: '2px 6px',
          }}
        >
          <option value="">— his real park —</option>
          {Object.keys(PARKS).sort().map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {/* 🏟 the 3D toggle lives beside the park test because they answer
            the same question from two angles — additive, the 2D chart never
            leaves the page. */}
        <button
          onClick={() => setStadium((v) => !v)}
          title="The same balls flown through the park in 3D — drag to orbit, scroll to zoom. The 2D chart stays; this is another way of looking at it."
          style={{
            padding: '2px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
            fontFamily: NUM_FONT,
            border: `1px solid ${stadium ? C.orange : C.border}`,
            background: stadium ? 'rgba(249,115,22,.12)' : 'transparent',
            color: stadium ? C.orange : C.text3,
          }}
        >🏟 Stadium</button>
        {parkTest && (
          <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
            {parkTest.stillClears} of {parkTest.realHR} real HR{parkTest.realHR === 1 ? '' : 's'} still clear
            {parkTest.offWall > 0 && (
              <> · <b style={{ color: C.blue }}>{parkTest.offWall}</b> off the wall</>
            )}
            {parkTest.wouldBeHR > 0 && (
              <> · <b style={{ color: C.orange }}>{parkTest.wouldBeHR}</b> more would go out here that didn&apos;t at his own park</>
            )}
          </span>
        )}
      </div>
      )}


      {/* Pitch chips. This is the question the panel exists for: does he only
          do damage against one pitch, and does tonight's arm throw it? The
          chips now come up pre-set to the starter's mix against this side. */}
      {!liveOnly && pitches.length > 0 && (
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
      {!liveOnly && (
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
      )}

      {!liveOnly && matchable.length > 0 && (
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


      {/* 🏟 STADIUM (2026-08-29) — GB/LD and pitch-mix chips above (plus batted-ball type) already filter
          this same `shown` set the dots below draw
          from, flown in 3D against the tested park's wall when one is picked,
          his own otherwise. Additive: the SVG chart below never leaves. */}
      {!liveOnly && stadium && (
        <div style={{ marginBottom: 10 }}>
          <SprayFieldStadium
            hits={shown}
            dims={testPark && PARKS[testPark] ? PARKS[testPark].d : dims}
            heights={testPark && PARKS[testPark] ? PARKS[testPark].h : (heights || [8, 8, 8, 8, 8])}
            venue={testPark || venue}
            wind={hasWind ? { mph: windMph, label: windLabel, to: windTo, color: windCol } : null}
          />
        </div>
      )}

      <div className="spray-wrap" style={{
        display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start',
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10,
      }}>
        {/* .spray-svg is a phone hook. The inline `height` is a fixed pixel
            number, and an inline style beats the blanket `svg { height: auto }`
            in MobileCSS — so on a narrow screen the field kept its full desktop
            height while its width collapsed, letterboxing a short wide picture
            inside a tall box and eating most of a portrait screen for nothing.
            The class lets the phone rule reclaim the height. */}
        <svg className="spray-svg" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 460, height, flexShrink: 0 }}>
          {/* ── FIELD GEOMETRY COLOURS: DOMAIN, NOT ROUTED (2026-08-24) ──────
              Every fixed hex from here down through the wall/turf/track/
              infield/arcs — including the field's own dark base tone,
              reused below as an outline so a marker still reads against
              whatever sits under it — is the ballpark graphic: turf, dirt,
              wall, wedge. lib/scales.js's own header exempts this explicitly
              ("Green/red survives ONLY where it is a domain colour, a field
              graphic"). None of it carries a verdict or a category; it's
              drawing a park, the same way a real park is brown dirt and
              green grass regardless of what theme your phone is in.
              A few of these (the wall stroke, the foul lines, the distance-
              arc stroke, the infield fill) happen to be byte-identical to
              C.orange today — deliberately NOT routed to the token: this
              file's own design a few hundred lines up is "ORANGE IS THE
              FIELD, NOT THE DOTS", so making the field itself follow
              C.orange across five different themes is a real design
              question — does the park still read as a park when it goes
              from ember's saturated orange to light theme's much more muted
              burnt-orange? — not something to answer unilaterally in a
              colour-plumbing pass. Flagged once here rather than at each
              repeat.
              Two are the opposite case: literals that must NOT be routed
              even though they land on a token by coincidence. The tonight-
              dot ring (below) is a fixed near-white ring that separates
              tonight's balls from the season sample, and happens to equal
              ember's C.text — but C.text is near-black under the light
              theme, so reading it as C.text would make the ring disappear
              exactly where it's needed. The hover ring (two places below,
              a plain "white") is a fixed white for the same reason. Neither
              is "the text colour" conceptually; both stay literal, marked
              at each occurrence. */}
          {/* THE FIELD IS A SOLID SURFACE.
              Every previous version drew it as white at 2-8% opacity on a
              near-black page, which is a difference of about 1.3:1 — the eye
              reads that as "nothing there", so the dots looked like they were
              floating on the page rather than sitting on a field. It's now a
              solid slate-navy polygon with a light rim, which is the single
              change that makes the plot legible. */}
          <rect x="0" y="0" width={W} height={H} rx="10" fill="#0a0806" />

          {/* Wind, drifting. The streaks move along the park-relative bearing
              so the direction is legible at a glance without reading the label,
              and the speed scales with mph — a 1 mph breeze barely creeps, a
              6 mph wind visibly runs. */}
          {hasWind && (() => {
            // Screen vector for the field bearing: 0° = out to centre = up.
            const rad = (windTo * Math.PI) / 180
            const vx = Math.sin(rad)
            const vy = -Math.cos(rad)
            const len = 14 + windMph * 2.2
            const dur = Math.max(2.4, 9 - windMph)
            return (
              <g className="wind-streaks" opacity="0.45">
                <style>{`
                  @keyframes windDrift {
                    from { transform: translate(0px, 0px); }
                    to   { transform: translate(${(vx * 46).toFixed(1)}px, ${(vy * 46).toFixed(1)}px); }
                  }
                  .wind-streaks g { animation: windDrift ${dur.toFixed(1)}s linear infinite; }
                  @media (prefers-reduced-motion: reduce) {
                    .wind-streaks g { animation: none; }
                  }
                `}</style>
                <g>
                  {Array.from({ length: 30 }).map((_, i) => {
                    const gx = ((i * 67) % (W + 60)) - 30
                    const gy = ((i * 113) % (H + 60)) - 30
                    return (
                      <line key={i}
                        x1={gx} y1={gy}
                        x2={gx + vx * len} y2={gy + vy * len}
                        stroke={windCol} strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
                    )
                  })}
                </g>
              </g>
            )
          })()}

          {/* Foul ground stays dark; fair territory is the solid surface. */}
          <path d={wedge(-EDGE, EDGE, R)} fill="#1a1109" />
          <path
            d={wedge(-45, 45, wallAt)}
            fill="#3d2612"
            stroke="#f97316"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />

          {/* Warning track — the band of dirt inside the wall. Drawn as the ring
              between the wall and 18 ft short of it, which is roughly regulation.
              It's the detail that makes this read as a ballpark rather than a
              scatter plot, and it also gives a free visual answer to "how close
              was that to going out". */}
          <path
            d={`${wedge(-45, 45, wallAt)} ${wedge(-45, 45, (a) => wallAt(a) - 18)}`}
            fillRule="evenodd"
            fill="rgba(253,183,90,0.13)"
          />

          {/* PARK OVERLAY: the selected park's fence, drawn as an outline
              only (no fill — his real wall above already owns the surface)
              so the two can be compared directly. Dashed and a cool colour
              on purpose: everything else on this field is warm orange, so
              a second solid orange line would just look like a rendering
              glitch rather than a second, different wall. */}
          {wallAtTest && (
            <path
              d={wedge(-45, 45, wallAtTest)}
              fill="none"
              stroke="#5fb8ff"
              strokeWidth="1.6"
              strokeDasharray="5 4"
              strokeLinejoin="round"
              opacity="0.9"
            />
          )}

          {/* Foul poles. Two short bright uprights where the lines meet the
              wall — small, but it's the thing that makes the corners read as
              corners. */}
          {[-45, 45].map((a) => {
            const [px, py] = pt(wallAt(a), a)
            return (
              <line key={`fp${a}`} x1={px} y1={py} x2={px} y2={py - 11}
                stroke="#fdb75a" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
            )
          })}

          {/* Infield: bases and the mound, for scale. Without them the plot has
              no reference for how far in "shallow" actually is. */}
          <path
            d={`M ${pt(0, 0)[0]} ${pt(0, 0)[1]} L ${pt(127, -45)[0]} ${pt(127, -45)[1]} L ${pt(180, 0)[0]} ${pt(180, 0)[1]} L ${pt(127, 45)[0]} ${pt(127, 45)[1]} Z`}
            fill="rgba(249,115,22,0.10)" stroke="#a4520d" strokeWidth="0.9"
          />
          <circle cx={pt(60.5, 0)[0]} cy={pt(60.5, 0)[1]} r="4" fill="none" stroke="#a4520d" strokeWidth="0.9" />

          {/* distance arcs instead of grass */}
          {[150, 250, 350, 450].map((d) => {
            const [lx, ly] = pt(d, -EDGE)
            const [rx, ry] = pt(d, EDGE)
            return (
              <g key={d}>
                <path
                  d={`M ${lx} ${ly} A ${d * scale} ${d * scale} 0 0 1 ${rx} ${ry}`}
                  fill="none" stroke="rgba(249,115,22,0.22)" strokeWidth="1"
                />
                <text x={cx} y={pt(d, 0)[1] + 9} fill="#b0793c" fontSize="7.5"
                  fontFamily={NUM_FONT} textAnchor="middle">{d}</text>
              </g>
            )
          })}
          {/* foul lines */}
          {[-45, 45].map((a) => {
            const [x, y] = pt(R, a)
            return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke="#f97316" strokeWidth="1.2" opacity="0.65" />
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
            // Colour = what happened. Size = how far. Shape = which pitch.
            const col = resultColor(h)
            const on = hover === i
            const foul = Math.abs(h.ang) > 45
            const rr = h.hr ? 5.2 : h.xbh ? 4.4 : h.hit ? 3.8 : 3.2
            // HOVER WAS GLITCHY BECAUSE THE HIT AREA WAS THE DOT.
            //
            // The mouse handler sat on the <g>, so the only thing you could
            // hover was the shape itself — 2.5px of radius for an out, and for
            // a hollow marker only the 1.3px stroke, since fill:none isn't
            // hoverable. The readout flickered on and off as the cursor
            // crossed a couple of pixels. Each ball now gets an invisible 9px
            // hit circle, and the visible marker is pointer-events:none so it
            // can't steal or block the event.
            return (
              <g key={i}>
                <g style={{ pointerEvents: 'none' }}>
                  <Marker
                    shape={shapeFor(h.pitch)}
                    x={x} y={y}
                    r={rr}
                    fill={col}
                    stroke={foul ? col : '#0a0806'}
                    sw={0.9}
                    opacity={on ? 1 : foul ? 0.45 : 0.95}
                    dashed={false}
                  />
                  {/* Ring = barrel. Squared up, whatever the outcome was. */}
                  {h.barrel && <circle cx={x} cy={y} r={rr + 3.6} fill="none" stroke={col} strokeWidth="1.1" opacity={on ? 1 : 0.75} />}
                  {/* PARK OVERLAY flip rings — same blue as the test wall so
                      the two read as one system. A real HR that would NOT
                      clear the selected park gets a dashed downgrade ring; a
                      ball that did NOT clear his own wall but WOULD clear
                      this one gets a solid gold upgrade ring. Never both —
                      h.hr and !h.hr are mutually exclusive. */}
                  {clearsTest && h.hr && !clearsTest(h) && (
                    <circle cx={x} cy={y} r={rr + 3.6} fill="none" stroke="#5fb8ff" strokeWidth="1.3" strokeDasharray="2 2" opacity={on ? 1 : 0.85} />
                  )}
                  {clearsTest && !h.hr && clearsTest(h) && (
                    <circle cx={x} cy={y} r={rr + 3.6} fill="none" stroke="#ffd23f" strokeWidth="1.6" opacity={on ? 1 : 0.9} />
                  )}
                  {/* fixed white hover ring — see the geometry-colours note above; must stay a literal, not C.text */}
                  {on && <circle cx={x} cy={y} r="12" fill="none" stroke="#fff" strokeWidth="1.1" opacity="0.9" />}
                </g>
                <circle
                  cx={x} cy={y} r="9"
                  fill="transparent"
                  onMouseEnter={() => { setHover(i); setHoverNonce((v) => v + 1) }}
                  onMouseLeave={() => setHover((v) => (v === i ? null : v))}
                  /* tap-to-toggle: `on` is this dot's hover-state from the last
                     completed render — a touch tap fires a synthetic mouseenter
                     immediately before click, both landing in the same React
                     batch, so reading `on` here (rather than a functional
                     setState toggle, which would see its own mouseenter update
                     and cancel out) is what makes tap-1 open, tap-2-same-dot
                     close, and tap-a-different-dot switch directly. Same fix as
                     ZoneMap.js's Phase 6 pass. */
                  onClick={() => setHover(on ? null : i)}
                  style={{ cursor: 'crosshair' }}
                />
              </g>
            )
          })}

          {/* 🎞 THE HOVER FLIGHT (2026-08-29). Donovan: "i want to see
              trajectory for single event like a moving thing when i hover
              over it." The chart is top-down, so there's no literal height
              axis to animate along — the ball travels the same straight
              home-plate-to-landing line the static dot already sits on. What
              sells the arc on a flat plane is everything ELSE changing along
              the way: it grows and brightens rising to apex, then shrinks and
              fades coming back down, timed to the REAL solved trajectory
              (lib/trajectory.js — same physics fit the park-overlay math
              uses, not a fake ease curve) rather than a constant-speed dot,
              so a towering fly ball visibly hangs near the top the way it did
              in the air, and a screaming liner just streaks across.
              `key` includes hoverNonce so re-hovering the SAME ball restarts
              it from home plate instead of continuing wherever it left off or
              silently not playing a second time. */}
          {hover != null && shown[hover] && (() => {
            const h = shown[hover]
            const flight = flightFor(h)
            if (!flight) return null // grounder/chopper: solveFlight declines rather than fake an arc
            const ang = Math.max(-EDGE, Math.min(EDGE, h.ang))
            const [tx, ty] = pt(Math.min(h.r, R), ang)
            const frames = flight.timeFrames(20)
            // Real hang time, clamped to stay watchable — a 0.3s squibber and
            // an 8s moonshot both need to actually be SEEN, not just be honest.
            const dur = Math.max(0.9, Math.min(3.2, flight.hangS))
            const BASE_R = 3.4, APEX_BUMP = 3.2
            const rValues = frames.map((f) => (BASE_R + f.heightFrac * APEX_BUMP).toFixed(2)).join(';')
            const opValues = frames.map((f) => (0.55 + f.heightFrac * 0.45).toFixed(2)).join(';')
            const keyTimes = frames.map((f) => f.t.toFixed(4)).join(';')
            const keyPoints = frames.map((f) => Math.min(1, f.distFrac).toFixed(4)).join(';')
            return (
              <g key={`flight-${hover}-${hoverNonce}`} style={{ pointerEvents: 'none' }}>
                <line x1={cx} y1={cy} x2={tx} y2={ty} stroke="#fff" strokeWidth="0.7" strokeDasharray="1.5 2.5" opacity="0.35" />
                <circle r={BASE_R} fill="#fff" stroke="#0a0806" strokeWidth="0.8">
                  <animateMotion
                    dur={`${dur}s`} fill="freeze" calcMode="linear"
                    keyPoints={keyPoints} keyTimes={keyTimes}
                    path={`M${cx},${cy} L${tx},${ty}`}
                  />
                  <animate attributeName="r" dur={`${dur}s`} fill="freeze" calcMode="linear" values={rValues} keyTimes={keyTimes} />
                  <animate attributeName="opacity" dur={`${dur}s`} fill="freeze" calcMode="linear" values={opValues} keyTimes={keyTimes} />
                </circle>
              </g>
            )
          })()}

          {/* TONIGHT'S BALLS — same field, same colour language, drawn last so
              they sit on top of the season sample. The white ring is the only
              thing that separates them; the current hitter's stay solid and
              the rest of the game's are dimmed. */}
          {liveDrawn.map((b, i) => {
            const ang = Math.max(-EDGE, Math.min(EDGE, b.ang))
            const [x, y] = pt(Math.min(b.r, R), ang)
            const col = liveColor(b)
            const focus = !anyFocus || Number(b.batterId) === fid
            const on = hoverLive === i
            const rr = b.hr ? 5.6 : 4.2
            return (
              <g key={`live-${i}`}>
                <g style={{ pointerEvents: 'none' }} opacity={focus ? 1 : 0.28}>
                  {/* fixed near-white ring — coincidentally equals ember's C.text but must NOT read C.text (near-black in light theme); see the geometry-colours note above */}
                  <circle cx={x} cy={y} r={rr} fill={col} stroke="#f4f4f5" strokeWidth={focus ? 1.3 : 0.8} />
                  {b.hr && <circle cx={x} cy={y} r={rr + 3.4} fill="none" stroke={col} strokeWidth="1.1" opacity="0.85" />}
                  {/* fixed white hover ring — same as the season dots above, must stay a literal */}
                  {on && <circle cx={x} cy={y} r="12" fill="none" stroke="#fff" strokeWidth="1.1" opacity="0.9" />}
                </g>
                <circle
                  cx={x} cy={y} r="9" fill="transparent"
                  onMouseEnter={() => setHoverLive(i)}
                  onMouseLeave={() => setHoverLive((v) => (v === i ? null : v))}
                  /* tap-to-toggle, same fix as the season dots above */
                  onClick={() => setHoverLive(on ? null : i)}
                  style={{ cursor: 'crosshair' }}
                />
              </g>
            )
          })}
          {/* tonight's homers wear their distance — the one number you'd quote */}
          {liveDrawn.map((b, i) => {
            if (!b.hr) return null
            const ang = Math.max(-EDGE, Math.min(EDGE, b.ang))
            const [x, y] = pt(Math.min(b.r, R), ang)
            return (
              <text key={`livehr-${i}`} x={x} y={y - 9} fill={RESULT_COLORS.home_run} fontSize="8.5"
                fontWeight="800" fontFamily={NUM_FONT} textAnchor="middle"
                stroke="#0a0806" strokeWidth="2" paintOrder="stroke">
                {b.dist ? `${Number(b.dist).toFixed(0)} ft` : 'HR'}
              </text>
            )
          })}

          {/* Wall distances at the three points people actually quote. */}
          {[[-45, dims[0]], [0, dims[2]], [45, dims[4]]].map(([a, d]) => {
            const [x, y] = pt(d + 26, a)
            return (
              <text key={a} x={x} y={y} fill="#fdb75a" fontSize="8" fontFamily={NUM_FONT}
                fontWeight="700" textAnchor="middle">{Math.round(d)}</text>
            )
          })}
          <circle cx={cx} cy={cy} r="3.2" fill="none" stroke="#fdb75a" strokeWidth="1.2" />

          {/* Wind arrow, bottom-left, pointing the way the ball gets carried.
              Motion alone is easy to miss on a still screenshot, so the arrow
              and the mph are drawn too. */}
          {hasWind && (() => {
            const ax = 34, ay = H - 30
            const rad = (windTo * Math.PI) / 180
            const vx = Math.sin(rad), vy = -Math.cos(rad)
            const L = 17
            const hx = ax + vx * L, hy = ay + vy * L
            const back = (deg) => {
              const r2 = rad + (deg * Math.PI) / 180
              return [hx - Math.sin(r2) * 6, hy + Math.cos(r2) * 6]
            }
            const [b1x, b1y] = back(28)
            const [b2x, b2y] = back(-28)
            return (
              <g>
                <line x1={ax - vx * L} y1={ay - vy * L} x2={hx} y2={hy}
                  stroke={windCol} strokeWidth="2" strokeLinecap="round" />
                <polygon points={`${hx},${hy} ${b1x},${b1y} ${b2x},${b2y}`} fill={windCol} />
                <text x={ax - 20} y={ay + 26} fill={windCol} fontSize="8.5"
                  fontFamily={NUM_FONT} fontWeight="800">{windMph.toFixed(1)} MPH</text>
                <text x={ax - 20} y={ay + 36} fill={C.text3} fontSize="7.5" fontFamily={NUM_FONT}>
                  {windLabel}
                </text>
              </g>
            )
          })()}

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

        {/* Fixed height so the panel doesn't jump every time the readout
            appears and disappears — the layout shift was half of what made
            hovering feel broken. */}
        <div style={{ flex: 1, minWidth: 160, minHeight: 54 }}>
          {hoverLive != null && liveDrawn[hoverLive] ? (
            <div style={{ fontFamily: NUM_FONT, fontSize: 10.5, lineHeight: 1.7 }}>
              <div style={{ color: C.green, fontSize: 8, fontWeight: 900, letterSpacing: '.09em' }}>● TONIGHT</div>
              <div style={{ color: liveColor(liveDrawn[hoverLive]), fontWeight: 800, fontSize: 11 }}>
                {String(liveDrawn[hoverLive].event || 'in play').replace(/_/g, ' ').toUpperCase()}
              </div>
              <div style={{ color: C.text }}>{clean(liveDrawn[hoverLive].batterName, 'unknown hitter')}</div>
              <div style={{ color: C.text2 }}>
                {liveDrawn[hoverLive].ev != null ? `${Number(liveDrawn[hoverLive].ev).toFixed(1)} mph` : 'EV n/a'}
                {liveDrawn[hoverLive].la != null ? ` · ${Number(liveDrawn[hoverLive].la).toFixed(0)}°` : ''}
                {liveDrawn[hoverLive].dist ? ` · ${Number(liveDrawn[hoverLive].dist).toFixed(0)} ft` : ''}
              </div>
              <div style={{ color: C.text3 }}>
                {String(liveDrawn[hoverLive].traj || '').replace(/_/g, ' ') || 'trajectory n/a'}
                {liveDrawn[hoverLive].pitcherName ? ` · off ${liveDrawn[hoverLive].pitcherName}` : ''}
                {liveDrawn[hoverLive].inning != null ? ` · ${String(liveDrawn[hoverLive].half || '').slice(0, 3)}${liveDrawn[hoverLive].inning}` : ''}
              </div>
            </div>
          ) : hover != null && shown[hover] ? (
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
              {clearsTest && (() => {
                const h = shown[hover]
                const wd = wallAtTest(h.ang)
                const wh = wallHeightAtTest(h.ang)
                const cleared = clearsTest(h)
                const reached = h.r > wd
                const f = reached ? flightFor(h) : null
                const ht = f ? f.heightAt(wd) : null
                return (
                  <div style={{ color: cleared ? C.orange : C.text3, marginTop: 2 }}>
                    At {testPark}: {cleared ? 'clears the wall' : reached ? 'off the wall' : 'short of the wall'}
                    {' · '}{wd.toFixed(0)} ft out, {wh.toFixed(0)} ft tall
                    {ht != null ? ` · ball at ${ht.toFixed(0)} ft` : ''}
                    {h.hr && !cleared ? ' (was a HR at his own park)' : ''}
                  </div>
                )
              })()}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6 }}>
              {liveOnly ? <>
                Hover or tap a ball for the hitter, exit velo and result.
                {' '}Showing <b style={{ color: C.text2 }}>{liveN}</b> ball{liveN === 1 ? '' : 's'} in play
                from this game — nothing from any other night.
              </> : <>
                Hover or tap a ball for pitch, exit velo and carry.
                {' '}Showing <b style={{ color: C.text2 }}>{shown.length}</b> of {hits.length} batted balls.
              </>}
            </div>
          )}

          {/* Lane shares are a SEASON read — five bars off tonight's three
              batted balls would be a shape drawn from nothing. Hidden here. */}
          {!liveOnly && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {laneCounts.map((l) => {
              const pctv = hits.length ? (100 * l.n) / hits.length : 0
              const bg = chipColor(pctv, 0, 45)
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
          )}
          {/* CLEANLINESS PASS (2026-08-06): three paragraphs of methodology
              sat permanently beside the chart — honest, but a wall. What
              stays visible is what you need EVERY time: the colour key, the
              wind one-liner, and the small-sample warning. The provenance
              essays (lane cuts, park-relative wind, dims verification,
              fielded-vs-carry) moved behind "How to read this". */}
          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8, lineHeight: 1.6 }}>
            <b style={{ color: RESULT_COLORS.home_run }}>red</b> HR ·{' '}
            <b style={{ color: catColor('result', 'triple') }}>purple</b> 3B ·{' '}
            <b style={{ color: RESULT_COLORS.double }}>green</b> 2B ·{' '}
            <b style={{ color: catColor('result', 'single') }}>blue</b> 1B · dark = out ·{' '}
            <b style={{ color: C.text2 }}>ring = barrel</b> · shape = pitch · size = distance
          </div>

          {/* TONIGHT — the live layer explains itself in the same footer type
              as everything else, and says out loud what it is. */}
          {liveN > 0 && (
            <div style={{ fontSize: 9.5, color: C.text3, marginTop: 5, lineHeight: 1.6 }}>
              <b style={{ color: C.green }}>● Tonight:</b>{' '}
              {liveOnly || liveOn ? <>
                {liveN} tracked ball{liveN === 1 ? '' : 's'} in play from the live feed
                {liveOnly
                  ? ', and nothing else — this chart carries no season sample. The wall is this park’s real dimensions and the arcs are fixed feet, so a dot’s position is where the ball was actually fielded'
                  : ', ringed in white on the same field'}.
                {' '}Colour = result — red = homer, green = double, blue = single, dark = out.
                {anyFocus
                  ? <> <b style={{ color: C.text2 }}>{clean(liveLabel, 'the current hitter')}</b>&apos;s stay solid; the rest of
                    the game&apos;s are dimmed.</>
                  : ' Every hitter in the game is shown.'}
                {' '}Homers carry their distance. Hover any ringed dot for the hitter, exit velo and result.
              </> : <>hidden — tap the ● Tonight chip to bring the live balls back.</>}
              {(liveOnly || liveOn) && (() => {
                const hardestLive = liveHits.filter((b) => b.ev != null).sort((a, b) => b.ev - a.ev)[0]
                const farLive = liveHits.filter((b) => b.dist).sort((a, b) => b.dist - a.dist)[0]
                if (!hardestLive && !farLive) return null
                return (
                  <div style={{ marginTop: 3, fontFamily: NUM_FONT, color: C.text2 }}>
                    {hardestLive && <>
                      <b style={{ color: RESULT_COLORS.home_run }}>Hardest:</b>{' '}
                      {clean(hardestLive.batterName, '?')} <b style={{ color: C.text }}>{Number(hardestLive.ev).toFixed(1)}</b> mph
                      {' · '}{String(hardestLive.event || 'in play').replace(/_/g, ' ')}
                    </>}
                    {farLive && (!hardestLive || farLive !== hardestLive) && <>
                      {hardestLive ? ' · ' : ''}
                      <b style={{ color: C.orange }}>Farthest:</b>{' '}
                      {clean(farLive.batterName, '?')} <b style={{ color: C.text }}>{Number(farLive.dist).toFixed(0)}</b> ft
                    </>}
                  </div>
                )
              })()}
            </div>
          )}
          {hasWind && (
            <div style={{ fontSize: 9.5, marginTop: 4, color: C.text3 }}>
              <b style={{ color: windCol }}>Wind {windMph.toFixed(1)} mph {windLabel}</b>
              {windOut ? ' — helping carry' : windIn ? ' — hurting carry' : ' — pushing sideways'}
            </div>
          )}
          {hits.length > 0 && hits.length < 25 && (
            <div style={{ fontSize: 9.5, marginTop: 4, color: C.orange }}>
              Only {hits.length} tracked batted balls — too few to read a spray tendency off.
            </div>
          )}

          <button onClick={() => setShowHelp((v) => !v)} style={{
            marginTop: 7, fontSize: 9.5, fontWeight: 700, color: C.text3, cursor: 'pointer',
            background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 6,
            padding: '3px 9px', fontFamily: NUM_FONT,
          }}>{showHelp ? 'hide the fine print ▾' : 'how to read this ▸'}</button>

          {showHelp && (
            <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
              {/* the lane cuts are still DRAWN in liveOnly (they're geometry),
                  but their counts aren't, so the counts paragraph is dropped */}
              {!liveOnly && (
              <div style={{ marginBottom: 5 }}>
                Lanes are the bot&apos;s own <code>lane</code> field, so the counts match the rest of
                the site. Read the labels loosely: the bot cuts lanes as vertical bands centred
                about 30 ft right of home plate, so its <b style={{ color: C.text2 }}>CF</b> runs from
                just left of straightaway centre out to right-centre, and <b style={{ color: C.text2 }}>LF</b>{' '}
                covers everything past 88 ft to the pull side of a righty. The dashed lines show
                where those cuts really fall; the solid line is true centre.
              </div>
              )}
              {hasWind && (
                <div style={{ marginBottom: 5 }}>
                  Wind direction is <b style={{ color: C.text2 }}>park-relative, not a compass bearing</b>:
                  the feed gives a compass degree, but each park faces a different way and that
                  orientation isn&apos;t published, so the arrow shows out / in / across from the bot&apos;s
                  own label rather than inventing a heading. A crosswind isn&apos;t told left or right
                  either, so it&apos;s drawn on the axis without picking a side.
                </div>
              )}
              <div>
                <b style={{ color: C.text2 }}>{knownPark ? venue : 'Generic park'}</b>
                {knownPark
                  ? `${dimSource === 'table'
                      ? ' — wall drawn from the curated dimensions table (the bot publishes dims too, but they were verified wrong at the corners — Camden 384 where the line is 333, Daikin missing the Crawford Boxes — so the table wins)'
                      : ' — wall from the bot’s published dims; this venue isn’t in the curated table, so treat the corners as approximate'}.`
                  : ' — no dimensions on file for this venue, so a standard outline is drawn.'}
                {' '}Position is where the ball was fielded, not how far it carried — a 30 ft
                chopper that a shortstop takes at 130 ft belongs at 130 ft; carry is in the hover.
                Outs are near-black on purpose — they&apos;re 62% of every hitter&apos;s contact, and a
                chart that shouts the common case is a chart you can&apos;t read. EV is in the hover
                rather than the colour, and the field is a fixed 450 ft for every hitter so two
                players stay directly comparable.
                {foulCount > 0 && (
                  <> {foulCount} of these {hits.length} landed in foul ground; they&apos;re drawn
                  dashed, outside the lines, rather than hidden.</>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
