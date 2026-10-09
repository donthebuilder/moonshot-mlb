// TUDDY'S ADAPTER FOR THE SLATE (X overhaul piece 3). Pure: takes the week file and the pick card the
// NFL tick already reads (nfl_week.json, nfl_picks.json). CALLED for football is a designated pick on
// the week's TD ladder (lib/nfl/tdFeed.js onBotFor); his place is his rank on the full TD board
// (scores.TD across every rated player, lib/nfl/tdFeed.js boardRankFor).
import { boardRankFor } from '../nfl/tdFeed'
import { nflNamingProblem } from '../dash/namingChecks'
import { easternDate } from '../data'
import { BRAND } from '../routes'

export const SPORT = 'nfl'
const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export function nflProof(p, rank, of) {
  const rz = num(p?.stats?.RZ)
  if (rz != null && rz > 0) return `${rz.toFixed(1)} red-zone touches a game`
  const gl = num(p?.stats?.GL)
  if (gl != null && gl > 0) return `${gl.toFixed(1)} goal-line touches a game`
  return rank && of ? `#${rank} of ${of} on the ${BRAND[SPORT].name} board` : `On the ${BRAND[SPORT].name} board`
}

/**
 * @param data   nfl_week.json ({ players, games })
 * @param picks  nfl_picks.json's `card` (TD.rungs) -- or the whole file; both are accepted
 * @param day    the slate day (ET date of the game)
 */
export function nflSlate({ data = null, picks = null, day, now = Date.now() } = {}) {
  const games = (Array.isArray(data?.games) ? data.games : []).filter((g) => g && g.kickoff && Number.isFinite(Date.parse(g.kickoff)) && easternDate(Date.parse(g.kickoff)) === day)
  const starts = games.map((g) => Date.parse(g.kickoff))
  const out = { sport: SPORT, hasGames: games.length > 0, firstStartMs: starts.length ? Math.min(...starts) : NaN, hold: null, cands: [] }
  if (!games.length) return out
  const card = picks?.card || picks || null
  const startOfTeam = new Map()
  const nameOfTeam = new Map()
  for (const g of games) {
    const t = Date.parse(g.kickoff)
    for (const [abbr, nm] of [[g.away, g.away_name], [g.home, g.home_name]]) { if (abbr) { startOfTeam.set(abbr, t); nameOfTeam.set(abbr, txt(nm)) } }
  }
  const byId = new Map((Array.isArray(data?.players) ? data.players : []).map((p) => [txt(p.player_id), p]))
  for (const rung of card?.TD?.rungs || []) {
    const id = txt(rung.player_id)
    const p = byId.get(id)
    if (!p || !startOfTeam.has(txt(p.team))) continue          // not on the day's slate
    const startMs = startOfTeam.get(txt(p.team))
    const place = boardRankFor(data, id)
    if (!place) continue
    let problem = nflNamingProblem(p)
    if (!problem && startMs <= now) problem = { id, reason: 'game already started', pending: false }
    out.cands.push({
      sport: SPORT, id, name: txt(p.name), team: txt(p.team), teamName: nameOfTeam.get(txt(p.team)) || '', rank: place.rank, of: place.of,
      startMs, problem, proof: nflProof(p, place.rank, place.of),
    })
  }
  return out
}

// ── THE NIGHT RECEIPT's grade for a named player (lib/posts/receipt.js) ─────────────────────────────
// A touchdown is a row in nfl_td_feed (the event table the NFL tick writes), matched by gsis id and, for a
// scorer the feed never joined to the roster, by name (the same match the board's own grade used). A man
// the week file lists out / inactive / on a bye did not play (void): the same test as the naming check
// (lib/dash/namingChecks.js nflNamingProblem), never re-derived.
/**
 * @param p   { id, name }
 * @param res { scorers: { ids: Set, names: Set }, players: Map<id, weekPlayer>|null }
 * @returns {'cashed'|'missed'|'void'}
 */
export function nflOutcome(p, res = {}) {
  const id = txt(p?.id)
  const scorers = res.scorers || {}
  if ((scorers.ids instanceof Set && scorers.ids.has(id)) || (scorers.names instanceof Set && scorers.names.has(txt(p?.name).toLowerCase()))) return 'cashed'
  const week = res.players instanceof Map ? res.players.get(id) : null
  return week && nflNamingProblem(week) ? 'void' : 'missed'
}
