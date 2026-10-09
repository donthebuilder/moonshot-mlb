// TEST DATA (labelled): made-up clubs and boards, never shown on the site. The NHL featured pick ranks by the
// dial's number (game.proj.total), ties by the night's top-20 count, and logs the old rule beside the new.
//   node --import ./scripts/_esm-resolve.mjs scripts/writeups/test-nhl-pick.mjs
import { nhlFeaturedPicks } from '../../lib/writeups/nhlPick.js'

let bad = 0
const check = (ok, m) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${m}`); if (!ok) bad++ }
let pid = 1
// a TEST game: 2 called skaters (one per club); `top` of the rows sit in the night's top 20; `p` = each row's board goal chance
const G = (id, away, home, proj, { top = 0, p = 0.3, start = '2099-01-01T00:00:00Z' } = {}) => {
  const row = (team, i) => ({ playerId: pid++, team, status: 'called', score: 80 - i, context: { nightRank: i < top ? 5 : 99, goalGameProbability: p } })
  return { game: { id, startUtc: start, away: { abbrev: away }, home: { abbrev: home } }, proj, rows: [row(away, 0), row(home, 1)] }
}
const P = (total, source = 'xg') => ({ total, source })

// new number decides, not the old chances
{
  const r = nhlFeaturedPicks([G(1, 'AAA', 'BBB', P(5.9), { p: 0.1 }), G(2, 'CCC', 'DDD', P(6.4), { p: 0.1 }), G(3, 'EEE', 'FFF', P(5.0), { p: 0.6 })])
  check(r.pick.game_id === '2' && r.basis === 'xg', 'highest dial total wins')
  check(r.oldPick.game_id === '3', 'old rule (summed board chances) picks a different game')
  check(r.pick.proj_total === 6.4 && r.pick.proj_source === 'xg', 'the pick carries the dial number and its basis')
}
// exact tie on the dial -> most top-20 players
{
  const r = nhlFeaturedPicks([G(1, 'AAA', 'BBB', P(6.1), { top: 0 }), G(2, 'CCC', 'DDD', P(6.1), { top: 2 })])
  check(r.pick.game_id === '2', 'tie on the dial: more top-20 players wins')
}
// the dial total is a hair apart: the number wins over the tie-break (tie-break is only for exact ties)
{
  const r = nhlFeaturedPicks([G(1, 'AAA', 'BBB', P(6.11), { top: 0 }), G(2, 'CCC', 'DDD', P(6.1), { top: 2 })])
  check(r.pick.game_id === '1', 'a larger dial total beats more top-20 players')
}
// fallback basis
{
  const r = nhlFeaturedPicks([G(1, 'AAA', 'BBB', P(5.5, 'rate')), G(2, 'CCC', 'DDD', P(6.0, 'rate'))])
  check(r.basis === 'rate' && r.pick.game_id === '2', 'plain-rate fallback still ranks and says so')
}
// no number at all -> tie-break alone decides
{
  const r = nhlFeaturedPicks([G(1, 'AAA', 'BBB', null, { top: 1 }), G(2, 'CCC', 'DDD', null, { top: 2 })])
  check(r.basis === 'none' && r.pick.game_id === '2' && r.pick.proj_total === null, 'no dial numbers: basis none, the top-20 count picks, nothing made up')
}
// mixed
{
  const r = nhlFeaturedPicks([G(1, 'AAA', 'BBB', P(6.0)), G(2, 'CCC', 'DDD', null)])
  check(r.basis === 'mixed' && r.pick.game_id === '1', 'a game without a number is basis mixed and never beats one with it')
}
// repeat-club rule unchanged: a club featured recently steps aside for a game within 0.5
{
  const r = nhlFeaturedPicks([G(1, 'AAA', 'BBB', P(6.3)), G(2, 'CCC', 'DDD', P(6.0))], { recentTeams: new Set(['AAA']) })
  check(r.pick.game_id === '2', 'no-repeat rule still applies')
}
check(nhlFeaturedPicks([]).pick === null, 'empty night: no pick')
process.exit(bad ? 1 : 0)
