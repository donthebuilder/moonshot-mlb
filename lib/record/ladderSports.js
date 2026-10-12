// THE LADDER, PER SPORT, AS DATA (Wave 8, 2026-10-11). One place says which kind of ladder a sport draws and the
// words that go with it, so components/record/LadderBlock.js and lib/record/ladder.js never ask "which sport is
// this" with a ternary. A new sport is one entry here (and one theme in LadderBlock's THEMES).
//
//   kind 'status'  the NHL ladder: CALLED > ON THE BOARD > NOT ON THE BOARD against every dressed skater
//                  (lib/record/ladder.js ladderFromRecords; the rows are lamp_goal_log's).
//   kind 'market'  one row per CALLED market, each on its own bar, against the base rate for the same bar
//                  (lib/record/ladder.js marketLadderFrom; the rows are the calibration reader's tiers).
//                  MLB: the base is every hitter on the locked board on that bar (tier.board).
//                  TUDDY: the base is the report card's back-test (nfl_report_card.json seasons[].<market>.base):
//                  the week's whole board is not stored player by player, so there is no same-week base to count.
//                  BUCKETS (hidden): the base is every graded player on that market (tier.board, buckets_log).
// Nothing here is a number. Words only.
export const LADDER_SPORTS = {
  nhl: { kind: 'status' },
  mlb: {
    kind: 'market', lead: 'HR', leadWord: 'HR call', subject: 'hitter', unit: 'night',
    baseWords: 'for every hitter on the board on the same bar',
    baseHead: 'Board',
    foot: 'Each call type is graded on its own bar, so the rows are different questions and are not ranked against each other. The base is every hitter on the board on that same bar. A hitter who did not play, a call stamped at or after first pitch and a game not final are set aside, never counted as misses.',
  },
  nfl: {
    kind: 'market', lead: 'TD', leadWord: 'touchdown call', subject: 'player', unit: 'week',
    baseWords: 'for every player the model scored, on the same bar',
    baseHead: 'Base',
    foot: 'Five calls a week in each market, each graded on its own bar, so the rows are different questions. The base is the report card back-test: the rate for every player the model scored in those seasons on the same bar. This season’s whole board is not stored player by player, so it is a reference, not a same-week comparison. A void (no line, or an ineligible position) is never a miss.',
  },
  nba: {
    kind: 'market', lead: null, leadWord: 'call', subject: 'player', unit: 'night',
    baseWords: 'for every graded player in the same market',
    baseHead: 'Base',
    foot: 'Each market is graded on its own bar. The base is every graded player in that market on the board. A player who did not play is out of every count.',
  },
}

export const ladderKind = (sport) => LADDER_SPORTS[sport]?.kind || null
