// ══ PITCHER WEAKNESS + ENVIRONMENT TAGS ═════════════════════════════════════
// (rebuilt 2026-08-23; the 2026-08-22 build was lost with its session — rules
// preserved in claude/moonshot-pitcher-tags.md and re-measured fresh)
//
// Donovan: "pitcher weakness tags or environmental tags. like BLOWUP INCOMING
// — things like that. like HH going up, or line prediction going up."
//
// The ask is a WARNING LABEL, not a stat line. That is a claim, so four rules
// govern this file:
//   1. A tag states its rule — `why` is the rule in words, and it is the tip.
//   2. A tag prints its evidence — "HARD CONTACT 42.5% HH", never a dot.
//   3. A tag the data cannot support does not exist.
//   4. Thresholds come from the slate, not from taste. Every cut below is the
//      p75 or p90 of the measured distribution across 60 DISTINCT STARTERS
//      (2026-08-22 today + tomorrow slates), and the distribution is written
//      here so the next person re-measures instead of guessing what "high"
//      meant:
//
//        field                     p25     med     p75     p90
//        l3_hr9 − season_hr9      (per-arm delta; +0.8 rule from the spec)
//        l3_era − season_era      (delta; +1.5 ≈ p75 of the spread)
//        hardhit_allowed          .341    .377    .407    .425
//        barrel_allowed           .027    .036    .056    .083
//        meatball_pct             .204    .224    .241    .255
//        fb_rate                  .243    .295    .324    .370
//        pullair_allowed_pct      .225    .261    .295    .326
//        fb_velo_delta           −0.70    0.00   +0.41   +1.17
//        bb_pct                   .065    .083    .099    .116
//        k9                       7.00    8.23    9.44   10.57
//        whiff_pct                .200    .225    .265    .291
//        hr9 (season)             0.78    1.05    1.43    1.73
//        park_hr_factor           0.96    1.04    1.07    1.12
//        weather_hr_effect_pct   −1       +1      +5     +10
//
// BLOWUP RISK is a COUNT of independent alarms (>= 3 of the 9 leaks), not a
// blend — these signals overlap (hard contact, barrels and HR/FB are three
// views of one batted ball), and a weighted score would reinvent the
// single-entry problem the component research found in the HR model. Three
// alarms is a pattern; one is a stat.
//
// Environment tags are shown BESIDE the count and excluded from it — a
// launchpad is a fact about the ballpark, not a weakness of his. (The 08-22
// measurement showed why: letting the park promote a two-alarm arm pushed
// BLOWUP from 20% to 34% of the slate, and every extra flag was really a
// statement about the venue.)
//
// pitcher_xhr_allowed / pitcher_hr_luck (HR LUCK DUE below) ship with bot
// commit 810999d — the tag is data-gated and simply absent until the slate
// carries them, per rule 3. pitcher_bb9 is real as of b322a86; WILD reads
// bb_pct anyway (richer denominator).

const num = (v) => {
  const f = Number(v)
  return Number.isFinite(f) ? f : null
}
const pct = (v, dp = 1) => (v == null ? '—' : `${(100 * v).toFixed(dp)}%`)
const f2 = (v) => (v == null ? '—' : v.toFixed(2))
const f1 = (v) => (v == null ? '—' : v.toFixed(1))

