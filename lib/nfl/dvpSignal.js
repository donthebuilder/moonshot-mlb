// Shared "what's the single softest matchup" signal — lifted out of
// components/nfl/tabs/Games.js (2026-09-11, Phase 2 depth pass) so the
// Matchups page can give the same one-sentence answer the Games cards do,
// instead of leaving a reader to scan an 11-row x 6-column DVP table
// themselves to find it. Two places computing this independently is how
// they'd drift; one function, two call sites.
//
// Covers the five stats the DVP payload actually carries a real signal
// for — confirmed directly against nfl_matchup.json's dvp_stats, not
// guessed: 'td', 'recyd_g', 'rshyd_g', 'rz_tgts', 'rz_car'. rz_tgts/rz_car
// (red-zone targets/carries allowed, by role, already published with a
// league rank) folded in 2026-09-15 -- same z-score-vs-league-average
// method as the original three, not a second signal type. Verified against
// the live payload first: rz_tgts only ever appears on receiving roles
// (WR1-3/Other WR/TE1-2/Other TE/RB) and rz_car only on rushing roles
// (RB/QB), so no role ever gets a nonsense combination. PASS_YDS and
// KICK_PTS still have no per-role DVP equivalent at all, so those two
// markets stay honestly uncovered rather than faked.
export const DVP_SIGNAL_STATS = [
  ['td', 'touchdowns'],
  ['recyd_g', 'receiving yards'],
  ['rshyd_g', 'rushing yards'],
  ['rz_tgts', 'red-zone targets'],
  ['rz_car', 'red-zone carries'],
]

// ── THE SOFTEST SPOT, REWRITTEN 2026-09-13 ────────────────────────────────
//
// The old version took the MINIMUM RANK across every role and every stat and
// called that the defense's weak point. Measured against the live payload,
// that put **18 of 32 defenses at "1st softest of 32" and 11 more at 2nd.**
// Not a data bug — arithmetic. The minimum of 25 draws from a 1-32 rank sits
// at about 1.3 in expectation, so every defense in the league is elite-soft
// at SOMETHING and saying so distinguishes nothing. The meter added to the
// Games tiles made it visible: sixteen cards, sixteen full-width bars.
//
// This is the same failure the DvP drift chart hit ("in a 32-team rank over
// three games somebody is top-three in every role by arithmetic"). The rule,
// written down so it stops recurring:
//
//     A MINIMUM OVER MANY RANKED CELLS IS NOT A SIGNAL.
//     Rank compresses; the VALUE is what varies.
//
// So the cell is chosen by how far its VALUE sits above the league's own
// average for that same role and stat, in standard deviations. That number
// spreads properly — measured on the live payload it runs 0.83 (LAC) to 4.02
// (CIN), so the meter finally distinguishes cards from each other — and it
// is what lets the sentence say a real thing ("35.8 receiving yards a game
// to the opposing No.2 tight end, 2.7x what an average defense gives up")
// instead of a rank a reader has to decode.
//
// Plain-language role names are deliberate, not decoration: TUDDY is for
// people who do not follow football, and "TE2" means nothing to them.
export const PLAIN_ROLE = {
  WR1: 'No.1 receiver', WR2: 'No.2 receiver', WR3: 'No.3 receiver',
  'Other WR': 'depth receivers', TE1: 'starting tight end',
  TE2: 'No.2 tight end', 'Other TE': 'depth tight ends',
  RB1: 'lead running back', RB2: 'No.2 running back',
  'Other RB': 'depth running backs', QB: 'quarterback',
}
export const plainRole = (role) => PLAIN_ROLE[role] || String(role || '').toLowerCase()

// Below this many standard deviations above league average, a defense has no
// standout weakness and the honest answer is to say so rather than name its
// least-good cell anyway. Two of 32 teams land here on the current payload —
// which is the point: a signal that fires for everybody is not a signal.
export const SOFT_MIN_Z = 1.0
// The meter's top end. 3 sd covers all but the one genuine outlier, so bars
// stay comparable instead of everything pinning full.
export const SOFT_MAX_Z = 3

// A cell needs at least this many teams reporting before its league average
// means anything.
const MIN_LEAGUE_N = 8

