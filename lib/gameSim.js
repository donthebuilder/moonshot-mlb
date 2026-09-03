// lib/gameSim.js — the GAME SIMULATOR (2026-09-03)
//
// Donovan: "i want my own game simulator."
//
// WHAT THIS IS, AND WHY IT IS NOT `components/GameSimulator.js`.
// That file (2026-08-24) is a closed-form PROJECTION panel: it takes one
// pitcher and one batter, applies a fixed 5.2 IP / 4.3 PA exposure, and prints
// expectations plus a Poisson K bar. It never plays a game. It has no innings,
// no baserunners, no score, and it cannot tell you who wins.
//
// This plays the game. Plate appearance by plate appearance, nine innings (or
// extras), a real base-out state machine, a starter who tires and gets pulled,
// a bullpen that finishes it, and a box score at the end with the same columns
// the real one has. Run it N times and you get the thing a single box score
// cannot give you: a distribution.
//
// NO NEW BACKEND. Every input is a field already on the slate row this app
// fetches. Nothing here calls a stats API.
//
//   batter   season_avg, season_obp, season_slg, season_iso, season_pa,
//            season_ab, season_hr, season_doubles, season_triples,
//            season_k_rate, season_bb_rate, season_sb_attempt_rate,
//            lineup_spot, bats, team, game_pk
//   pitcher  pitcher_k_rate, pitcher_bb_pct, pitcher_hr9, pitcher_babip,
//            pitcher_whip, pitcher_era, pitcher_gb_rate, pitcher_throws,
//            and the handedness splits pitcher_hr9_vs_lhb / _vs_rhb
//   bullpen  bullpen_era, bullpen_whip, bullpen_hr9, bullpen_quality
//   context  park_hr_factor, park_hits_factor, weather_hr_effect_pct, roof
//
// THE ONE HONEST GAP: relief arms are not published individually. The slate
// gives a TEAM bullpen line and nothing else — no names, no roles, no
// handedness. So the sim's relievers are the same modelled arm pitching
// consecutive innings, and the box score labels them "BULLPEN 1..n" rather
// than inventing six names it does not have. Everything else is a real rate.

// Which club owns which yard. The slate publishes `venue_name` but NO home/away
// flag, and the difference is not cosmetic: the home side does not bat in the
// bottom of the ninth with a lead, which is why real box scores show one team
// with eight at-bats' worth of innings and not nine. Without this table the sim
// gives the wrong team that inning half the time.
export const HOME_PARK = {
  ARI: 'Chase Field', ATL: 'Truist Park', BAL: 'Oriole Park at Camden Yards',
  BOS: 'Fenway Park', CHC: 'Wrigley Field', CWS: 'Rate Field', CIN: 'Great American Ball Park',
  CLE: 'Progressive Field', COL: 'Coors Field', DET: 'Comerica Park', HOU: 'Daikin Park',
  KC: 'Kauffman Stadium', LAA: 'Angel Stadium', LAD: 'Dodger Stadium', MIA: 'loanDepot park',
  MIL: 'American Family Field', MIN: 'Target Field', NYM: 'Citi Field', NYY: 'Yankee Stadium',
  ATH: 'Sutter Health Park', PHI: 'Citizens Bank Park', PIT: 'PNC Park', SD: 'Petco Park',
  SF: 'Oracle Park', SEA: 'T-Mobile Park', STL: 'Busch Stadium', TB: 'Tropicana Field',
  TEX: 'Globe Life Field', TOR: 'Rogers Centre', WSH: 'Nationals Park',
}
// Matched loosely: the slate has renamed yards mid-season before (Dodger
// Stadium is publishing as "UNIQLO Field at Dodger Stadium" tonight), so a
// substring match in either direction beats an equality test that silently
// flips the home team when a sponsor changes.
const sameVenue = (a, b) => {
  if (!a || !b) return false
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, '')
  const x = norm(a), y = norm(b)
  return x.includes(y) || y.includes(x)
}

const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d }

