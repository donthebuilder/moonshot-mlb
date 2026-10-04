// TUDDY CARD REGRADES (2026-10-01, queue 0d (b), confirmed by Donovan). The
// one place a graded week's footnote lives, keyed like lib/nfl/resultsArchive.js
// weekKey(season, 'week', n). Week 1 of 2026 was first graded against the
// week-2 card; the bot regraded it Oct 1 against the card published before
// week 1's kickoffs. Every surface that shows week 1 prints this line.
//
// 2026-10-04 (Donovan: regrade from what was knowable before each kickoff):
// weeks 1-3 rebuilt by replaying the pick lock over every logged pregame run
// (bots/nfl/nfl_regrade.py --lock-replay) -- each pick is the player who held
// that slot at his own kickoff. The TD record is unchanged at 13/14.
const REGRADES = {
  '2026_w01': 'Week 1 regraded Oct 4 from the pregame logs: no card was archived, so each pick is the player standing in that slot at his own kickoff. The first grade used the week-2 card.',
  '2026_w02': 'Week 2 checked Oct 4 against the pregame logs (the card file was saved after kickoff): every pick held its slot at kickoff. One receiving-yards name differs; the record does not.',
  '2026_w03': 'Week 3 checked Oct 4 against the pregame logs (the card file was saved after Sunday’s games): every pick held its slot at kickoff except kicking points #4, now Cam Little.',
}

/** The footnote for one week, or null. */
export const regradeNote = (season, week, mode = 'week') =>
  (mode === 'week' ? REGRADES[`${season}_w${String(week).padStart(2, '0')}`] : null) || null

/** The footnotes for a list of archive keys ("2026_w01", ...), in order, deduped. */
export const regradeNotes = (keys = []) => [...new Set(keys.map((k) => REGRADES[k]).filter(Boolean))]