// SAMPLE FLOOR (2026-09-29, queue batch 4). A defense's cell needs this many
// games behind it before it can be its softest or toughest spot, and under
// SOFT_THIN_GAMES it is tagged "thin" wherever it is printed ("QB rushing
// yards 3.8x" for DAL is 59.5 a game over 2 games -- a real number, but a thin
// one). Measured 09-29: every 2026 cell carries g = 2, so a floor of 3 would
// have emptied the table; 2 drops one-game cells and the tag says the rest.
// The count rides on the result (`games`, `thin`) so the page prints it.
export const SOFT_MIN_GAMES = 2
export const SOFT_THIN_GAMES = 4
const thin = (row) => Number.isFinite(Number(row?.g)) && Number(row.g) < SOFT_MIN_GAMES

// WHO FITS IT (2026-09-29, queue batch 4: "a who-fits rule that requires the
// role"). Being QB1 on the other side is not fitting a QB-rushing leak; the
// player has to be the kind that exploits it. Every test reads his own
// per-game stats on the slate row:
//   QB on a rushing cell (rushing yards / red-zone carries / touchdowns): a
//      Rushing QB -- 5+ carries a game (BATCH-NFL-STATS-DEPTH-PLAN's role).
//   rushing / receiving yards: his own number at least the league's average
//      for that role (soft.leagueAvg -- the same cell the leak is measured on).
//   red-zone targets / carries: he gets red-zone touches at all.
//   touchdowns (non-QB): being in the role is the whole question.
export const RUSHING_QB_CARRIES = 5
export function fitsSoft(player, soft) {
  if (!player || !soft) return false
  const s = player.stats || {}
  if (soft.role === 'QB' && soft.stat !== 'recyd_g') return Number(s.CAR) >= RUSHING_QB_CARRIES
  if (soft.stat === 'rshyd_g') return Number(s.RUYD) >= Number(soft.leagueAvg || 0)
  if (soft.stat === 'recyd_g') return Number(s.RECYD) >= Number(soft.leagueAvg || 0)
  if (soft.stat === 'rz_car' || soft.stat === 'rz_tgts') return Number(s.RZ) > 0
  return true
}

// League mean/sd per (role, stat), memoised per payload+window — softRole is
// called twice per game card, and recomputing 25 cells x 32 teams each time
// is waste, not correctness.
// A row swapped in from last season (lib/nfl/seasonRule.js blendMatchup) carries
// `s`, and is judged only against rows of its OWN season: the key says which.
// An untagged row (every payload that was never blended) keys as before.
const leagueKey = (row, role, stat) => `${row?.s ?? ''}|${role}|${stat}`
// WHICH SEASON A ROW IS FROM, IN WORDS (lib/nfl/seasonRule.js has the rule). `matchup.slate_season` is stamped on by the page / the route that
// loaded the payload (components/nfl/NflDashboard via lib/nfl/useBlendedMatchup). With no slate season there is nothing honest to compare to: ''.
export function whenOf(matchup, row) {
  const slate = Number(matchup?.slate_season); const yr = Number(row?.s ?? matchup?.season)
  if (!(slate > 0) || !(yr > 0)) return ''
  return yr >= slate ? 'this season' : yr === slate - 1 ? 'last season' : `in ${yr}`
}
const LEAGUE_CACHE = new WeakMap()
function leagueCells(matchup, win) {
  const dvp = matchup?.dvp?.[win]
  if (!dvp) return null
  let byWin = LEAGUE_CACHE.get(matchup)
  if (!byWin) { byWin = {}; LEAGUE_CACHE.set(matchup, byWin) }
  if (byWin[win]) return byWin[win]
  const buckets = {}
  // After a blend (lib/nfl/seasonRule.js) the swapped teams' rows are last season's; their league is that season's WHOLE table
  // (matchup.dvp_league), not the one or two swapped rows. So the swapped rows are left out of this loop and the full table added below.
  const full = win === 'season' ? matchup?.dvp_league : null
  const fileS = Number(matchup?.season)
  const pools = [...Object.values(dvp).map((roles) => [roles, true]), ...Object.values(full || {}).map((roles) => [roles, false])]
  for (const [roles, fromFile] of pools) {
    for (const [role, row] of Object.entries(roles || {})) {
      if (full && fromFile && row?.s != null && row.s !== fileS) continue
      for (const [stat] of DVP_SIGNAL_STATS) {
        const v = Number(row?.[stat])
        if (!Number.isFinite(v)) continue
        ;(buckets[leagueKey(row, role, stat)] ||= []).push(v)
      }
    }
  }
  const out = {}
  for (const [key, vals] of Object.entries(buckets)) {
    if (vals.length < MIN_LEAGUE_N) continue
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    if (!(sd > 0)) continue
    out[key] = { mean, sd }
  }
  byWin[win] = out
  return out
}

