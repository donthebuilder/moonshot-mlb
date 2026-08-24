'use client'
import { useEffect, useState } from 'react'
import { n } from './player'

// ✨ SPOTLIGHT v2 — named highlights, each with its own color.
//
// 2026-08-15, Donovan, with screenshots of the highlight editor he wants the
// feel of: named rule sets ("Pure"), a priority ("1 = top"), a color per
// highlight (presets + a hex box), All-or-Any matching, and rich criteria
// (LD%, GB%, Barrel%, BA, AvgDist, BBE, Air% …) — "those are the type of
// filters i want to use for the highlights."
//
// Same philosophy as v1 (a SPOTLIGHT washes matches and leaves the page
// whole; a filter would hide the context that makes a match mean something),
// now plural: several lights, each a color, ranked by priority so a hitter
// matching two lights wears the more important one. Everything still reads
// off the published slate row — the registry below lists every field the
// picker may offer, grouped, with the unit it expects, so the editor can
// never offer a number that isn't there.
//
// v1 configs (ms_spotlight_v1: one bare rule list) migrate automatically
// into a single gold light named "My spotlight".

const KEY_V2 = 'ms_spotlight_v2'
const KEY_V1 = 'ms_spotlight_v1'

// Site palette presets — first is the default for a new light.
export const SPOT_COLORS = ['#FCD34D', '#4ade80', '#f97316', '#f87171', '#38bdf8', '#c084fc']

const pct = (v) => (Number.isFinite(v) ? 100 * v : NaN)
const bbe = (p, k) => n(p?.bbe_profile?.[k], NaN)
const shape = (p, k) => n(p?.hr_shape_components?.[k], NaN)

