// ─────────────────────────────────────────────────────────────────────────
// Additions for lib/scoring.js
//
// Paste these functions into your existing lib/scoring.js. They don't
// replace anything — they add new helpers used by PlayerCard + PlayerModal.
//
// Make sure these are EXPORTED so the components can import them.
// ─────────────────────────────────────────────────────────────────────────

import { n } from './player'

// State colors — used by glow, dot, and state word
export const STATE_STYLE = {
  heat_check: {
    label: 'Heat Check',
    color: '#EF4444',       // red 500
    textColor: '#FCA5A5',   // red 300 (better on dark bg)
    glow: 'rgba(239,68,68,0.35)',
    ring: 'rgba(239,68,68,0.18)',
    dotShadow: '0 0 8px rgba(239,68,68,0.6)',
  },
  hot: {
    label: 'Hot',
    color: '#F59E0B',       // amber 500
    textColor: '#FCD34D',   // amber 300
    glow: 'rgba(245,158,11,0.25)',
    ring: 'rgba(245,158,11,0.13)',
    dotShadow: '0 0 6px rgba(245,158,11,0.5)',
  },
  due: {
    label: 'Due',
    color: '#8B5CF6',       // violet 500
    textColor: '#C4B5FD',   // violet 300
    glow: 'rgba(139,92,246,0.30)',
    ring: 'rgba(139,92,246,0.14)',
    dotShadow: '0 0 6px rgba(139,92,246,0.55)',
  },
  cold: {
    label: 'Cold',
    color: '#60A5FA',       // blue 400 (cool, dimmed)
    textColor: 'rgba(147,197,253,0.75)',
    glow: 'rgba(0,0,0,0)',  // no glow — cold is the absence
    ring: 'rgba(0,0,0,0)',
    dotShadow: 'none',
  },
  neutral: {
    label: '',
    color: 'rgba(255,255,255,0.18)',
    textColor: 'rgba(255,255,255,0.4)',
    glow: 'rgba(0,0,0,0)',
    ring: 'rgba(0,0,0,0)',
    dotShadow: 'none',
  },
}

// ─── playerState ─────────────────────────────────────────────────────────
// Returns one of: 'heat_check' | 'hot' | 'due' | 'cold' | 'neutral'
//
// Logic:
//   HEAT CHECK = HR in last 2-4 games (very recent)
//   HOT        = HR in L5 or L7, OR rising quality (L5 barrel/xwoba > L10)
//   DUE        = games_since_last_hr >= (1 / hr_per_pa * ~3.5) AND season_pa >= 100
//                (i.e., past 1.5× expected pace for a regular)
//   COLD       = 10g without HR AND no XBH AND ≤6 hits (true cold)
//   NEUTRAL    = none of the above
//
// Priority: heat_check > hot > due > cold > neutral
export function playerState(p) {
  if (!p) return 'neutral'

  const l5_hr = n(p.last5_hr, 0)
  const l5_hits = n(p.last5_hits, 0)
  const l5_xbh = n(p.last5_xbh, 0)
  const l7_hr = n(p.last7_hr, 0)
  const l7_xbh = n(p.last7_xbh, 0)
  const l7_hits = n(p.last7_hits, 0)
  const l10_hr = n(p.last10_hr, 0)
  const l10_xbh = n(p.last10_xbh, 0)
  const l10_hits = n(p.last10_hits, 0)

  const l5_barrel = n(p.l5_barrel_rate, 0)
  const l10_barrel = n(p.l10_barrel_rate, 0)
  const l5_xwoba = n(p.l5_xwoba, 0)
  const l10_xwoba = n(p.l10_xwoba, 0)

  // HEAT CHECK — HR in last 2-4 games
  // Approximation: 2+ HRs in L5 OR (1 HR in L5 AND 2+ XBH in L5)
  if (l5_hr >= 2 || (l5_hr >= 1 && l5_xbh >= 2)) return 'heat_check'

  // HOT — recent HR or rising quality
  const qualityRising =
    (l5_barrel - l10_barrel) >= 0.04 ||
    (l5_xwoba - l10_xwoba) >= 0.030
  const recentHR = l5_hr >= 1 || l7_hr >= 1 || l10_hr >= 2 || l7_xbh >= 3 || l10_xbh >= 4
  if (recentHR || qualityRising) return 'hot'

  // DUE — past expected pace
  const season_pa = n(p.season_pa, 0) || n(p.pa, 0)
  const season_hr = n(p.season_hr, 0)
  if (season_pa >= 100 && season_hr >= 5) {
    const hr_per_pa = season_hr / season_pa
    const expectedGap = Math.round(1 / hr_per_pa / 4) // ~PA per game ÷ HR per PA
    const games_since_hr = n(p.games_since_last_hr, null)
    if (games_since_hr != null && games_since_hr >= Math.max(8, Math.round(expectedGap * 1.5))) {
      return 'due'
    }
    // Fallback: no games_since_hr field — infer from L10/L7 with no HR
    if (games_since_hr == null && l10_hr === 0 && l10_xbh >= 2 && hr_per_pa >= 0.030) {
      return 'due'
    }
  }

  // COLD — 10g no HR, no XBH, ≤6 hits
  if (l10_hr === 0 && l10_xbh <= 1 && l10_hits <= 6 && season_pa >= 50) return 'cold'

  return 'neutral'
}

