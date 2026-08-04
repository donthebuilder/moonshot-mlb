// Scoring + role/grade/lane logic. Pure functions of a player object.
import {
  clean, n, nn, pick,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
  ihrVal, avgEV, hardHitRate, barrelRate,
  recent375, recent400, d350Rate, lowSample,
} from './player'
import { isoAdjustedHr, isoTag } from './scoring_additions'

export function roleRaw(p) {
  return clean(p?.pick_role || p?.beginner_label || p?.best_role || p?.role, '')
}

export function explicitTrap(p) {
  const r = roleRaw(p).toLowerCase()
  return p?.trap_flag === true || r.includes('avoid') || r.includes('careful') || r.includes('trap')
}

export function avoidHRCandidate(p) {
  if (explicitTrap(p)) return true
  const hr = hrScore(p)
  const hrr = prodScore(p)
  const hit = hitScore(p)
  const tb = tbScore(p)
  const ihr = ihrVal(p)
  const pmix = pick(p?.pitch_mix_score, p?.pmix_score, p?.pitch_matchup_score, p?.pitch_fit_score, 50)
  const lowLift = ihr > 0 && ihr < 0.08 && recent375(p) === 0 && d350Rate(p) < 0.08
  const betterOther = Math.max(hrr, hit, tb) >= hr + 14 && hr < 55
  const kRisk = n(p?.season_k_rate, 0) >= 0.29 && hr < 60
  const badPitch = pmix > 0 && pmix < 45 && hr < 55
  return lowLift || betterOther || kRisk || badPitch
}

export function compactRole(p) {
  const r = roleRaw(p).toLowerCase()
  // "Avoid HR" CONFUSED PEOPLE, and they were right to be confused: it read
  // as "avoid this player," when most of the time it meant "his case is on a
  // different market." Bellinger-types — elite hit/HRR profiles with modest
  // power — wore a red warning for being good at something else.
  //
  // Two changes (2026-08-04):
  //   1. When a better market clearly exists, the tag now REDIRECTS instead
  //      of warning: he's labelled Hit / HRR / TB, the thing he actually is.
  //   2. Only a hitter with no case anywhere keeps a negative tag, and it's
  //      renamed "Skip HR" — skip him on THIS market, not in general.
  if (avoidHRCandidate(p)) {
    const hrr = prodScore(p), hit = hitScore(p), tb = tbScore(p)
    const best = Math.max(hrr, hit, tb)
    if (best >= hrScore(p) + 14 && best >= 55) {
      return best === hit ? 'Hit' : best === hrr ? 'HRR' : 'TB'
    }
    return 'Skip HR'
  }
  if (p?.hidden_hr_value || p?.hidden_value_flag || r.includes('hidden')) return 'Value HR'
  if (r.includes('strong') || r.includes('hr look')) return 'HR'
  if (r.includes('hrr') || r.includes('production')) return 'HRR'
  if (r.includes('hit')) return 'Hit'
  if (r.includes('contact') || r.includes('total')) return 'TB'
  if (hrScore(p) >= 55) return 'HR'
  if (prodScore(p) >= 60) return 'HRR'
  if (hitScore(p) >= 60) return 'Hit'
  if (tbScore(p) >= 60) return 'TB'
  return 'HR'
}

export function roleColor(role, C) {
  if (role === 'Value HR') return C.purple
  if (role === 'HRR') return C.cyan
  if (role === 'Hit') return C.purple
  if (role === 'TB') return C.green
  if (role === 'Skip HR' || role === 'Avoid HR') return C.red
  return C.orange
}

// Real conviction tier straight from the bot (🏆 HR Bet / 🔥 HR Lean / 🏁 HRR
// / 🔭 Power Watch / 💠 Contact / ⛔ True Avoid), distinct from compactRole's
// coarser type bucket. compactRole answers "what kind of bet is this"; this
// answers "how confident is the model", which Leaders/Scoreboard want to show
// since collapsing HR Bet and HR Lean into the same plain-text "HR" loses the
// tier distinction the rest of the site already shows.
export function tierRole(p) {
  const raw = clean(p?.final_hr_role, '')
  return raw || compactRole(p)
}