// {key, label, group, unit, get} — unit drives the editor's suffix and how a
// saved rule reads back ("Barrel% ≥ 10%", "Avg dist ≥ 280 ft", "BA ≥ .200").
// v1 keys are preserved verbatim so old saved rules keep working.
export const SPOT_FIELDS = [
  // ── bot scores ──
  { key: 'hr_score', label: 'HR score', group: 'Bot scores', unit: '', get: (p) => n(p?.hr_score, NaN) },
  { key: 'hit_score', label: 'Hit score', group: 'Bot scores', unit: '', get: (p) => n(p?.hit_score, NaN) },
  { key: 'hrr_score', label: 'HRR score', group: 'Bot scores', unit: '', get: (p) => n(p?.hrr_score, NaN) },
  { key: 'contact_score', label: 'TB score', group: 'Bot scores', unit: '', get: (p) => n(p?.contact_score, NaN) },
  { key: 'overall_score', label: 'Overall score', group: 'Bot scores', unit: '', get: (p) => n(p?.overall_score, NaN) },
  { key: 'power_score', label: 'Power score', group: 'Bot scores', unit: '', get: (p) => n(p?.batted_ball_power_score, NaN) },
  // ── recent contact (the bot's recent statcast window) ──
  { key: 'recent_barrel_rate', label: 'Barrel %', group: 'Recent contact', unit: '%', get: (p) => pct(n(p?.recent_barrel_rate, NaN)) },
  { key: 'recent_hard_hit_rate', label: 'Hard-hit %', group: 'Recent contact', unit: '%', get: (p) => pct(n(p?.recent_hard_hit_rate, NaN)) },
  { key: 'ld_pct', label: 'LD %', group: 'Recent contact', unit: '%', get: (p) => pct(n(p?.recent_ld_rate, NaN)) },
  { key: 'gb_pct', label: 'GB %', group: 'Recent contact', unit: '%', get: (p) => pct(n(p?.recent_gb_rate, NaN)) },
  { key: 'fb_pct', label: 'FB %', group: 'Recent contact', unit: '%', get: (p) => pct(n(p?.recent_fb_rate, NaN)) },
  { key: 'popup_pct', label: 'Popup %', group: 'Recent contact', unit: '%', get: (p) => pct(n(p?.recent_popup_rate, NaN)) },
  { key: 'air_pct', label: 'Air % (FB+LD)', group: 'Recent contact', unit: '%', get: (p) => pct(n(p?.recent_fb_rate, NaN) + n(p?.recent_ld_rate, NaN)) },
  { key: 'pull_pct', label: 'Pull %', group: 'Recent contact', unit: '%', get: (p) => pct(n(p?.recent_pull_rate, NaN)) },
  { key: 'sweet_pct', label: 'Sweet-spot %', group: 'Recent contact', unit: '%', get: (p) => pct(bbe(p, 'sweet_spot_rate')) },
  { key: 'avg_ev', label: 'Avg EV', group: 'Recent contact', unit: 'mph', get: (p) => n(p?.recent_ev, NaN) },
  { key: 'max_ev', label: 'Max EV', group: 'Recent contact', unit: 'mph', get: (p) => shape(p, 'max_ev') },
  { key: 'avg_dist', label: 'Avg dist', group: 'Recent contact', unit: 'ft', get: (p) => bbe(p, 'avg_distance') },
  { key: 'max_dist', label: 'Max dist', group: 'Recent contact', unit: 'ft', get: (p) => shape(p, 'max_distance') },
  { key: 'bbe_n', label: 'BBE (sample)', group: 'Recent contact', unit: '', get: (p) => bbe(p, 'sample_bbe') },
  // ── season ──
  { key: 'ba', label: 'BA', group: 'Season', unit: 'avg', get: (p) => n(p?.season_avg, NaN) },
  { key: 'iso', label: 'ISO', group: 'Season', unit: 'avg', get: (p) => n(p?.season_iso, NaN) },
  { key: 'slg', label: 'SLG', group: 'Season', unit: 'avg', get: (p) => n(p?.season_slg, NaN) },
  { key: 'babip', label: 'BABIP', group: 'Season', unit: 'avg', get: (p) => n(p?.babip, NaN) },
  { key: 'season_hr', label: 'Season HR', group: 'Season', unit: '', get: (p) => n(p?.season_hr, NaN) },
  { key: 'hr_per_pa', label: 'HR per PA', group: 'Season', unit: '%', get: (p) => pct(n(p?.hr_per_pa, NaN)) },
  { key: 'season_k_rate', label: 'K %', group: 'Season', unit: '%', get: (p) => pct(n(p?.season_k_rate, NaN)) },
  { key: 'bb_pct', label: 'BB %', group: 'Season', unit: '%', get: (p) => pct(n(p?.season_bb_rate, NaN)) },
  { key: 'vs_lhp', label: 'BA vs LHP', group: 'Season', unit: 'avg', get: (p) => n(p?.avg_vs_lhp, NaN) },
  { key: 'vs_rhp', label: 'BA vs RHP', group: 'Season', unit: 'avg', get: (p) => n(p?.avg_vs_rhp, NaN) },
  // ── form ──
  { key: 'last5_hr', label: 'L5 HR', group: 'Form', unit: '', get: (p) => n(p?.last5_hr, NaN) },
  { key: 'last5_hits', label: 'L5 hits', group: 'Form', unit: '', get: (p) => n(p?.last5_hits, NaN) },
  { key: 'last5_xbh', label: 'L5 XBH', group: 'Form', unit: '', get: (p) => n(p?.last5_xbh, NaN) },
  { key: 'games_since_last_hr', label: 'Games since HR', group: 'Form', unit: '', get: (p) => n(p?.games_since_last_hr, NaN) },
  // ── matchup / situation ──
  { key: 'lineup_spot', label: 'Lineup spot', group: 'Matchup', unit: '', get: (p) => n(p?.lineup_spot, NaN) },
  { key: 'pitcher_hr9', label: 'Arm HR/9', group: 'Matchup', unit: '', get: (p) => n(p?.pitcher_hr9, NaN) },
  { key: 'pitcher_whip', label: 'Arm WHIP', group: 'Matchup', unit: '', get: (p) => n(p?.pitcher_whip, NaN) },
  { key: 'pitcher_bb9', label: 'Arm BB/9', group: 'Matchup', unit: '', get: (p) => n(p?.pitcher_bb9, NaN) },
  { key: 'park_hr_factor', label: 'Park HR factor', group: 'Matchup', unit: '', get: (p) => n(p?.park_hr_factor, NaN) },
]

export const SPOT_GROUPS = ['Bot scores', 'Recent contact', 'Season', 'Form', 'Matchup']