/** The one cell where this defense is furthest above the league's own
 * average for that role and stat. `win` defaults to season (matching every
 * pre-existing call site); the Matchups page threads its own toggle through.
 * `rank` is still returned, so colour scales keyed to it keep working — it
 * is simply no longer what picks the cell. `restrictRoles` (2026-09-17),
 * an optional array of role keys, narrows the SEARCH to a role subset a
 * caller is already showing -- DvpTable.js's own player-modal view scopes
 * to one position group, and the softest cell it names has to be a row
 * actually on screen, not one from a table the reader can't see. League
 * mean/sd (leagueCells) are unaffected -- still measured against every
 * team's full role table, since narrowing the search should not also
 * shrink the population a value is judged against. */
export function softRole(matchup, defense, win = 'season', restrictRoles, restrictStats = null) {
  const roles = matchup?.dvp?.[win]?.[defense] || {}
  const league = leagueCells(matchup, win)
  if (!league) return null
  const scope = restrictRoles ? new Set(restrictRoles) : null
  let best = null
  for (const [role, row] of Object.entries(roles)) {
    if (scope && !scope.has(role)) continue
    if (thin(row)) continue
    for (const [stat, label] of DVP_SIGNAL_STATS) {
      if (restrictStats && !restrictStats.includes(stat)) continue
      const value = Number(row?.[stat])
      if (!Number.isFinite(value)) continue
      const lg = league[leagueKey(row, role, stat)]
      if (!lg) continue
      const z = (value - lg.mean) / lg.sd
      if (!best || z > best.z) {
        best = {
          role, stat, label, value, z,
          leagueAvg: lg.mean,
          multiple: lg.mean > 0 ? value / lg.mean : null,
          rank: Number(row?.[`${stat}_rank`]),
          games: Number(row?.g),
          plain: plainRole(role),
          when: whenOf(matchup, row),
        }
      }
    }
  }
  if (!best) return null
  return { ...best, standout: best.z >= SOFT_MIN_Z, thin: Number.isFinite(best.games) && best.games < SOFT_THIN_GAMES }
}

/** EVERY SOFT ROLE, not just the softest (2026-09-28, Weak spots -- parity
 * plan 00Q step 2): for each role, its softest cell by the same z against the
 * same league cells, kept only when it is a standout (z >= SOFT_MIN_Z).
 * Softest first. The TUDDY weak-spot cards are built from this. */
export function softRoles(matchup, defense, win = 'season', restrictRoles = null, restrictStats = null) {
  const roles = Object.keys(matchup?.dvp?.[win]?.[defense] || {}).filter((r) => !restrictRoles || restrictRoles.includes(r))
  return roles.map((r) => softRole(matchup, defense, win, [r], restrictStats)).filter((d) => d?.standout).sort((a, b) => b.z - a.z)
}
/** EVERY SOFT CELL in the given roles (2026-10-01, 0e d -- the card's
 * "Doors"): each role x stat this defense allows a standout amount of
 * (z >= SOFT_MIN_Z against the same league cells softRole reads), softest
 * first. Same z, same thin-row floor, so a door here is a door everywhere. */
