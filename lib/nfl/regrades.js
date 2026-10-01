// TUDDY CARD REGRADES (2026-10-01, queue 0d (b), confirmed by Donovan). The
// one place a graded week's footnote lives, keyed like lib/nfl/resultsArchive.js
// weekKey(season, 'week', n). Week 1 of 2026 was first graded against the
// week-2 card; the bot regraded it Oct 1 against the card published before
// week 1's kickoffs. Every surface that shows week 1 prints this line.
const REGRADES = {
  '2026_w01': 'Week 1 regraded Oct 1 against the pregame card; the first grade used the week-2 card.',
}

/** The footnote for one week, or null. */
export const regradeNote = (season, week, mode = 'week') =>
  (mode === 'week' ? REGRADES[`${season}_w${String(week).padStart(2, '0')}`] : null) || null

/** The footnotes for a list of archive keys ("2026_w01", ...), in order, deduped. */
export const regradeNotes = (keys = []) => [...new Set(keys.map((k) => REGRADES[k]).filter(Boolean))]