// ── "BEST FILTER PER CATEGORY" SEARCH RESULTS (2026-08-24) ────────────────────
//
// Donovan: "make the best filter possibile for each pick catergoy" then
// "yeah do pitcher side data too then add to site" then "add to the site
// highlithg and label all ofthem." These three are the categories whose
// filter held up on nights the search never saw, restricted to fields that
// actually exist in this registry today (recent_barrel_rate / fb_pct /
// avg_ev / sweet_pct) — every threshold below is a real, held-out number,
// not a train-set number being passed off as one:
//
//   HR:      Barrel% >= 3.1, FB% >= 23.2, avg EV >= 89.9
//            base 11.1% -> 16.2% on 44 held-out nights (n=334) = 1.46x
//   HRR 2+:  Barrel% >= 2.5, FB% >= 23.2, avg EV >= 90.3
//            base 44.1% -> 50.0% on held-out nights (n=228) = 1.13x
//   Any hit: Barrel% >= 3.1, Sweet-spot% >= 37.2, avg EV >= 90.3
//            base 59.9% -> 65.6% on held-out nights (n=154) = 1.09x
//
// Built on a homer-free rolling window (each batter's own recent home runs
// excluded from his own trailing stats — otherwise a guy who already
// homered inflates his own "power" reading) and a real chronological
// train/test split. Adding the opposing pitcher's contact-allowed profile
// pushed HR to 1.73x and rescued 2B to 1.48x in research (2B has no working
// filter on batter-side fields alone), but those need pitcher EV-allowed /
// FB%-allowed / HR-rate-allowed and a 350+ rate — none of which this
// registry (or whatever populates `p` today) carries; only `pitcher_hr9`
// does, and it wasn't part of this backtest, so nothing pitcher-side is
// shipped here rather than guessed at. HRR 2+ and any-hit are real but
// modest edges (44%/60% base rates don't leave much room to move) — labeled
// with their own numbers below so nobody mistakes them for HR-strength
// results.
const DEFAULT_LIGHTS = [
  {
    id: 'validated-hr-2026-08-24',
    name: 'HR Filter (validated 1.46x)',
    color: SPOT_COLORS[1],
    priority: 9,
    mode: 'all',
    on: true,
    rules: [
      { field: 'recent_barrel_rate', op: '>=', val: 3.1 },
      { field: 'fb_pct', op: '>=', val: 23.2 },
      { field: 'avg_ev', op: '>=', val: 89.9 },
    ],
  },
  {
    id: 'validated-hrr2plus-2026-08-24',
    name: 'HRR 2+ Filter (validated 1.13x)',
    color: SPOT_COLORS[4],
    priority: 10,
    mode: 'all',
    on: true,
    rules: [
      { field: 'recent_barrel_rate', op: '>=', val: 2.5 },
      { field: 'fb_pct', op: '>=', val: 23.2 },
      { field: 'avg_ev', op: '>=', val: 90.3 },
    ],
  },
  {
    id: 'validated-anyhit-2026-08-24',
    name: 'Any Hit Filter (validated 1.09x)',
    color: SPOT_COLORS[5],
    priority: 11,
    mode: 'all',
    on: true,
    rules: [
      { field: 'recent_barrel_rate', op: '>=', val: 3.1 },
      { field: 'sweet_pct', op: '>=', val: 37.2 },
      { field: 'avg_ev', op: '>=', val: 90.3 },
    ],
  },
]

const DEFAULT = { on: true, lights: DEFAULT_LIGHTS }

const HEX = /^#[0-9a-fA-F]{6}$/
export const spotColor = (c) => (HEX.test(String(c || '')) ? c : SPOT_COLORS[0])

// One-time seed: append any DEFAULT_LIGHTS entry (by id) missing from an
// existing saved config, so an already-populated browser (Donovan's) picks
// up a new validated default the same as a fresh install would, without
// touching or reordering anything he already saved.
const withSeededDefaults = (lights) => {
  const have = new Set((lights || []).map((l) => l.id))
  const missing = DEFAULT_LIGHTS.filter((l) => !have.has(l.id))
  return missing.length ? [...lights, ...missing] : lights
}

export function readSpot() {
  try {
    const v2 = JSON.parse(localStorage.getItem(KEY_V2) || 'null')
    if (v2 && Array.isArray(v2.lights)) {
      const seeded = withSeededDefaults(v2.lights)
      const conf = { ...DEFAULT, ...v2, lights: seeded }
      if (seeded !== v2.lights) { try { localStorage.setItem(KEY_V2, JSON.stringify(conf)) } catch { /* private mode */ } }
      return conf
    }
    // one-time migration: v1's bare rule list becomes one gold light
    const v1 = JSON.parse(localStorage.getItem(KEY_V1) || 'null')
    if (v1 && Array.isArray(v1.rules) && v1.rules.length) {
      const conf = {
        on: v1.on !== false,
        lights: [{ id: 'v1', name: 'My spotlight', color: SPOT_COLORS[0], priority: 1, mode: 'all', on: true, rules: v1.rules }],
      }
      try { localStorage.setItem(KEY_V2, JSON.stringify(conf)) } catch { /* private mode */ }
      return conf
    }
    return { ...DEFAULT }
  } catch { return { ...DEFAULT } }
}

