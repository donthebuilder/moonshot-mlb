// WHAT HELPS PEOPLE PAIR PLAYERS, ON THE BET SLIP (2026-10-07). The Parlay Builder page is deleted (owner's call);
// its useful parts moved here, on real data only, and are read by the slip (components/props/BetSlip.js):
//   notes     for every two home-run legs on the slip: the measured both-homer rate of the best rule the pair
//             meets (lib/pairEvidence.js PAIR_RULES, measured over the archive against a random pair), the
//             weaker leg (both must land, so the weaker one decides), and any co-HR history on file
//             (pair_history_summary, lib/pairHistory.js). A pair that meets no rule says so; nothing is invented.
//   partners  the hitters who pair best with what is already on the slip (the same rules, ranked), a tap adds one.
// Pure. Home-run family only (TOP / HR / WATCH): the rules and the history are about two homers, so a hits or
// bases leg gets neither (never a rate quoted against the wrong bar).
import { PAIR_BASELINE, pairRate, pairSampleNote } from './pairEvidence'
import { findPairHistory } from './pairHistory'
import { hrScore, nameOf, n } from './player'

/** The markets whose bar is "1+ home run". */
export const HR_FAMILY = new Set(['TOP', 'HR', 'WATCH'])
export const isHrLeg = (k) => HR_FAMILY.has(String(k))

const pct = (v) => `${Number(v).toFixed(1)}%`
const sameMan = (a, b) => String(a?.player_id ?? a?.id ?? nameOf(a)) === String(b?.player_id ?? b?.id ?? nameOf(b))

/**
 * One note per pair of home-run legs.
 * @param legs [{ r: slate row, k: market key, key }]
 * @param summary pair_history_summary (or null)
 * @returns [{ id, a, b, text, rate, lift, together }]
 */
export function pairNotes(legs, summary = null) {
  const hr = (legs || []).filter((l) => l?.r && isHrLeg(l.k))
  const out = []
  for (let i = 0; i < hr.length; i += 1) {
    for (let j = i + 1; j < hr.length; j += 1) {
      const A = hr[i].r; const B = hr[j].r
      if (sameMan(A, B)) continue
      const ev = pairRate(A, B)
      const hist = findPairHistory(summary, A, B)
      const together = n(hist?.repeat_count, 0)
      const weaker = Math.min(hrScore(A), hrScore(B))
      const parts = []
      parts.push(ev.rule
        ? `${ev.rule.label}: ${pct(ev.rate)} of such pairs both homered in the archive (a random pair: ${pct(PAIR_BASELINE)}; ${pairSampleNote()}).`
        : `Meets none of the measured pair rules, so no better than a random pair (${pct(PAIR_BASELINE)} both homer; ${pairSampleNote()}).`)
      if (weaker > 0) parts.push(`The weaker leg is a ${weaker.toFixed(0)}: both must land, so that one decides.`)
      if (together >= 2) parts.push(`They have homered on the same day ${together} times this season (history, not a forecast).`)
      out.push({ id: `${hr[i].key}+${hr[j].key}`, a: nameOf(A), b: nameOf(B), text: parts.join(' '), rate: ev.rate, lift: ev.lift, together })
    }
  }
  return out
}

/**
 * The best partners for what is on the slip: hitters on the slate who meet a measured pair rule with EVERY
 * home-run leg already there (the weakest rate counts), not already on the slip, with a price, not started.
 * @param legs   [{ r, k }]
 * @param rows   the slate rows
 * @param opts   { limit, canAdd(r) -> k|null (the market a card would be added in, null when unpriced/started) }
 * @returns [{ r, k, name, rate, why }]
 */
export function partners(legs, rows, { limit = 3, canAdd = () => null } = {}) {
  const anchors = (legs || []).filter((l) => l?.r && isHrLeg(l.k)).map((l) => l.r)
  if (!anchors.length) return []
  const have = new Set((legs || []).map((l) => String(l?.r?.player_id ?? l?.r?.id)))
  const seen = new Set()
  const out = []
  for (const c of rows || []) {
    const id = String(c?.player_id ?? c?.id ?? '')
    if (!id || have.has(id) || seen.has(id)) continue
    seen.add(id)
    const k = canAdd(c)
    if (!k) continue
    const evs = anchors.map((a) => pairRate(a, c))
    if (evs.some((e) => !e.rule)) continue            // a partner must meet a measured rule with every anchor
    const rate = Math.min(...evs.map((e) => e.rate))
    const why = evs.length === 1 ? evs[0].rule.label : `${evs.length} pair rules met`
    out.push({ r: c, k, name: nameOf(c), rate, why, sort: rate * 1000 + hrScore(c) })
  }
  return out.sort((x, y) => y.sort - x.sort).slice(0, limit)
}
