// ═══════════════════════════════════════════════════════════════════════════
// THE RUNNING GAME — reading nine published fields without overclaiming
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan asked for "wild pitches, pickoffs, pitcher SB-against, catcher CS%,
// team defense". The bot publishes all of them on every slate row. Until this
// file existed, exactly two of the nine were read anywhere on the site (the
// steal board), which by this project's own rule means the other seven did
// not exist.
//
// THREE THINGS THIS MODULE REFUSES TO DO
//
//  1. It does not call cs_rate_against a pitcher stat. The bot's own field
//     comment says it: "the PAIR's number — the catcher throws it." An arm
//     with a good caught-stealing rate behind him may be slow to the plate and
//     simply have a cannon behind the dish. So the catcher is named on the
//     same line, always, and the copy says "him and his catcher".
//
//  2. It does not render a refusal as a zero. The bot returns null for
//     cs_rate_against under 5 attempts and for pickoff_rate under 20
//     baserunners, because a rate off three attempts is noise wearing a
//     percentage sign. Those come back as `null` here and must be drawn as an
//     em-dash with the reason, never as 0%.
//
//  3. It does not colour anything against an invented league average. Nobody
//     in this project has measured a league CS% and the number moved when the
//     bases got bigger. Every figure is shown WITH ITS DENOMINATOR, which is
//     the one form of number this project trusts.
//
// The catcher's `source` matters and is carried through: a catcher read off a
// POSTED lineup and one guessed from the roster are different facts, and the
// UI says which it had.

const num = (v) => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/**
 * Everything the running game says about one starter, off any slate row that
 * faces him. Returns `{ ok: false, why }` when the bot published nothing —
 * callers render the reason, not a row of zeroes.
 */
export function runningGame(r) {
  if (!r) return { ok: false, why: 'no row for this arm tonight' }
  const status = String(r?.pitcher_running_game_status || 'missing')
  if (status !== 'ok') {
    return {
      ok: false,
      why: status === 'missing'
        ? 'no innings logged for him yet this season'
        : `the bot marked this ${status}`,
    }
  }

  const attempts = num(r.pitcher_sb_attempts_against)
  const sb = num(r.pitcher_sb_against)
  const cs = num(r.pitcher_cs_against)
  const csRate = num(r.pitcher_cs_rate_against)          // null under 5 attempts
  const wp = num(r.pitcher_wild_pitches)
  const wp9 = num(r.pitcher_wp9)
  const pickoffs = num(r.pitcher_pickoffs)
  const pickRate = num(r.pitcher_pickoff_rate)           // null under 20 baserunners

  const cStatus = String(r?.opp_catcher_status || 'missing')
  const catcher = {
    name: String(r?.opp_catcher_name || '').trim(),
    source: String(r?.opp_catcher_source || ''),
    csRate: num(r.opp_catcher_cs_rate),
    attempts: num(r.opp_catcher_sb_attempts),
    ok: cStatus === 'ok',
    status: cStatus,
  }

  const defStatus = String(r?.opp_def_status || 'missing')
  const defence = {
    oaa: num(r.opp_def_oaa_vs_hand),
    ok: defStatus === 'ok',
    status: defStatus,
  }

  return {
    ok: true, attempts, sb, cs, csRate, wp, wp9, pickoffs, pickRate,
    catcher, defence,
    // Why the rate is missing, in the words the tile should print.
    // Three different reasons a rate is absent, and they are not the same
    // fact. "Nobody ran" is information about the arm; "four attempts" is
    // information about the sample; "nothing logged" is information about the
    // feed. Collapsing them into one sentence — which the first draft did,
    // printing "only 0 attempts, under the 5 the bot needs" — turns a real
    // read into a complaint about a threshold.
    csWhy: csRate == null
      ? (attempts == null ? 'nothing logged for him'
        : attempts === 0 ? 'nobody has run on him'
          : `only ${attempts} attempt${attempts === 1 ? '' : 's'} — under the 5 the bot needs`)
      : null,
    pickWhy: pickRate == null ? 'under 20 baserunners allowed — too few to rate' : null,
  }
}

/**
 * ONE clause, and only when there is something to say.
 *
 * The first draft of this listed the attempts, the wild-pitch rate and the
 * catcher — all three of which are already printed as tiles directly above it,
 * so it was a caption restating its own picture. This project has a rule about
 * that: when two surfaces stack, check whether the top one repeats the bottom
 * one.
 *
 * So this returns a READ, not a recap, and only fires on something a reader
 * would not get from glancing at the tiles:
 *
 *   · the wild-pitch rate turned into innings-per-wild-pitch, because "0.54
 *     per nine" is a rate nobody pictures and "one every 17 innings" is a
 *     thing that happens in a game you are watching;
 *   · runners going freely, stated as freely rather than as two numbers;
 *   · an arm who actually holds them.
 *
 * Unremarkable arms get silence, which is the correct amount of copy for an
 * unremarkable arm. Nothing here compares him to a league average, because
 * nobody in this project has measured one.
 */
export function runningGameLine(g) {
  if (!g?.ok) return ''

  // Runners going, and getting away with it. Needs a real sample on both
  // halves — the bot already refuses csRate under five attempts, and ten
  // attempts is the least this sentence will speak on.
  if (g.attempts != null && g.attempts >= 10 && g.csRate != null) {
    if (g.csRate <= 0.20) {
      return `Runners have gone ${g.attempts} times and been thrown out on ${g.cs} of them — this is a base people take.`
    }
    if (g.csRate >= 0.40) {
      return `${g.attempts} have tried and ${g.cs} were thrown out — going on him and his catcher has not paid.`
    }
  }

  // A wild-pitch rate a reader can picture. 0.45 per nine is one every twenty
  // innings, which is roughly every third start — the point where it stops
  // being trivia.
  if (g.wp9 != null && g.wp9 >= 0.45) {
    const every = Math.round(9 / g.wp9)
    return `He bounces one to the backstop about every ${every} innings — a runner moves up without anybody swinging.`
  }

  // An arm who throws over. Rare enough to be worth the line when it happens.
  if (g.pickRate != null && g.pickRate >= 0.015) {
    return `He picks off ${(g.pickRate * 100).toFixed(1)}% of the runners he allows — he throws over, and it works.`
  }

  if (g.attempts === 0) return 'Nobody has tried to run on him all season.'
  return ''
}
