// THE SLATE'S HEAT (2026-10-07, Donovan: "5 goals" was not lit). One pure place for how a game's
// expected-goals number sits in tonight's range and what the dial wears for it.
//
// Two faults, both fixed here:
//  1. the selected card (the lead game, usually the night's hottest) drew its dial in the product
//     accent no matter its heat, so the hottest game, 5.0 goals, read exactly like a cold one. The
//     dial's ink now comes from the heat alone; the selection only moves the card's border.
//  2. with one game (or every game level) the range has no spread, and the old rule gave heat 0, so
//     a lone 5.0 was drawn as the coldest game on the slate. No spread now reads as the middle:
//     nothing is hot or cold when there is nothing to compare it with.
export const HOT = 0.55    // MOONSHOT's own cut-offs (components/slate/SlateCard.js)
export const COLD = 0.25

/** 0..1 of `v` inside [lo, hi]; 0.5 when the range has no spread; 0 for no number. */
export function heatOf(v, lo, hi) {
  if (!Number.isFinite(v)) return 0
  return hi > lo ? (v - lo) / (hi - lo) : 0.5
}

/**
 * THE DIAL'S HEAT FROM THE LEAGUE (2026-10-08, lamp-team-v1). A game's projected goals total sits against the
 * spread of ALL games' totals (`dist` = lib/nhl/teamProjV1.js dist[source]: p10..p90 of the held-out games),
 * not against tonight's range: the top quarter of games is hot and the bottom quarter cold on any night,
 * a one-game slate included. Knots: p10 -> 0, p25 -> COLD, p50 -> .40, p75 -> HOT, p90 -> .85, and the same
 * step again beyond p90 -> 1. null with no number or no distribution (the caller then has no heat to draw).
 */
export function leagueHeat(total, dist) {
  if (!Number.isFinite(total) || !dist) return null
  const knots = [[dist.p10, 0], [dist.p25, COLD], [dist.p50, 0.4], [dist.p75, HOT], [dist.p90, 0.85], [dist.p90 + (dist.p90 - dist.p75), 1]]
  if (total <= knots[0][0]) return 0
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i]; const [x0, y0] = knots[i - 1]
    if (total <= x1) return x1 > x0 ? y0 + ((total - x0) / (x1 - x0)) * (y1 - y0) : y1
  }
  return 1
}

export const heatTier = (h) => (h >= HOT ? 'hot' : h <= COLD ? 'cold' : 'mid')

/** The dial's ink: LAMP's one accent when hot, grey when not. `theme` is lib/nhl/theme's C. */
export function dialInk(h, theme) {
  const t = heatTier(h)
  return t === 'hot' ? theme.ice : t === 'cold' ? theme.text3 : theme.text2
}
