import { n } from './player'
import { hrPerGame } from './odds'

const rate = (value, fallback = NaN) => {
  const valueNumber = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(valueNumber)) return fallback
  return valueNumber > 1 ? valueNumber / 100 : valueNumber
}

const airRate = (p) => {
  const direct = rate(p?.l25pa_air_rate)
  if (Number.isFinite(direct)) return direct
  const parts = [p?.recent_fb_rate, p?.recent_ld_rate, p?.recent_popup_rate].map((v) => rate(v))
  return parts.some(Number.isFinite) ? parts.filter(Number.isFinite).reduce((sum, value) => sum + value, 0) : NaN
}

// Current clean locked slice (218 selected hitter-games, 30 HR): this simple
// two-variable gate separated 17.7% from 8.0% outside the gate. ISO and HRW
// then form nested tracking tiers; they are not calibrated probabilities.
export const HR_OVERLAY_RULES = [
  { key: 'air', label: 'Air% > 50', hit: (p) => airRate(p) > 0.50 },
  { key: 'ev', label: 'Avg EV > 87', hit: (p) => n(p?.recent_ev, 0) > 87 },
]

const shapeRules = [
  { label: 'Barrel ≥ 3.1%', hit: (p) => rate(p?.recent_barrel_rate, 0) >= 0.031 },
  { label: 'Fly-ball ≥ 23.2%', hit: (p) => rate(p?.recent_fb_rate, 0) >= 0.232 },
  { label: 'Avg EV ≥ 89.9', hit: (p) => n(p?.recent_ev, 0) >= 89.9 },
]

export function hrOverlayRead(p) {
  const checks = HR_OVERLAY_RULES.map((rule) => ({ ...rule, on: rule.hit(p) }))
  const locked = p?.hr_overlay && typeof p.hr_overlay === 'object' && p.hr_overlay.version === 'hr_overlay_v2'
    ? p.hr_overlay : null
  const passed = locked ? n(locked.fit_passed, 0) : checks.filter((rule) => rule.on).length
  const probability = hrPerGame(p)
  const validated = passed === checks.length
  const iso = n(p?.season_iso, 0)
  const hrw = n(p?.hrw_score, 0)
  const derivedTier = validated && iso >= 0.230 && hrw >= 60
    ? 'premium_power'
    : validated && iso >= 0.230
      ? 'power_overlay'
      : validated ? 'hr_overlay' : null
  const primaryTier = locked?.primary_tier || derivedTier
  const tierLabel = {
    hr_overlay: 'HR Overlay',
    power_overlay: 'Power Overlay',
    premium_power: 'Premium Power',
  }[primaryTier]
  const color = primaryTier === 'premium_power' ? '#f97316'
    : primaryTier === 'power_overlay' ? '#FCD34D'
      : validated ? '#4ade80' : passed === 1 ? '#38bdf8' : '#71717a'
  const probabilityLabel = Number.isFinite(probability) ? `${probability.toFixed(1)}% HR` : 'HR% —'
  const shapeChecks = shapeRules.map((rule) => ({ ...rule, on: rule.hit(p) }))
  const shapeQualified = locked?.shape_reference?.qualified ?? shapeChecks.every((rule) => rule.on)

  const inputs = locked?.inputs || {}
  const metric = (key, fallback) => {
    const raw = inputs?.[key]
    const value = raw === null || raw === undefined || raw === '' ? NaN : Number(raw)
    return Number.isFinite(value) ? value : fallback
  }
  const supportingSignals = [
    ['HH', metric('recent_hard_hit_rate', rate(p?.recent_hard_hit_rate)), '%'],
    ['PullAir', metric('recent_pull_air_rate', rate(p?.recent_pull_air_rate)), '%'],
    ['AvgDist', metric('recent_avg_distance', Number(p?.recent_avg_distance ?? p?.bbe_profile?.avg_distance)), 'ft'],
    ['SqUp', metric('recent_squared_up_rate', rate(p?.recent_squared_up_rate)), '%'],
    ['Blast', metric('recent_blast_rate', rate(p?.recent_blast_rate)), '%'],
  ].filter(([, value]) => Number.isFinite(value)).map(([label, value, unit]) => (
    `${label} ${unit === '%' ? `${(value * 100).toFixed(0)}%` : `${value.toFixed(0)}${unit}`}`
  ))

  const ruleLine = checks.map((rule) => `${rule.on ? '✓' : '○'} ${rule.label}`).join(' · ')
  const tierEvidence = primaryTier === 'premium_power'
    ? 'Premium tracking reference: 5/20 HR (25.0%); promising, still a small sample.'
    : primaryTier === 'power_overlay'
      ? 'Power tracking reference: 7/33 HR (21.2%); promising, still a small sample.'
      : validated
        ? 'Core clean-slice reference: 23/130 HR (17.7%) versus 8.0% outside the gate.'
        : 'Both core conditions are required for the measured HR Overlay.'
  return {
    probability,
    passed,
    total: checks.length,
    validated,
    color,
    primaryTier,
    tierLabel,
    shapeQualified,
    supportingSignals,
    label: `${tierLabel || `Power ${passed}/${checks.length}`} · ${probabilityLabel}`,
    title: `${ruleLine}. ${tierEvidence}${shapeQualified ? ' Historical 3/3 shape badge also passed.' : ''}${supportingSignals.length ? ` Tracking: ${supportingSignals.join(' · ')}.` : ''}`,
  }
}
