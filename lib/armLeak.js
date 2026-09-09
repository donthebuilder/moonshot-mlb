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

// ─────────────────────────────────────────────────────────────────────────────
// 📈 WHAT HAS BEEN GOING ON WITH HIM — the form read (2026-08-15)
// ─────────────────────────────────────────────────────────────────────────────
//
// Donovan on the Pitchers page: "fill like more things can be now wiether
// about the bull pen piutcher or whats been going on for the pitcher or the
// invriment." This block is the middle one.
//
// WHAT WAS WRONG BEFORE. Every field needed to say "he has been getting hit
// lately" was already on 266 of 266 slate rows — pitcher_l3_era, _l3_whip,
// _l3_hr9, _l3_starts_found, pitcher_trend_direction, pitcher_trend_reason,
// pitcher_fb_velo_delta / _status, pitcher_hr_luck — and the Pitchers page
// showed exactly ONE of them anywhere outside the wide table: a five-character
// "trend" column with no reason attached. The read that GameDeepDive gives you
// for a game ("his last three are worse still at 1.83, the trend reads
// worsening") had no equivalent on the page whose entire subject is arms.
//
// WHY CLAUSES AND NOT TILES. Same shape as lib/conditions.js's airParts:
// [{ key, text, tone, title }]. Tiles and boxes lose to sentences here — the
// owner has said so five separate times — so the library hands back the
// clauses and the caller strings them into one sentence. Tone is read from the
// HITTER's side, matching every other board on the site: 'hot' means this is
// good news for the bat, 'cold' means the arm is the one it favours.
//
// A CLAUSE WITH NO FIELD BEHIND IT IS DROPPED, never defaulted. An arm with no
// published velocity status simply doesn't get a velocity clause; he does not
// get "+0.0 mph", which would read as a measurement.

const sstr = (v) => String(v ?? '').trim()

/** The form fields off any slate row that faces this starter. */
export function formFrom(p) {
  return {
    hr9: num(p?.pitcher_hr9),
    era: num(p?.pitcher_era),
    whip: num(p?.pitcher_whip),
    l3hr9: num(p?.pitcher_l3_hr9),
    l3era: num(p?.pitcher_l3_era),
    l3whip: num(p?.pitcher_l3_whip),
    l3starts: num(p?.pitcher_l3_starts_found) ?? 0,
    trend: sstr(p?.pitcher_trend_direction).toLowerCase(),
    trendReason: sstr(p?.pitcher_trend_reason),
    veloDelta: num(p?.pitcher_fb_velo_delta),
    veloStatus: sstr(p?.pitcher_fb_velo_status).toLowerCase(),
    hrAllowed: num(p?.pitcher_hr_allowed),
    xhr: num(p?.pitcher_xhr_allowed),
    xhrBbe: num(p?.pitcher_xhr_bbe) ?? 0,
    hrLuck: num(p?.pitcher_hr_luck),
  }
}

const joinList = (bits) => (bits.length <= 1 ? (bits[0] || '')
  : `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`)

/**
 * His recent form as an ordered list of spoken clauses.
 *
 * @param p     any slate row carrying this starter's pitcher_* fields
 * @param opts.luckPointer  the slate-relative HR-luck pointer for this arm
 *              (see hrLuckPointers). Used ONLY when the calibrated
 *              pitcher_hr_luck hasn't published yet, and labelled as the
 *              weaker thing it is.
 * @returns [{ key, text, tone, title }]
 */
