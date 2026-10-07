// First-visit paragraph per BUCKETS tab, for components/TabExplainer.js --
// LAMP's NHL_TEXTS shape, basketball's words. REWRITTEN 2026-10-07 (text sweep): one or two plain
// sentences each; it opens once per visitor, then it is the small pill. Caveats that carry
// meaning moved into each page's (?) (components/buckets/ui.js Why).
export const NBA_TEXTS = {
  home: { what: 'BUCKETS calls one player per team in every NBA game, locks the calls before tip and grades them in public after the final. Tap a game for its whole board.' },
  board: { what: 'The night’s calls, one market at a time. CALLED is one per team in a game; ON THE BOARD is the top third. A PREVIEW is not a call until its game locks.' },
  fullboard: { what: 'Every player tonight, #1 down. Tap Why on a row for the reason, or a name for his file.' },
  scores: { what: 'Every game on one day: score, quarter and clock. Tap a game for its box score and every shot.' },
  games: { what: 'Tonight one game at a time: the matchup, its calls and its board for the market you pick.' },
  game: { what: 'One game top to bottom: line score, box scores, every shot where it was taken, and who scored first.' },
  schedule: { what: 'The league week, day by day. Tap a game for its page.' },
  odds: { what: 'The books’ lines on tonight’s players, beside the board and never inside its score.' },
  storylines: { what: 'The stories in the day’s games, each locked at tip and graded after the final.' },
  watchlist: { what: 'The players you starred. A star lasts for his next game; every night you starred him is graded below.' },
  ledger: { what: 'The Ledger: every player who cleared a bar tonight, live, and the record of every graded night.' },
  hot: { what: 'Every rotation player’s last 5 and last 10 games beside his season. ± is last 5 minus season.' },
  matchups: { what: 'Each side against what the other defence gives up a game, with its rank among the 30 (1 = gives up the most).' },
  standings: { what: 'Both conferences, seeded. Before opening night this is last season’s final table, and it says so.' },
  teams: { what: 'The 30 clubs by division. Tap a club for its roster, schedule and season lines.' },
  team: { what: 'One club: record and seed, the roster with season lines, and the schedule.' },
  players: { what: 'Every player. Type a name or a club; tap a row for his file.' },
  player: { what: 'One player: the season line, the game log, every shot he took, and the board on him.' },
  leaders: { what: 'Who leads the league per game, with a 20-game floor.' },
  shotmap: { what: 'Where a club or a player shoots from: every attempt on record, by zone, made and missed.' },
  results: { what: 'Every graded night: how many of the calls hit, per market. Preseason is counted apart.' },
  guide: { what: 'What BUCKETS is, where its numbers come from, and what it does not do yet.' },
}
