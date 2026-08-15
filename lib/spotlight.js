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

const DEFAULT = { on: true, lights: [] }

const HEX = /^#[0-9a-fA-F]{6}$/
export const spotColor = (c) => (HEX.test(String(c || '')) ? c : SPOT_COLORS[0])

export function readSpot() {
  try {
    const v2 = JSON.parse(localStorage.getItem(KEY_V2) || 'null')
    if (v2 && Array.isArray(v2.lights)) return { ...DEFAULT, ...v2 }
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

/** Does this row light THIS light? */
export function lightMatch(light, p) {
  if (!light?.on || !light.rules?.length || !p) return false
  return light.mode === 'any'
    ? light.rules.some((r) => ruleHit(r, p))
    : light.rules.every((r) => ruleHit(r, p))
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