// tone: 'leak' = warm, good for the bat · 'wall' = cool, his strength ·
// 'env' = its own hue, a fact about tonight's building, not about him.
export function pitcherTags(row) {
  if (!row) return { tags: [], leaks: 0, blowup: false }
  const g = (k) => num(row[k])
  const tags = []
  const leak = (key, label, evidence, why) => tags.push({ key, label, evidence, why, tone: 'leak' })
  const wall = (key, label, evidence, why) => tags.push({ key, label, evidence, why, tone: 'wall' })
  const env = (key, label, evidence, why) => tags.push({ key, label, evidence, why, tone: 'env' })

  const hr9 = g('pitcher_hr9')
  const l3hr9 = g('pitcher_l3_hr9')
  const l3n = num(row.pitcher_l3_starts_found) || 0
  const era = g('pitcher_era')
  const l3era = g('pitcher_l3_era')
  const hh = g('pitcher_hardhit_allowed')
  const brl = g('pitcher_barrel_allowed')
  const meat = g('pitcher_meatball_pct')
  const fb = g('pitcher_fb_rate')
  const pullair = g('pitcher_pullair_allowed_pct')
  const velo = g('pitcher_fb_velo_delta')
  const veloStatus = String(row.pitcher_fb_velo_status || '')
  const bbp = g('pitcher_bb_pct')
  const k9 = g('pitcher_k9')
  const whiff = g('pitcher_whiff_pct')
  const xhrBbe = num(row.pitcher_xhr_bbe) || 0
  const hrLuck = g('pitcher_hr_luck')

  // ── the nine leaks (each counts toward BLOWUP) ──
  if (l3n >= 2 && l3hr9 != null && hr9 != null && l3hr9 >= hr9 + 0.8)
    leak('getting_hit', 'GETTING HIT', `L3 ${f2(l3hr9)} vs ${f2(hr9)} HR/9`,
      `Last-${l3n} HR/9 at least 0.8 over his season rate — the leak is recent, not historical.`)
  if (l3n >= 2 && l3era != null && era != null && l3era >= era + 1.5)
    leak('era_spiking', 'ERA SPIKING', `L3 ${f2(l3era)} vs ${f2(era)}`,
      `Last-${l3n} ERA at least 1.5 runs over season — results are already slipping.`)
  if (hh != null && hh >= 0.407)
    leak('hard_contact', 'HARD CONTACT', `${pct(hh)} HH`,
      'Hard-hit rate allowed at or above the slate p75 (.407).')
  if (brl != null && brl >= 0.056)
    leak('barrel_prone', 'BARREL PRONE', `${pct(brl)} Brl`,
      'Barrel rate allowed at or above the slate p75 (.056) — the single best contact-quality homer signal.')
  if (meat != null && meat >= 0.241)
    leak('meatballs', 'MEATBALLS', `${pct(meat, 0)} meatball`,
      'Middle-middle pitch rate at or above the slate p75 (.241).')
  if (fb != null && fb >= 0.324)
    leak('flyball_leak', 'FLYBALL LEAK', `${pct(fb, 0)} FB`,
      'Fly-ball rate allowed at or above the slate p75 (.324) — the only batted ball that leaves the yard.')
  if (pullair != null && pullair >= 0.295)
    leak('pull_air', 'PULL-AIR', `${pct(pullair, 0)} pulled air`,
      'Pulled air-ball rate allowed at or above the slate p75 (.295) — the homer-shaped contact.')
  if (velo != null && velo <= -1.0 && veloStatus !== 'missing')
    leak('velo_down', 'VELO DOWN', `${f1(velo)} mph`,
      'Last start’s fastball at least 1 mph under his season average — the wear signal.')
  if (bbp != null && bbp >= 0.099)
    leak('wild', 'WILD', `${pct(bbp)} BB`,
      'Walk rate at or above the slate p75 (.099) — free traffic ahead of the mistake pitch.')

  const leaks = tags.filter((t) => t.tone === 'leak').length

  // ── HR LUCK DUE — data-gated on the xHR fields (live with bot 810999d).
  // Fires BEFORE the damage: an arm whose allowed contact deserved ~2+ more
  // homers than he has given up is the one about to give some back. Counts
  // toward BLOWUP once the field is real; while xhr_bbe is 0 the tag simply
  // does not exist (rule 3), so pre-fix slates render exactly as before.
  let luckLeak = 0
  if (xhrBbe >= 50 && hrLuck != null && hrLuck <= -2.0) {
    leak('hr_luck_due', 'HR LUCK DUE', `${f1(hrLuck)} vs expected`,
      `His contact allowed deserved ${f1(-hrLuck)} more HR than he has given up (${xhrBbe} tracked balls) — regression fires before the damage.`)
    luckLeak = 1
  }

  // ── the walls (never counted toward BLOWUP) ──
  if (hr9 != null && hr9 <= 0.78 && brl != null && brl <= 0.027)
    wall('suppressor', 'SUPPRESSOR', `${f2(hr9)} HR/9 · ${pct(brl)} Brl`,
      'Season HR/9 at or under the slate p25 with barrel-allowed at or under p25 — a genuine wall, not a lucky one.')
  if (k9 != null && k9 >= 9.44 && whiff != null && whiff >= 0.265)
    wall('misses_bats', 'MISSES BATS', `${f1(k9)} K/9 · ${pct(whiff, 0)} whiff`,
      'K/9 and whiff rate both at or above the slate p75 — contact is the price of admission.')

  // ── environment (own hue, excluded from the count) ──
  const park = g('park_hr_factor')
  const air = g('weather_hr_effect_pct')
  if (park != null && park >= 1.07)
    env('launchpad', 'LAUNCHPAD', `park ×${f2(park)}`,
      'Park HR factor at or above the slate p75 (1.07) — a fact about the building, not about him.')
  if (air != null && air >= 5)
    env('wind_out', 'WIND OUT', `air +${Math.round(air)}%`,
      'Weather HR effect at or above the slate p75 (+5%) — the air is helping tonight.')
  if (park != null && park <= 0.96 && (air == null || air <= 0))
    env('dead_air', 'DEAD AIR', `park ×${f2(park)}`,
      'Park factor at or under the slate p25 with no weather help — the building takes homers back. (Weather alone never fires this: the measured range of weather_hr_effect_pct is −2..+10, so the park carries the rule.)')

  const totalLeaks = leaks + luckLeak
  const blowup = totalLeaks >= 3
  return { tags, leaks: totalLeaks, blowup }
}