export function armFormParts(p, opts = {}) {
  if (!p) return []
  const f = formFrom(p)
  const out = []

  // ── 1. The last three starts against the season line ──────────────────────
  if (f.l3starts >= 1 && (f.l3hr9 != null || f.l3era != null || f.l3whip != null)) {
    const bits = []
    if (f.l3hr9 != null) bits.push(`${f.l3hr9.toFixed(2)} HR/9${f.hr9 != null ? ` against ${f.hr9.toFixed(2)} on the season` : ''}`)
    if (f.l3era != null) bits.push(`a ${f.l3era.toFixed(2)} ERA${f.era != null ? ` against ${f.era.toFixed(2)}` : ''}`)
    if (f.l3whip != null) bits.push(`a ${f.l3whip.toFixed(2)} WHIP${f.whip != null ? ` against ${f.whip.toFixed(2)}` : ''}`)
    const gap = (f.l3hr9 != null && f.hr9 != null) ? f.l3hr9 - f.hr9 : null
    const tail = gap == null ? ''
      : gap >= 0.3 ? ' — he is leaking harder than his season line reads'
        : gap <= -0.3 ? ' — tighter than his season line reads'
          : ''
    out.push({
      key: 'l3',
      text: `over his last ${f.l3starts === 1 ? 'start' : `${f.l3starts} starts`} he has given up ${joinList(bits)}${tail}`,
      tone: gap == null ? 'plain' : gap >= 0.3 ? 'hot' : gap <= -0.3 ? 'cold' : 'plain',
      title: `Last-${f.l3starts} numbers (pitcher_l3_hr9 / _l3_era / _l3_whip on ${f.l3starts} starts found) beside his season line. Three outings is a handful of innings — a direction, not a rate.`,
    })
  }

  // ── 2. The bot's own trend call, and the reason it published for it ───────
  if (f.trend && f.trend !== 'unknown') {
    const worse = /worsen|declin|down|slip/.test(f.trend)
    const better = /improv|better|up/.test(f.trend)
    out.push({
      key: 'trend',
      // The reason string is published pipe-delimited ("Barrel 4%→2% | HH
      // 32%→25% | ..."), which is a machine's punctuation. Commas, so it reads
      // as part of the sentence it is sitting in. Nothing else about it is
      // touched — the numbers and the window are the bot's own words.
      text: `the bot's contact-quality trend on him reads ${f.trend}${f.trendReason ? ` — ${f.trendReason.replace(/\s*\|\s*/g, ', ')}` : ''}`,
      tone: worse ? 'hot' : better ? 'cold' : 'plain',
      title: f.trendReason
        ? 'pitcher_trend_direction with the bot\'s published pitcher_trend_reason — its last-5 contact numbers against his last 8.'
        : 'pitcher_trend_direction — where the bot has his contact quality heading. No reason string published for this arm, so none is shown.',
    })
  }

  // ── 3. Velocity against his OWN baseline (not the league's) ───────────────
  if (f.veloStatus !== 'missing' && f.veloDelta != null) {
    // Bucketed on the ROUNDED figure, not the raw one: a −0.39 prints as
    // "−0.4" and calling that "sitting on his baseline" in the same breath is
    // the sort of half-degree contradiction that makes a reader stop trusting
    // the sentence.
    const d = Number(f.veloDelta.toFixed(1))
    out.push({
      key: 'velo',
      text: d <= -0.4 ? `his fastball is ${Math.abs(d).toFixed(1)} mph down on his own baseline`
        : d >= 0.4 ? `his fastball is ${d.toFixed(1)} mph up on his own baseline`
          : `his fastball is sitting on his own baseline (${d >= 0 ? '+' : ''}${d.toFixed(1)} mph)`,
      tone: d <= -0.4 ? 'hot' : d >= 0.4 ? 'cold' : 'plain',
      title: 'pitcher_fb_velo_delta — average fastball velocity against his own season baseline, not against the league. Down on his usual means the bats are seeing a lesser pitch.',
    })
  }

  // ── 4. Has he been hittable, or just unlucky? ─────────────────────────────
  //
  // Two answers, and the calibrated one wins whenever it exists. Sign matches
  // the table column and GameDeepDive: NEGATIVE = fewer homers than the
  // contact deserved = the lucky arm = the regression bet is on the bats.
  if (f.xhrBbe >= 50 && f.hrLuck != null && f.hrLuck !== 0) {
    const l = f.hrLuck
    out.push({
      key: 'luck',
      text: `he has allowed ${Math.abs(l).toFixed(1)} ${l < 0 ? 'fewer' : 'more'} homers than the contact he gave up deserved${l < 0 ? ', so regression is on the hitters\' side' : ', so his home-run line overstates how hittable he has been'}`,
      tone: l < 0 ? 'hot' : 'cold',
      title: `Actual home runs allowed minus expected-from-contact (calibrated pitcher_hr_luck, on ${Math.round(f.xhrBbe)} batted balls${f.xhr != null ? `; pitcher_xhr_allowed ${f.xhr.toFixed(1)}` : ''}).`,
    })
  } else if (opts.luckPointer != null && Math.abs(opts.luckPointer) >= 15) {
    const v = Math.round(opts.luckPointer)
    out.push({
      key: 'luck',
      text: v > 0
        ? `he allows louder contact than his home-run total has paid for so far (+${v} on tonight's luck pointer)`
        : `he has paid for more homers than the contact he allows (${v} on tonight's luck pointer)`,
      tone: v > 0 ? 'hot' : 'cold',
      title: 'Loudness of contact allowed (barrel / hard-hit / pull-air / fly-ball percentiles) minus his HR/9 percentile, both within tonight\'s slate. A pointer, not a projection — and the weaker of the two luck reads, used only because the calibrated xHR fields have not published for him.',
    })
  }

  return out
}

