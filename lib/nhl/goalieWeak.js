// 🥅 WHERE A GOALIE IS WEAK (2026-10-10, Donovan: "need to know what position the goalie is weak to").
// PURE and browser-safe: no fetch, no clock. The numbers are the two SQL answers the goalie view already reads
// (lamp_goalie_zones for him, lamp_league_zones for the league: lib/nhl/goalieZones.js), cut into the 2-3 named
// zones where he has allowed the most goals ABOVE what the league's own rate gives for his shots there.
//
// WHAT THE DATA CAN SAY: the shot's place on the ice (x, y -> a named zone) and its type. It does NOT carry where in
// the net a shot went (glove / blocker / five-hole): the league's play-by-play has no net location, so there is no
// placement here and never a guess at one. The league's per-shot-type rates are not kept either, so a shot type is
// not compared with the league; zones are.
//
// THE RULES (each one printed where it matters):
//   · THE FLOOR   a goalie is only read at WEAK_FLOOR.starts starts OR WEAK_FLOOR.shots shots against this season.
//                 Under it the block says how many he has and ranks nothing.
//   · A ZONE      counts at WEAK_FLOOR.zoneShots shots there, WEAK_FLOOR.zoneGoals goals against, a rate above the league's
//                 by more than the rink tint's EVEN margin (lib/nhl/zones.js), and at least WEAK_FLOOR.excess goals above
//                 what the league's rate gives for those shots, a gap of at least one standard error of the shot count
//                 (WEAK_FLOOR.z). They are ranked by those extra goals, not by the rate (a 3-for-8 zone is a rate, not a weakness).
//   · THE SEASON  his shots are THIS season's, always, with "n starts · n shots this season" beside them. The league's
//                 rates are this season's when the league has the volume, else last season's, said in words
//                 (lib/nhl/goalieZones.js LEAGUE_MIN_SOG). Two seasons are never added into one number.
//   · INFORMATION A weak zone is where goals have gone in. It says nothing about what a shooter will do.
import { GOALIE_ZONES, goalieZoneRead, EVEN, zoneOf } from './zones'

export const WEAK_FLOOR = Object.freeze({ starts: 8, shots: 150, zoneShots: 20, zoneGoals: 2, excess: 1, z: 1 })
export const MAX_SPOTS = 3

/** Rink words for a zone key, as a sentence uses them ("from the left circle"). */
export const ZONE_PHRASE = Object.freeze({
  crease: 'the crease', inner_slot: 'the inner slot', slot: 'the slot', l_circle: 'the left circle', r_circle: 'the right circle',
  l_point: 'the left point', r_point: 'the right point', perimeter: 'behind the net',
})
/** Short names for a table cell / chip. */
export const ZONE_SHORT = Object.freeze({
  crease: 'Crease', inner_slot: 'Inner slot', slot: 'Slot', l_circle: 'L circle', r_circle: 'R circle', l_point: 'L point', r_point: 'R point', perimeter: 'Behind net',
})
const DEF = Object.fromEntries(GOALIE_ZONES.map((z) => [z.key, z.def]))

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const pct1 = (r) => `${Math.round(r * 1000) / 10}%`

/** { starts, sa, ga } from the goalie answer. `starts` = games with a shot against him (the SQL's distinct games). */
export function goalieSample(goalie) {
  return { starts: num(goalie?.games) ?? 0, sa: num(goalie?.sa) ?? 0, ga: num(goalie?.ga) ?? 0 }
}
export const clearsFloor = (s) => Boolean(s) && (s.starts >= WEAK_FLOOR.starts || s.sa >= WEAK_FLOOR.shots)

/** "5 starts · 142 shots this season" -- the sample, always beside any number he is read on. */
export function sampleLabel(s, seasonWord = 'this season') {
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
  return `${plural(s.starts, 'start')} · ${plural(s.sa, 'shot')} ${seasonWord}`
}

/** How the league's rates are labelled: "league this season" / "league last season (this season's league sample is still small)". */
export function leagueWord(read) {
  return read?.leagueFallback ? 'last season’s league rates (this season’s league sample is still small)' : 'this season’s league rates'
}

