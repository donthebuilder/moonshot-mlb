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

export const heatTier = (h) => (h >= HOT ? 'hot' : h <= COLD ? 'cold' : 'mid')

/** The dial's ink: LAMP's one accent when hot, grey when not. `theme` is lib/nhl/theme's C. */
export function dialInk(h, theme) {
  const t = heatTier(h)
  return t === 'hot' ? theme.ice : t === 'cold' ? theme.text3 : theme.text2
}
