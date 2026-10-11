// THE ORDER OF THE "WHAT SEPARATES THEM" BARS (2026-10-10, Donovan: "the last picture i like but it random").
//
// It was random because two orders met in one chart. The rows arrived in the BOARD's order (the bot's board_rank:
// hr_score, season home runs and season exit velocity, averaged), were numbered 1..15 in that order, and then each
// row's bar was drawn from a different number, the HR score. Row 5 (57.5) sat under row 4 (35.7); row 9 (43.1)
// sat over row 8 (21.2). Each number was true; the picture put one man's rank beside another man's bar.
//
// The panel is titled "Top 15 by HR score", so the rows are the fifteen highest scores, highest first, numbered
// by that order: the number, the bar and the title all say the same thing. The board's own order is the # column of
// the table above and below it, and the caption says so. A tie keeps the order the rows arrived in (the board's).
//
// Pure (no React) so scripts/check-profile-bars.mjs can prove the order without a browser.

/** The `max` highest-scoring rows with a finite score, highest first; ties keep the order they arrived in. */
export function topByScore(rows, max = 15) {
  return (rows || [])
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r && Number.isFinite(r.score))
    .sort((a, b) => (b.r.score - a.r.score) || (a.i - b.i))
    .slice(0, max)
    .map(({ r }) => r)
}

/** A bar's width as a percent of its track: the score on its own 0-100 scale, the same for every row. */
export const barPct = (score) => Math.max(2, Math.min(100, Number(score) || 0))