/** The same thing as one plain string, for titles and share cards. */
export function armFormSentence(p, opts = {}) {
  const parts = armFormParts(p, opts).map((x) => x.text)
  if (!parts.length) return ''
  const s = joinList(parts)
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`
}

/**
 * THE SLATE-RELATIVE HR-LUCK POINTER, for every starter tonight.
 *
 * Lifted here out of tabs/Pitchers.js (2026-08-15) where it was computed
 * inline inside the DenseTable rows IIFE and therefore reachable by exactly
 * one column and nothing else — the form read above needs the same number, and
 * a second copy of a percentile ladder is how two surfaces start disagreeing.
 * Same fields, same maths, same meaning as the column it still feeds:
 *
 *   damage = mean slate percentile of barrel-allowed, hard-hit-allowed,
 *            pull-air-allowed and fly-ball rate (whichever are published)
 *   luck   = (damage percentile − HR/9 percentile) × 100
 *
 * POSITIVE = loud contact that hasn't been paid for yet.
 * Returns Map(pitcher_name → luck), null-safe and empty when the slate is thin.
 */
export function hrLuckPointers(players = []) {
  const byName = new Map()
  players.forEach((p) => {
    const name = sstr(p?.pitcher_name)
    if (!name || name === 'TBD' || byName.has(name)) return
    byName.set(name, {
      brl: num(p?.pitcher_barrel_allowed),
      hh: num(p?.pitcher_hardhit_allowed),
      pullAir: num(p?.pitcher_pullair_allowed_pct),
      fb: num(p?.pitcher_fb_rate),
      hr9: num(p?.pitcher_hr9),
    })
  })
  const all = [...byName.values()]
  const out = new Map()
  if (!all.length) return out
  const pct = (vals, v) => {
    const xs = vals.filter((x) => x != null).sort((a, b) => a - b)
    if (v == null || !xs.length) return null
    let i = 0
    while (i < xs.length && xs[i] <= v) i++
    return i / xs.length
  }
  const cols = {
    brl: all.map((x) => x.brl),
    hh: all.map((x) => x.hh),
    pullAir: all.map((x) => x.pullAir),
    fb: all.map((x) => x.fb),
    hr9: all.map((x) => x.hr9),
  }
  byName.forEach((r, name) => {
    const parts = [pct(cols.brl, r.brl), pct(cols.hh, r.hh), pct(cols.pullAir, r.pullAir), pct(cols.fb, r.fb)]
      .filter((x) => x != null)
    const d = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null
    const h = pct(cols.hr9, r.hr9)
    out.set(name, d != null && h != null ? Math.round((d - h) * 100) : null)
  })
  return out
}