// Compact role for dense tables. The full label carries an emoji and a slash
// pair -- readable on a card, truncated to nothing in a column.
export function shortRole(p) {
  const s = String(tierRole(p) || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!s) return '—'
  if (/avoid/i.test(s)) return 'Avoid'
  if (/power\s*watch/i.test(s)) return 'Power'
  if (/hr\s*bet/i.test(s)) return 'HR Bet'
  if (/hr\s*lean/i.test(s)) return 'HR Lean'
  if (/value/i.test(s)) return 'Value'
  if (/contact/i.test(s)) return 'Contact'
  if (/monitor/i.test(s)) return 'Monitor'
  if (/hrr|xbh/i.test(s)) return 'HRR'
  return s.split('/')[0].trim().slice(0, 12)
}

export function tierColor(role, C) {
  const s = String(role || '')
  if (s.includes('🏆')) return C.orange
  if (s.includes('🔥')) return C.orange
  if (s.includes('🏁')) return C.cyan
  if (s.includes('🔭')) return C.purple
  if (s.includes('💠')) return C.blue
  if (s.includes('⛔')) return C.red
  return roleColor(role, C)
}

export function scoreFor(p, type = 'hr') {
  if (type === 'hrr') return prodScore(p)
  if (type === 'hit') return hitScore(p)
  if (type === 'tb') return tbScore(p)
  if (type === 'contact') return n(p?.contact_score_v2 ?? p?.contact_score, 0)
  // Same fields the Streamlit build reads -- longest_hr_score and
  // hr_due_score are written by the bot under exactly one name each.
  if (type === 'longest') return n(p?.longest_hr_score, 0)
  if (type === 'due') return n(p?.hr_due_score, 0)
  // HR RANKING IS ISO-ADJUSTED as of 2026-08-04. The 39-day graded archive
  // (3,973 slots) showed season ISO out-predicting hr_score for home runs —
  // 8.2% to 22.2% across ISO bands vs +4.7 points across score quartiles —
  // with the signal living almost entirely OUTSIDE the score. The raw
  // hr_score is multiplied by the measured relative HR rate of the hitter's
  // ISO band (×0.56 low to ×1.52 high, interpolated). Full derivation and
  // the calibration table live in lib/scoring_additions.js and
  // BOT-DATA-REQUESTS.md. rawHrScore() below is the unadjusted bot score for
  // anything that needs to display the bot's own number.
  return isoAdjustedHr(p, hrScore(p))
}

// The bot's hr_score exactly as published, for surfaces that show the bot's
// own opinion rather than the site's ranking.
export const rawHrScore = (p) => hrScore(p)

// gradeFor reflects the raw score only — avoid signal surfaces via signalPills/compactRole
export function gradeFor(p, type = 'hr') {
  const s = scoreFor(p, type)
  if (s >= 78) return 'A+'
  if (s >= 70) return 'A'
  if (s >= 62) return 'A-'
  if (s >= 54) return 'B+'
  if (s >= 46) return 'B'
  return 'C+'
}