// League baselines, 2026. Every blend below is measured against these, so they
// are stated once, here, rather than buried as magic numbers in the math.
export const LG = {
  K: 0.225, BB: 0.085, HBP: 0.011, HR: 0.032, BABIP: 0.292,
  PA_PER_INNING: 4.3, PITCHES_PER_PA: 3.9,
}

// log5 / odds-ratio. THE standard way to combine a batter rate and a pitcher
// rate against a league mean — the same construction Bill James published for
// win probability and the one every public sim uses. Not a weighted average:
// a .300 hitter facing a pitcher who allows .200 should land BELOW the midpoint
// of the two, and an average blend gets that wrong in both tails.
const log5 = (b, p, lg) => {
  if (!(lg > 0 && lg < 1)) return b
  const x = (b * p) / lg
  const y = ((1 - b) * (1 - p)) / (1 - lg)
  const t = x + y
  return t > 0 ? Math.min(0.95, Math.max(0.001, x / t)) : b
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// A staff of more than six is not a baseball game, it is a bookkeeping error.
const MAX_ARMS = 6

// HOME FIELD — the one number here that is not derived from a published field.
//
// Everything else in this engine comes off the slate row. This does not: no
// field on the payload says "home teams win more," and yet they do, at about
// 53-54% across the modern era. Left out entirely, the sim's home sides won
// 47% of tonight's fifteen games. Rather than bury the correction in a rate,
// it is stated here as what it is — an empirical constant, applied as a ~2%
// bump to the home side's contact quality, which is worth roughly +3pp of win
// probability. If you would rather the sim make no claim it cannot source,
// set this to 1 and the home team simply loses those three points.
export const HFA = 1.03

// THE RUNNING GAME (2026-09-03, second pass).
//
// The first build had no steals, no errors and no wild pitches, and came in
// ~0.5 runs a game light against MLB's ~8.6. Those three are how a real inning
// manufactures a run without a hit, and every input for them is already on the
// slate row — the same fields the steal board reads.
//
//   attempt    season_sb_attempt_rate   (per OPPORTUNITY, not per PA — median
//                                        0.067 tonight, which is MLB's ~7%)
//   success    season_sb / (season_sb + season_cs), blended against the
//              catcher's opp_catcher_cs_rate and the pitcher's own
//              sb_against / sb_attempts_against
//   wild pitch pitcher_wp9
//   error      opp_def_success_rate / opp_def_oaa
//
// One published field is missing on 42 of tonight's 261 rows:
// `opp_catcher_cs_rate` (the catcher feed outage). Where it is null the runner
// is judged on his own record and the league mean, never on a zero — a missing
// catcher must not read as a catcher who never throws anybody out.
export const RUN = {
  LG_ATTEMPT: 0.07,     // the published field's own league median
  LG_SUCCESS: 0.785,    // league SB success rate
  LG_CS: 0.20,          // league caught-stealing rate for a catcher
  LG_ERROR: 0.033,      // errors per ball in play
  BREAK_EVEN: 0.75,     // below this, running costs more than it gains
  // ATTEMPT_SCALE — an admitted fit, and the only one in this file.
  //
  // `season_sb_attempt_rate` is published without its denominator documented.
  // Used at face value it produced 0.67 steals a game against MLB's ~1.45, so
  // whatever it divides by, it is not "times on first with second open" —
  // probably all times on base. Rather than invent a denominator I cannot
  // verify, the rate is scaled until the sim reproduces the league's steal
  // count, and the fitted number is named here where you can see it. If the
  // bot ever publishes attempts and opportunities separately, delete this.
  ATTEMPT_SCALE: 1.27,
}

// REGRESSION TO THE MEAN — the fix that mattered most.
//
// The first working build had Brian Serven, a backup catcher, homering in 40%
// of simulated games. Nothing was wrong with the engine: he simply had a
// handful of homers in a handful of trips, `season_hr / season_pa` read as an
// enormous rate, and log5 faithfully amplified it. A simulator that takes small
// samples at face value will always hand its loudest result to its least
// established player.
//
// So every batter rate is pulled toward league by its own stabilisation point —
// the PA count at which that statistic is roughly half signal. These are the
// published Statcast/FanGraphs figures, not tuned numbers: K% ~60 PA, BB% ~120,
// HR/PA ~170, BABIP ~820 balls in play (the slowest-stabilising rate in the
// sport, which is exactly why it is the one people most often over-read).
export const STABILISE = { K: 60, BB: 120, HR: 170, BABIP: 820, RATE: 300 }
const shrink = (rate, pa, lg, k) => {
  if (!Number.isFinite(rate)) return lg
  const w = Math.max(n(pa, 0), 0)
  return (rate * w + lg * k) / (w + k)
}

/**
 * Per-PA outcome probabilities for one batter against one pitcher, in one park,
 * in tonight's weather. Returns probabilities that sum to 1 across
 * K / BB / HBP / HR / 3B / 2B / 1B / OUT_IN_PLAY.
 */
export const paRates = (bat, pit, ctx = {}) => {
  const pa = Math.max(n(bat.season_pa, 1), 1)

  // --- the three true outcomes, blended log5 -------------------------------
  const k = log5(clamp(shrink(n(bat.season_k_rate, LG.K), pa, LG.K, STABILISE.K), 0.02, 0.6),
                 clamp(n(pit.k_rate, LG.K), 0.02, 0.5), LG.K)
  const bb = log5(clamp(shrink(n(bat.season_bb_rate, LG.BB), pa, LG.BB, STABILISE.BB), 0.005, 0.3),
                  clamp(n(pit.bb_rate, LG.BB), 0.005, 0.3), LG.BB)

  // HR uses the pitcher's SAME-HANDEDNESS rate when it is published, because
  // hr9_vs_lhb / _vs_rhb are on the row and a lefty-mashing arm is the single
  // biggest platoon effect in the game. hr9 -> HR/PA divides by the batters a
  // pitcher faces in nine innings, not by nine.
  const hand = String(bat.bats || 'R').toUpperCase().startsWith('L') ? 'L' : 'R'
  const hr9 = n(hand === 'L' ? pit.hr9_vs_lhb : pit.hr9_vs_rhb, 0) || n(pit.hr9, 1.15)
  const pHR9 = clamp(hr9 / 9 / LG.PA_PER_INNING, 0.004, 0.12)
  const bHR = clamp(shrink(n(bat.season_hr, 0) / pa, pa, LG.HR, STABILISE.HR), 0.001, 0.12)
  let hr = log5(bHR, pHR9, LG.HR)

  // Park and air. park_hr_factor is indexed to 1.00; weather_hr_effect_pct is
  // the bot's own published percentage and is exactly the right thing here —
  // unlike on the triples board, wind blowing out IS the home-run mechanism.
  hr *= clamp(n(ctx.park_hr_factor, 1), 0.7, 1.45)
  hr *= 1 + clamp(n(ctx.weather_hr_effect_pct, 0) / 100, -0.2, 0.25)
  if (ctx.isHome) hr *= HFA
  hr = clamp(hr, 0.001, 0.15)

  // --- balls in play -------------------------------------------------------
  const rest = Math.max(0.02, 1 - k - bb - LG.HBP - hr)
  const babip = clamp(log5(clamp(shrink(n(bat.season_babip, LG.BABIP), n(bat.season_ab, pa), LG.BABIP, STABILISE.BABIP), 0.18, 0.42),
                           clamp(n(pit.babip, LG.BABIP), 0.18, 0.42), LG.BABIP)
                      * clamp(n(ctx.park_hits_factor, 1), 0.85, 1.15)
                      * (ctx.isHome ? HFA : 1), 0.18, 0.42)
  const hitsInPlay = rest * babip

  // Split those hits into 1B / 2B / 3B by the batter's OWN season shape. This
  // is where lib/triples.js's subject lives: a man with 8 triples in 500 PA
  // legs one out here at his real rate, and a catcher with none never does.
  const h = Math.max(n(bat.season_hits, n(bat.season_avg) * n(bat.season_ab)), 1)
  const d2 = n(bat.season_doubles), d3 = n(bat.season_triples), bhr = n(bat.season_hr)
  // The 1B/2B/3B split gets the same treatment, blended toward the league shape
  // (roughly 68/26/2 of non-homer hits) so a 30-PA callup with one double does
  // not simulate as a doubles machine.
  const kS = STABILISE.RATE
  const s1 = Math.max(h - d2 - d3 - bhr, 1)
  const raw = s1 + d2 + d3
  const wS = raw / (raw + kS), wL = 1 - wS
  const f1 = wS * (s1 / Math.max(raw, 1)) + wL * 0.72
  const f2 = wS * (d2 / Math.max(raw, 1)) + wL * 0.26
  const f3 = wS * (d3 / Math.max(raw, 1)) + wL * 0.02
  const base = 1
  const tot = f1 + f2 + f3
  const p3 = hitsInPlay * (f3 / tot), p2 = hitsInPlay * (f2 / tot)
  const p1 = hitsInPlay - p2 - p3

  return {
    K: k, BB: bb, HBP: LG.HBP, HR: hr,
    T: p3, D: p2, S: p1,
    OUT: Math.max(0, rest - hitsInPlay),
    gb: clamp(n(pit.gb_rate, 0.43), 0.2, 0.65),
  }
}

// Steal chance for the man on first, given the battery he is running on.
const stealOdds = (bat, pit) => {
  const att = shrink(clamp(n(bat.season_sb_attempt_rate, RUN.LG_ATTEMPT), 0, 0.6),
                     n(bat.season_pa, 0), RUN.LG_ATTEMPT, 150)
  const sb = n(bat.season_sb, 0), cs = n(bat.season_cs, 0)
  const own = shrink(sb + cs > 0 ? sb / (sb + cs) : RUN.LG_SUCCESS, sb + cs, RUN.LG_SUCCESS, 12)
  // The catcher's arm, when the feed has one. `null` is not zero: a missing
  // caught-stealing rate must not read as a catcher who never throws anybody
  // out, so it falls back to the league mean and the runner keeps his own record.
  const cRate = Number.isFinite(Number(pit.catcher_cs)) ? clamp(n(pit.catcher_cs), 0.02, 0.45) : RUN.LG_CS
  // The pitcher holds runners too — sb_against over attempts_against is his
  // measured share of the job, and an arm nobody runs on gets the benefit.
  const pAtt = n(pit.sb_attempts_against, 0)
  const pHold = pAtt >= 5 ? clamp(n(pit.sb_against, 0) / pAtt, 0.3, 1) : RUN.LG_SUCCESS
  const success = clamp((own * 0.5) + ((1 - cRate) * 0.3) + (pHold * 0.2), 0.35, 0.95)
  return { att: clamp(att * RUN.ATTEMPT_SCALE, 0, 0.6), success }
}

const pick = (r, rng) => {
  let u = rng()
  for (const kind of ['K', 'BB', 'HBP', 'HR', 'T', 'D', 'S']) {
    u -= r[kind]
    if (u <= 0) return kind
  }
  return 'OUT'
}

// Deterministic RNG so a given game_pk + seed always replays identically —
// a box score you can link someone to has to still be there when they open it.
const mulberry = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const blank = (p) => ({
  id: p.player_id ?? p.id, name: p.player_name || p.name, spot: n(p.lineup_spot, 9),
  // The slate row is carried through so a box-score line stays clickable —
  // the panel opens the same player modal the rest of the site does.
  row: p,
  ab: 0, r: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, d2: 0, d3: 0, sb: 0, cs: 0,
})
const arm = (name) => ({ name, outs: 0, h: 0, er: 0, bb: 0, k: 0, hr: 0, wp: 0, pitches: 0, dec: null })

/**
 * Play one half inning. Mutates the box lines. Returns runs scored.
 * Base state is [on1, on2, on3] holding the batter index that owns each base,
 * so an RBI is credited to the man who drove him in and the run to the man who
 * actually scored — which is the whole reason a box score is not just totals.
 */
const halfInning = (lineup, box, pitcher, pbox, ctx, state, rng, ghost = false) => {
  let outs = 0, runs = 0, errors = 0
  const bases = [null, null, null]
  if (!lineup || !lineup.length) return { runs: 0, errors: 0 }
  // Extra innings put an automatic runner on second — the rule since 2020, and
  // the reason a modern game almost never reaches the fifteenth. Without it the
  // sim produced real ties, which MLB does not have.
  if (ghost) bases[1] = (state.idx + lineup.length - 1) % lineup.length
  const score = (i) => { if (i != null) { box[i].r += 1; runs += 1 } }

  while (outs < 3) {
    // ── before the pitch: the running game ──────────────────────────────
    // A steal is resolved BEFORE the plate appearance it happens during. That
    // is a simplification — a real steal lands mid-count — but it puts the
    // runner on the right base for the swing that follows, which is the part
    // that changes the score.
    if (bases[0] != null && bases[1] == null) {
      const runner = lineup[bases[0]]
      const o = stealOdds(runner, pitcher)
      if (rng() < o.att) {
        if (rng() < o.success) { box[bases[0]].sb += 1; bases[1] = bases[0]; bases[0] = null }
        else { box[bases[0]].cs += 1; bases[0] = null; outs += 1; pbox.outs += 1 }
        if (outs >= 3) break
      }
    }
    // A wild pitch only matters with someone on. `pitcher_wp9` is per nine
    // innings, so it divides by the batters faced in nine, not by nine.
    if (bases.some((x) => x != null) && rng() < clamp(n(pitcher.wp9, 0.3) / 9 / LG.PA_PER_INNING, 0, 0.06)) {
      pbox.wp += 1
      if (bases[2] != null) { score(bases[2]); bases[2] = null }
      if (bases[1] != null) { bases[2] = bases[1]; bases[1] = null }
      if (bases[0] != null) { bases[1] = bases[0]; bases[0] = null }
    }

    // Modulo the lineup's ACTUAL length, not 9. Several clubs publish only
    // eight hitters on a given night (a spot not yet posted, or a pitcher
    // batting), and `% 9` walked off the end of the array and crashed the sim
    // mid-inning. Cycling the short order slightly over-feeds the men who ARE
    // published, so `simGame` flags it rather than pretending the card is full.
    const bi = state.idx % lineup.length
    const bat = lineup[bi]
    const r = paRates(bat, pitcher, ctx)
    const out = pick(r, rng)
    const line = box[bi]
    pbox.pitches += Math.max(1, Math.round(LG.PITCHES_PER_PA + (rng() - 0.5) * 2))
    state.idx += 1
    let rbi = 0

    if (out === 'K') { line.ab++; line.k++; pbox.k++; outs++ }
    else if (out === 'BB' || out === 'HBP') {
      if (out === 'BB') { line.bb++; pbox.bb++ }
      // Forced advance only.
      if (bases[0] != null) {
        if (bases[1] != null) {
          if (bases[2] != null) { score(bases[2]); rbi = 1 }
          bases[2] = bases[1]
        }
        bases[1] = bases[0]
      }
      bases[0] = bi
    } else if (out === 'HR') {
      line.ab++; line.h++; line.hr++; pbox.h++; pbox.hr++
      rbi = 1 + bases.filter((x) => x != null).length
      bases.forEach((x) => score(x))
      bases[0] = bases[1] = bases[2] = null
      score(bi)
    } else if (out === 'T') {
      line.ab++; line.h++; line.d3++; pbox.h++
      rbi = bases.filter((x) => x != null).length
      bases.forEach((x) => score(x))
      bases[0] = bases[1] = null; bases[2] = bi
    } else if (out === 'D') {
      line.ab++; line.h++; line.d2++; pbox.h++
      if (bases[2] != null) { score(bases[2]); rbi++ }
      if (bases[1] != null) { score(bases[1]); rbi++ }
      // From first, a double scores him about half the time.
      if (bases[0] != null) { if (rng() < 0.45) { score(bases[0]); rbi++; bases[2] = null } else bases[2] = bases[0] }
      else bases[2] = null
      bases[0] = null; bases[1] = bi
    } else if (out === 'S') {
      line.ab++; line.h++; pbox.h++
      if (bases[2] != null) { score(bases[2]); rbi++ }
      // Second scores on a single about 60% of the time.
      const from2 = bases[1]
      bases[2] = null
      if (from2 != null) { if (rng() < 0.6) { score(from2); rbi++ } else bases[2] = from2 }
      bases[1] = bases[0]
      bases[0] = bi
    } else {
      // Ball in play. Three things a real inning does that a rate model does
      // not: the error, the double play, and the run that scores on an out.
      line.ab++
      // Reached on error — an at-bat, not a hit, and the runs it leads to are
      // unearned. Scaled by the defence actually behind this pitcher:
      // `opp_def_success_rate` runs 76-81 across tonight's board.
      const errRate = clamp(RUN.LG_ERROR * (1 + (79 - n(ctx.def_success, 79)) * 0.25), 0.004, 0.045)
      if (rng() < errRate) {
        errors += 1
        if (bases[2] != null) { score(bases[2]); bases[2] = null }
        if (bases[1] != null) { bases[2] = bases[1]; bases[1] = null }
        if (bases[0] != null) { bases[1] = bases[0] }
        bases[0] = bi
        continue
      }
      const isGB = rng() < r.gb
      if (isGB && bases[0] != null && outs < 2 && rng() < 0.42) {
        outs += 2; bases[0] = null
        if (outs < 3 && bases[2] != null && rng() < 0.5) { score(bases[2]); rbi++; bases[2] = null }
      } else {
        outs++
        if (!isGB && outs < 3 && bases[2] != null && rng() < 0.42) { score(bases[2]); rbi++; bases[2] = null }
      }
    }
    line.rbi += rbi
  }
  pbox.outs += 3
  // Unearned runs, both kinds: the automatic runner in extras is unearned by
  // rule, and so is a run that only scored because of an error. Charging
  // either would quietly inflate every ERA in the box.
  pbox.er += Math.max(0, runs - (ghost ? 1 : 0) - errors)
  return { runs, errors }
}

const pitcherCtxFrom = (row, relief = false) => (relief ? {
  k_rate: LG.K * 1.05, bb_rate: LG.BB * 1.05,
  hr9: n(row.bullpen_hr9, 1.15), hr9_vs_lhb: 0, hr9_vs_rhb: 0,
  babip: LG.BABIP, gb_rate: 0.44,
  era: n(row.bullpen_era, 4.1), whip: n(row.bullpen_whip, 1.28),
  wp9: n(row.pitcher_wp9, 0.35),
  catcher_cs: Number.isFinite(Number(row.opp_catcher_cs_rate)) ? Number(row.opp_catcher_cs_rate) : null,
  sb_against: 0, sb_attempts_against: 0,
} : {
  k_rate: n(row.pitcher_k_rate, LG.K), bb_rate: n(row.pitcher_bb_pct, LG.BB),
  hr9: n(row.pitcher_hr9, 1.15),
  hr9_vs_lhb: n(row.pitcher_hr9_vs_lhb, 0), hr9_vs_rhb: n(row.pitcher_hr9_vs_rhb, 0),
  babip: n(row.pitcher_babip, LG.BABIP), gb_rate: n(row.pitcher_gb_rate, 0.43),
  era: n(row.pitcher_era, 4.2), whip: n(row.pitcher_whip, 1.28),
  wp9: n(row.pitcher_wp9, 0.3),
  // `opp_catcher_cs_rate` is null on 42 of tonight's 261 rows (the catcher
  // feed outage). Passed through as null, never coerced to 0 — see stealOdds.
  catcher_cs: Number.isFinite(Number(row.opp_catcher_cs_rate)) ? Number(row.opp_catcher_cs_rate) : null,
  sb_against: n(row.pitcher_sb_against, 0),
  sb_attempts_against: n(row.pitcher_sb_attempts_against, 0),
})

/** One complete game. */
export const simGame = (game, seed = 1) => {
  const rng = mulberry(seed)
  const sides = ['away', 'home']
  const L = { away: game.away.lineup, home: game.home.lineup }
  const box = { away: L.away.map(blank), home: L.home.map(blank) }
  const staff = {
    away: [arm(game.away.starter || 'STARTER')],
    home: [arm(game.home.starter || 'STARTER')],
  }
  const ctxOf = (s) => game[s].ctx
  const starterCtx = { away: pitcherCtxFrom(game.away.pitcherRow), home: pitcherCtxFrom(game.home.pitcherRow) }
  const penCtx = { away: pitcherCtxFrom(game.away.pitcherRow, true), home: pitcherCtxFrom(game.home.pitcherRow, true) }
  const idx = { away: { idx: 0 }, home: { idx: 0 } }
  const runs = { away: 0, home: 0 }
  const errs = { away: 0, home: 0 }
  const lineScore = { away: [], home: [] }

  let inning = 1
  while (true) {
    for (const bat of sides) {
      // Home does not bat in the bottom of the ninth with a lead.
      if (bat === 'home' && inning >= 9 && runs.home > runs.away) { lineScore.home.push(null); break }
      // `staff`, `starterCtx` and `penCtx` are keyed by the BATTING team —
      // each holds the arms that team hits against. That follows the payload:
      // a batter row carries the pitcher he FACES (`pitcher_name`), never his
      // own team's. Keying them by the defending side instead had ATH batting
      // against ATH's own starter, which the box score hid because the totals
      // still looked like baseball.
      const s = staff[bat]
      let cur = s[s.length - 1]
      // Hook. A starter is done at ~95 pitches, six innings, or five runs —
      // whichever lands first. After that it is one bullpen arm per inning,
      // which is what a modern staff actually does and what the box shows.
      const isStarter = s.length === 1
      if (isStarter && (cur.pitches >= 95 || cur.outs >= 18 || cur.er >= 5) && inning > 1) {
        cur = arm(`BULLPEN ${s.length}`); s.push(cur)
      } else if (!isStarter && cur.outs >= 3 && s.length < MAX_ARMS) {
        cur = arm(`BULLPEN ${s.length}`); s.push(cur)
      }
      const pc = isStarter ? starterCtx[bat] : penCtx[bat]
      const got = halfInning(L[bat], box[bat], pc, cur, ctxOf(bat), idx[bat], rng, inning > 9)
      runs[bat] += got.runs
      // An error is charged to the side in the FIELD, which is the side not
      // batting — the box's E column belongs to the defence.
      errs[bat === 'away' ? 'home' : 'away'] += got.errors
      lineScore[bat].push(got.runs)
    }
    if (inning >= 9 && runs.home !== runs.away) break
    if (inning >= 15) break // a tie this deep is a tie; do not loop forever
    inning++
  }

  // Decision. The honest simple rule: the pitcher of record for the winner is
  // the starter if he left with a lead his side never surrendered, otherwise
  // the arm who was in when the winning side took the lead for good. This sim
  // does not track lead changes per half, so it credits the starter only when
  // he finished five, and the last arm otherwise — and says so in the caption.
  const winner = runs.home > runs.away ? 'home' : runs.away > runs.home ? 'away' : null
  if (winner) {
    const loser = winner === 'home' ? 'away' : 'home'
    // `staff` is keyed by the side that BATS against it, so the winning team's
    // own arms are staff[loser] and the losing team's are staff[winner]. This
    // read backwards in the first build and hung the W on the losing starter —
    // invisible in the totals, obvious the moment you look at the decision.
    const ws = staff[loser]
    const w = ws[0].outs >= 15 ? ws[0] : (ws[1] || ws[0])
    w.dec = 'W'
    staff[winner][0].dec = 'L'
  }

  const fmtIP = (o) => `${Math.floor(o / 3)}.${o % 3}`
  const side = (s) => ({
    team: game[s].team,
    runs: runs[s],
    hits: box[s].reduce((a, b) => a + b.h, 0),
    errors: errs[s],
    sb: box[s].reduce((a, b) => a + b.sb, 0),
    batters: box[s].slice().sort((a, b) => a.spot - b.spot),
    pitchers: staff[s === 'home' ? 'away' : 'home'].map((p) => ({ ...p, ip: fmtIP(p.outs) })),
  })
  const partial = [game.away, game.home].filter((t) => t.lineup.length < 9).map((t) => t.team)
  return {
    inning, away: side('away'), home: side('home'), lineScore, winner,
    // Surfaced so the UI can caption it. A box score built from eight names is
    // still useful; a box score built from eight names and PRESENTED as nine
    // is not.
    partialLineups: partial.length ? partial : null,
  }
}

/**
 * Run the game N times. This is the part a box score cannot give you and the
 * reason to own the simulator rather than screenshot someone else's: the spread.
 */
export const simulate = (game, runsN = 2000, seed = 7) => {
  const wins = { away: 0, home: 0, tie: 0 }
  const totals = []
  const hrBy = new Map()
  let median = null, medianDist = Infinity
  for (let i = 0; i < runsN; i++) {
    const g = simGame(game, seed + i * 7919)
    wins[g.winner || 'tie'] += 1
    const tot = g.away.runs + g.home.runs
    totals.push(tot)
    for (const s of ['away', 'home']) {
      for (const b of g[s].batters) {
        if (b.hr > 0) hrBy.set(b.name, (hrBy.get(b.name) || 0) + 1)
      }
    }
    // Keep a representative game to SHOW: the one closest to the mean total.
    if (i > 0 && Math.abs(tot - 8.8) < medianDist) { medianDist = Math.abs(tot - 8.8); median = g }
  }
  totals.sort((a, b) => a - b)
  const q = (p) => totals[Math.floor(p * (totals.length - 1))]
  return {
    n: runsN,
    winPct: { away: wins.away / runsN, home: wins.home / runsN, tie: wins.tie / runsN },
    total: { mean: totals.reduce((a, b) => a + b, 0) / runsN, p10: q(0.1), p50: q(0.5), p90: q(0.9) },
    hrProb: [...hrBy.entries()].map(([name, c]) => ({ name, p: c / runsN })).sort((a, b) => b.p - a.p),
    box: median,
  }
}

/** Build the sim input for one game_pk out of the slate rows this app already has. */
export const gameFrom = (rows, gamePk) => {
  const mine = rows.filter((r) => String(r.game_pk) === String(gamePk))
  if (!mine.length) return null
  const teams = [...new Set(mine.map((r) => r.team))]
  if (teams.length !== 2) return null
  // The row carries the OPPOSING starter, so a team's own pitcher is the one
  // listed on the other team's rows. This is the join that makes the whole
  // thing work off a batter-shaped payload.
  const build = (t) => {
    const lineup = mine.filter((r) => r.team === t).sort((a, b) => n(a.lineup_spot, 9) - n(b.lineup_spot, 9))
    const opp = mine.find((r) => r.team !== t) || {}
    const own = lineup[0] || {}
    return {
      team: t, lineup,
      starter: own.pitcher_name,          // the arm THIS lineup faces
      pitcherRow: own,                    // carries pitcher_* for that arm
      ctx: {
        park_hr_factor: own.park_hr_factor, park_hits_factor: own.park_hits_factor,
        weather_hr_effect_pct: own.weather_hr_effect_pct,
        def_success: own.opp_def_success_rate,
        isHome: false, // set below, once we know whose yard this is
      },
    }
  }
  const venue = mine[0].venue_name
  let [a, b] = teams
  // Home is the club whose park this is. If neither matches (a neutral site,
  // or a yard this table has not learned), fall back to the payload order and
  // SAY so on the result rather than quietly guessing.
  let homeKnown = true
  if (sameVenue(venue, HOME_PARK[a])) [a, b] = [b, a]
  else if (!sameVenue(venue, HOME_PARK[b])) homeKnown = false
  const away = build(a), home = build(b)
  home.ctx.isHome = homeKnown
  return { gamePk, away, home, venue, homeKnown, time: mine[0].game_time }
}

export default simulate