/**
 * Where he is weak.
 * @param answer  { available, goalie, league, leagueFallback } as readGoalieZones returns it
 * @returns { state: 'ok'|'thin'|'none'|'unavailable', sample, spots: [{ key, label, phrase, def, sa, ga, rate, lg, expected, excess }], leagueFallback }
 *   'unavailable' = the zone SQL has not answered (nothing is guessed); 'none' = he clears the floor and no zone is above the league by the rules.
 */
export function weakSpots(answer, { top = MAX_SPOTS } = {}) {
  if (!answer?.available || !answer.goalie || !answer.league) return { state: 'unavailable', sample: null, spots: [], leagueFallback: false }
  const sample = goalieSample(answer.goalie)
  const base = { sample, leagueFallback: Boolean(answer.leagueFallback), leagueSeason: answer.leagueSeason ?? null }
  if (!clearsFloor(sample)) return { ...base, state: 'thin', spots: [] }
  const read = goalieZoneRead(answer.goalie, answer.league)
  const spots = []
  for (const z of GOALIE_ZONES) {
    const r = read[z.key]
    if (!r || r.lg == null || r.rate == null) continue
    if (r.sa < WEAK_FLOOR.zoneShots || r.ga < WEAK_FLOOR.zoneGoals) continue
    if (!(r.rate - r.lg > EVEN)) continue
    const expected = r.sa * r.lg
    const excess = r.ga - expected
    if (excess < WEAK_FLOOR.excess) continue
    // and the gap is at least one standard error of the shot count (a coin's wobble at that many shots is not a weakness)
    const se = Math.sqrt(r.sa * r.lg * (1 - r.lg))
    if (!(se > 0) || excess / se < WEAK_FLOOR.z) continue
    spots.push({ key: z.key, label: z.label, phrase: ZONE_PHRASE[z.key], short: ZONE_SHORT[z.key], def: DEF[z.key], sa: r.sa, ga: r.ga, rate: r.rate, lg: r.lg, expected, excess })
  }
  spots.sort((a, b) => b.excess - a.excess || b.sa - a.sa)
  return { ...base, state: spots.length ? 'ok' : 'none', spots: spots.slice(0, top) }
}

/** The one plain sentence for a spot (the write-up's line). No claim about what a shooter will do. */
export function weakSentence(name, spot) {
  return `${name} allows more goals than the league from ${spot.phrase} (${spot.ga} on ${spot.sa} shots vs the league’s ${pct1(spot.lg)}).`
}

/** The zone counts of one shooter's shots on goal, from [x, y] pairs already turned to attack the right-hand net. */
export function zoneCounts(points) {
  const zones = {}
  let m = 0
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const k = zoneOf(x, y)
    zones[k] = (zones[k] || 0) + 1
    m += 1
  }
  return { m, zones }
}

/**
 * The shooter-vs-goalie match (information only): of his m shots on goal this season, how many came from the goalie's weak zones.
 * @param spots   weakSpots().spots
 * @param counts  zoneCounts() of the shooter
 * @returns { n, m, byZone: [{ key, short, n }] } -- n is shots from ANY of the weak zones listed; null when the shooter has no shots on file or the goalie has no spot
 */
export function shooterMatch(spots, counts) {
  if (!spots?.length || !counts || !(counts.m > 0)) return null
  const byZone = spots.map((s) => ({ key: s.key, short: s.short, n: counts.zones?.[s.key] || 0 }))
  return { n: byZone.reduce((a, z) => a + z.n, 0), m: counts.m, byZone }
}

/** Wording lint: a block's text never claims an outcome and never prints a probability. Returns the problems (empty = clean). */
export function lintWording(text) {
  const t = String(text || '')
  const bad = []
  if (/\b(will|would|going to|guaranteed?|lock|sure thing|should score|bound to|expect(?:ed)? to score)\b/i.test(t)) bad.push('claims an outcome')
  if (/\bprobab|\bchance|\bodds\b|\blikel(?:y|ihood)\b/i.test(t)) bad.push('a probability word') // allow-probability: the lint's own list of the words it bans, never printed
  return bad
}