export function bestBet(p, type = 'hr') {
  const raw = clean(p?.best_bet_type || p?.bet_type || p?.best_use, '')
  const rawLow = raw.toLowerCase()
  if (type === 'hit') {
    if (raw && raw !== '—' && !rawLow.includes('avoid') && (rawLow.includes('hit') || rawLow.includes('base'))) return raw
    return 'Hit'
  }
  if (type === 'hrr') {
    if (raw && raw !== '—' && !rawLow.includes('avoid') && (rawLow.includes('hrr') || rawLow.includes('run') || rawLow.includes('rbi') || rawLow.includes('prod'))) return raw
    return 'HRR'
  }
  if (type === 'tb' || type === 'contact') {
    if (raw && raw !== '—' && !rawLow.includes('avoid') && (rawLow.includes('contact') || rawLow.includes('tb') || rawLow.includes('total') || rawLow.includes('xbh'))) return raw
    return 'Contact'
  }
  if (raw && raw !== '—') return raw
  const role = compactRole(p)
  if (role === 'Value HR') return 'HR'
  if (role === 'HRR') return 'HRR'
  if (role === 'Hit') return 'Hit'
  if (role === 'TB') return 'TB'
  if (role === 'Skip HR') return 'Skip HR'
  return 'HR'
}

export function signalPills(p, C, type = 'hr') {
  const out = []
  const add = (label, color = C.green) => {
    if (label && !out.some((x) => x.label === label)) out.push({ label, color })
  }

  // ISO band, HR context only — the two ends where the archive speaks loudly.
  // Sub-.13 ISO homered 8.2% across 610 graded picks; ≥.23 homered 22.2%
  // across 1,082. The middle bands stay unpilled; a pill for "average" is
  // noise.
  if (type === 'hr') {
    const t = isoTag(p)
    if (t?.warn) add(`Low ISO ${t.iso.toFixed(3).slice(1)}`, C.red)
    else if (t) add(`ISO+ ${t.iso.toFixed(3).slice(1)}`, C.orange)
  }

  // Red — trap/avoid with short reason
  if (p?.trap_flag && p?.trap_reason) {
    const r = p.trap_reason.toLowerCase()
    const short = r.includes('arsenal') ? 'Low Arsenal'
      : r.includes('gb') || r.includes('ground') ? 'GB Pitcher'
      : r.includes('k rate') ? 'High K'
      : r.includes('sample') ? 'Low Sample'
      : 'Trap'
    add(short, C.red)
  } else if (avoidHRCandidate(p) && type === 'hr') {
    const r = (p?.avoid_hr_reasons?.[0] || '').toLowerCase()
    const short = r.includes('k rate') ? 'High K'
      : r.includes('gb') || r.includes('ground') ? 'GB Pitcher'
      : r.includes('pitch') ? 'Bad PMix'
      : r.includes('lift') ? 'Low Lift'
      : null
    // BUGFIX: this used to fall back to literal 'Avoid HR' when no specific
    // reason matched, duplicating the role chip's exact text (compactRole()
    // already returns 'Avoid HR' whenever avoidHRCandidate(p) is true, and
    // PlayerCard.js renders that as its own chip). A generic repeat of text
    // already shown elsewhere adds no information, so skip the pill
    // entirely rather than show the same two words twice on one card.
    if (short) add(short, C.red)
  }

  // Orange — hot form
  const l5hr = n(p?.last5_hr, 0)
  if (l5hr >= 2) add(`L5 ${l5hr}HR`, C.orange)
  else if (p?.hr_due_tag === 'Hot HR Form') add('Hot Form', C.orange)

  // Blue — matchup
  if (p?.matchup_label === 'HR Attack') add('HR Attack', C.cyan)
  else if (p?.pitcher_low_k_flag) add('Low-K P', C.cyan)
  else if (p?.weak_pitcher_flag) add('Weak P', C.cyan)

  // Blue — pitch mix
  if (p?.pitch_type_match_flag && n(p?.pitch_type_match_score, 0) >= 80) {
    const note = p?.pitch_type_match_note || ''
    const pitch = note.includes('vs ') ? note.split('vs ')[1].split(':')[0].trim() : ''
    add(pitch ? `PMix: ${pitch}` : 'PMix', C.cyan)
  }

  // Green — batted ball
  const l5hh = n(p?.l5_hard_hit_rate, 0)
  const l5pull = n(p?.l5_pull_rate, 0)
  if (l5hh >= 0.5) add(`HH ${Math.round(l5hh * 100)}%`, C.green)
  else if (l5pull >= 0.65) add(`Pull ${Math.round(l5pull * 100)}%`, C.green)
  else if (recent375(p) >= 1) add('375+', C.green)
  else if (hrScore(p) >= 55) add('Power', C.green)
  else if (pitchMixScore(p) >= 60) add('Pitch Fit', C.green)

  if (!out.length) add('Playable', C.text2)
  return out.slice(0, 3)
}