// Short tagline for the state row — e.g. "HR in last 2 games", "9g since HR · 1.5× pace"
export function playerStateNote(p, state) {
  if (!p || !state || state === 'neutral') return ''
  const l5_hr = n(p.last5_hr, 0)
  const l7_hr = n(p.last7_hr, 0)
  const l10_hr = n(p.last10_hr, 0)
  const l10_hits = n(p.last10_hits, 0)
  const l10_xbh = n(p.last10_xbh, 0)
  const games_since_hr = n(p.games_since_last_hr, null)

  if (state === 'heat_check') {
    if (l5_hr >= 2) return `${l5_hr} HR in last 5`
    return 'HR + multi XBH (L5)'
  }
  if (state === 'hot') {
    if (l5_hr >= 1) return `1 HR · ${n(p.last5_hits, 0)}H (L5)`
    if (l7_hr >= 1) return `${l7_hr} HR (L7)`
    if (l10_hr >= 2) return `${l10_hr} HR (L10)`
    return 'rising quality'
  }
  if (state === 'due') {
    const season_pa = n(p.season_pa, 0) || n(p.pa, 0)
    const season_hr = n(p.season_hr, 0)
    const hr_per_pa = season_hr / Math.max(1, season_pa)
    const expectedGap = Math.round(1 / Math.max(0.001, hr_per_pa) / 4)
    const g = games_since_hr != null ? games_since_hr : 10
    const pace = expectedGap > 0 ? (g / expectedGap).toFixed(1) : '—'
    return `${g}g since HR · ${pace}× pace`
  }
  if (state === 'cold') {
    return `${l10_hits}H · ${l10_xbh}XBH in L10`
  }
  return ''
}

