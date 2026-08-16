// 🎯 HOMER SHAPE — what KIND of home run it was.
//
// 2026-08-11. Donovan has asked for this since the handoff: "line drive HR,
// fly ball HR, moonshots, lasers." It was unanswerable until today because
// every archived homer said `actual_hr: 1` and nothing about the ball. The
// backfill (bots/backfill_hr_events.py) attached launch speed, launch angle
// and distance to all 872 archived homers, and these bands come from that
// distribution — 801 homers with all three fields, across 60 nights.
//
// ── READ THIS BEFORE CHANGING A NUMBER ──────────────────────────────────
//
// THE BANDS ARE PERCENTILES, NOT PHYSICS. Both distributions are a single
// hump, not clusters. Launch angle runs 16-49° with the mass at 26-32°;
// distance runs 326-471ft with the mass at 390-420. Nothing in the data
// separates on its own, so these cuts are slices of one continuous blob and
// have to be described that way. Anyone reading 366 or 428 as a physical
// constant will draw a conclusion the data does not support.
//
//   wall-scraper   distance <366ft   p10     10.0%   med EV  99.1  med 356ft
//   laser          angle    <25°     p23     16.5%   med EV 107.1  med 394ft
//   standard       the middle                45.9%   med EV 103.9  med 403ft
//   moonshot       angle    >=34°    p79     16.5%   med EV 103.7  med 391ft
//   no-doubter     distance >=428ft  p90     11.1%   med EV 109.1  med 436ft
//
// Ordered so every homer lands in exactly one band, and the distance rules
// are tested FIRST: a 440ft ball at 36° is a no-doubter before it is a
// moonshot, because how far it went is the less ambiguous fact.
//
// WHY THE HANDOFF'S PROPOSED CUTS WERE DROPPED. It suggested laser <24°,
// moonshot >32° AND 400ft+, wall-scraper <360ft. Checked against the real
// distribution those leave 70.5% of homers — 565 of 801 — in no band at all.
// Worse, "moonshot" required BOTH high angle and 400ft+, and those two fight
// each other: distance peaks at 28-31° (406ft) and falls away above it, so
// homers at 34°+ travel a median 18ft SHORTER than the 25-34° group. Only 28%
// of 34°+ homers reach 400ft. A moonshot is HIGH, not FAR, and asking for
// both caught almost nothing.
//
// THE BANDS ARE REAL, not relabelled noise. A wall-scraper leaves the bat 8.0
// mph slower than a laser — it is a weakly hit ball that just cleared. And a
// laser and a moonshot land at effectively the same distance (394 vs 391ft)
// off 23° vs 36°: two genuinely different ways to reach the same fence, which
// is the distinction Donovan asked for in the first place.
//
// SAMPLE: 60 nights, 801 homers, ~/Desktop/results. Not the full season.

export const HR_BANDS = {
  'wall-scraper': { label: 'Wall-scraper', color: '#9ca3af', short: 'WALL',
    blurb: 'Just cleared — 8 mph slower off the bat than a laser. The park and the air did real work here.' },
  laser: { label: 'Laser', color: '#22d3ee', short: 'LASER',
    blurb: 'Low and hot — under 25°, and it still got out. Struck harder than any band but a no-doubter.' },
  standard: { label: 'Standard', color: '#a1a1aa', short: 'STD',
    blurb: 'The middle of the distribution — the shape most home runs actually are.' },
  moonshot: { label: 'Moonshot', color: '#a78bfa', short: 'MOON',
    blurb: 'High, not far. Steep homers travel a median 18ft SHORTER than flatter ones — height costs distance.' },
  'no-doubter': { label: 'No-doubter', color: '#fb923c', short: 'NODBT',
    blurb: 'Out of any park — top-decile distance and the hardest-struck band on the board.' },
}

// The percentile cuts, named so they can be re-derived rather than trusted.
export const HR_CUTS = { shortFt: 366, longFt: 428, flatDeg: 25, steepDeg: 34 }

const num = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/**
 * Which band a single homer falls in.
 * Takes an hr_events entry (or anything with launch_angle / total_distance).
 * Returns null when the ball was not tracked — never a guess, because an
 * untracked homer and a wall-scraper are different claims.
 */