export function riskPill(p, C, type = 'hr') {
  if (avoidHRCandidate(p) && type === 'hr') return null
  if (p?.trap_flag) return null
  if (lowSample(p)) return { label: 'Low Sample', color: C.yellow }
  if (n(p?.season_k_rate, 0) >= 0.27) return null
  if (n(p?.lineup_spot, 0) >= 7) return { label: 'Lower Order', color: C.yellow }
  if (type === 'hr' && prodScore(p) > hrScore(p) + 15) return { label: 'Better HRR', color: C.cyan }
  return null
}

export function isAligned(p) {
  // Legacy payloads stamped a 🧩 tag; current ones don't, so honour the tag if
  // it's there and otherwise derive it.
  if ((p?.top_board_tags || []).some((t) => String(t).includes('🧩'))) return true

  // Three independent things pointing the same way. Any two of these is common
  // and means little; all three is the thing worth flagging.
  const weakSpot = p?.weak_spot_flag === true
  const pitchMatch = n(p?.pitch_type_match_score, 0) > 0
  const realContact =
    barrelRate(p) >= 0.05 || recent375(p) >= 1 || hardHitRate(p) >= 0.35
  return weakSpot && pitchMatch && realContact
}

export function lanePass(p, lane) {
  const role = compactRole(p)
  const hr = hrScore(p)
  const hrw = n(p?.hrw_score, 0)
  const ihr = ihrVal(p)
  const hiddenFallback =
    !avoidHRCandidate(p) &&
    hr < 55 &&
    (hrw >= 50 || ihr >= 0.1 || d350Rate(p) >= 0.1 || recent375(p) >= 1 || pitchMixScore(p) >= 60 || n(p?.last5_xbh, 0) >= 2)
  if (lane === 'all') return true
  if (lane === 'strong') return role === 'HR' && !avoidHRCandidate(p)
  if (lane === 'value') return role === 'Value HR' || hiddenFallback
  if (lane === 'due') return !avoidHRCandidate(p) && n(p?.last5_hr, 0) === 0 && hr >= 28 && (ihr >= 0.08 || hrw >= 45 || d350Rate(p) >= 0.1)
  if (lane === 'hot') return n(p?.last5_hr, 0) >= 1 || n(p?.last7_hr, 0) >= 1 || n(p?.last5_xbh, 0) >= 2
  if (lane === 'target') return p?.weak_spot_flag === true || n(p?.pitcher_hr9, 0) >= 1.2 || n(p?.pitcher_whip, 0) >= 1.3 || n(p?.pitcher_attack_score, 0) >= 40
  if (lane === 'weather') return n(p?.park_factor, 100) >= 105 || clean(p?.weather_label || p?.weather_display, '') !== '—'
  if (lane === 'matchup') return pitchMixScore(p) >= 60 || clean(p?.pitch_fit_summary, '') !== '—'
  if (lane === 'aligned') return isAligned(p)
  if (lane === 'avoid') return p?.true_avoid_hr === true || avoidHRCandidate(p)
  return true
}

export const LANES = [
  ['all', 'All'],
  ['strong', 'Strong HR'],
  ['value', 'Value'],
  ['due', 'Due'],
  ['hot', 'Hot'],
  ['target', 'Weak Pitcher'],
  ['weather', 'Weather/Park'],
  ['matchup', 'Pitch Matchup'],
  ['aligned', '🧩 Aligned'],
  ['avoid', 'Skip HR'],
]
