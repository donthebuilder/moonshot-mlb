'use client'

// 📐 PICKING THE RIGHT SEASON LINE — the traded-player bug.
//
// 2026-08-09, Donovan: "please make sure the storylines and the milestones are
// correct." They weren't, for one specific and invisible class of hitter.
//
// WHAT THE LEAGUE ACTUALLY RETURNS. Every consumer here read
// `stats[].splits[0].stat` and treated it as the season. For a player who
// spent the whole year with one club that is exactly right, which is why this
// never looked broken. For a player traded mid-season it is his OLD TEAM'S
// PARTIAL LINE.
//
// Verified live against a real traded hitter's yearByYear (2026-08-09):
//
//   season 2024, Boston Red Sox   21 G · 11 H · 13 TB · 5 RBI
//   season 2024, New York Mets     1 G ·  0 H ·  0 TB · 0 RBI
//   season 2024, (NO team field)  22 G · 11 H · 13 TB · 5 RBI   ← the total
//
// So MLB publishes one row per club PLUS an aggregate, and the aggregate is
// identifiable by having no `team` — 21 + 1 = 22 confirms it. `splits[0]` is
// the first club's row.
//
// WHAT THAT DID. A hitter with 28 homers split 18/10 across a deadline trade
// read as 18. His 30-homer milestone could never fire, the homer ledger would
// have called his 29th his 19th, and the player card's live season fallback
// showed a partial slash line. Every one of those is a confidently stated
// wrong number, and none of them looks wrong from the outside — which is the
// worst property a bug can have on a site whose whole pitch is receipts.
//
// THE RULE: prefer the aggregate, and if the league ever stops publishing one,
// sum the clubs ourselves rather than picking one arbitrarily.

const num = (v) => {
  const f = Number(v)
  return Number.isFinite(f) ? f : null
}

// Counting stats add across clubs. Rates do NOT — averaging two batting
// averages is not a batting average — so they're recomputed from components
// below rather than summed.
const COUNTING = [
  'gamesPlayed', 'plateAppearances', 'atBats', 'hits', 'doubles', 'triples',
  'homeRuns', 'rbi', 'runs', 'stolenBases', 'caughtStealing', 'baseOnBalls',
  'intentionalWalks', 'hitByPitch', 'strikeOuts', 'totalBases', 'sacFlies',
  'sacBunts', 'groundIntoDoublePlay', 'leftOnBase', 'numberOfPitches',
]

// Baseball rounds a rate HALF UP: 115-for-400 is .288, not .287.
//
// toFixed() rounds the BINARY value, and 0.2875 is stored as slightly less
// than 0.2875, so `(115/400).toFixed(3)` returns ".287" — a batting average
// one point light, on exactly the boundaries a fan would notice. The nudge
// puts the tie back on the right side without moving any non-tie value.
const fmt3 = (v) => (v == null ? undefined
  : (Math.round(v * 1000 + 1e-9) / 1000).toFixed(3).replace(/^0/, ''))

function sumSplits(splits) {
  const out = {}
  COUNTING.forEach((k) => {
    let any = false
    let t = 0
    splits.forEach((s) => {
      const v = num(s?.stat?.[k])
      if (v != null) { any = true; t += v }
    })
    if (any) out[k] = t
  })
  // Rates rebuilt from the totals — exact, not averaged.
  const ab = out.atBats
  const h = out.hits
  const tb = out.totalBases
  const bb = out.baseOnBalls || 0
  const hbp = out.hitByPitch || 0
  const sf = out.sacFlies || 0
  if (ab > 0 && h != null) out.avg = fmt3(h / ab)
  if (ab > 0 && tb != null) out.slg = fmt3(tb / ab)
  const onBaseDen = (ab || 0) + bb + hbp + sf
  if (onBaseDen > 0 && h != null) out.obp = fmt3((h + bb + hbp) / onBaseDen)
  if (out.obp && out.slg) {
    out.ops = fmt3(Number(out.obp) + Number(out.slg))
  }
  return out
}

/**
 * The season (or career) line for a player, handling mid-season trades.
 *
 * @param block a `stats[]` entry — the one whose type.displayName you want
 * @returns the stat object, or null
 */
export function pickSplit(block) {
  // Regular season only. A postseason or spring row sitting in the same array
  // would otherwise be able to win the `splits[0]` lottery.
  const splits = (block?.splits || []).filter((s) => (s?.gameType || 'R') === 'R')
  if (!splits.length) return null
  if (splits.length === 1) return splits[0]?.stat || null

  // The league's own aggregate: the row with no team on it.
  const total = splits.find((s) => !s?.team)
  if (total?.stat) return total.stat

  // No aggregate published — add the clubs up rather than picking one.
  return sumSplits(splits)
}

/** Convenience: find the named block on a person and pick its split. */
export function statOfPerson(person, type) {
  const block = (person?.stats || []).find((s) => s?.type?.displayName === type)
  return pickSplit(block)
}

// Fields every caller should ask for, so the rate rebuild above has its
// components available when a sum is needed. Kept here so the four call sites
// can't drift out of agreement with each other.
export const HITTING_FIELDS = [
  'gamesPlayed', 'plateAppearances', 'atBats', 'hits', 'doubles', 'triples',
  'homeRuns', 'rbi', 'runs', 'stolenBases', 'baseOnBalls', 'hitByPitch',
  'strikeOuts', 'totalBases', 'sacFlies', 'avg', 'obp', 'slg', 'ops',
].join(',')
