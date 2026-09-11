// Shared "what's the single softest matchup" signal — lifted out of
// components/nfl/tabs/Games.js (2026-09-11, Phase 2 depth pass) so the
// Matchups page can give the same one-sentence answer the Games cards do,
// instead of leaving a reader to scan an 11-row x 6-column DVP table
// themselves to find it. Two places computing this independently is how
// they'd drift; one function, two call sites.
//
// Covers the three stats the DVP payload actually carries a real signal
// for — confirmed directly against nfl_matchup.json's dvp_stats, not
// guessed: 'td', 'recyd_g', 'rshyd_g'. REC has no reception-count column
// published, PASS_YDS and KICK_PTS have no per-role DVP equivalent at all,
// so those three markets stay honestly uncovered rather than faked.
export const DVP_SIGNAL_STATS = [
  ['td', 'touchdowns'],
  ['recyd_g', 'receiving yards'],
  ['rshyd_g', 'rushing yards'],
]

// Picks the single softest cell across every role AND all three stats for
// one team's defense, so a defense that's mediocre against the pass but
// bleeds rushing yards to RB2s still surfaces its real weak point.
// `win` defaults to season (matches every pre-existing call site) but the
// Matchups page has its own season/L10/L5/L3 toggle, so it's threaded
// through rather than hardcoded a second time.
export function softRole(matchup, defense, win = 'season') {
  const roles = matchup?.dvp?.[win]?.[defense] || {}
  let best = null
  for (const [role, row] of Object.entries(roles)) {
    for (const [stat, label] of DVP_SIGNAL_STATS) {
      const rank = Number(row?.[`${stat}_rank`])
      if (!Number.isFinite(rank)) continue
      if (!best || rank < best.rank) best = { role, stat, label, rank, value: row[stat] }
    }
  }
  return best
}

// 11th/12th/13th are the exceptions the one-line version of this always
// gets wrong, and rank 11-13 of 32 is squarely in range here.
export const ordinal = (n) => {
  const x = Number(n)
  if (!Number.isFinite(x) || x < 1) return null
  const tens = x % 100
  if (tens >= 11 && tens <= 13) return `${x}th`
  return `${x}${['th', 'st', 'nd', 'rd'][x % 10] || 'th'}`
}

export const softLine = (d) => {
  if (!d) return 'matchup table pending'
  const o = ordinal(d.rank)
  if (!o) return 'softest matchup for this defence'
  return `${o} softest of 32 in ${d.label} against the ${String(d.role).toLowerCase()} role`
}

export const SOFT_TITLE = 'The single biggest opening this defence gives up -- role, market (touchdowns / receiving yards / rushing yards), and where it ranks league-wide against that role and market. Rank 1 leaks the most.'