export function softCells(matchup, defense, win = 'season', roles = null) {
  const blob = matchup?.dvp?.[win]?.[defense] || {}
  const league = leagueCells(matchup, win)
  if (!league) return []
  const out = []
  for (const [role, row] of Object.entries(blob)) {
    if (roles && !roles.includes(role)) continue
    if (thin(row)) continue
    for (const [stat, label] of DVP_SIGNAL_STATS) {
      const value = Number(row?.[stat])
      const lg = league[leagueKey(row, role, stat)]
      if (!Number.isFinite(value) || !lg) continue
      const z = (value - lg.mean) / lg.sd
      if (z < SOFT_MIN_Z) continue
      const games = Number(row?.g)
      out.push({ role, stat, label, value, z, leagueAvg: lg.mean, multiple: lg.mean > 0 ? value / lg.mean : null, rank: Number(row?.[`${stat}_rank`]), games, plain: plainRole(role), when: whenOf(matchup, row), thin: Number.isFinite(games) && games < SOFT_THIN_GAMES })
    }
  }
  return out.sort((a, b) => b.z - a.z)
}
// TUDDY is a touchdown product: its weak spots are the STARTERS' touchdown and
// red-zone cells (the Matchups table's starters-only rule), not every
// yardage cell of every depth role -- that flagged 29 of 32 defenses.
export const WEAK_SPOT_STATS = ['td', 'rz_tgts', 'rz_car']
export const weakSpotRoles = (matchup, defense, win = 'season') => softRoles(matchup, defense, win, STARTER_ROLES, WEAK_SPOT_STATS)

/** The mirror of softRole (2026-09-27, Matchups verdict line, BATCH-FACES
 * step 10): the role x stat cell this defense holds furthest BELOW the
 * league's own average, same z against the same league cells. A standout is
 * z <= -SOFT_MIN_Z; anything milder is not called "toughest". */
export function stingyRole(matchup, defense, win = 'season', restrictRoles) {
  const roles = matchup?.dvp?.[win]?.[defense] || {}
  const league = leagueCells(matchup, win)
  if (!league) return null
  const scope = restrictRoles ? new Set(restrictRoles) : null
  let best = null
  for (const [role, row] of Object.entries(roles)) {
    if (scope && !scope.has(role)) continue
    if (thin(row)) continue
    for (const [stat, label] of DVP_SIGNAL_STATS) {
      const value = Number(row?.[stat])
      if (!Number.isFinite(value)) continue
      const lg = league[leagueKey(row, role, stat)]
      if (!lg) continue
      const z = (value - lg.mean) / lg.sd
      if (!best || z < best.z) best = { role, stat, label, value, z, leagueAvg: lg.mean, multiple: lg.mean > 0 ? value / lg.mean : null, games: Number(row?.g), plain: plainRole(role), when: whenOf(matchup, row) }
    }
  }
  if (!best) return null
  return { ...best, standout: best.z <= -SOFT_MIN_Z }
}

/** The roles a verdict speaks about: the starters. Depth rows ("depth tight
 * ends", "No.2 tight end"...) have tiny league means, so two plays swing
 * their ratio to 3x or 0x -- they won both ends of 12 of 16 games on 09-27. */
export const STARTER_ROLES = ['QB', 'RB1', 'WR1', 'WR2', 'WR3', 'TE1']

/** One game in one line: the softest spot on either defense and the
 * toughest, from softRole / stingyRole over the starter roles. Null halves
 * are left out. */
export function gameVerdict(matchup, away, home, win = 'season') {
  const pickMax = (a, b) => (!a?.standout ? (b?.standout ? b : null) : !b?.standout ? a : (a.z >= b.z ? a : b))
  const pickMin = (a, b) => (!a?.standout ? (b?.standout ? b : null) : !b?.standout ? a : (a.z <= b.z ? a : b))
  const sa = softRole(matchup, away, win, STARTER_ROLES); const sh = softRole(matchup, home, win, STARTER_ROLES)
  const ta = stingyRole(matchup, away, win, STARTER_ROLES); const th = stingyRole(matchup, home, win, STARTER_ROLES)
  const soft = pickMax(sa && { ...sa, def: away }, sh && { ...sh, def: home })
  const tough = pickMin(ta && { ...ta, def: away }, th && { ...th, def: home })
  const x = (d) => (d.multiple === 0 ? ', none allowed' : d.multiple ? ` ${Math.round(d.multiple * 10) / 10}x` : '')
  return {
    soft, tough,
    softText: soft ? `softest: ${soft.def} vs the ${soft.plain} (${soft.label}${x(soft)})` : null,
    toughText: tough ? `toughest: ${tough.def} vs the ${tough.plain} (${tough.label}${x(tough)})` : null,
  }
}

