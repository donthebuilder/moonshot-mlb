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
import { nhlGoalieProblem } from '../nhl/oppGoalie'
import { nhlTeam } from '../nhl/teams'
import { resultOf } from '../record/nhl'
import { BRAND } from '../routes'

export const SPORT = 'nhl'
const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export function nhlProof(r, rank, of) {
  const sog = num(r?.legs?.shotsPg)
  if (sog != null && sog > 0) return `${sog.toFixed(1)} shots a game`
  return rank && of ? `#${rank} of ${of} on the ${BRAND[SPORT].name} board` : `On the ${BRAND[SPORT].name} board`
}

/**
 * THE LOCK (2026-10-10). A game's rows are the CALLS only once the LAMP tick has written them (lamp_goal_log,
 * locked_at; the tick rewrites them every ten minutes inside the 100 minutes before puck drop, the last write
 * is the lock). Before that the board is a PREVIEW, and a preview is not a call: its rows are never named, and
 * the sport's `lockWait` says the lock is still to come (lib/posts/slate.js waits for it, then leaves LAMP out).
 */
export const nhlGameLocked = (g) => Boolean(g?.locked || g?.setting) && Boolean(g?.lockedAt)

export function nhlSlate({ games = [], now = Date.now() } = {}) {
  const list = Array.isArray(games) ? games.filter((g) => g?.game && (g.game.scheduleState == null || g.game.scheduleState === 'OK')) : []
  const starts = list.map((g) => Date.parse(g.game.startUtc)).filter(Number.isFinite)
  const out = { sport: SPORT, hasGames: list.length > 0, firstStartMs: starts.length ? Math.min(...starts) : NaN, hold: null, cands: [] }
  const first = list.filter((g) => Date.parse(g.game.startUtc) === out.firstStartMs)[0]
  if (first && !nhlGameLocked(first)) out.lockWait = { startMs: out.firstStartMs, reason: `lock not written yet for the first game (${txt(first.game.away?.abbrev)} at ${txt(first.game.home?.abbrev)}); it is written inside the 100 minutes before puck drop` }
  for (const g of list) {
    const startMs = Date.parse(g.game.startUtc)
    if (!nhlGameLocked(g)) continue                  // a preview is not a call: never named
    for (const r of g.rows || []) {
      if (r.preview) continue
      if (r.status !== 'called' || !(r.score != null)) continue
      const id = txt(r.playerId)
      const rank = num(r.context?.nightRank)
      const of = num(r.context?.nightOf)
      if (!id || !(rank > 0) || !(of > 0)) continue
      let problem = nhlGoalieProblem(g, r, id)       // the goalie source the NHL polls read too (lib/nhl/oppGoalie.js)
      if (!problem && g.game.state !== 'pre') problem = { id, reason: 'game already started', pending: false }
      out.cands.push({
        sport: SPORT, id, name: txt(r.name), team: txt(r.team), teamName: nhlTeam(r.team)?.name || '', rank, of, startMs, problem, proof: nhlProof(r, rank, of),
      })
    }
  }
  return out
}

// ── THE NIGHT RECEIPT's grade for a named skater (lib/posts/receipt.js) ─────────────────────────────
// LAMP grades its own rows (lamp_goal_log: dressed + hit, graded when the game is final); lib/record/nhl.js
// resultOf is the one word for it: hit / miss / void (not dressed) / null (not graded yet).
/**
 * @param p   { id }
 * @param res { rows: Map<id, lamp_goal_log row> }
 * @returns {'cashed'|'missed'|'void'|'pending'}
 */
export function nhlOutcome(p, res = {}) {
  const row = res.rows instanceof Map ? res.rows.get(txt(p?.id)) : null
  const r = row ? resultOf(row) : null
  return r === 'hit' ? 'cashed' : r === 'miss' ? 'missed' : r === 'void' ? 'void' : 'pending'
}