// ─── pitcherWeaknessProfile ──────────────────────────────────────────────
// Reads the pitcher fields on the hitter record and returns the pitcher's
// dominant weakness profile, or null if no clear weakness.
//
// Returns: { tag: string, vsSide: 'L'|'R'|'both', requires: { ... } }
// or null.
export function pitcherWeaknessProfile(p) {
  if (!p) return null

  const meatball = n(p.pitcher_meatball_pct, 0)
  const pullairAllowed = n(p.pitcher_pullair_allowed_pct, 0)
  const hr9 = n(p.pitcher_hr9, 0)
  const fps = n(p.pitcher_first_pitch_strike_pct, 0.60)
  const arsenal = Array.isArray(p.pitcher_pitch_arsenal_detail) ? p.pitcher_pitch_arsenal_detail : []

  // Find the worst pitch by HH allowed (must have ≥10 BBE)
  let worstPitch = null
  let worstHH = 0
  arsenal.forEach((row) => {
    const bbe = n(row?.bbe_allowed, 0)
    const hh = n(row?.hard_hit_rate_allowed, 0)
    const usage = n(row?.usage_pct, 0)
    if (bbe >= 10 && hh > worstHH && usage >= 8) {
      worstHH = hh
      worstPitch = row?.pitch_type || row?.pitch_code
    }
  })

  // BLOWUP INCOMING — strong stacked negative signals
  if (meatball >= 0.085 && pullairAllowed >= 0.255 && hr9 >= 1.40) {
    return { tag: 'pitcher: blowup risk', vsSide: 'both', strength: 'high' }
  }

  // PITCH-SPECIFIC weakness
  if (worstPitch && worstHH >= 0.42) {
    return { tag: `pitcher: weak vs ${worstPitch} contact`, vsSide: 'both', strength: 'med', pitch: worstPitch, hh: worstHH }
  }

  // PULL-AIR PRONE
  if (pullairAllowed >= 0.255) {
    return { tag: 'pitcher: pull-air prone', vsSide: 'both', strength: 'med' }
  }

  // AMBUSH SETUP — pitcher gets behind in counts
  if (fps <= 0.555 && hr9 >= 1.20) {
    return { tag: 'pitcher: ambush setup', vsSide: 'both', strength: 'low' }
  }

  return null
}

// ─── matchesPitcherWeakness ──────────────────────────────────────────────
// Does THIS hitter fit the pitcher's weakness?
// Returns true if the hitter has the profile that exploits the pitcher's gap.
export function matchesPitcherWeakness(p, weakness) {
  if (!p || !weakness) return false

  const air_pull = n(p.air_pull_rate, 0) || n(p.recent_air_pull_rate, 0)
  const barrel = n(p.recent_barrel_rate, 0)
  const ev = n(p.recent_ev, 0) || n(p.avg_ev, 0)
  const fps_swing = n(p.hitter_first_pitch_swing_pct, 0.28)
  const lineup_spot = n(p.lineup_spot, 9)
  const matchFlag = !!p.pitch_type_match_flag
  const matchCode = p.pitch_type_match_code || ''

  if (weakness.tag === 'pitcher: blowup risk') {
    // any decent power bat matches a blowup risk
    return barrel >= 0.07 || ev >= 88.5
  }
  if (weakness.tag.startsWith('pitcher: weak vs')) {
    // hitter matches if they have a pitch-type match on this pitch
    return matchFlag && matchCode === weakness.pitch
  }
  if (weakness.tag === 'pitcher: pull-air prone') {
    return air_pull >= 0.26 || barrel >= 0.08
  }
  if (weakness.tag === 'pitcher: ambush setup') {
    return fps_swing >= 0.30 || lineup_spot <= 5
  }
  return false
}

// Helper: short, friendly weakness display string
export function weaknessLineFor(p) {
  const w = pitcherWeaknessProfile(p)
  if (!w) return ''
  if (!matchesPitcherWeakness(p, w)) return ''
  return 'matches pitcher weakness'
}