export function writeSpot(conf) {
  try { localStorage.setItem(KEY_V2, JSON.stringify(conf)) } catch { /* private mode */ }
  // Same-tab listeners don't get 'storage' events; ping them ourselves.
  try { window.dispatchEvent(new Event('ms-spotlight')) } catch { /* ssr */ }
}

/** Does this row meet one rule? Missing data NEVER matches — a blank is not a pass. */
const ruleHit = (r, p) => {
  const f = SPOT_FIELDS.find((x) => x.key === r.field)
  if (!f) return false
  const v = f.get(p)
  if (!Number.isFinite(v)) return false
  return r.op === '<=' ? v <= Number(r.val) : v >= Number(r.val)
}

// ── "AT LEAST N OF M" GATING (2026-08-24) ──────────────────────────────────────
//
// Donovan wanted a checklist-style gate ("if X of Y criteria meet") — the
// same shape as the offline "S Tier: any 11 of 12" rule this project already
// backtested (moonshot-highlight-round2.md), which never had a live UI home
// because mode only ever supported All (every rule) or Any (one rule). This
// adds a third mode, 'atLeast', with its own `min` count on the light. All
// and Any still behave exactly as before — `min` is only read when
// mode === 'atLeast'.

/** Does this row light THIS light? */
export function lightMatch(light, p) {
  if (!light?.on || !light.rules?.length || !p) return false
  if (light.mode === 'any') return light.rules.some((r) => ruleHit(r, p))
  if (light.mode === 'atLeast') {
    const need = Math.max(1, Math.min(light.rules.length, Number(light.min) || 1))
    return light.rules.filter((r) => ruleHit(r, p)).length >= need
  }
  return light.rules.every((r) => ruleHit(r, p))
}

/**
 * The winning light for a row, or null. Priority 1 beats 2 beats 3 (the
 * screenshot's own rule: "1 = top"); ties break by list order.
 */
export function spotFor(conf, p) {
  if (!conf?.on || !conf.lights?.length || !p) return null
  const live = conf.lights.filter((l) => l.on && l.rules?.length)
  if (!live.length) return null
  const ranked = [...live].sort((a, b) => (n(a.priority, 99) - n(b.priority, 99)))
  for (const l of ranked) if (lightMatch(l, p)) return l
  return null
}

/** Live spotlight config — re-renders every subscriber when any surface edits it. */
export function useSpotlight() {
  const [conf, setConf] = useState(DEFAULT)
  useEffect(() => {
    setConf(readSpot())
    const onPing = () => setConf(readSpot())
    window.addEventListener('ms-spotlight', onPing)
    window.addEventListener('storage', onPing)
    return () => { window.removeEventListener('ms-spotlight', onPing); window.removeEventListener('storage', onPing) }
  }, [])
  const update = (next) => { writeSpot(next); setConf(next) }
  return { conf, update, firstMatch: (p) => spotFor(conf, p) }
}

/** The row wash, in the light's own color: a left bar plus a faint interior glow. */
export function washOf(color) {
  const c = spotColor(color)
  return { boxShadow: `inset 3px 0 0 ${c}, inset 0 0 18px ${c}1A` }
}

/**
 * ── WHY A ROW WASH WAS INVISIBLE IN EVERY TABLE (2026-08-17) ────────────────
 *
 * Donovan: "i just realized the highlight worked for the cards and not the
 * columns or the spreadsheets excel things charts."
 *
 * washOf() puts an inset box-shadow on the ELEMENT. On a card that is the whole
 * surface, so it shows. On a table row it is painted on the <tr> — and then
 * every single <td> inside sets its own OPAQUE background (`C.bg2` for text
 * cells, `C.bg3` or a ramp colour for numeric ones). A child's opaque
 * background paints over its parent's box-shadow, and the sticky name cell
 * additionally carries `zIndex: 1`, which guarantees it wins. So the highlight
 * was being drawn and then covered up, every time, on every board.
 *
 * That is why "highlights don't work on the boards" survived three separate
 * fixes: the wash was applied correctly at every step, and never once visible.
 *
 * THE FIX IS PER-CELL, because in a table the cell owns the paint.
 *
 * cellTint  — for text cells, whose background is a flat surface colour and can
 *             safely be replaced with a tinted one.
 * cellEdge  — for the row's FIRST cell: the 3px bar, now on the cell that
 *             actually renders it rather than on an ancestor.
 * cellMark  — a glyph, because a heat cell's background is already carrying
 *             meaning (its own value) and must not be recoloured to say
 *             something else. Colour is never the only encoding here, and on a
 *             heat-mapped row it cannot be the encoding at all.
 */
export function cellTint(color) {
  const c = spotColor(color)
  // 26 ≈ 15% alpha: enough to read as lit next to an untinted neighbour, far
  // too little to fight the ramp colours in the same row for attention.
  return { background: `${c}26` }
}

