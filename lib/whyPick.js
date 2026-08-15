'use client'

// 🔎 WHY THIS ONE — the driver behind a pick, measured rather than narrated.
//
// 2026-08-15, Donovan on the Bot page: it "can be boring". He ruled out
// pairing it with odds ("that doesnt seem like it flows") — the four calls
// already carry their price. What was missing is that every call read the
// same: name, arm, HR/9, lineup spot, last five. Four paragraphs with an
// identical skeleton is a form, not a read.
//
// THE FIX IS NOT MORE ADJECTIVES. It is answering the question the page never
// answered: of everything that goes into this number, WHICH PART is doing the
// work tonight? That is a measurement, and the slate itself is the yardstick —
// a 68 pitch-type fit means nothing until you know the slate's median is 41.
//
// HOW IT WORKS. Each market has a driver list of published fields. For each
// driver we take the player's value's PERCENTILE within tonight's own slate
// (direction-adjusted, so a low strikeout rate and a high hard-hit rate both
// score high). The highest percentile is what's carrying the pick; the lowest
// is what's working against it. Both get said, because a page that only
// prints the flattering half of its own model is advertising.
//
// COHERENCE, THE PROJECT'S STANDING RULE. Each market is explained by ITS OWN
// inputs. The HR call is broken down with the bot's own `hr_shape_components`
// — literally the HR model's parts, already on a shared 0-100 scale. The hit,
// H+R+RBI and total-bases calls are explained with contact, traffic and
// extra-base fields. Explaining a base-hit pick with an HR component
// breakdown would be the same category error the modal chips, the slip label
// and The Read all already guard against.
//
// NOTHING HERE INVENTS PROSE ABOUT BASEBALL. Every clause is a template with
// a published number in it, and a driver whose field is missing drops out
// rather than being guessed at.

const num = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const pctStr = (v) => `${Math.round(v * 100)}%`
const rate3 = (v) => v.toFixed(3).replace(/^0/, '')

// dir: +1 = higher is better for the hitter, -1 = lower is better.
// say(v, p): the clause, given the value and the player row.
const D = (key, dir, label, say) => ({ key, dir, label, say })

export const MARKET_DRIVERS = {
  HIT: [
    D('l25pa_avg', +1, 'his recent bat', (v) => `he is hitting ${rate3(v)} over his last 25 plate appearances`),
    D('season_avg', +1, 'his season bat', (v) => `he carries a ${rate3(v)} season average`),
    D('season_k_rate', -1, 'his strikeouts', (v) => `he strikes out just ${pctStr(v)} of the time`),
    D('pitcher_avg_against', +1, 'the arm', (v) => `the arm is being hit ${rate3(v)} against`),
    D('pitcher_whip', +1, 'traffic', (v) => `that arm puts ${v.toFixed(2)} on base an inning`),
    D('lineup_spot', -1, 'his spot', (v) => `he bats ${v}${ordSuffix(v)}, so the plate appearances are there`),
    D('multi_hit_score', +1, 'his multi-hit profile', (v) => `his multi-hit profile scores ${v.toFixed(0)}`),
    D('last10_hits', +1, 'his form', (v) => `${v} hits in his last ten`),
  ],
  HRR: [
    D('lineup_context_score', +1, 'the lineup around him', (v) => `the lineup around him scores ${v.toFixed(0)} for context`),
    D('season_rbi_per_pa', +1, 'his RBI rate', (v) => `he drives in a run every ${(1 / v).toFixed(0)} plate appearances`),
    D('season_runs_per_pa', +1, 'his run rate', (v) => `he scores every ${(1 / v).toFixed(0)} plate appearances`),
    D('lineup_spot', -1, 'his spot', (v) => `he bats ${v}${ordSuffix(v)}`),
    D('pitcher_whip', +1, 'traffic', (v) => `the arm allows ${v.toFixed(2)} baserunners an inning, so there is traffic to drive in`),
    D('last7_rbi', +1, 'his week', (v) => `${v} driven in over his last seven`),
    D('last7_runs', +1, 'his week', (v) => `${v} runs scored over his last seven`),
  ],
  CONTACT: [
    D('l25pa_hard_hit_rate', +1, 'his contact quality', (v) => `he is hitting ${pctStr(v)} of them hard`),
    D('season_slg', +1, 'his slug', (v) => `he slugs ${rate3(v)}`),
    D('last10_xbh', +1, 'his extra-base form', (v) => `${v} extra-base hits in his last ten`),
    D('l25pa_avg_ev', +1, 'his exit velocity', (v) => `${v.toFixed(1)} mph average off the bat lately`),
    D('pitcher_hardhit_allowed', +1, 'the arm', (v) => `this arm gives up hard contact ${pctStr(v)} of the time`),
    D('pitcher_iso_against', +1, 'the arm', (v) => `hitters slug ${rate3(v)} of isolated power off him`),
    D('lineup_spot', -1, 'his spot', (v) => `he bats ${v}${ordSuffix(v)}`),
  ],
}