export function hrShape(e) {
  const la = num(e?.launch_angle ?? e?.la)
  // `distance` added to the alias chain (2026-08-14): batted_ball_log rows
  // publish the field under that name, and without it the two distance
  // bands (wall-scraper / no-doubter) could never fire on a log row.
  const d = num(e?.total_distance ?? e?.dist ?? e?.distance)
  if (d == null && la == null) return null
  if (d != null && d < HR_CUTS.shortFt) return 'wall-scraper'
  if (d != null && d >= HR_CUTS.longFt) return 'no-doubter'
  if (la == null) return d == null ? null : 'standard'
  if (la < HR_CUTS.flatDeg) return 'laser'
  if (la >= HR_CUTS.steepDeg) return 'moonshot'
  return 'standard'
}

export const hrShapeMeta = (e) => {
  const k = hrShape(e)
  return k ? { key: k, ...HR_BANDS[k] } : null
}

/** One-line description of a tracked homer: "412ft · 106.3 mph · 31°". */
export function hrLine(e) {
  const bits = []
  const d = num(e?.total_distance ?? e?.dist)
  const v = num(e?.launch_speed ?? e?.ev)
  const la = num(e?.launch_angle ?? e?.la)
  if (d != null) bits.push(`${Math.round(d)}ft`)
  if (v != null) bits.push(`${v.toFixed(1)} mph`)
  if (la != null) bits.push(`${Math.round(la)}°`)
  return bits.join(' · ')
}

/**
 * The mix across a set of homers, as counts and shares.
 *
 * CAUTION, and it is the reason this is not wired into any score: a per-hitter
 * mix needs a sample this archive does not have. Across 60 nights the median
 * hitter has TWO tracked homers and only 87 have four or more — at that size a
 * single wall-scraper swings a hitter's "mix" by 25 points. Use this for a
 * population (a team, a park, the bot's own picks), not for one bat, until
 * season Statcast is joined in via spray_cache.
 */
export function shapeMix(events = []) {
  const out = { total: 0 }
  Object.keys(HR_BANDS).forEach((k) => { out[k] = 0 })
  ;(events || []).forEach((e) => {
    const k = hrShape(e)
    if (!k) return
    out[k] += 1
    out.total += 1
  })
  return out
}

// ── PERSONAL HR SHAPE (2026-08-14) ──────────────────────────────────────────
//
// Donovan: "each player needs to be categorized by the homers they hit this
// season... Schwarber lasers, James Wood moonshots... maybe it will help
// figure out when a certain batter is in their form — not the overall shape
// but their personal shape."
//
// This is the season-Statcast join the shapeMix() caution above was waiting
// for: batted_ball_log (spray_cache's per-ball season log, already on every
// bot-file player) carries launch angle, distance and is_hr per ball, so a
// hitter's own homer mix is finally computable at a real sample size instead
// of the archive's median-two-homers-per-hitter.
//
// TWO HALVES, SAME DEFINITIONS AS THE BOT (mlb_dashboard.py computes and
// archives the identical numbers nightly under hr_shape_profile /
// personal_shape_* — keep the two implementations in sync BY HAND):
//
//   personalShape(log)     his signature: homer counts per band, plus his own
//                          homer launch-angle window (median ± max(4°, half
//                          the IQR) — the 4° floor stops a 4-homer IQR from
//                          collapsing the window to nothing).
//   personalFormRead(log)  is he in HIS form: of hard-hit balls (95+, the EV
//                          floor a homer basically requires), the share
//                          leaving the bat inside HIS window — recent (last 8
//                          game dates in the log, mirroring the bot's recent
//                          window) minus season. Positive = trending toward
//                          the shape his homers actually take.
//
// HONESTY RULES, same as everything else in this file: the signature needs
// 4+ shaped homers before a mix is a claim (status 'thin_hr' below that,
// 'no_hr' at zero); the form read additionally needs 5+ recent hard-hit
// balls ('thin_recent' below that). And the form read is DESCRIPTIVE — the
// generic version of this idea (a player's aggregate barrel rate) does not
// predict which night he homers (p=0.58 on the graded archive), so the
// personal version earns its way into any score from the archived nightly
// field, or not at all.

