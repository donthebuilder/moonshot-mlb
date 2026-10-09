// LAMP'S ADAPTER FOR THE SLATE (X overhaul piece 3). Pure: takes lib/nhl/boardRead.js readBoard()'s
// `games` (locked rows, or the preview for a game still outside its window). CALLED is the board's own
// word (lib/nhl/goalModel.js scoreNight: the top skater of each club); his place is his night rank
// among every scored skater (context.nightRank of nightOf).
//
// THE GOALIE RULE (rule 4): a skater is named only once the opposing starting goalie is confirmed.
// The board carries the starters when a source exists (lamp_goal_games.starters, lib/nhl/goalies.js).
// With no source for a game there is nothing to wait for: he is a definite no (not "pending"), so the
// post is not held for a confirmation that cannot come. With a source and an unconfirmed goalie he is
// pending: the post holds until 30 minutes before puck drop, then goes out without him.
import { nhlNamingProblem } from '../dash/namingChecks'
import { nhlTeam } from '../nhl/teams'
import { BRAND } from '../routes'

export const SPORT = 'nhl'
const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export function nhlProof(r, rank, of) {
  const sog = num(r?.legs?.shotsPg)
  if (sog != null && sog > 0) return `${sog.toFixed(1)} shots a game`
  return rank && of ? `#${rank} of ${of} on the ${BRAND[SPORT].name} board` : `On the ${BRAND[SPORT].name} board`
}

/** The opposing goalie for a row, from the game's starters ({ away, home } with confirmed flags), or null. */
function oppGoalie(game, row) {
  const s = game?.starters
  if (!s || typeof s !== 'object') return undefined          // no source for this game
  const side = row.home ? 'away' : 'home'
  return s[side] || null
}

export function nhlSlate({ games = [], now = Date.now() } = {}) {
  const list = Array.isArray(games) ? games.filter((g) => g?.game && (g.game.scheduleState == null || g.game.scheduleState === 'OK')) : []
  const starts = list.map((g) => Date.parse(g.game.startUtc)).filter(Number.isFinite)
  const out = { sport: SPORT, hasGames: list.length > 0, firstStartMs: starts.length ? Math.min(...starts) : NaN, hold: null, cands: [] }
  for (const g of list) {
    const startMs = Date.parse(g.game.startUtc)
    for (const r of g.rows || []) {
      if (r.status !== 'called' || !(r.score != null)) continue
      const id = txt(r.playerId)
      const rank = num(r.context?.nightRank)
      const of = num(r.context?.nightOf)
      if (!id || !(rank > 0) || !(of > 0)) continue
      const goalie = oppGoalie(g, r)
      let problem
      if (goalie === undefined) problem = { id, reason: 'no starting-goalie source', pending: false }
      else problem = nhlNamingProblem({ player_id: id, startsAt: g.game.startUtc, oppGoalieConfirmed: goalie?.confirmed === true })
      if (!problem && g.game.state !== 'pre') problem = { id, reason: 'game already started', pending: false }
      out.cands.push({
        sport: SPORT, id, name: txt(r.name), team: txt(r.team), teamName: nhlTeam(r.team)?.name || '', rank, of, startMs, problem, proof: nhlProof(r, rank, of),
      })
    }
  }
  return out
}