// ── STRIKEOUT RISK ───────────────────────────────────────────────────────────
//
// A composite, not a bot field — the payload has no strikeout score, so this is
// built here from four inputs that are all on 268 of 268 slate rows:
//
//   season_k_rate         hitter, 0.000–0.423, median 0.220
//   pitcher_k_rate        arm,    0.000–0.320, median 0.220
//   pitcher_swstr_pct     arm,    0.060–0.160, median 0.112
//   pitcher_putaway_pct   arm,    0.129–0.250, median 0.193
//
// Weighted 40 / 25 / 20 / 15. The hitter's own rate leads because it's the most
// stable of the four across a season; swinging-strike and putaway are the two
// pitcher inputs that actually describe finishing an at-bat rather than
// accumulating counting stats.
//
// IT IS NOT CALIBRATED, AND IT CANNOT BE FROM THIS DATA.
// The graded results carry actual_ab, actual_hits, actual_hr, actual_rbi,
// actual_runs and actual_tb — there is no actual_k anywhere in the archive. So
// unlike the Pools BANDS table, which is observed hit rates over graded days,
// nothing here has been checked against what happened. It's a transparent
// blend of four published rates, and the site says so wherever it's shown.
// If live_results_tracker.py ever writes strikeouts, this becomes auditable.
//
// Direction: HIGH = more likely to strike out = BAD for the hitter. Every board
// that shows it marks the column inverted, so bright still means good for the
// bat, consistent with everything else on the site.

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const norm = (v, lo, hi) => clamp01(((Number(v) || 0) - lo) / (hi - lo))

export function kRiskScore(p) {
  if (!p) return 0
  const batK = norm(p.season_k_rate, 0.12, 0.36)
  const pK = norm(p.pitcher_k_rate, 0.14, 0.30)
  const sw = norm(p.pitcher_swstr_pct, 0.07, 0.15)
  const pa = norm(p.pitcher_putaway_pct, 0.14, 0.24)
  return 100 * (batK * 0.40 + pK * 0.25 + sw * 0.20 + pa * 0.15)
}

// Plain-language band, so the number doesn't have to be interpreted cold.
export function kRiskLabel(v) {
  if (v >= 70) return 'High K'
  if (v >= 50) return 'Elevated'
  if (v >= 30) return 'Average'
  return 'Low K'
}

// ── OVERALL PITCHER SCORE ────────────────────────────────────────────────────
//
// One number for "how attackable is this arm tonight", blended from the five
// pitcher scores the bot publishes plus HR/9. The bot doesn't write an overall,
// and the five it does write are on wildly different scales, which is exactly
// why they're hard to read side by side:
//
//   pitcher_attack_score        0–54   median 19
//   pitcher_weak_side_score     0–90   median 21
//   pitcher_zone_damage_score   0–76   median 28
//   pitcher_spot_damage_score   0–89   median 18   (thin — see below)
//   pitcher_hr9                 0–2.5  median ~1.2
//
// Each is normalised against its own observed range before weighting, so no one
// component dominates just for having a bigger scale.
//
//   HR/9        30%   the most direct signal for a home-run site
//   attack      25%   the bot's own overall read
//   zone dmg    20%   order-thirds damage, pooled and reasonably sturdy
//   weak side   15%   platoon exploitability
//   swstr       10%   SUBTRACTED — bat-missing is the pitcher's defence
//
// SPOT DAMAGE IS DELIBERATELY EXCLUDED. It splits one season nine ways at
// roughly 10–15 plate appearances a slot, and it's already the weakest table in
// the pitcher modal. Folding a number that noisy into a headline score would
// make the headline noisy too. It stays a column you can read on its own.
//
// UNVALIDATED, same as kRiskScore: none of these five inputs appear in the
// graded archive — 0 of 648 graded slots carry any of them — so there is no way
// to check this blend against what actually happened. It's a readable summary
// of the bot's own opinion, not a measured predictor, and the caption says so.
//
// Direction: HIGH = easier to attack = good for the hitter, matching the ramp.

export function pitcherOverall(p) {
  if (!p) return 0
  const hr9 = norm(p.pitcher_hr9, 0.5, 2.0)
  const atk = norm(p.pitcher_attack_score, 0, 45)
  const zone = norm(p.pitcher_zone_damage_score, 0, 70)
  const weak = norm(p.pitcher_weak_side_score, 0, 75)
  const sw = norm(p.pitcher_swstr_pct, 0.07, 0.15)
  const raw = hr9 * 0.30 + atk * 0.25 + zone * 0.20 + weak * 0.15 - sw * 0.10
  return 100 * clamp01(raw / 0.90)
}