const isHrRow = (b) => !!(b?.is_hr || String(b?.result || b?.event || '') === 'home_run')

/**
 * THE FLOOR UNDER A MIX, IN ONE PLACE.
 *
 * Four band-classified homers. Below it a "mix" is one swing from flipping —
 * at three homers a single wall-scraper moves the mix by 33 points — so under
 * this bar the counts may be shown and NO type may be claimed.
 *
 * It was already the number personalFormRead() gated 'thin_hr' on and the
 * number the modal panel gates its share percentages on; both had it written
 * as a bare 4. It is a constant now because the Shape board needs the same
 * bar, and three copies of a literal 4 is how two surfaces end up disagreeing
 * about whether a hitter has a shape at all. (components/HomerShape.js still
 * carries its own `f.n < 4`; that file was held by another worker when this
 * landed and should adopt SHAPE_MIN_N on its next edit — the VALUE is
 * identical today, so nothing disagrees, but the literal is a drift risk.)
 */
export const SHAPE_MIN_N = 4

/**
 * The bot publishes the same five bands under snake_case keys inside
 * `hr_shape_profile`; this file names them with hyphens because that is what
 * hrShape() has returned since day one. One map, so no caller has to guess
 * whether it is 'no-doubter' or 'no_doubter' — the two spellings are the
 * single most likely way a board silently reads zero homers for everybody.
 */
export const PROFILE_FIELD = {
  'wall-scraper': 'wall_scraper',
  laser: 'laser',
  standard: 'standard',
  moonshot: 'moonshot',
  'no-doubter': 'no_doubter',
}

/**
 * His type, from a mix — the ONE definition of "he is a laser hitter".
 *
 * Takes the `mix` array that personalShape() builds from a batted-ball log AND
 * the one profileMix() builds from the bot's published counts, so the modal
 * panel and any board are answering the question with the same arithmetic
 * rather than each rolling its own argmax.
 *
 * Returns null — never a band — in the two cases where the answer is "you
 * cannot say":
 *   · n < SHAPE_MIN_N. Reason 'thin'.
 *   · the top two bands are LEVEL. Reason 'tied'. On the verified slate this
 *     is 24 of the 222 hitters over the floor, which is far too many to break
 *     with a rule like "moonshot beats standard" — a tiebreak there would be
 *     inventing a lean out of a coin flip. They are named as tied instead.
 */
export function dominantBand(mix = [], n = 0) {
  if (!(n >= SHAPE_MIN_N)) return null
  const sorted = [...(mix || [])].filter((m) => m.count > 0).sort((a, b) => b.count - a.count)
  if (!sorted.length) return null
  if (sorted.length > 1 && sorted[1].count === sorted[0].count) {
    return { key: null, reason: 'tied', tied: sorted.filter((m) => m.count === sorted[0].count) }
  }
  return { ...sorted[0], reason: 'top' }
}

/**
 * The bot's published per-hitter homer profile → the same shape personalShape()
 * returns from a raw log.
 *
 * `hr_shape_profile` is mlb_dashboard.py's nightly archive of exactly the
 * computation personalShape() does browser-side off batted_ball_log (see the
 * PERSONAL HR SHAPE note above — the two are kept in sync by hand). A board
 * cannot run the browser-side version: batted_ball_log lives in the per-player
 * DETAIL file, so a 266-row board would need 266 fetches to build one column.
 * The published counts are the same numbers without the 266 requests.
 *
 * Accepts either the profile object itself or a whole slate row, because
 * calling it with the row is the obvious mistake and returning an empty mix
 * for a hitter who has one is worse than being permissive here.
 */
