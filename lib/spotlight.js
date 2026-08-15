'use client'
import { useEffect, useState } from 'react'
import { n } from './player'

// ✨ SPOTLIGHT — your criteria, lit up everywhere.
//
// 2026-08-15, Donovan: "add highlight filter where if a player meets a certain
// criteria the user can use a highlight to spot him site wide — this is why we
// need the user to have access to as much data and splits as possible, easy to
// use and access."
//
// One rule set, saved on the device, checked by every surface that renders a
// player row. A FILTER hides what fails; a SPOTLIGHT leaves the page whole and
// makes the matches glow — which is the right tool for "spot him", because the
// non-matches are the context that makes a match mean something.
//
// Rules AND together: "HR score ≥ 80 AND games since HR ≥ 3" is one spotlight.
// Fields are the slate's own published numbers, listed explicitly so the
// picker can never offer a field that isn't there.

const KEY = 'ms_spotlight_v1'

export const SPOT_FIELDS = [
  { key: 'hr_score', label: 'HR score', get: (p) => n(p?.hr_score, NaN) },
  { key: 'hit_score', label: 'Hit score', get: (p) => n(p?.hit_score, NaN) },
  { key: 'hrr_score', label: 'HRR score', get: (p) => n(p?.hrr_score, NaN) },
  { key: 'contact_score', label: 'TB score', get: (p) => n(p?.contact_score, NaN) },
  { key: 'overall_score', label: 'Overall', get: (p) => n(p?.overall_score, NaN) },
  { key: 'games_since_last_hr', label: 'Games since HR', get: (p) => n(p?.games_since_last_hr, NaN) },
  { key: 'recent_barrel_rate', label: 'Recent barrel %', get: (p) => 100 * n(p?.recent_barrel_rate, NaN) },
  { key: 'recent_hard_hit_rate', label: 'Recent hard-hit %', get: (p) => 100 * n(p?.recent_hard_hit_rate, NaN) },
  { key: 'lineup_spot', label: 'Lineup spot', get: (p) => n(p?.lineup_spot, NaN) },
  { key: 'pitcher_hr9', label: 'Arm HR/9', get: (p) => n(p?.pitcher_hr9, NaN) },
  { key: 'season_k_rate', label: 'Season K %', get: (p) => 100 * n(p?.season_k_rate, NaN) },
]

const DEFAULT = { on: false, rules: [] }

export function readSpot() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULT } }
}
export function writeSpot(conf) {
  try { localStorage.setItem(KEY, JSON.stringify(conf)) } catch { /* private mode */ }
  // Same-tab listeners don't get 'storage' events; ping them ourselves.
  try { window.dispatchEvent(new Event('ms-spotlight')) } catch { /* ssr */ }
}

/** Does this slate row meet EVERY rule? False when off or no rules. */
export function spotMatch(conf, p) {
  if (!conf?.on || !conf.rules?.length || !p) return false
  return conf.rules.every((r) => {
    const f = SPOT_FIELDS.find((x) => x.key === r.field)
    if (!f) return false
    const v = f.get(p)
    if (!Number.isFinite(v)) return false
    return r.op === '<=' ? v <= Number(r.val) : v >= Number(r.val)
  })
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
  return { conf, update, match: (p) => spotMatch(conf, p) }
}

// The one look, shared, so a spotlight reads the same on every surface: a
// warm ring, no layout shift, and it never fights the row's own colours.
export const SPOT_RING = {
  boxShadow: '0 0 0 1.5px rgba(252,211,77,.75), 0 0 12px rgba(252,211,77,.28)',
  borderRadius: 8,
}

export function spotText(conf) {
  if (!conf?.rules?.length) return ''
  return conf.rules.map((r) => {
    const f = SPOT_FIELDS.find((x) => x.key === r.field)
    return `${f?.label || r.field} ${r.op} ${r.val}`
  }).join(' · ')
}
