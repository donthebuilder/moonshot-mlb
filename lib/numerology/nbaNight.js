// BUCKETS' LANE-NIGHT ADAPTERS (Wave 8, 2026-10-11). Pure, no fetch, no writes: the two shapes the shared numerology
// record (lib/numerology/record.js) asks every sport for, built from what BUCKETS already reads -- so that wiring the
// buckets tick to record lane nights is one call each, when Donovan says go. NOTHING CALLS THESE YET: the tick does not
// write numerology_log for the 'nba' sport (no new stored data while BUCKETS is hidden), and /api/numerology/lanes
// answers 404 for 'nba' to anyone but the gate's own viewers (lib/nba/gate.js).
//
//   nbaLanePlayers(read)            the night's players in the record's shape (writeNight), from lib/nba/numerology.js
//                                   readNbaNumerology(): jersey, birth date, club, opponent. No `next` lane: a points total
//                                   has no "his next one" (lib/numerology/adapters.js fromNba), those lanes sit out.
//   nbaBoxResults(box, loggedIds)   Map(player_id -> { played, hit }) for gradeNight, from the ESPN box (lib/nba/api.js
//                                   reduceBox): played = not a DNP, hit = scored the event bar (the points market's bar, the
//                                   market every night grades, lib/record/nba.js NBA_EVENT_BAR). A logged player with no
//                                   line on the box did not play: played false, void, never a miss.
import { fromNba } from './adapters'
import { NBA_EVENT_BAR } from '../record/nba'

/** @returns {object[]} [{ player_id, name, jersey, birthDate, next:null, team, opp }] */
export function nbaLanePlayers(read) {
  const out = []
  for (const r of read?.all || []) {
    const a = fromNba(r)
    if (!a || !r?.id) continue
    out.push({ player_id: String(r.id), ...a })
  }
  return out
}

/** @param box reduceBox() rows [{ id, dnp, pts }]  @param loggedIds the ids numerology_log holds for the game's two clubs */
export function nbaBoxResults(box, loggedIds = [], bar = NBA_EVENT_BAR) {
  const out = new Map()
  for (const b of box || []) {
    if (!b?.id) continue
    out.set(String(b.id), b.dnp ? { played: false, hit: false } : { played: true, hit: (Number(b.pts) || 0) >= bar })
  }
  for (const id of loggedIds || []) if (!out.has(String(id))) out.set(String(id), { played: false, hit: false })
  return out
}
