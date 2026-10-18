// THE LEDGER'S FORWARD HALF, ONCE (2026-10-17, path item 7). Donovan: "the ledgers are supposed to have the next predictions of people, not the
// people who already went ... predicting, they don't need to just be all called players, they need to be everybody ... based on the numerology and
// the names and all of that, and use that to pick names ... they don't have to be right ... that's what makes it marketing."
// Four sports kept four copies of this list, and three of them only listed a man when a numerology lane or a name echo happened to fit him (or fell back
// to the CALLED players only). Now every sport hands its candidates here: EVERY player still to come (game not final, nothing yet this night) with
//   chips  the patterns he stands on (numerology lanes, name echoes: the sport's own axes, unchanged)
//   stat   what his own numbers say (the board's score, his rank in his game, CALLED): so a man with no pattern still appears, ranked on his stats
//   nLanes how many patterns, score his board score
// The rank: live games first (the man at the plate / on the ice now), then the most patterns, then the best score. A watch, never a prediction of
// a result: the box's own caption says so. The receipts (who already scored) stay in their own blocks.

const WHEN = { now: 0, later: 1 }

/** cands: [{ key, when: 'now' | 'later', name, chips?, stat?, nLanes?, score?, ...anything the sport's row needs }] -> ranked, capped, chips = patterns then stats */
export function rankNextUp(cands, { cap = 12 } = {}) {
  return (cands || []).filter(Boolean)
    .map((c) => ({ ...c, nLanes: c.nLanes || 0, chips: [...(c.chips || []), ...(c.stat || [])] }))
    .sort((a, b) => (WHEN[a.when] ?? 1) - (WHEN[b.when] ?? 1) || b.nLanes - a.nLanes || (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, cap)
}