/** 0-1, for a meter. A defense with no standout weakness reads empty, which
 * is the honest picture — not a bar at the bottom of a scale. */
export const softStrength = (d) => {
  if (!d?.standout) return null
  return Math.max(0.08, Math.min(1, d.z / SOFT_MAX_Z))
}

const fmtVal = (n) => (Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10)

// td, rz_tgts and rz_car are running totals over the window; recyd_g/rshyd_g
// are per-game rates. The sentence has to say which or "50 red-zone
// carries" reads as a per-game number and the defense sounds absurd.
const TOTAL_STATS = new Set(['td', 'rz_tgts', 'rz_car'])

// HOW MUCH ABOVE THE LEAGUE, SAID HONESTLY (2026-10-04 user review: "5.6x the
// league looks stronger than the sample supports"; "say '2 games, early' in
// words and cap the multipliers"). A thin cell gets no multiplier at all; a
// solid one is capped at 3x+ -- past that the ratio is mostly noise in a
// small denominator.
export const MULTIPLE_CAP = 3
export function multipleWords(d, { short = false } = {}) {
  if (!d?.multiple || d.multiple < 1.35) return null
  if (d.thin) return short ? 'well above avg' : 'well above the league average'
  const m = d.multiple >= MULTIPLE_CAP ? `${MULTIPLE_CAP}x+` : `${Math.round(d.multiple * 10) / 10}x`
  return short ? `${m} the league` : `${m} the league average`
}
/** ' · early: 2 games' for a thin cell, else ''. */
export const earlyNote = (d) => (d?.thin ? (Number.isFinite(d.games) ? ` · early: ${d.games} ${d.games === 1 ? 'game' : 'games'}${d.when ? ` ${d.when}` : ''}` : ' · early, small sample') : '')

export const softLine = (d) => {
  if (!d) return 'matchup table pending'
  if (!d.standout) return 'no standout weakness — it holds up everywhere'
  const unit = TOTAL_STATS.has(d.stat)
    ? `${d.label}${Number.isFinite(d.games) ? ` in ${d.games} games` : ''}`
    : `${d.label} a game`
  const much = multipleWords(d) || `league average is ${fmtVal(d.leagueAvg)}`
  // A thin cell says how thin, once, in words, in the one sentence every page prints.
  // a solid sample says its season and its games once, at the end ("· 3 games this season"); a thin one says it in earlyNote
  const tail = !d.thin && d.when && Number.isFinite(d.games) && d.games > 0 ? ` · ${d.games} ${d.games === 1 ? 'game' : 'games'} ${d.when}` : ''
  return `gives up ${fmtVal(d.value)} ${unit} to the opposing ${d.plain} — ${much}${earlyNote(d)}${tail}`
}

export const SOFT_TITLE = "Where this defense is furthest above the league's own average for that role and stat, measured in standard deviations rather than by rank. Rank compresses — by rank alone most of the league is 1st or 2nd softest at something, which tells you nothing."

// ── THE TAG: TARGET / AVOID / EVEN (2026-09-11, Phase 2 depth pass) ────────
//
// Competitive Reference #3 ("Defense allowed, not just defense stats"): "That
// tag system is the single easiest high-leverage thing to copy conceptually
// -- it turns a stat table into a decision." softRole()/DvpTable already
// carry the rank; this turns ONE player's ONE market into a plain verdict
// against the specific defense he's facing this week, instead of making a
// reader hold the whole 11-role x 6-stat table in their head.
//
// Same stats as softRole() -- see DVP_SIGNAL_STATS above. REC and RUSH_ATT
// were honestly untagged until 2026-09-15: there's no per-role reception-
// count or rush-attempt-count column published, but red-zone targets/
// carries allowed IS a real, role-level opportunity signal for exactly
// those two markets, so it fills the gap rather than leaving it faked.
// PASS_YDS and KICK_PTS still have no per-role DVP equivalent at all.
export const MARKET_STAT = {
  TD: 'td', REC_YDS: 'recyd_g', REC: 'rz_tgts',
  RUSH_YDS: 'rshyd_g', RUSH_ATT: 'rz_car',
}

