'use client'

// 🩹 LEAK SCORE — how likely tonight's starters are to give one up.
//
// 2026-08-09, Donovan: "everything on the site is bats; there's no 'which
// start is most homer-prone tonight' as a front-door lane, even though the arm
// is the strongest single input in the model — fix that too."
//
// The Home panel already ranked arms, but on ONE number: season HR/9. That's
// the right headline and a poor ranking. It's slow to move, it's blind to
// contact quality, and it can't tell a fly-ball pitcher in Yankee Stadium from
// the same HR/9 in Oracle Park. Meanwhile the slate publishes barrel-allowed,
// hard-hit-allowed, fly-ball rate, meatball rate, last-three-start HR/9 and a
// fastball-velocity delta, and none of it was being read.
//
// WHY A BLEND AND NOT A MODEL. This is a display ranking, not a score — it
// never touches a pick, per the two-lane rule. So it's built to be EXPLAINABLE
// rather than optimal: every term is a published field, every weight is
// visible below, and the panel names the two terms actually driving each arm.
// If it disagrees with HR/9, you can see exactly why in one glance.
//
// HOW THE NUMBERS ARE MADE COMPARABLE. Each term is ranked against TONIGHT'S
// OTHER STARTERS — min/max across the slate — not against the league. Same
// choice as the stat strip and for the same reason: we don't publish league
// baselines and inventing them would be the dishonest part. So a 78 means
// "near the top of the arms pitching tonight", the panel says so, and on a
// thin slate the scale moves with it.
//
// EVERY FIELD HERE WAS READ OUT OF A LIVE today_slim.json BEFORE THIS FILE WAS
// WRITTEN. Rates are 0–1 fractions; hr9 / l3_hr9 are per-nine; park_hr_factor
// is a multiplier; fb_velo_delta is mph off his own baseline (negative = he's
// lost velocity).

const num = (v) => {
  const f = Number(v)
  return Number.isFinite(f) ? f : null
}

