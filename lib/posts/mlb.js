// MOONSHOT'S ADAPTER FOR THE SLATE (X overhaul piece 3, 2026-10-09). Pure: it takes the rows the
// homers tick has already loaded (the board file) and answers in the Slate's one candidate shape.
// No fetch, no database. Candidate = {
//   sport, id, name, teamName, rank, of, startMs, problem, proof }
// where `rank` / `of` are HIS PLACE ON MOONSHOT'S OWN BOARD (board_rank of board_of) -- the only thing
// the Slate ever compares across sports, as a share of that sport's own board (lib/posts/slate.js).
import { callStatus, boardOfRows } from '../callStatus'
import { mlbNamingProblem } from '../dash/namingChecks'
import { teamFullName } from '../mlbTeams'
import { BRAND } from '../routes'

export const SPORT = 'mlb'
const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

/** One proof line, from his own row. First one the row can back; the board place is the floor. */
export function mlbProof(r, rank, of) {
  const l10 = num(r?.last10_hr)
  if (l10 != null && l10 >= 1) return `${l10} HR in his last 10 games`
  const arm = txt(r?.pitcher_name)
  const l3 = num(r?.pitcher_l3_hr9)
  if (arm && r?.pitcher_projected !== true && l3 != null && l3 >= 1) return `${arm} allows ${l3.toFixed(2)} HR/9 lately`
  const hr = num(r?.season_hr)
  if (hr != null && hr >= 1) return `${hr} home runs this season`
  return rank && of ? `#${rank} of ${of} on the ${BRAND[SPORT].name} board` : `On the ${BRAND[SPORT].name} board`
}

/**
 * @param rows  the board rows for the day (the homers tick's boardRows())
 * @param live  lib/dash/tweetFeed liveIndexFrom(snap), or null
 * @param hold  a reason the board is not tonight's board (stale date, stale arms): no one is named
 * @param firstStartMs  the first pitch from today's schedule (used when the rows' own times are not trusted)
 * @returns {{ sport, hasGames, firstStartMs, hold, cands }}
 */
export function mlbSlate({ rows = [], live = null, hold = null, firstStartMs = NaN } = {}) {
  const list = Array.isArray(rows) ? rows : []
  const starts = list.map((r) => Date.parse(r?.game_time)).filter(Number.isFinite)
  // a board that is not tonight's (hold) has game times that are not tonight's either: only the tick's own
  // first pitch (from today's schedule) is used then
  const first = hold ? Number(firstStartMs) : (starts.length ? Math.min(...starts) : Number(firstStartMs))
  const out = { sport: SPORT, hasGames: list.length > 0 || Boolean(live?.size) || Boolean(hold && Number.isFinite(Number(firstStartMs))), firstStartMs: Number.isFinite(first) ? first : NaN, hold: hold || null, cands: [] }
  if (hold) return out
  const of = boardOfRows(list)
  const seen = new Set()
  for (const r of list) {
    const id = txt(r?.player_id)
    if (!id || seen.has(id)) continue
    // CALLED is lib/callStatus.js's word, read off the pregame role the board carries
    if (callStatus({ role: r.game_pick_role }) !== 'called') continue
    const rank = num(r.board_rank)
    if (!(rank > 0)) continue
    seen.add(id)
    out.cands.push({
      sport: SPORT, id, name: txt(r.name), team: txt(r.team), teamName: teamFullName(r.team), rank, of,
      startMs: Date.parse(r.game_time),
      problem: mlbNamingProblem(r, { live: live?.size ? live : null }),
      proof: mlbProof(r, rank, of),
    })
  }
  return out
}