// Same three buckets DvpTable's rankColor() already paints (green+lime /
// yellow / orange+red), collapsed to a verdict instead of a color -- 12 and
// 22 are literally DvpTable's own lime/orange boundaries, not a second set
// of thresholds invented here, so the tag and the table can never disagree
// about the same cell.
export function tagForRank(rank) {
  const r = Number(rank)
  if (!Number.isFinite(r)) return null
  if (r <= 12) return 'TARGET'
  if (r >= 22) return 'AVOID'
  return 'EVEN'
}

// player: needs .player_id (for matchup.roles lookup) and .opp (the team
// he's facing this week -- every player row already carries it, confirmed
// against Matchups.js's own `facing` filter: `p.opp === active`). market:
// one of MARKET_STAT's keys; anything else (KICK_PTS; PASS_YDS is handled
// separately above) returns null rather than a guessed tag.
// PASS_YDS has no per-role DVP equivalent (see the note above on
// MARKET_STAT) -- there is no "role" a passer plays that a defense-vs-
// position table can rank. But nfl_disruption.py's pass_rush_efficiency()
// (2026-09-13) ships a real, individual signal DVP never covered: does the
// defense HE is about to face roster an actual finisher up front. Team-
// level, not role-level -- a pass rush doesn't care what role the passer
// plays, only whether it can get to him.
//
// Thresholds are top/bottom QUARTILE of pass_rush's own percentile (already
// computed within DL/LB, see nfl_disruption.py) -- one notch stricter than
// DVP's top/bottom third, since an 80th-percentile-plus pass rusher already
// implies real, individual disruption ability, not just "one of the better
// thirds of a 32-team DVP table."
export const PASS_RUSH_AVOID = 75
export const PASS_RUSH_TARGET = 25

/** The single most disruptive pass rusher, by percentile, on `team` --
 * or null if nothing in matchup.pass_rush belongs to that team (a team with
 * no rusher who cleared nfl_disruption.py's own MIN_PRESSURES bar is simply
 * uncovered, not assumed harmless). */
// THE FLIP WEEK (2026-09-28). Once three weeks are played the bot moves the
// context tables to this season, but a block whose sample floor this season
// can't clear yet (pass_rush, dvp_trend, disruption) is served from last season
// and named in matchup.block_seasons. This is the one place that answers
// "which year is this block": the block's own year, else the file's `season`.
export function blockSeason(matchup, block) {
  return Number(matchup?.block_seasons?.[block]) || Number(matchup?.season) || null
}

export function passRushThreat(matchup, team) {
  if (!team) return null
  let best = null
  for (const row of Object.values(matchup?.pass_rush || {})) {
    if (row?.team !== team) continue
    if (!best || row.percentile > best.percentile) best = row
  }
  return best
}

export function matchupTag(matchup, player, market, win = 'season') {
  if (market === 'PASS_YDS') {
    const best = passRushThreat(matchup, player?.opp)
    if (!best) return null
    const pct = Math.round(best.percentile)
    const tag = best.percentile >= PASS_RUSH_AVOID ? 'AVOID' : best.percentile <= PASS_RUSH_TARGET ? 'TARGET' : 'EVEN'
    const title = tag === 'AVOID'
      ? `${player.opp} rosters a real finisher up front — ${best.name} grades ${pct}th percentile on sack-per-pressure rate among ${best.pos_group === 'LB' ? 'linebackers' : 'linemen'} — a genuine pass-rush concern for this passing prop.`
      : tag === 'TARGET'
        ? `${player.opp}'s pass rush has no standout individual finisher this week (best is ${best.name} at ${pct}th percentile) — a real lean-in matchup for this passing prop.`
        : `${player.opp}'s best pass rusher (${best.name}) grades ${pct}th percentile — no real edge either way for this passing prop.`
    const yr = matchup?.block_seasons?.pass_rush
    const from = yr ? ` From ${yr}: this season's pressure counts are still too small to grade.` : ''
    return { tag, stat: 'pass_rush', label: 'pass rush', opp: player.opp, detail: `${best.name} — ${pct}th percentile sack-per-pressure${yr ? ` (${yr})` : ''}`, title: title + from }
  }
  const stat = MARKET_STAT[market]
  if (!stat || !player?.opp || !player?.player_id) return null
  const role = matchup?.roles?.[player.player_id]
  if (!role) return null
  const cell = matchup?.dvp?.[win]?.[player.opp]?.[role]
  const rank = cell?.[`${stat}_rank`]
  const tag = tagForRank(rank)
  if (!tag) return null
  const label = (DVP_SIGNAL_STATS.find(([k]) => k === stat) || [])[1] || stat
  // the season and the games behind this rank (a blended payload can hold last season's row for one defense): the Discord line and
  // the card say which, lib/nfl/seasonRule.js has the words
  const games = Number.isFinite(Number(cell?.g)) ? Number(cell.g) : null
  const season = Number(cell?.s ?? matchup?.season) || null
  return { tag, rank, stat, label, role, opp: player.opp, games, season, detail: `${role} vs ${player.opp} — #${rank} of 32 in ${label} allowed${whenOf(matchup, cell) ? ` (${games != null ? `${games} ${games === 1 ? 'game' : 'games'} ` : ''}${whenOf(matchup, cell)})` : ''}` }
}