export function cellEdge(color) {
  const c = spotColor(color)
  return { boxShadow: `inset 3px 0 0 ${c}` }
}

/** The glyph a lit row wears next to its name, and its colour. */
export const SPOT_MARK = '◗'

export function cellMark(color) {
  return { color: spotColor(color), fontSize: 9, marginRight: 3, flexShrink: 0 }
}

/** "Barrel% ≥ 10%" — one rule, said back in its own unit. */
export function ruleText(r) {
  const f = SPOT_FIELDS.find((x) => x.key === r.field)
  const unit = f?.unit === 'avg' ? '' : (f?.unit ? ` ${f.unit}` : '')
  const val = f?.unit === 'avg' ? String(r.val).replace(/^0\./, '.') : r.val
  return `${f?.label || r.field} ${r.op === '<=' ? '≤' : '≥'} ${val}${unit === ' %' ? '%' : unit}`
}

export function spotText(conf) {
  const live = (conf?.lights || []).filter((l) => l.on && l.rules?.length)
  if (!live.length) return ''
  return live.map((l) => l.name || 'highlight').join(' · ')
}

/** How many of these rows the light would wash right now — the editor's live preview. */
export function lightCount(light, players) {
  if (!players?.length) return 0
  let k = 0
  for (const p of players) if (lightMatch({ ...light, on: true }, p)) k++
  return k
}

// ── THE HIGHLIGHTS ONLY EVER WASHED ONE SURFACE (2026-08-17) ─────────────────
//
// Donovan, with a screenshot of the Games tab and the Highlights panel open
// beside it reporting 18 matching hitters: "these highlights dont work."
//
// They worked. They just had exactly one consumer. A whole-repo grep for
// firstMatch / washOf found DenseTable.js and nothing else — so a highlight
// washed rows in a dense table and was invisible on every other surface a
// hitter appears on. His screenshot is the Games tab, which renders game CARDS
// with pick chips, not a table, so a rule matching 18 hitters lit up nothing
// at all and the feature read as broken.
//
// That is a design gap, not a bug in the matcher: nothing was ever wired up.
// The fix is a hook cheap enough that any surface can opt in with one line,
// rather than each one re-deriving the config, the priority order and the
// wash. One implementation, every surface — the same reason pickCleared() is
// the only grading bar in the repo.
//
// CHIP AND ROW GET DIFFERENT WASHES ON PURPOSE. washOf() is an inset left bar
// plus an interior glow, which is right for a full-width table row and wrong
// for a 90px chip, where a 3px bar eats a tenth of the element and the glow
// swamps the text. chipWashOf() tints the border and the background instead,
// so the same rule reads as the same colour in both places without either one
// being deformed by a style built for the other.

/**
 * The wash for a small element — a pick chip, a name pill, a card.
 * Border and background rather than an inset bar, so it survives at 90px.
 */
export function chipWashOf(color) {
  const c = spotColor(color)
  return { borderColor: `${c}99`, background: `${c}1f`, boxShadow: `0 0 0 1px ${c}55` }
}

/**
 * One hook, every surface. Returns two ready-made style objects so a caller
 * spreads one and is done:
 *
 *   const { rowSpot, chipSpot } = useSpot()
 *   <tr style={{ ...rowSpot(p) }}>          full-width rows
 *   <span style={{ ...chipSpot(p) }}>       chips, pills, cards
 *
 * Both return {} when nothing matches, so they are always safe to spread.
 * `lightOf` is there for a caller that needs the light itself (to name it in a
 * tooltip, say) rather than only its colour.
 */
export function useSpot() {
  const { conf, firstMatch } = useSpotlight()
  return {
    conf,
    lightOf: firstMatch,
    rowSpot: (p) => { const l = firstMatch(p); return l ? washOf(l.color) : {} },
    chipSpot: (p) => { const l = firstMatch(p); return l ? chipWashOf(l.color) : {} },
    /** "Highlight · HRR score ≥ 50 · TB score ≥ 15" — for a title attribute. */
    spotTitle: (p) => {
      const l = firstMatch(p)
      if (!l) return ''
      const rules = (l.rules || []).map(ruleText).join(l.mode === 'any' ? ' or ' : ' · ')
      const need = l.mode === 'atLeast'
        ? ` (needs ${Math.max(1, Math.min(l.rules.length, Number(l.min) || 1))} of ${l.rules.length})`
        : ''
      return `${l.name || 'Highlight'}${need}${rules ? ` — ${rules}` : ''}`
    },
  }
}
