// First-visit paragraph per BUCKETS tab, for components/TabExplainer.js --
// LAMP's NHL_TEXTS shape, basketball's words. REWRITTEN 2026-10-07 (text sweep): one or two plain
// sentences each; it opens once per visitor, then it is the small pill. Caveats that carry
// meaning moved into each page's (?) (components/buckets/ui.js Why).
export const NBA_TEXTS = {
  home: { what: 'BUCKETS calls one player per team in every NBA game, locks the calls before tip and grades them in public after the final. Tap a game for its whole board.' },
  board: { what: 'The night’s calls, one market at a time. CALLED is one per team in a game; ON THE BOARD is the top third. Calls lock before tip.' },
  fullboard: { what: 'Every player tonight, #1 down. Tap Why on a row for the reason, or a name for his file.' },
  scores: { what: 'Every game on one day: score, quarter and clock. Tap a game for its box score and every shot.' },
  game: { what: 'One game top to bottom: line score, box scores, every shot where it was taken, and who scored first.' },
  ledger: { what: 'The Ledger: every player who cleared a bar tonight, live, and the record of every graded night.' },
  hot: { what: 'Every rotation player’s last 5 and last 10 games beside his season. ± is last 5 minus season.' },
  standings: { what: 'Both conferences, seeded. Before opening night this is last season’s final table, and it says so.' },
  teams: { what: 'The 30 clubs by division. Tap a club for its roster, schedule and season lines.' },
  team: { what: 'One club: record and seed, the roster with season lines, and the schedule.' },
  players: { what: 'Every player. Type a name or a club; tap a row for his file.' },
  player: { what: 'One player: the season line, the game log, every shot he took, and the board on him.' },
  leaders: { what: 'Who leads the league per game, with a 20-game floor.' },
  power: { what: 'Who scores most, who is heating up, who scores per minute: the league’s numbers, not a BUCKETS score.' },
  results: { what: 'Every graded night: how many of the calls hit, per market. Preseason is counted apart.' },
  guide: { what: 'What BUCKETS is, where its numbers come from, and what it does not do yet.' },
}

// THE PAGE LINE, TUDDY'S WAY (2026-10-20, Donovan: "make sure the pages are matching up with the nfl pages"): a page with no header of its own opens with one
// short line and a (?) (components/nfl/NflNote), as TUDDY's; the "what am I looking at" chip is gone. The longer words live behind the (?).
export const BUCKETS_SUBS = {
  home: { sub: 'Every game tonight, its calls and the board.', why: 'Every player is scored before tip; BUCKETS calls the top players on each market\u2019s board, locks the calls and grades each one in public after the final. Scores rank tonight\u2019s pool from 0 to 100, not chances.' },
  board: { sub: 'Tonight\u2019s calls, one market at a time.', why: NBA_TEXTS.board?.what || null },
  fullboard: { sub: 'Every player tonight, #1 down. Tap a header to sort.', why: NBA_TEXTS.fullboard?.what || null },
  players: { sub: 'Every player. Tap a name.', why: NBA_TEXTS.players?.what || null },
  odds: { sub: 'Every price we read tonight, beside the BUCKETS score.', why: 'The best price on each line, the book offering it and how it moved since it opened. A price is the book\u2019s, never BUCKETS\u2019.' },
  hot: { sub: 'Last 5 and last 10 beside the season.', why: NBA_TEXTS.hot?.what || null },
  guide: { sub: 'What BUCKETS shows and how to read it.', why: null },
}
export const BUCKETS_LINE_TABS = new Set(Object.keys(BUCKETS_SUBS))
