// BET-SLIP PAIR HISTORY FOR THE OTHER THREE (2026-10-15). MOONSHOT's slip tells you, for every two home-run legs, what
// the pair has measured (lib/slipPairs.js pairNotes: the co-HR history on file). This is the same note for TUDDY, LAMP and
// BUCKETS, read from the SAME four-season pair file their Pairs pages draw (pairhist_v2_<sport>.json; BUCKETS: our own
// graded games, lib/nba/pairHistory.js), through lib/pairHistV2.js's reader. Pure. Counts and a rate that were stored,
// nothing else: there are no "pair rules" for these sports (nothing like MOONSHOT's measured archive rules), so none is
// quoted, and a pair the file does not list says exactly that. Only the legs of the event the history counts (a goal, a
// touchdown, a 25-point game) get a note: a shots or yards leg is never quoted against the wrong bar.
import { arr } from './player'

/** The history's own words per sport: what the two did on the same day, and what a day is. */
export const SLIP_PAIR_WORDS = {
  nfl: { did: 'scored a touchdown', day: 'week', days: 'weeks', event: 'touchdown' },
  nhl: { did: 'scored a goal', day: 'day', days: 'days', event: 'goal' },
  nba: { did: 'scored 25+ points', day: 'day', days: 'days', event: '25-point game' },
}

const pct = (v) => `${(Math.round(Number(v) * 1000) / 10).toFixed(1)}%`

/** The pair's record in the file, by player id in either order, or null. */
export function findPairInFile(file, idA, idB) {
  if (!file || !Array.isArray(file.pairs) || !idA || !idB || idA === idB) return null
  return file.pairs.find((p) => {
    const ps = arr(p?.players)
    if (ps.length < 2) return false
    const a = String(ps[0]?.player_id), b = String(ps[1]?.player_id)
    return (a === idA && b === idB) || (a === idB && b === idA)
  }) || null
}

/**
 * One note per pair of event legs on the slip.
 * @param legs   [{ r: row, k: market key, key }]
 * @param file   the pairhist_v2 file (or null: the note says nothing about history)
 * @param cfg    { sport, idOf(row) -> player id, isEventLeg(k) -> bool }
 * @returns [{ id, a, b, text, rate, lift, together }]   (the shape components/props/BetSlip.js prints)
 */
export function pairHistNotes(legs, file, { sport, idOf: rowId, isEventLeg, nameOf }) {
  const W = SLIP_PAIR_WORDS[sport]
  if (!W || !file || !Array.isArray(file.pairs)) return []
  const ev = (legs || []).filter((l) => l?.r && isEventLeg(l.k))
  const out = []
  for (let i = 0; i < ev.length; i += 1) {
    for (let j = i + 1; j < ev.length; j += 1) {
      const A = ev[i].r, B = ev[j].r
      const ia = String(rowId(A)), ib = String(rowId(B))
      if (!ia || !ib || ia === ib) continue
      const h = findPairInFile(file, ia, ib)
      const th = file.thresholds || {}
      let text
      if (!h) {
        text = `Not in the pair history: they have not had ${th.min_joint_days ?? 'enough'} shared games with ${th.min_joint_event_days ?? 'enough'} ${W.days} where both ${W.did}, or one is not an active player. No history to quote.`
      } else {
        const parts = [`They both ${W.did} on the same ${W.day} ${h.joint_event_days} of ${h.joint_days} shared games (${pct(h.rate)})${Number(h.same_game_event_days) > 0 ? `, ${h.same_game_event_days} in the same game` : ''}.`]
        if (Number.isFinite(Number(h.expected_joint)) && Number.isFinite(Number(h.lift))) parts.push(`Their own rates alone would give ${Number(h.expected_joint).toFixed(1)}: lift ${Number(h.lift).toFixed(2)} (near 1.00 is coincidence).`)
        if (h.last_joint_date) parts.push(`Last time: ${String(h.last_joint_date).slice(0, 10)}.`)
        parts.push('History, not a forecast.')
        text = parts.join(' ')
      }
      out.push({ id: `${ev[i].key}+${ev[j].key}`, a: nameOf(A), b: nameOf(B), text, rate: h ? Number(h.rate) : null, lift: h && Number.isFinite(Number(h.lift)) ? Number(h.lift) : null, together: h ? Number(h.joint_event_days) : 0 })
    }
  }
  return out
}
