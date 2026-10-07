// WHAT "CALLED" MEANS, ONCE PER SPORT, in plain words (2026-10-06, ledger audit P2).
// /called printed these inline in app/called/page.js and no in-app ledger or record tab
// said any of it. Now /called and every in-app ledger / record tab (components/record/
// RecordNote.js) read this one table. The words follow lib/callStatus.js (MLB, NFL) and
// lib/nhl/goalModel.js scoreNight (NHL); nothing is derived here.
export const CALL_RULES = {
  mlb: {
    rule: 'CALLED = a TOP, HR, HIT, HRR or CONTACT pick in his game. ON THE BOARD = the top third of that night’s board (nights before Sep 17: anyone the board rated).',
  },
  nfl: {
    rule: 'CALLED = a pick in any TUDDY market that week, or his game’s TD call. ON THE BOARD = the top third of the week’s TD board.',
    outside: 'TD calls cover RB / WR / TE. QB touchdowns are outside the pool',
    // the in-app tabs' fuller sentence
    extra: 'A call in ANY market counts as CALLED (the 0c rule), so the CALLED touchdowns here are not only the anytime-TD ladder. QB touchdowns are counted beside, not as misses. Counts are touchdowns, not scorers: a man with two is two.',
  },
  nhl: {
    rule: 'CALLED = one of the calls in his game: the goal board (the top skater on each team, from Oct 1) or SHOTS 3+. ON THE BOARD = the top third of tonight’s board.',
    extra: 'CALLED counts a call in ANY market (the 0c rule), so it can include a SHOTS call; the tier table on the record page grades only the goal calls, which is why its numbers are smaller.',
  },
  nba: {
    rule: 'CALLED = one of the calls in his game, in any BUCKETS market (the top player on each team per market). ON THE BOARD = the top third of the night’s points board.',
    extra: 'CALLED counts a call in ANY market (the 0c rule).',
  },
}