export const TAG_TITLE = {
  TARGET: 'This defense ranks in the softest third of the league against this role and market — a real lean-in matchup, not just a number.',
  AVOID: 'This defense ranks in the stingiest third of the league against this role and market — the matchup is working against this pick.',
  EVEN: 'This defense is middle-of-the-pack against this role and market — no real matchup edge either way.',
}

// ALIGNED SIGNALS (B10(b)/(e), 2026-09-16) -- the fourth flag, and the only
// composite one. MLB's SignalAudit.js grades a dedicated 🧩 "Aligned"
// tag: "weak-spot + pitch-match + real recent contact quality all stacking
// together (strongest validated combo)" -- multiple independent real
// signals lining up on the same player, not any one of them alone. The TD
// market's three closest, already-real equivalents:
//   matchup   -- matchupTag(matchup, player, 'TD') === 'TARGET' (this file,
//                already shipped: DVP role rank vs this week's opponent)
//   finisher  -- matchup.red_zone[player_id].percentile >= FINISHER_PCTL,
//                same 80th-percentile bar streaks.js's reasonsFor() already
//                uses for "a real finisher, not just volume"
//   rising    -- matchup.snaps[player_id].trend >= SNAP_RISING, the exact
//                20-point bar nfl_snaps.py's own RISING constant measured
//                off the real 2025 trend distribution (sd 12.1, 90th +14.9)
//
// Requiring all three, the literal reading of "all stacking together",
// measured against today's live slate: 1 of 196 TD-eligible players. A
// signal that fires roughly once a week across the whole league is not a
// board, it's a coincidence detector -- most weeks it would show nothing at
// all. Two of three measured at 14 of 196 (~7%), the same order of
// selectivity as this file's own PASS_RUSH_AVOID/TARGET quartile cut and
// coverage_mismatch_tag's real hit rate (27+12 of 526, ~7.4%) -- genuinely
// selective, not silent. ALIGNED_MIN=2 is that measured choice, not a
// guess.
export const FINISHER_PCTL = 80
export const SNAP_RISING = 20.0
export const ALIGNED_MIN = 2

/** Does this TD-market player have multiple real signals lining up at once?
 * Returns which of the three hit even when the total falls short of
 * ALIGNED_MIN, so a card can show "2 of 3" honestly instead of a bare bool. */
export function alignedSignals(matchup, player) {
  const matchTag = matchupTag(matchup, player, 'TD')
  const matchupHit = matchTag?.tag === 'TARGET'
  const rz = matchup?.red_zone?.[player?.player_id]
  const finisherHit = Number.isFinite(rz?.percentile) && rz.percentile >= FINISHER_PCTL
  const snap = matchup?.snaps?.[player?.player_id]
  const risingHit = Number.isFinite(snap?.trend) && snap.trend >= SNAP_RISING
  const hits = [matchupHit, finisherHit, risingHit].filter(Boolean).length
  return { aligned: hits >= ALIGNED_MIN, hits, matchupHit, finisherHit, risingHit }
}
