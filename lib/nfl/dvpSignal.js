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

// ── THE TAG: TARGET / AVOID / EVEN (2026-09-11, Phase 2 depth pass) ────────
//
// Competitive Reference #3 ("Defense allowed, not just defense stats"): "That
// tag system is the single easiest high-leverage thing to copy conceptually
// -- it turns a stat table into a decision." softRole()/DvpTable already
// carry the rank; this turns ONE player's ONE market into a plain verdict
// against the specific defense he's facing this week, instead of making a
// reader hold the whole 11-role x 6-stat table in their head.
//
// Same three stats as softRole() -- 'td'/'recyd_g'/'rshyd_g' are the only
// ones the DVP payload actually carries a signal for (see DVP_SIGNAL_STATS
// above). REC, PASS_YDS and KICK_PTS have no per-role DVP equivalent, so a
// call in one of those markets stays honestly untagged rather than guessed.
export const MARKET_STAT = { TD: 'td', REC_YDS: 'recyd_g', RUSH_YDS: 'rshyd_g' }

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
// one of MARKET_STAT's keys; anything else (REC/PASS_YDS/KICK_PTS) returns
// null rather than a guessed tag.
export function matchupTag(matchup, player, market, win = 'season') {
  const stat = MARKET_STAT[market]
  if (!stat || !player?.opp || !player?.player_id) return null
  const role = matchup?.roles?.[player.player_id]
  if (!role) return null
  const cell = matchup?.dvp?.[win]?.[player.opp]?.[role]
  const rank = cell?.[`${stat}_rank`]
  const tag = tagForRank(rank)
  if (!tag) return null
  const label = (DVP_SIGNAL_STATS.find(([k]) => k === stat) || [])[1] || stat
  return { tag, rank, stat, label, role, opp: player.opp }
}

export const TAG_TITLE = {
  TARGET: 'This defence ranks in the softest third of the league against this role and market -- a real lean-in matchup, not just a number.',
  AVOID: 'This defence ranks in the stingiest third of the league against this role and market -- the matchup is working against this pick.',
  EVEN: 'This defence is middle-of-the-pack against this role and market -- no real matchup edge either way.',
}
