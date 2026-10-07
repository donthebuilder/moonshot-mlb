// ONE SUBTITLE PER TUDDY PAGE (2026-10-07 text sweep, VISUAL-AUDIT-1006 section 2).
// `sub` is the page's whole intro, 12 words at most. `why` is the longer answer, kept for the
// "(?)" beside it (components/nfl/NflNote.js, lib/explain.js): anything honest the old banner
// said that a reader needs (a caveat, a how-to-read) lives there, never in a banner.
// Football words, no developer words.
export const NFL_SUBS = {
  home: { sub: 'Every skill player rated before kickoff. Touchdown calls are graded in public.', why: 'Players are rated before kickoff, TUDDY locks its touchdown calls, and every call is graded after the game. This page is the week in one screen: the slate, the record so far, the headline calls and the top boards. Tap a name for his card. Scores are league rankings from 0 to 100, not probabilities.' },
  games: { sub: 'Every game this week.', why: 'The table ranks every scored player. Games opens one game at a time: where it is played, each offense against the other defense, where each defense gets beaten, and the calls.' },
  picks: { sub: 'The week’s calls, one per market.', why: 'Each market lists everyone scored for it, best first, with his season numbers and how often he cleared the line in his last ten. A call is locked before kickoff and graded after. Next week’s list appears once it is built.' },
  research: { sub: 'Every player, #1 down. Tap a header to sort.', why: 'Pick a market and every scored player is ranked for it. Tap the Why on a row for the reason and the numbers behind it. Scores rank players against the league; they are not chances.' },
  players: { sub: 'Every player. Tap a name.', why: 'Tap a name to open his card: his read, his graded week, his rates at every bar, then Matchup and Splits. The team filter narrows the list.' },
  watchlist: { sub: 'Your starred players, one game at a time.', why: 'A star lives on this device. The follow it creates outlives the slate.' },
  matchups: { sub: 'Which defenses to attack this week.', why: 'Defense against position, by depth role. Tap a defense for where it gets beaten, what it allows each position, and who on the slate is walking into it. Early in the season a few games make any number swing.' },
  pairs: { sub: 'Two players from one team, called together.', why: 'The relationship labels are context, not a graded result. A season of results is needed before a real hit rate exists for a pair.' },
  ledger: { sub: 'Every call, graded in public.', why: 'This week: the week in names and numbers. Called: every touchdown sorted CALLED, ON THE BOARD or NOT ON THE BOARD. Record: hits, misses and voids by market. Archive: past weeks and the whole season.' },
  accountability: { sub: 'How every call did, by market.', why: 'Season to date, one row per market, and any graded week. Hits, misses, voids, and the bar each market had to clear.' },
  live: { sub: 'Every call against its bar, as games play.', why: 'Each call is cleared, live or missed against its bar, with your pinned names and the scoring plays as they land. It wakes twenty minutes before kickoff.' },
  streaks: { sub: 'Who is hot or cold at a line you pick.', why: 'Consecutive games on the same side of the line, last 30 games. Low-volume names only appear with a reason printed next to them.' },
  odds: { sub: 'What the books are paying this week.', why: 'Every quote in one table: the line, the typical and best price, how far it has moved, and where books disagree. There is no per-game rate for football, so prices sit beside the scores and the judgement is yours. A blank means the books have not posted it.' },
  numerology: { sub: 'For fun: numbers that line up. Not part of any score.', why: 'Pattern watching, not evidence: nothing here feeds any score, board or call. Hundreds of players spread over nine digits put dozens on every digit by arithmetic alone, so a match proves little.' },
  guide: { sub: 'What every page is for.', why: null },
  longshots: { sub: 'Long-priced players beside our scores.', why: null },
  leaders: { sub: 'Per-game rates for this week’s players.', why: null },
  explosive: { sub: 'Big plays: 10, 20, 30 and 40-yard catches.', why: 'Counted from play-by-play. A receiver’s own ceiling is not his average game.' },
  redzone: { sub: 'Red-zone touches per game, ranked.', why: 'Touches close to the line are where touchdowns come from. Team share counts only the players tracked on his team.' },
  scores: { sub: 'Every score this week. Tap a game for its box.', why: null },
  standings: { sub: 'Every division: record, points, streak.', why: 'Nothing here is a TUDDY score.' },
  storylines: { sub: 'Real facts from this week, read as stories.', why: 'Each line is a live fact off this week’s logs and grading, written as a sentence instead of a table row.' },
}
// Pages whose own header carries the note; the dashboard adds the line for every other tab.
export const NFL_OWN_HEADER = new Set(['research', 'games', 'matchups', 'scores', 'standings', 'team', 'watchlist', 'streaks', 'leaders', 'explosive', 'redzone', 'numerology', 'storylines', 'live'])
