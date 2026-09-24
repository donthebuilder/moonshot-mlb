// SET BEST LINEUP (2026-09-24).
//
// ESPN's "quick lineup": one tap and the healthiest, highest-projected men
// start. Donovan found 3zzz starting Trevor Lawrence (17.1) over Jalen Hurts
// (22.4); this is the button that fixes that in one move, for your own team,
// or -- commissioner only -- for a manager who is not around.
//
// Pure: takes the roster, this week's lineup rows and the clock, returns the
// rows the lineup SHOULD have. The caller writes them. Rules, in order:
//
//  · A locked row stays exactly where it is (his game started; the slot is
//    part of the week's score). IR rows stay too -- that is a roster decision.
//  · A player whose game has started but who is NOT in a row stays out of the
//    lineup -- he cannot be placed after kickoff.
//  · Starters are chosen from everyone else who can play: not on bye, not
//    ruled out (lib/fantasy/injury.js), not missing from the week's slate.
//    Scarcest slot first (K, DEF, QB, TE, RB, WR, then FLEX), best projection.
//  · A starting slot nobody healthy can fill keeps whoever is in it now,
//    rather than going empty -- an empty slot is the same zero and looks like
//    the button lost a player.
//  · Everyone left over goes to the bench, best projection first, into the
//    bench indexes locked rows are not using. Past the bench's size, a man
//    stays unassigned (still on the roster).
import { isUnavailable, offSlate } from './injury'

const FILL_ORDER = ['K', 'DEF', 'QB', 'TE', 'RB', 'WR', 'FLEX']

export function startingSlots(league) {
  const slots = [['QB', 1], ['RB', 1], ['RB', 2], ['WR', 1], ['WR', 2], ['TE', 1], ['FLEX', 1]]
  if (league?.has_kicker) slots.push(['K', 1])
  if (league?.has_defense) slots.push(['DEF', 1])
  return slots
}
export const benchSize = (league) => Math.max(1, 15 - startingSlots(league).length)

const fits = (player, slot) =>
  slot === 'FLEX' ? ['RB', 'WR', 'TE'].includes(player?.position) : player?.position === slot

/**
 * @param {object} a
 * @param {object} a.league        fantasy_leagues row (has_kicker, has_defense)
 * @param {object[]} a.roster      nfl_players rows on the roster
 * @param {object[]} a.rows        this week's fantasy_lineup_slots rows for the team
 * @param {(p)=>boolean} a.started his game has kicked off
 * @param {(p)=>boolean} a.onBye   his club has no game this week
 * @param {(p)=>number} a.project  this week's projected points
 * @param {Set<string>|null} [a.slateIds]   ids on this week's slate (see slateKey)
 * @param {(p)=>string} [a.slateKey]        which id of the player slateIds holds
 * @returns {{ rows: {slot,slot_index,player_id}[], starters: object[], changed: number }}
 */
export function planBestLineup({ league, roster, rows, started, onBye, project, slateIds = null, slateKey = (p) => p.source_player_id }) {
  const byId = new Map(roster.map((p) => [p.id, p]))
  const keep = rows.filter((r) => r.locked_at || r.slot === 'IR' || started(byId.get(r.player_id)))
  const keptIds = new Set(keep.map((r) => r.player_id))
  const keptSlot = new Set(keep.map((r) => `${r.slot}#${r.slot_index}`))
  const canPlay = (p) => !onBye(p) && !isUnavailable(p) && !offSlate(p, slateIds, (x) => !onBye(x), slateKey)

  // Men who may move: on the roster, not pinned by a lock/IR, game not started.
  const free = roster.filter((p) => !keptIds.has(p.id) && !started(p))
  const value = new Map(free.map((p) => [p.id, Number(project(p)) || 0]))
  const pool = free.filter(canPlay).sort((a, b) => value.get(b.id) - value.get(a.id))

  const open = startingSlots(league)
    .filter(([s, i]) => !keptSlot.has(`${s}#${i}`))
    .sort((a, b) => FILL_ORDER.indexOf(a[0]) - FILL_ORDER.indexOf(b[0]))
  const used = new Set()
  const out = []
  for (const [slot, index] of open) {
    let pick = pool.find((p) => !used.has(p.id) && fits(p, slot))
    if (!pick) {
      // Nobody healthy fits: keep the current occupant if he may still move.
      const now = rows.find((r) => r.slot === slot && r.slot_index === index)
      const cur = now && byId.get(now.player_id)
      if (cur && !used.has(cur.id) && free.includes(cur)) pick = cur
    }
    if (!pick) continue
    used.add(pick.id)
    out.push({ slot, slot_index: index, player_id: pick.id })
  }

  const benchTaken = new Set(keep.filter((r) => r.slot === 'BENCH').map((r) => r.slot_index))
  const benchFree = []
  for (let i = 1; i <= benchSize(league); i += 1) if (!benchTaken.has(i)) benchFree.push(i)
  const rest = free.filter((p) => !used.has(p.id)).sort((a, b) => value.get(b.id) - value.get(a.id))
  rest.slice(0, benchFree.length).forEach((p, i) => out.push({ slot: 'BENCH', slot_index: benchFree[i], player_id: p.id }))

  const before = new Map(rows.filter((r) => !keptIds.has(r.player_id)).map((r) => [r.player_id, `${r.slot}#${r.slot_index}`]))
  const changed = out.filter((r) => before.get(r.player_id) !== `${r.slot}#${r.slot_index}`).length
  const starters = out.filter((r) => r.slot !== 'BENCH').map((r) => ({ ...r, player: byId.get(r.player_id), value: value.get(r.player_id) }))
  return { rows: out, starters, changed }
}
