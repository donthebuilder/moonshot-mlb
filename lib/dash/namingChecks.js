// BEFORE A POST NAMES A PLAYER (rule 4 of the X overhaul, 2026-10-09). Pure.
//
// Each check returns null (fine to name) or { id, reason, pending }:
//   pending: false  a definite no -- he is out, not on the slate, his game has
//                   started. He is left out of the post; waiting changes nothing.
//   pending: true   not yet -- the lineup is not posted, the starter or the
//                   goalie is not confirmed. The post is HELD (lib/dash/xPolicy
//                   holdOrDrop) and these are retried on later ticks.
// Emergency off-switch: X_GUARDS_OFF=naming (lib/dash/xPolicy guardOff).
import { isOut, injuryTag } from '../nfl/injury'
import { guardOff, holdOrDrop as policyHoldOrDrop } from './xPolicy'

const txt = (v) => String(v == null ? '' : v).trim()
const fail = (id, reason, pending) => ({ id: txt(id), reason, pending })

/**
 * MLB: on today's slate, his lineup posted with him in it, and the starter
 * confirmed (a "projected" arm is a guess). `row` is a board row; `live` the
 * liveSlate index (byPlayer/byTeam) when the caller has it.
 */
export function mlbNamingProblem(row, { live = null } = {}) {
  const id = txt(row?.player_id)
  if (live && live.size) {
    const g = (id && live.byPlayer.get(id)) || live.byTeam.get(txt(row?.team).toUpperCase()) || null
    if (!g) return fail(id, "not on today's slate", false)
    if (g.postponed || g.suspended) return fail(id, 'game postponed', false)
    if (txt(g.state) === 'Final' || txt(g.state) === 'Live') return fail(id, 'game already started', false)
    if (g.lineupPosted && g._lineupIds && !g._lineupIds.has(id)) return fail(id, 'not in the posted lineup', false)
    if (!g.lineupPosted) return fail(id, 'lineup not posted', true)
  }
  if (row?.lineup_confirmed !== true) return fail(id, 'lineup not posted', true)
  if (row?.pitcher_projected === true) return fail(id, 'starter not confirmed', true)
  return null
}

/** NFL: not OUT / inactive / IR / suspended. (Questionable and doubtful are still listed to play.) */
const INACTIVE = /\b(out|inactive|injured reserve|ir|suspended|susp|pup|nfi)\b/i
export function nflNamingProblem(player) {
  const id = txt(player?.player_id ?? player?.gsis_id)
  if (player?.on_bye) return fail(id, 'on bye', false)
  if (isOut(injuryTag(player)) || INACTIVE.test(txt(player?.injury_status))) return fail(id, `listed ${txt(player.injury_status) || 'out'}`, false)
  return null
}

/** NHL: the opposing starting goalie confirmed (`oppGoalieConfirmed`), game not started. Nothing stores this pregame today, so it fails closed. */
export function nhlNamingProblem(row) {
  const id = txt(row?.player_id ?? row?.id)
  if (row?.startsAt && Date.parse(row.startsAt) <= Date.now()) return fail(id, 'game already started', false)
  if (row?.oppGoalieConfirmed !== true) return fail(id, 'starting goalie not confirmed', true)
  return null
}

/**
 * Run `check` over `items` and sort them: { ok, blocked, pending }.
 * `idOf(item)` is only used when the problem has no id.
 */
export function sortByNaming(items, check) {
  const ok = [], blocked = [], pending = []
  for (const it of items || []) {
    const p = check(it)
    if (!p) ok.push(it)
    else (p.pending ? pending : blocked).push({ item: it, ...p })
  }
  return { ok, blocked, pending }
}

/**
 * Pick the names for a post under the naming rule. Pure.
 *   rows      every candidate row
 *   check     (row) -> null | { id, reason, pending }
 *   pickFrom  (rows) -> the picks the post would name from those rows (each with player_id)
 *   startOf   (row) -> ms start of his game
 *   trim      true: when a pending name runs out of time, build the post WITHOUT him
 *             (never names him) instead of dropping the whole post
 * -> { state: 'go', picks, left: [blocked], trimmed: [pending ids] }
 *  | { state: 'held', reason, pending }       retry next tick, nothing is claimed
 *  | { state: 'dropped', reason, pending }    out of time and trim is off
 */
export function resolveNaming({ rows, check, pickFrom, startOf, trim = false, now = Date.now(), holdOrDrop = policyHoldOrDrop }) {
  if (guardOff('naming')) return { state: 'go', picks: pickFrom(rows || []), left: [], trimmed: [] }   // emergency off-switch
  const { blocked, pending } = sortByNaming(rows, check)
  const blockedIds = new Set(blocked.map((b) => txt(b.id)))
  const pendingIds = new Set(pending.map((p) => txt(p.id)))
  const rows0 = (rows || []).filter((r) => !blockedIds.has(txt(r?.player_id ?? r?.id)))
  const picks = pickFrom(rows0)
  const idOfPick = (p) => txt(p?.player_id ?? p?.id)
  const pend = picks.filter((p) => pendingIds.has(idOfPick(p)))
  if (!pend.length) return { state: 'go', picks, left: blocked.map((b) => b.id), trimmed: [] }
  const byId = new Map((rows || []).map((r) => [txt(r?.player_id ?? r?.id), r]))
  const starts = picks.map((p) => startOf(byId.get(idOfPick(p)))).filter(Number.isFinite)
  const startMs = starts.length ? Math.min(...starts) : NaN
  const reasons = new Map(pending.map((p) => [txt(p.id), p.reason]))
  const h = holdOrDrop({ pending: pend.map((p) => ({ id: idOfPick(p), reason: reasons.get(idOfPick(p)) || 'not confirmed' })), startMs, now })
  const info = pend.map((p) => ({ id: idOfPick(p), reason: reasons.get(idOfPick(p)) || 'not confirmed' }))
  if (h.state === 'held') return { state: 'held', reason: h.reason, pending: info }
  if (!trim) return { state: 'dropped', reason: h.reason, pending: info }
  const rows1 = rows0.filter((r) => !pendingIds.has(txt(r?.player_id ?? r?.id)))
  return { state: 'go', picks: pickFrom(rows1), left: blocked.map((b) => b.id), trimmed: info.map((i) => i.id), reason: h.reason }
}
