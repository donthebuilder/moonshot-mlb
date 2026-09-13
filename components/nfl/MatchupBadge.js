'use client'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { matchupTag, TAG_TITLE } from '../../lib/nfl/dvpSignal'

// THE TAG (2026-09-11, Phase 2 depth pass, Competitive Reference #3). Turns
// one player's one market into a plain verdict against the specific defense
// he's facing this week -- TARGET when that defense ranks in the softest
// third of the league against this role/market, AVOID in the stingiest
// third. Silent for EVEN and for anything neither payload can cover
// (REC/KICK_PTS, or a role that hasn't published yet) -- a badge
// that says nothing you couldn't already guess isn't worth the pixels, same
// "renders nothing when there's nothing to say" rule the rest of this
// product already follows.
//
// Extracted out of components/nfl/tabs/Games.js (2026-09-13) so the
// Matchups page's player picker can show the same tag instead of growing a
// second copy -- item 40's own "not done in this batch, queued next" line.
// Games.js and Matchups.js both import this one component now.
// PASS_YDS (2026-09-13) is sourced from a DIFFERENT payload than the other
// three markets -- matchup.pass_rush (nfl_disruption.py's
// pass_rush_efficiency(), an individual pass-rush percentile), not
// matchup.dvp -- because PASS_YDS has no role for a DVP table to rank.
// matchupTag() branches on that internally; this component doesn't need to
// know which source answered.
export default function MatchupBadge({ matchup, player, market }) {
  const t = matchupTag(matchup, player, market)
  if (!t || t.tag === 'EVEN') return null
  const color = t.tag === 'TARGET' ? C.green : C.red
  // t.title is a fully-composed override for a tag not sourced from the DVP
  // role/rank table (2026-09-13's PASS_YDS/pass-rush branch, which has no
  // "role" or "#rank of 32" to report) -- every other tag still falls back
  // to the original DVP-shaped sentence, now built from t.detail instead of
  // re-deriving role/rank/label inline here a second time.
  return (
    <span
      title={t.title || `${TAG_TITLE[t.tag]} (${t.detail})`}
      style={{
        fontSize: 8, fontWeight: 900, color, fontFamily: NUM_FONT, letterSpacing: '.04em',
        border: `1px solid ${color}55`, background: `${color}18`, borderRadius: 4,
        padding: '1px 4px', flexShrink: 0,
      }}
    >{t.tag}</span>
  )
}
