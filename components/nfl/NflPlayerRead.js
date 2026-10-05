'use client'
import { C, MARKETS, gradeFor } from '../../lib/nfl/theme'
import { ReadFrame, Line } from '../PlayerRead'

// 🧭 TUDDY'S READ (2026-09-30, Donovan: "the mlb players page is the base ...
// use those components to make the other sports' player modal better"). The
// storyline desk's sentences (it lived on the Players page as "What the data
// says") in MOONSHOT's Read (components/PlayerRead.js ReadFrame + Line): one
// icon, one sentence, the number in it. Every sentence carries its direction
// -- FOR, AGAINST or context -- as it did on the desk.

/** The desk's sentences: [{ tone: 'for'|'against'|'note', text }]. */
export function nflReadBullets(player, market, rows = [], matchup = null) {
  const scored = Object.entries(player.scores || {}).filter(([, value]) => Number.isFinite(value)).sort((a, b) => b[1] - a[1])
  const [bestMarket, bestScore] = scored[0] || []
  const role = matchup?.dvp_roles?.[player.player_id] || matchup?.roles?.[player.player_id]
  const defense = matchup?.dvp?.season?.[player.opp]?.[role]
  // ── #21: THE DESK MIXED EVIDENCE FOR AND AGAINST, UNMARKED ───────────────
  //
  // McCaffrey's 81 (A+) card listed "LA ranks #28 in TDs allowed to the RB1
  // role (rank 1 is softest)" -- which argues AGAINST the call -- inside a
  // numbered list that reads, by its position on an A+ card, as the reasons
  // FOR it. A desk that presents a counter-argument as a supporting point is
  // worse than one that omits it.
  //
  // Every bullet now carries its direction, and the DVP one computes its own:
  // a low rank is a soft matchup and helps, a high rank is a hard one and
  // hurts, and the boundary is the middle of a 32-team league. Nothing is
  // dropped -- the point of a desk is that it says the awkward thing too; it
  // just has to say which way it points.
  const dvpRank = Number(defense?.td_rank)
  const dvpTone = !Number.isFinite(dvpRank) ? 'note' : dvpRank <= 12 ? 'for' : dvpRank >= 21 ? 'against' : 'note'
  // route_value (2026-09-13, nfl_offense_value.py): a career/season profile
  // fact about THIS player, not this week's matchup -- so it sits with the
  // other player-profile bullets (bestMarket), not the opponent-facing ones
  // below. 'note' tone, not 'for'/'against': a route he wins on doesn't
  // argue for or against THIS market's specific call, it's context for
  // reading the rest of the card.
  const rv = matchup?.route_value?.[player.player_id]
  // games_since_last_td (2026-09-19). nfl_bot.py has frozen this onto every
  // row since 2026-09-16 -- leak-free by construction, and frozen on purpose
  // rather than recomputed here, because a client-side walk of the same log
  // next month would silently change what a past week's number "was". It was
  // published and read by NOTHING until now.
  //
  // IT IS HISTORY, NOT A SIGNAL, and it is worded that way. A drought does not
  // make anyone due -- that is the gambler's fallacy, and this site does not
  // sell it (#8, #16). What it is: the plainest fact about a scorer, useful
  // for reading the rest of the card, which is exactly what the 'note' tone is
  // for. The Streaks page already owns the board-level version of this
  // question; one sentence here is the whole of what belongs on a profile.
  //
  // 0 is a real value with a real meaning -- he scored in his most recent
  // game -- so it gets its own sentence rather than "0 games since".
  const sinceTd = Number.isFinite(Number(player?.games_since_last_td))
    ? Number(player.games_since_last_td) : null
  const bullets = [
    bestMarket && { tone: 'for', text: `${(MARKETS.find(([k]) => k === bestMarket) || [])[1] || bestMarket} is his strongest DASH lane at ${Math.round(bestScore)} (${gradeFor(bestScore).label}).` },
    rv && { tone: 'note', text: `Wins most on ${rv.best_route.toLowerCase()} routes when targeted -- ${rv.best_yds_per_tgt} yards per target, his best of any route type with enough sample in ${matchup?.chart_season || 'the charting season'}.` },
    sinceTd != null && {
      tone: 'note',
      text: sinceTd === 0
        ? 'Found the end zone in his most recent game.'
        : `${sinceTd} game${sinceTd === 1 ? '' : 's'} since his last touchdown — history, not a forecast; a drought does not make anyone due.`,
    },
    player.questionable && { tone: 'against', text: 'Injury status is questionable; the slate row should be rechecked before kickoff.' },
    player.carryover && { tone: 'note', text: 'The current score leans on last season’s per-game baseline until current-season form has depth.' },
    role && defense && {
      tone: dvpTone,
      text: `${player.opp} ranks #${Number.isFinite(dvpRank) ? dvpRank : '—'} of 32 in TDs allowed to the ${role} role — ${
        !Number.isFinite(dvpRank) ? 'rank not published'
          : dvpRank <= 12 ? 'a soft spot, and a reason for the call'
            : dvpRank >= 21 ? 'a hard spot, and a reason against it'
              : 'middle of the league, neither way'
      }.`,
    },
  ].filter(Boolean)
  return bullets
}

const ICON = { for: '🟢', against: '🔴', note: '·' }
const TONE = () => ({ for: C.green, against: C.red, note: C.text2 })

export default function NflPlayerRead({ player, market, rows, matchup }) {
  if (!player) return null
  const bullets = nflReadBullets(player, market, rows || [], matchup)
  if (!bullets.length) return null
  return (
    <ReadFrame sub="this week in sentences — every number below backs one of these">
      {bullets.map((b) => (
        <Line key={b.text} icon={ICON[b.tone] || '·'}>
          <span style={{ color: b.tone === 'note' ? C.text2 : TONE()[b.tone] }}>{b.text}</span>
        </Line>
      ))}
    </ReadFrame>
  )
}
