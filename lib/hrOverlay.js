import { n } from './player'
import { hrPerGame } from './odds'

// The three-variable HR filter that survived a chronological held-out test:
// 11.1% base HR rate -> 16.2% when all three passed (334 hitter-games), 1.46x.
// Partial levels are displayed as FIT progress only. Their HR rates were not
// published by the audit, so 1/3 and 2/3 must never be dressed up as measured
// probabilities.
export const HR_OVERLAY_RULES = [
  { key: 'barrel', label: 'Barrel ≥ 3.1%', hit: (p) => n(p?.recent_barrel_rate, 0) * 100 >= 3.1 },
  { key: 'fly', label: 'Fly-ball ≥ 23.2%', hit: (p) => n(p?.recent_fb_rate, 0) * 100 >= 23.2 },
  { key: 'ev', label: 'Avg EV ≥ 89.9', hit: (p) => n(p?.recent_ev, 0) >= 89.9 },
]

export function hrOverlayRead(p) {
  const checks = HR_OVERLAY_RULES.map((r) => ({ ...r, on: r.hit(p) }))
  const locked = p?.hr_overlay && typeof p.hr_overlay === 'object' ? p.hr_overlay : null
  const passed = locked ? n(locked.fit_passed, 0) : checks.filter((r) => r.on).length
  const probability = hrPerGame(p)
  const validated = passed === checks.length
  const iso = n(p?.season_iso, 0)
  const hrw = n(p?.hrw_score, 0)
  const pitcherHr9 = n(p?.pitcher_hr9, 0)
  const derivedTier = validated && iso >= 0.230 && hrw >= 60 && pitcherHr9 >= 1.40
    ? 'elite_matchup'
    : validated && iso >= 0.230 && hrw >= 60
      ? 'premium_power'
      : validated ? 'verified_shape' : null
  const primaryTier = locked?.primary_tier || derivedTier
  const tierLabel = {
    verified_shape: 'Verified Shape',
    premium_power: 'Premium Power',
    elite_matchup: 'Elite Matchup',
  }[primaryTier]
  const color = primaryTier === 'elite_matchup' ? '#f97316' : primaryTier === 'premium_power' ? '#FCD34D' : validated ? '#4ade80' : passed === 2 ? '#FCD34D' : passed === 1 ? '#f97316' : '#71717a'
  const probabilityLabel = Number.isFinite(probability) ? `${probability.toFixed(1)}% HR` : 'HR% —'
  const ruleLine = checks.map((r) => `${r.on ? '✓' : '○'} ${r.label}`).join(' · ')
  const validation = validated
    ? ' Full gate: 16.2% HR on 334 held-out hitter-games versus 11.1% base (1.46×).'
    : ' Partial gate is fit progress, not a measured hit rate; only 3/3 carries the held-out 16.2% result.'
  return {
    probability,
    passed,
    total: checks.length,
    validated,
    color,
    primaryTier,
    tierLabel,
    label: `${tierLabel ? `${tierLabel} · ` : ''}${probabilityLabel} · ${passed}/${checks.length}`,
    title: `Player HR% is his small-sample-shrunk season game estimate. ${ruleLine}.${validation}${tierLabel ? ` Current tier: ${tierLabel}.` : ''}`,
  }
}