// The HR call gets the model's own parts, not a proxy list.
export const HR_COMPONENTS = [
  { key: 'batted_ball_damage', label: 'his contact', say: (v) => `the damage he is doing on contact rates ${v.toFixed(0)}` },
  { key: 'pull_air_launch', label: 'his shape', say: (v) => `his pull-and-air launch shape rates ${v.toFixed(0)}` },
  { key: 'season_power_baseline', label: 'his power', say: (v) => `his season power baseline rates ${v.toFixed(0)}` },
  { key: 'pitcher_hr_damage', label: 'the arm', say: (v) => `the home runs this arm gives up rate ${v.toFixed(0)}` },
  { key: 'pitch_type_fit', label: 'the pitch mix', say: (v) => `the pitch mix he will see fits him at ${v.toFixed(0)}` },
  { key: 'park_weather', label: 'the air', say: (v) => `the park and the weather rate ${v.toFixed(0)}` },
  { key: 'lineup_opportunity', label: 'his spot', say: (v) => `his lineup opportunity rates ${v.toFixed(0)}` },
]

function ordSuffix(i) {
  const v = Number(i)
  return v % 10 === 1 && v % 100 !== 11 ? 'st' : v % 10 === 2 && v % 100 !== 12 ? 'nd' : v % 10 === 3 && v % 100 !== 13 ? 'rd' : 'th'
}

const compOf = (p, key) => {
  const c = p?.hr_shape_components
  return c && typeof c === 'object' ? num(c[key]) : null
}

/**
 * Percentile of `value` inside `values`, 0-1, as the share strictly below it
 * plus half the ties — the standard mid-rank definition, so a slate where
 * forty hitters share a value doesn't hand all forty the 100th percentile.
 */
export function percentileOf(value, values) {
  if (value == null || !values.length) return null
  let below = 0
  let equal = 0
  for (const v of values) {
    if (v < value) below += 1
    else if (v === value) equal += 1
  }
  return (below + equal / 2) / values.length
}

/**
 * What is carrying this pick, and what is working against it.
 *
 * @param p     the player row
 * @param pool  every row on the slate (the yardstick)
 * @param role  HR / TOP / HIT / HRR / CONTACT
 * @returns { drivers, top, against, n } or null when nothing measurable
 *          drivers: [{ key, label, value, pct, text }] sorted best first
 */
export function whyPick(p, pool = [], role = 'HR') {
  if (!p) return null
  const key = String(role || '').toUpperCase()
  const rows = (pool || []).filter(Boolean)
  const isHr = key === 'HR' || key === 'TOP'
  const specs = isHr
    ? HR_COMPONENTS.map((c) => ({ ...c, dir: +1, get: (r) => compOf(r, c.key) }))
    : (MARKET_DRIVERS[key] || []).map((d) => ({ ...d, get: (r) => num(r?.[d.key]) }))
  if (!specs.length) return null

  const drivers = []
  for (const s of specs) {
    const v = s.get(p)
    if (v == null) continue
    const vals = rows.map(s.get).filter((x) => x != null)
    // Under twenty comparable rows the slate is not a yardstick, so the
    // driver still prints its clause but claims no percentile.
    const raw = vals.length >= 20 ? percentileOf(v, vals) : null
    const pct = raw == null ? null : (s.dir >= 0 ? raw : 1 - raw)
    drivers.push({ key: s.key, label: s.label, value: v, pct, text: s.say(v, p), n: vals.length })
  }
  if (!drivers.length) return null

  const ranked = [...drivers].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
  const top = ranked.filter((d) => d.pct != null && d.pct >= 0.6).slice(0, 2)
  const worst = ranked[ranked.length - 1]
  // Only call something out as against it when it is genuinely poor AND the
  // pick isn't uniformly strong; a bottom-third reading on a card where every
  // driver is top-decile is not a warning, it's rounding.
  const against = worst && worst.pct != null && worst.pct <= 0.35 ? worst : null

  return { drivers: ranked, top, against, n: rows.length, market: key }
}

/** "top 8% of the slate" / "bottom 12%" — the phrase, or '' when unclaimable. */
export function standingPhrase(pct) {
  if (pct == null) return ''
  if (pct >= 0.5) {
    const t = Math.max(1, Math.round((1 - pct) * 100))
    return `top ${t}% of the slate`
  }
  const b = Math.max(1, Math.round(pct * 100))
  return `bottom ${b}% of the slate`
}

/**
 * Conviction: how far clear of its own category's field the lead pick sits,
 * in that category's own standard deviations. Comparing an hr_score to a
 * hit_score directly is meaningless — they are different models on different
 * spreads — but "how far clear of his own field" is the same question asked
 * of each, so the four answers CAN be ranked against each other.
 */
export function convictionOf(lead, pool, scoreOf) {
  const vals = (pool || []).map(scoreOf).filter((v) => Number.isFinite(v))
  const mine = scoreOf(lead)
  if (!Number.isFinite(mine) || vals.length < 3) return null
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
  const sorted = [...vals].sort((a, b) => b - a)
  const second = sorted[1]
  return {
    z: sd > 0 ? (mine - mean) / sd : 0,
    gap: Number.isFinite(second) ? mine - second : null,
    sd, mean, depth: vals.length,
  }
}
