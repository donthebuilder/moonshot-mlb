// WHEN EACH TIER WAS CHOSEN (the hold-out starts the day after). A tier's date is
// recorded here only where the repo shows when its rule was fixed; null = no chosen
// date yet = TESTING by definition (lib/calibration/proof.js).
//
// MLB   TOP / HR / HIT / HRR / CONTACT and the three model tiers: the repo holds no
//       date on which these rules were fixed ahead of a measurement (lib/cleanRecord.js
//       measured them after the fact, 2026-10-01; scripts/mlb/angle-backtest.mjs grades
//       board ANGLES, not these tiers) -> null.
export const CHOSEN = {
  mlb: { TOP: null, HR: null, HIT: null, HRR: null, CONTACT: null, hr_overlay: null, power_overlay: null, premium_power: null },
}
export const chosenOf = (sport, key) => CHOSEN[sport]?.[key] ?? null