export function profileMix(input) {
  const prof = (input && typeof input === 'object' && input.hr_shape_profile) ? input.hr_shape_profile : input
  const counts = {}
  Object.keys(HR_BANDS).forEach((k) => { counts[k] = num(prof?.[PROFILE_FIELD[k]]) || 0 })
  const summed = Object.values(counts).reduce((a, v) => a + v, 0)
  // `n` PUBLISHED, NOT RE-SUMMED — but only when the two agree. The profile
  // carries its own n; if it ever disagreed with the five counts, silently
  // preferring either one would hide a broken payload. The sum is the number
  // the mix is actually built from, so that is what the shares divide by, and
  // the disagreement is published on the object for a caller to say out loud.
  const published = num(prof?.n)
  const n = summed
  const mix = Object.keys(HR_BANDS)
    .filter((k) => counts[k] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .map((k) => ({ key: k, ...HR_BANDS[k], count: counts[k], share: n ? counts[k] / n : 0 }))
  return {
    n,
    counts,
    mix,
    nMismatch: published != null && published !== summed,
    // His own homer launch-angle window, median ± max(4°, half the IQR) — the
    // same window personalShape() derives, archived by the bot as la_lo/la_hi.
    // It is what personal_shape_match measures recent contact against, so a
    // board quoting the delta should be able to show the window it is a delta
    // against.
    laLo: num(prof?.la_lo),
    laHi: num(prof?.la_hi),
    dominant: dominantBand(mix, n),
  }
}

/**
 * The reference mix: every tracked homer on the slate, pooled.
 *
 * WHY POOLED-FROM-THE-SLATE RATHER THAN THE PERCENTILE CUTS AT THE TOP OF THIS
 * FILE. The bands were cut at p10/p23/p79/p90 of a 60-night archive, so the
 * archive's shares are 10.0 / 16.5 / 45.9 / 16.5 / 11.1 by construction. Those
 * are a fine baseline and hard-coding them would work — but they would be a
 * constant that can drift away from whatever the bot is publishing today, and
 * the whole point of a baseline is that it is the same measurement as the
 * thing measured against it. Pooling the slate's own homers costs nothing and
 * cannot drift.
 *
 * It is also a check on the bands: on the verified 266-row slate this pools to
 * 10.4 / 16.4 / 46.6 / 15.4 / 11.2 across 3,125 homers — within 1.1 points of
 * the archive percentiles on every band. The cuts reproduce.
 *
 * Every hitter's homers count, including hitters under SHAPE_MIN_N. The floor
 * is a rule about describing a PERSON; a homer is evidence about the league
 * whoever hit it.
 */
export function slateShapeMix(rows = []) {
  const counts = {}
  Object.keys(HR_BANDS).forEach((k) => { counts[k] = 0 })
  let hitters = 0
  ;(rows || []).forEach((p) => {
    const prof = p?.hr_shape_profile
    if (!prof) return
    let any = false
    Object.keys(HR_BANDS).forEach((k) => {
      const v = num(prof?.[PROFILE_FIELD[k]]) || 0
      counts[k] += v
      if (v > 0) any = true
    })
    if (any) hitters += 1
  })
  const total = Object.values(counts).reduce((a, v) => a + v, 0)
  const shares = {}
  Object.keys(HR_BANDS).forEach((k) => { shares[k] = total ? counts[k] / total : 0 })
  return { total, hitters, counts, shares }
}

/**
 * ── IS THE BOT PUBLISHING ANY OF THIS? ──────────────────────────────────────
 *
 * Same guard shape as blankDataPublished() in lib/blankBoard.js, and for the
 * same reason: the bot deploys on its own schedule from another repo, so the
 * failure that actually bites is not a broken file, it is a perfectly valid
 * slate from a bot that predates the fields a lens reads. Without this the
 * Shape board would render 266 hitters with an empty mix and a dash in every
 * column, which reads as "nobody on this slate has a homer shape" — a claim,
 * and a false one.
 *
 * n > 0 rather than "the key exists", because an all-zero profile on every row
 * is the same nothing wearing a different hat.
 */
export function shapeDataPublished(rows = []) {
  return (rows || []).some((p) => num(p?.hr_shape_profile?.n) > 0)
}

/**
 * And the SECOND guard, deliberately separate — the exact split
 * blankBoard.js draws between blankDataPublished and controlPublished.
 *
 * The mix (hr_shape_profile) and the form read (personal_shape_*) are two
 * different bot computations that shipped together but need not arrive
 * together. A slate with profiles and no form read is a real state, and it
 * must lose the form columns and say so, not fill them with the zeros the
 * next function is about.
 */
export function shapeFormPublished(rows = []) {
  return (rows || []).some((p) => String(p?.personal_shape_status || '') === 'ok')
}

/**
 * ── ZERO IS NOT THE SAME FACT AS "NO READING" ───────────────────────────────
 *
 * personalFormRead() returns `match: null` when the hitter has no launch-angle
 * window. The bot's JSON does not: on the verified slate all 266 rows carry a
 * personal_shape_match, and 31 of them are exactly 0.0 — of which 6 are hitters
 * with NO tracked homer at all and 23 more are under the mix floor. Their
 * recent and season rates are 0.0 too. Those zeros are a serialiser writing
 * null as 0, not a hitter sitting dead level with himself.
 *
 * personal_shape_status is what tells them apart, and it does so cleanly:
 *   no_hr        (6)   no tracked homer — every number is a placeholder zero
 *   thin_hr      (38)  under SHAPE_MIN_N tracked homers; 23 of them all-zero,
 *                      the other 15 carry a real-looking delta computed off a
 *                      window derived from three homers
 *   thin_recent  (30)  window is fine, fewer than 5 recent hard-hit balls
 *                      under the recent half of the delta
 *   ok           (192) both halves have a sample
 *
 * ONLY 'ok' YIELDS A NUMBER, which is exactly what the modal panel does — it
 * prints the recent-vs-season sentence for 'ok', "too few recent hard-hit
 * balls" for 'thin_recent', and nothing at all below that. Two of the 192 'ok'
 * rows are a genuine 0.0, and those two are the only rows on the slate allowed
 * to render as level.
 *
 * `raw` keeps whatever the bot published so no caller has to refetch it to
 * show the reader what was thrown away.
 */
/**
 * How far the recent-minus-season delta has to move before it is worth a word.
 *
 * 0.08 = eight percentage points of his hard-hit contact landing inside his own
 * homer launch window. The modal panel has used this bar since the panel
 * shipped (its `inForm` / `outForm` literals); it is a constant now so the
 * board cannot call a hitter "trending" at a delta the modal calls "about his
 * norm" four inches away in his own card.
 */
export const SHAPE_FORM_EDGE = 0.08

/**
 * THE THREE THINGS A DELTA IS ALLOWED TO BE CALLED, IN ONE PLACE.
 *
 * The modal panel (components/HomerShape.js) prints "trending toward his
 * shape" / "away from his shape lately" / "about his norm" off two literal
 * 0.08 comparisons. The Shape board has to say the same three things about the
 * same number, and a board and a card four inches apart disagreeing about
 * whether a hitter is trending is the exact failure SHAPE_MIN_N and
 * SHAPE_FORM_EDGE were made constants to prevent — so the WORDS get a single
 * definition too, not just the threshold.
 *
 * Takes the gated match (shapeForm().match), i.e. null unless status is 'ok'.
 * Returns null for null, so a caller cannot accidentally call a missing
 * reading "about his norm" — which would be a claim about a hitter the bot
 * refused to read.
 *
 * `tone` is a NAME, not a colour: this file has no business importing the
 * theme (it is imported by lib code as well as components), and the caller
 * knows which palette it is drawing in. 'toward' and 'away' are directions,
 * not grades — nothing here says toward is better, because nothing has graded
 * whether it is.
 */
export function formVerdict(match) {
  if (match == null || !Number.isFinite(match)) return null
  if (match >= SHAPE_FORM_EDGE) return { key: 'toward', tone: 'toward', label: 'trending toward his shape', short: 'toward' }
  if (match <= -SHAPE_FORM_EDGE) return { key: 'away', tone: 'away', label: 'away from his shape lately', short: 'away' }
  return { key: 'norm', tone: 'norm', label: 'about his norm', short: 'norm' }
}

export function shapeForm(row) {
  const status = String(row?.personal_shape_status || '')
  const raw = {
    match: num(row?.personal_shape_match),
    recentRate: num(row?.personal_shape_recent_rate),
    seasonRate: num(row?.personal_shape_season_rate),
  }
  const readable = status === 'ok'
  return {
    status,
    readable,
    raw,
    match: readable ? raw.match : null,
    recentRate: readable ? raw.recentRate : null,
    // The SEASON rate survives 'thin_recent' on purpose: that status is a
    // statement about the recent window only (fewer than 5 hard-hit balls in
    // the last 8 dates), and the season half of the comparison is built on his
    // whole log. Killing it too would throw away a number that is fine.
    seasonRate: (readable || status === 'thin_recent') ? raw.seasonRate : null,
  }
}

/**
 * ── THE BOT'S OWN "DO NOT TRUST THIS SHAPE" FLAG ────────────────────────────
 *
 * `hr_unreliable_shape_flag` rides on every slate row and, before the Shape
 * board, was read by nothing in this repo. It is set bot-side and this file
 * cannot see the rule, so what follows is what the flag DOES on the verified
 * slate rather than a claim about what it means:
 *
 *   9 of 266 rows are flagged. Every one of them is a low-launch ground-ball
 *   bat with a handful of homers — 1 to 7 tracked homers, average launch angle
 *   between −5° and 7.4° (the unflagged median is 15.3°), ground-ball rate .52
 *   to .69, and HR/PA under .038. No single published field reproduces the set
 *   (avg_la < 8 catches all 9 and 38 others), so it is a bot-side judgement,
 *   not something to re-derive here.
 *
 * It is NOT redundant with SHAPE_MIN_N: 5 of the 9 clear the floor (n of 4, 6,
 * 6, 7 and 7), and 3 of those 5 are at status 'ok' — i.e. without this veto
 * they would each be handed a claimed type AND a live form reading. So it is
 * respected as an independent veto: a flagged hitter gets his counts shown and
 * no type claimed, at any n. (Recounted 2026-08-16 against the fixture while
 * the Shape board was being built; this note previously said 3 of 9 and two at
 * 'ok', which undercounted the veto's reach by two hitters.)
 */
export const shapeUnreliable = (row) => !!row?.hr_unreliable_shape_flag

/**
 * Everything one slate row can honestly say about its homer shape, in one
 * object, so a board never re-implements a gate.
 *
 * `base` is a slateShapeMix() result. `lean` is the band this hitter is most
 * OVER the slate on, in percentage points — see the Shape board for why a
 * plurality alone answers almost nothing (168 of the 222 hitters over the
 * floor are plurality-standard, because standard is 46% of all homers).
 */
export function shapeRead(row, base = null) {
  const m = profileMix(row)
  const form = shapeForm(row)
  const unreliable = shapeUnreliable(row)
  const thin = m.n < SHAPE_MIN_N
  // A type is claimable only above the floor AND without the bot's veto.
  const dominant = unreliable ? null : m.dominant
  let lean = null
  if (base && base.total > 0 && !thin && !unreliable) {
    let best = null
    m.mix.forEach((x) => {
      const over = x.share - (base.shares[x.key] || 0)
      if (!best || over > best.over) best = { ...x, over }
    })
    lean = best
  }
  return { ...m, form, unreliable, thin, dominant, lean }
}

/**
 * WHAT TO CALL A HITTER WHO HAS NO TYPE — which is most of them.
 *
 * shapeRead() decides whether a type is CLAIMABLE; this decides what the
 * surface says when it is not, and that is the harder half. Of 266 hitters on
 * the verified slate only 194 get a band: 6 have no tracked homer, 38 are
 * under SHAPE_MIN_N, 24 are level between their top two bands, and 4 more
 * clear the floor and are untied but carry the bot's unreliable flag (5 flagged
 * hitters clear the floor; one of them was already counted as tied). Four
 * different reasons
 * for an empty cell, and a board that renders all four as a dash is telling
 * the reader "no shape" four times when the honest answers are "he has none
 * yet", "too few to say", "he is two things at once" and "the bot does not
 * trust this one".
 *
 * Every branch names the COUNT, because the count is the whole argument for
 * why the cell is empty — "too thin (2 HR)" is checkable and "—" is not.
 *
 * Returns { key, text, color, why }. `color` is a band colour when a band is
 * being named and null otherwise, so a caller never paints a non-answer in a
 * band's colour; `text` always stands alone in words, so colour is never
 * carrying the meaning by itself.
 */
export function typeLabel(read) {
  const nn = read?.n || 0
  if (read?.unreliable) {
    return { key: 'unreliable', color: null, text: `not read (${nn} HR)`,
      why: `The bot flagged this hitter's shape as unreliable (hr_unreliable_shape_flag) — on the verified slate every flagged bat is a low-launch ground-ball hitter. His counts are shown; no type is claimed at any sample size.` }
  }
  if (nn === 0) {
    return { key: 'none', color: null, text: 'no tracked HR',
      why: 'No homer of his has been classified into a band, so there is no mix to describe. Not a shape — an absence of one.' }
  }
  if (nn < SHAPE_MIN_N) {
    return { key: 'thin', color: null, text: `too thin (${nn} HR)`,
      why: `Under ${SHAPE_MIN_N} classified homers one ball swings the mix by 25-33 points, so the counts are shown and no type is claimed.` }
  }
  const d = read?.dominant
  if (!d) {
    return { key: 'thin', color: null, text: `too thin (${nn} HR)`, why: 'No band has a homer in it.' }
  }
  if (d.reason === 'tied') {
    const names = (d.tied || []).map((t) => t.label).join(' / ')
    return { key: 'tied', color: null, text: `tied: ${names}`,
      why: `His top two bands are level on ${d.tied?.[0]?.count ?? 0} homers each. Breaking a tie with a rule would be inventing a lean out of a coin flip, so both are named.` }
  }
  return { key: d.key, color: d.color, text: d.label,
    why: `${d.count} of his ${nn} classified homers are ${d.label.toLowerCase()}s — his most common band. ${d.blurb}` }
}

export function personalShape(log = []) {
  const counts = {}
  Object.keys(HR_BANDS).forEach((k) => { counts[k] = 0 })
  const las = []
  ;(log || []).forEach((b) => {
    if (!isHrRow(b)) return
    const k = hrShape(b)
    if (k) counts[k] += 1
    const la = num(b?.launch_angle ?? b?.la)
    if (la != null) las.push(la)
  })
  const n = Object.values(counts).reduce((a, v) => a + v, 0)
  let laLo = null
  let laHi = null
  if (las.length >= 3) {
    const s = [...las].sort((a, b) => a - b)
    const m = s.length
    const med = m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2
    const q1 = s[Math.floor(0.25 * (m - 1))]
    const q3 = s[Math.floor(0.75 * (m - 1))]
    const half = Math.max(4, (q3 - q1) / 2)
    laLo = med - half
    laHi = med + half
  }
  // Bands with at least one homer, biggest first — the render order.
  const mix = Object.keys(HR_BANDS)
    .filter((k) => counts[k] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .map((k) => ({ key: k, ...HR_BANDS[k], count: counts[k], share: n ? counts[k] / n : 0 }))
  return { n, counts, mix, laLo, laHi }
}

export function personalFormRead(log = [], sig = null) {
  const s = sig || personalShape(log)
  if (s.laLo == null) {
    return { ...s, status: s.n === 0 ? 'no_hr' : 'thin_hr', match: null, recentRate: null, seasonRate: null, recentDen: 0 }
  }
  const rows = (log || []).filter((b) => num(b?.ev) != null && num(b?.launch_angle ?? b?.la) != null)
  const dates = [...new Set(rows.map((b) => String(b?.date || '')).filter(Boolean))].sort()
  const recentDates = new Set(dates.slice(-8))
  const rate = (list) => {
    const hard = list.filter((b) => num(b?.ev) >= 95)
    if (!hard.length) return { rate: 0, den: 0 }
    const inw = hard.filter((b) => {
      const la = num(b?.launch_angle ?? b?.la)
      return la >= s.laLo && la <= s.laHi
    })
    return { rate: inw.length / hard.length, den: hard.length }
  }
  const season = rate(rows)
  const recent = rate(rows.filter((b) => recentDates.has(String(b?.date || ''))))
  return {
    ...s,
    // SHAPE_MIN_N, not a bare 4 (2026-08-16). Same number, one definition —
    // the Shape board gates its type column on the same constant, and the bot
    // gates the status string it publishes on the same rule.
    status: s.n >= SHAPE_MIN_N && recent.den >= 5 ? 'ok' : s.n >= SHAPE_MIN_N ? 'thin_recent' : 'thin_hr',
    seasonRate: season.rate,
    recentRate: recent.rate,
    match: recent.rate - season.rate,
    recentDen: recent.den,
    seasonDen: season.den,
  }
}
