// Player field accessors.
//
// Bot JSON varies (recent_375_num vs distance_375_num etc) so each getter
// tries multiple keys. To add a new alias, edit one line here.

// ---- type helpers ----
export const arr = (v) => (Array.isArray(v) ? v : [])
export const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

export function clean(v, fallback = '—') {
  if (v === null || v === undefined) return fallback
  if (typeof v === 'object') return fallback
  const s = String(v).trim()
  return s || fallback
}

export function n(v, fallback = 0) {
  const x = Number(v)
  return Number.isFinite(x) ? x : fallback
}

export function sc(v) {
  const x = Number(v)
  return Number.isFinite(x) ? x.toFixed(1) : '—'
}

export function pct(v) {
  const x = Number(v)
  if (!Number.isFinite(x)) return '—'
  return `${Math.round(x > 1 ? x : x * 100)}%`
}

export function pick(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && !v.trim()) continue
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'boolean') return v
    if (typeof v === 'object') {
      if (Array.isArray(v) && v.length) return v
      if (!Array.isArray(v) && Object.keys(v).length) return v
      continue
    }
    return v
  }
  return undefined
}

export const nn = (...vals) => n(pick(...vals), 0)
export const txt = (...vals) => clean(pick(...vals), '')

// ---- identity ----
export const nameOf = (p) => clean(p?.name || p?.player || p?.player_name, 'Unknown')
export const teamOf = (p) => clean(p?.team || p?.team_abbr || p?.batting_team, '')
export const oppOf = (p) => clean(p?.opponent || p?.opp || p?.pitcher_team || p?.away || p?.home, '')
export const playerId = (p) => `${clean(p?.player_id || p?.id || p?.name, '')}-${clean(p?.game_pk || p?.team, '')}`

// ---- scores ----
export const hrScore = (p) => nn(p?.hr_score)
export const hitScore = (p) => nn(p?.hit_shape_score, p?.hit_score, p?.contact_hit_score, p?.base_hit_score, p?.hit_model_score)
export const prodScore = (p) => nn(p?.production_shape_score, p?.hrr_score, p?.hrr_model_score, p?.run_rbi_score, p?.prod_score)
export const tbScore = (p) => nn(p?.contact_shape_score, p?.contact_score, p?.tb_score, p?.total_base_score, p?.xbh_score)
export const pitchMixScore = (p) => nn(p?.pitch_mix_score, p?.pmix_score, p?.pitch_matchup_score, p?.pitch_fit_score, p?.pm_score)

// ---- batted ball ----
export const ihrVal = (p) => nn(p?.recent_ideal_hr_contact, p?.l20pa_ideal_hr_contact, p?.ideal_hr_contact, p?.ihr, p?.ihr_rate)
export const avgEV = (p) => nn(p?.recent_ev, p?.avg_ev, p?.bbe_profile?.avg_ev, p?.statcast?.avg_ev)
export const maxEV = (p) => nn(p?.max_ev, p?.bbe_profile?.max_ev, p?.statcast?.max_ev)
export const barrelRate = (p) => nn(p?.recent_barrel_rate, p?.barrel_rate, p?.bbe_profile?.barrel_rate, p?.statcast?.barrel_rate)
export const hardHitRate = (p) => nn(p?.recent_hard_hit_rate, p?.hard_hit_rate, p?.bbe_profile?.hard_hit_rate, p?.statcast?.hard_hit_rate)
export const launchAngle = (p) => nn(p?.recent_la, p?.avg_la, p?.bbe_profile?.avg_la, p?.statcast?.avg_la)

// ---- distance buckets ----
export const recent350 = (p) => nn(p?.recent_350_num, p?.l20pa_350_num, p?.distance_350_num, p?.hits_350_plus)
export const recent375 = (p) => nn(p?.recent_375_num, p?.l20pa_375_num, p?.distance_375_num, p?.hits_375_plus)
export const recent400 = (p) => nn(p?.recent_400_num, p?.l20pa_400_num, p?.distance_400_num, p?.hits_400_plus)
export const d350Rate = (p) => recent350(p) / Math.max(1, nn(p?.recent_350_den, p?.l20pa_bbe, p?.bbe_count, 1))

// ---- splits / BABIP ----
export const avgVsRHP = (p) => nn(p?.avg_vs_rhp, p?.ba_vs_rhp, p?.split_avg_rhp, p?.season_avg_vs_rhp, p?.vs_rhp_avg)
export const avgVsLHP = (p) => nn(p?.avg_vs_lhp, p?.ba_vs_lhp, p?.split_avg_lhp, p?.season_avg_vs_lhp, p?.vs_lhp_avg)
export const babipVal = (p) => nn(p?.babip, p?.season_babip, p?.batter_babip)
export const pitcherBabipVal = (p) =>
  nn(p?.pitcher_babip, p?.opp_pitcher_babip, p?.pitcher_babip_allowed, p?.pitcher_allowed_babip)

// ---- misc ----
export function dateText(v) {
  try {
    return v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD'
  } catch {
    return 'TBD'
  }
}

export function lowSample(p) {
  return nn(p?.season_pa, p?.pa, p?.plate_appearances) < 40 || Math.max(1, nn(p?.recent_350_den, p?.l20pa_bbe, p?.bbe_count, 1)) < 10
}

// Median. Used wherever a slate-level number has to survive one outlier --
// mean would let a single inflated score speak for a whole lineup.
export const median = (vals) => {
  const v = vals.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return 0
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
