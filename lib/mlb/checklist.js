// DONOVAN'S CHECKLIST (2026-10-21). His original HR method (May 2025 notes, SPORTS/BASEBALL_ANALYSIS), as the six
// checks on top of the MLB player card. Each one was backtested on the graded board, Aug 22 - Sep 27 2026 (3,105
// hitter-games, base 15.5% HR): claude/MLB-PLAYER-PORTAL-V2-2026-10-21.txt. Listed strongest first, by the HR rate of
// the hitters who passed it. Two of his rules are NOT here on purpose: barrel 8%+ and "spray leaning with the wind"
// showed no lift on the data the bot keeps (last-25-PA barrel, wind as CF only), so they don't get a check until
// they're tested his way (KNOWN-ISSUES #27).
//
// Reads only fields the slate row already carries. A field that isn't there is `null` (drawn as a dash), never a
// pass and never a fail: an empty field is not evidence.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const f = Number(v)
  return Number.isFinite(f) ? f : null
}
const iso = (v) => v.toFixed(3).replace(/^0/, '')

// the hitter's side against tonight's arm (a switch hitter bats opposite the pitcher)
export function sideVs(bats, throws) {
  if (bats === 'S') return throws === 'R' ? 'L' : throws === 'L' ? 'R' : null
  return bats === 'L' || bats === 'R' ? bats : null
}

export const CHECKS = [
  {
    key: 'hrCount', label: 'HR COUNT', rule: '20+ this season',
    tested: '30+ HR hit 21.5%, 20+ hit 17.7% (base 15.5%)',
    read(p) {
      const hr = num(p?.season_hr)
      if (hr == null) return null
      return { pass: hr >= 20, big: String(hr), small: 'home runs this season' }
    },
  },
  {
    key: 'weakSpot', label: 'WEAK SPOT', rule: "his slot hurts this pitcher",
    tested: 'passed 18.3% vs 15.2%',
    read(p) {
      const d = num(p?.pitcher_spot_damage_score)
      const spot = num(p?.lineup_spot)
      if (d == null) return null
      return { pass: d >= 50, big: spot != null ? `#${spot}` : '—', small: `spot damage ${Math.round(d)} of 100` }
    },
  },
  {
    key: 'hrRate', label: 'HR RATE', rule: '3.5%+ of PA',
    tested: 'passed 17.8% vs 12.4%',
    read(p) {
      const r = num(p?.hr_per_pa)
      if (r == null) return null
      // shown truncated, not rounded: a 3.47% rate must not print as the 3.5% it misses
      return { pass: r >= 0.035, big: `${(Math.floor(r * 1000) / 10).toFixed(1)}%`, small: r > 0 ? `1 every ${Math.round(1 / r)} PA` : 'no HR yet' }
    },
  },
  {
    key: 'pitchMatch', label: 'HIS PITCHES', rule: 'he hits what this arm throws',
    tested: 'passed 17.5% vs 14.1%',
    read(p) {
      if (p?.pitch_type_match_flag == null) return null
      const s = num(p?.pitch_type_match_score)
      return { pass: !!p.pitch_type_match_flag, big: p.pitch_type_match_flag ? 'YES' : 'NO', small: s != null ? `pitch match ${Math.round(s)}` : 'pitch match' }
    },
  },
  {
    key: 'split', label: 'VS HIS HAND', rule: 'better split vs tonight’s arm',
    tested: 'passed 17.1% vs 15.2%',
    read(p) {
      const t = p?.pitcher_throws
      const v = num(t === 'R' ? p?.iso_vs_rhp : t === 'L' ? p?.iso_vs_lhp : null)
      const s = num(p?.season_iso)
      if (v == null || s == null) return null
      return { pass: v > s, big: iso(v), small: `ISO vs ${t}HP · ${iso(s)} overall` }
    },
  },
  {
    key: 'bvp', label: 'VS HIM', rule: 'ISO .200+ in 5+ AB',
    tested: 'passed 18.7% (small sample); with the top four, 35.7% in 70',
    read(p) {
      const ab = num(p?.bvp_ab)
      const v = num(p?.bvp_iso)
      if (ab == null || ab < 5 || v == null) return ab != null && ab < 5 ? { pass: null, big: `${ab} AB`, small: 'not enough to say' } : null
      return { pass: v >= 0.2, big: iso(v), small: `ISO in ${ab} AB${num(p?.bvp_hr) ? ` · ${num(p.bvp_hr)} HR` : ''}` }
    },
  },
]

/** The six checks for one slate row: [{ key, label, rule, tested, pass: true|false|null, big, small }]. */
export function checklist(p) {
  return CHECKS.map((c) => {
    const r = c.read(p)
    return { key: c.key, label: c.label, rule: c.rule, tested: c.tested, pass: r ? r.pass : null, big: r ? r.big : '—', small: r ? r.small : 'no data' }
  })
}

export const passCount = (rows) => rows.filter((r) => r.pass === true).length