// term          weight  what it says
export const LEAK_TERMS = [
  {
    id: 'hr9', w: 3, label: 'HR/9',
    get: (a) => a.hr9,
    fmt: (v) => v.toFixed(2),
    why: 'Home runs allowed per nine innings this season — the headline number, and the slowest to move.',
  },
  {
    id: 'l3', w: 2, label: 'Last 3',
    // Form only counts when there IS form: one start is noise, not a trend.
    get: (a) => (a.l3starts >= 2 ? a.l3hr9 : null),
    fmt: (v) => v.toFixed(2),
    why: 'HR/9 over his last three starts. Needs at least two starts on file — one is noise.',
  },
  {
    id: 'barrel', w: 2, label: 'Barrels',
    get: (a) => a.barrel,
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    why: 'Share of batted balls against him hit at home-run exit velocity and launch angle.',
  },
  {
    id: 'hard', w: 1.5, label: 'Hard hit',
    get: (a) => a.hard,
    fmt: (v) => `${(v * 100).toFixed(0)}%`,
    why: 'Share of batted balls against him at 95 mph or more.',
  },
  {
    id: 'fb', w: 1.5, label: 'Fly balls',
    get: (a) => a.fb,
    fmt: (v) => `${(v * 100).toFixed(0)}%`,
    why: 'Fly-ball rate against him. Ground balls cannot leave the yard, so this is the raw material.',
  },
  {
    id: 'meatball', w: 1, label: 'Meatballs',
    get: (a) => a.meatball,
    fmt: (v) => `${(v * 100).toFixed(0)}%`,
    why: 'Share of his pitches down the middle — the ones that get hit a long way.',
  },
  {
    id: 'park', w: 1.5, label: 'Park',
    get: (a) => a.park,
    fmt: (v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`,
    why: 'The building he is pitching in tonight, as a home-run multiplier against a neutral park.',
  },
  {
    id: 'velo', w: 1, label: 'Velo',
    // Negative delta = he has LOST velocity, which is bad for him and good for
    // the bats — so it's negated to keep "higher = leakier" true for every term.
    get: (a) => (a.veloDelta == null ? null : -a.veloDelta),
    fmt: (v) => `${-v >= 0 ? '+' : ''}${(-v).toFixed(1)}`,
    why: 'Fastball velocity against his own baseline. Down on his usual means the bats are seeing a lesser pitch.',
  },
]

/** Pull one starter's row out of any slate row that faces him. */
export function armFrom(p) {
  return {
    name: String(p?.pitcher_name || '').trim(),
    id: num(p?.pitcher_id),
    throws: String(p?.pitcher_throws || '').trim(),
    team: String(p?.pitcher_team || '').trim(),
    vs: String(p?.team || '').trim(),
    hr9: num(p?.pitcher_hr9),
    l3hr9: num(p?.pitcher_l3_hr9),
    l3starts: num(p?.pitcher_l3_starts_found) ?? 0,
    barrel: num(p?.pitcher_barrel_allowed),
    hard: num(p?.pitcher_hardhit_allowed),
    fb: num(p?.pitcher_statcast_fb_rate) ?? num(p?.pitcher_fb_rate),
    meatball: num(p?.pitcher_meatball_pct),
    park: num(p?.park_hr_factor),
    veloDelta: num(p?.pitcher_fb_velo_delta),
    era: num(p?.pitcher_era),
    // How much of a Statcast sample the contact-quality terms rest on.
    bbe: num(p?.pitcher_statcast_bbe) ?? 0,
    venue: String(p?.venue_name || '').trim(),
    gamePk: p?.game_pk ?? null,
  }
}

/**
 * Rank every starter on the slate.
 *
 * Returns [{ ...arm, leak, drivers, terms, thin }] sorted leakiest first.
 *   leak    0–100 against tonight's other starters
 *   drivers the two terms he ranks highest on — what to actually say out loud
 *   thin    true when the contact-quality terms rest on a small sample
 */
export function rankArms(players = []) {
  const byName = new Map()
  players.forEach((p) => {
    const a = armFrom(p)
    if (!a.name || a.name === 'TBD') return
    if (!byName.has(a.name)) byName.set(a.name, { ...a, weak: 0 })
    // Weak lineup spots are counted across every hitter he faces.
    if (p?.weak_spot_flag) byName.get(a.name).weak += 1
  })
  const arms = [...byName.values()]
  if (arms.length < 3) return []   // nothing to rank against

  // min/max per term across tonight's starters
  const span = {}
  LEAK_TERMS.forEach((t) => {
    const vals = arms.map((a) => t.get(a)).filter((v) => v != null)
    span[t.id] = vals.length >= 3
      ? { lo: Math.min(...vals), hi: Math.max(...vals), n: vals.length }
      : null   // too few published values to rank — term sits out
  })

  arms.forEach((a) => {
    let sum = 0; let wsum = 0
    const terms = []
    LEAK_TERMS.forEach((t) => {
      const v = t.get(a)
      const s = span[t.id]
      if (v == null || !s || s.hi <= s.lo) return
      const norm = (v - s.lo) / (s.hi - s.lo)   // 0 = least leaky tonight
      sum += norm * t.w
      wsum += t.w
      terms.push({ id: t.id, label: t.label, raw: v, text: t.fmt(v), norm, w: t.w, why: t.why })
    })
    // A term missing on one arm shouldn't quietly score him as zero — the
    // weighted mean uses only the weights that actually had a value, so an
    // arm with six of eight terms is scored on those six.
    a.leak = wsum > 0 ? Math.round((sum / wsum) * 100) : null
    a.terms = terms
    a.drivers = [...terms].sort((x, y) => (y.norm * y.w) - (x.norm * x.w)).slice(0, 2)
    // Contact-quality terms need balls in play behind them to mean anything.
    a.thin = a.bbe > 0 && a.bbe < 60
    a.scoredOn = terms.length
  })

  return arms.filter((a) => a.leak != null).sort((a, b) => b.leak - a.leak)
}
