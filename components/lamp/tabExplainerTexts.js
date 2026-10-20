// First-visit paragraph per LAMP tab, for components/TabExplainer.js.
// Hockey words; the MLB map lives in TabExplainer itself, NFL's beside it.
export const NHL_TEXTS = {
  // 2026-09-26 (stranger test F12): the product first, then the page.
  home: { what: 'One skater called per team, every game, before puck drop.' },
  scores: { what: 'Every game today: score, clock, shots and who scored.' },
  standings: { what: 'Division, wild card, conference and league tables.' },
  game: { what: 'One game: goals, shots, penalties and three stars.' },
  fullboard: { what: 'Every skater tonight, #1 down. Tap a header to sort.' },
  board: { what: 'One call per team, locked before puck drop.' },
  ledger: { what: 'Every call, graded: tonight, called, record and archive.' },
  results: { what: 'How many goal scorers we called.' },
  players: { what: 'Every rostered player. Tap a name.' },
  goalies: { what: 'Every rostered goalie. Tap a name.' },
  player: { what: 'Season line, career, last five and game log.' },
  teams: { what: 'The 32 clubs by division.' },
  team: { what: 'One club: record, roster, schedule and leaders.' },
  leaders: { what: 'Who leads the league, straight from the league’s stats.' },
  power: { what: 'Who shoots most, who is heating up, who finishes.' },
  guide: { what: 'What LAMP shows and how to read it.' },
}

// ONE SUBTITLE PER LAMP PAGE THAT CARRIES A CAVEAT (2026-10-17, simplify audit 5): the same short-line-plus-"(?)" pattern as
// TUDDY's (components/nfl/NflNote.js takes this map as `subs`). `sub` is 12 words at most; `why` is the rest of what the
// page's note said, moved behind the tap -- nothing dropped.
export const LAMP_SUBS = {
  scores: { sub: 'Every game that day, in your time zone.', why: 'Each day is the league’s Eastern calendar day, so a late West Coast game counts on the day it was scheduled, and times are shown in your own zone.' },
  numerology: { sub: 'For fun, not a prediction.', why: 'Every digit of the date is added until one is left, then set against each dressed skater’s jersey, birth day and life path. It is not graded and never part of any score.' },
  standings: { sub: 'League order: points, then regulation wins.', why: 'Ordered the way the league orders them: points, then regulation wins, then regulation-plus-overtime wins. Tap a column’s ⓘ for what it means.' },
  watchlist: { sub: 'Skaters you watch, and every night they played, graded.', why: 'Watch a skater from his file and he lands here for his next game; the watch clears after it. Every night you watched him counts below, graded off his own game log.' },
  // THE PAGE LINE, TUDDY'S WAY (2026-10-20, Donovan: "make sure the pages are matching up with the nfl pages"): a page with no header of its own
  // opens with one short line and a (?), as TUDDY's (NflDashboard + NflNote); the "what am I looking at" chip is gone. LAMP_LINE_TABS lists them.
  home: { sub: 'One skater called per team, every game, before puck drop.', why: 'Every skater is scored before puck drop; LAMP calls one per team in every game, locks the calls and grades each one in public after the final. Scores rank tonight\u2019s pool from 0 to 100, not chances.' },
  board: { sub: 'Tonight\u2019s calls, one market at a time.', why: 'One call per team, locked before puck drop. CALLED is the pick; ON THE BOARD is the top third of tonight\u2019s scores. A preview is not a call until its game locks.' },
  fullboard: { sub: 'Every skater tonight, #1 down. Tap a header to sort.', why: 'Pick a market and every scored skater is ranked for it. Tap a name for his file. Scores rank skaters against tonight\u2019s pool; they are not chances.' },
  players: { sub: 'Every rostered player. Tap a name.', why: 'Sort by LAMP\u2019s score, goals or goalies; search a name or a club. Tap a row for his file.' },
  odds: { sub: 'Every price we read tonight, beside LAMP\u2019s score.', why: 'The best price on each line, the book offering it and how it moved since it opened. A price is the book\u2019s, never LAMP\u2019s.' },
  guide: { sub: 'What LAMP shows and how to read it.', why: null },
  projected: { sub: 'Projected goals come from the team model.', why: 'Each club’s shots, shot quality, the other side’s defense and goalie. Proj goals is the team model’s goals for the game or the club, the same number the Slate prints; the chips do not move it. Proj shots adds each scored skater’s shots on goal a game. Called goals adds the goals a game of the called skaters only.' },
}
export const LAMP_LINE_TABS = new Set(['home', 'board', 'fullboard', 'players', 'odds', 'guide'])
