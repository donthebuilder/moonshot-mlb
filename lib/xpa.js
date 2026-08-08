// ⚾ xPA — expected plate appearances from lineup slot (audit #3, 2026-08-08).
//
// The most under-priced number in HR betting: the leadoff man gets nearly a
// full extra trip to the plate every night over the 9-hole. These are the
// long-run league averages of PA per game by batting-order slot — stable
// year over year to within a few hundredths, which is exactly why a static
// table is the honest implementation: there is no nightly feed to verify
// against, and pretending per-game precision we don't have would violate the
// verify-first rule. Directional by design; the tooltip on every surface that
// shows this number says so.
export const XPA_BY_SLOT = {
  1: 4.65, 2: 4.55, 3: 4.44, 4: 4.34, 5: 4.24,
  6: 4.13, 7: 4.02, 8: 3.90, 9: 3.77,
}

// null when the spot is unknown/unconfirmed — a dash beats a fake average.
export const xpaFor = (spot) => {
  const s = Number(spot)
  return Number.isInteger(s) && XPA_BY_SLOT[s] ? XPA_BY_SLOT[s] : null
}

export const XPA_TITLE = 'Expected plate appearances from his lineup slot — league long-run averages '
  + '(leadoff ≈ 4.65, 9-hole ≈ 3.77). The quiet edge: a slot-1 hitter gets ~0.9 more looks '
  + 'than a slot-9 hitter every single night. Directional, not a nightly forecast.'
