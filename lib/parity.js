// WHAT EVERY SPORT HAS (BATCH-ONE-SITE step 2, 2026-10-05). One list of the features
// each product's pages carry, sport by sport: 'yes', 'n/a: <reason>' (the sport will
// never have it) or 'todo: <reason>' (it should have it and doesn't YET) -- a gap is
// written down with its reason, never left blank. A 'todo' does not fail the gate, but
// it is never hidden: scripts/check-parity.mjs lists every one as TODO in its output and
// /admin prints it on the grid with its reason. scripts/check-parity.mjs (in the push
// gate) fails when a value is missing, when a 'yes' isn't backed by the code, or when a
// feature the code now has is still marked n/a or todo (flip it to 'yes').
//
// `check` is the code fact that backs a 'yes':
//   { ledger: '<section>' }  the sport's Ledger draws that section (lib/sports/<sport>/ledger.js,
//                            MOONSHOT's through HomerLedger's LedgerBody)
//   { tab: { mlb, nfl, nhl, nba } }   that tab is in the sport's registry (lib/routes.js)
//   { file: { mlb: [file, importer] , ... } }   the file exists and the importer mounts it
//   { grep: { mlb: [file, text], ... } }        the file says it

export const SPORT_NAMES = { mlb: 'MOONSHOT', nfl: 'TUDDY', nhl: 'LAMP', nba: 'BUCKETS' }


export const PARITY = [
  // ── the Ledger (components/pages/LedgerPage + components/ledger/LedgerBody) ──
  { key: 'ledger.tonight', page: 'Ledger', label: 'TONIGHT: went / lining up / still to go',
    check: { grep: { mlb: ['lib/sports/mlb/ledger.js', 'tonight: <MlbTonight'], nfl: ['lib/sports/nfl/ledger.js', 'tonight: <NflTonight'], nhl: ['lib/sports/nhl/ledger.js', 'tonight: <NhlTonight'], nba: ['lib/sports/nba/ledger.js', 'tonight: <NbaTonight'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.round', page: 'Ledger', label: 'Round number tonight', check: { ledger: 'round' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.watch', page: 'Ledger', label: 'The calls / watchlist', check: { ledger: 'watch' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.align', page: 'Ledger', label: 'Lining up with the date', check: { ledger: 'align' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.lookout', page: 'Ledger', label: 'The look-out (defences, who needs what)', check: { ledger: 'lookout' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.names', page: 'Ledger', label: 'Name echoes', check: { ledger: 'names' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.nextUp', page: 'Ledger', label: 'Still to come / fits the pattern', check: { ledger: 'nextUp' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.scorers', page: 'Ledger', label: 'Every scorer, numbered', check: { ledger: 'scorers' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.spots', page: 'Ledger', label: 'By lineup spot / position', check: { ledger: 'spots' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.first', page: 'Ledger', label: 'First scorer of each game', check: { ledger: 'first' },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── TOP TOTALS (2026-10-09, lib/totals + components/TopTotals.js): each slate's three highest projected-total games, called and graded ──
  { key: 'totals.slate', page: 'Slate', label: 'Top totals: each game wears its own total (the three highest are CALLED before the first game), no standalone table',
    check: { grep: { mlb: ['components/tabs/Games.js', '<GameTotalLine sport="mlb"'], nfl: ['components/nfl/NflSlate.js', '<GameTotalLine sport="nfl"'], nhl: ['components/lamp/LampSlate.js', '<GameTotalLine sport="nhl"'], nba: ['components/buckets/tabs/Slate.js', '<GameTotalLine sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'totals.record', page: 'Ledger', label: 'Top totals: the record and graded calls in the Ledger\'s Record view',
    check: { grep: { mlb: ['components/pages/LedgerShell.js', '<TopTotals sport={sport} mode="record"'], nfl: ['components/pages/LedgerShell.js', '<TopTotals sport={sport} mode="record"'], nhl: ['components/pages/LedgerShell.js', '<TopTotals sport={sport} mode="record"'], nba: ['components/pages/LedgerShell.js', '<TopTotals sport={sport} mode="record"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── HEAD TO HEAD (2026-10-13, lib/h2h + components/h2h/HeadToHead.js): the two clubs' record, margin and meetings over three seasons; a club's season against every opponent ──
  { key: 'h2h.game', page: 'Slate', label: 'Head to head: the two clubs\' record, average margin, total and meetings over three seasons, with an explicit-list rivalry tag (a margin, never a spread)',
    check: { grep: { mlb: ['components/tabs/Games.js', '<MlbH2H'], nfl: ['components/nfl/NflSlate.js', '<NflH2H'], nhl: ['components/lamp/LampSlate.js', '<NhlH2H'], nba: ['components/buckets/tabs/Game.js', '<NbaH2H'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'h2h.team', page: 'Team', label: 'Head to head on the team page: the club against every opponent this season, rivals first',
    check: { grep: { mlb: ['lib/team/mlb.js', 'h2hTeamSection(SPORT'], nfl: ['lib/team/nfl.js', 'h2hTeamSection(SPORT'], nhl: ['lib/team/nhl.js', 'h2hTeamSection(SPORT'], nba: ['lib/team/nba.js', 'h2hTeamSection(SPORT'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── CHAMPIONSHIP ODDS (2026-10-13, lib/championship.js + components/PennantRace.js): the bot's simulated bracket, folded on Home ──
  { key: 'championship.odds', page: 'Home', label: 'Championship odds: playoff field and a title pick, simulated (a fold on Home; the three new leagues draw nothing until the bot publishes their file)',
    check: { grep: { mlb: ['components/tabs/Home.js', '<PennantRace />'], nfl: ['components/nfl/tabs/Home.js', '<ChampionshipFold sport="nfl" />'], nhl: ['components/lamp/tabs/Home.js', '<ChampionshipFold sport="nhl" />'], nba: ['components/buckets/tabs/Home.js', '<ChampionshipFold sport="nba" />'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── THE CARD AND THE TWO-MAN (2026-10-10, lib/card + components/card/CardSection.js): 3 straights + 1 Two-Man per slate, frozen at the lock; Donovan's Two-Man in its own lane ──
  { key: 'card.slate', page: 'Slate', label: 'The Card: three straights and a Two-Man, fixed before the first game (one line, opens in place)',
    check: { grep: { mlb: ['components/Dashboard.js', '<CardSection sport="mlb"'], nfl: ['components/nfl/NflDashboard.js', '<CardSection sport="nfl"'], nhl: ['components/lamp/LampDashboard.js', '<CardSection sport="nhl"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'todo: the Card\'s parts exist for BUCKETS as a PREVIEW (lib/card/nbaPreview.js, /api/buckets/card: same slots and floors) but nothing is locked: NBA is not in CARD_SPORTS until BUCKETS is public AND stored book lines exist (NBA_ODDS_CAPTURE). No Two-Man: BUCKETS has no yes/no market with a stored price' } },
  { key: 'card.record', page: 'Ledger', label: 'The Card record: straights, Two-Man and Donovan\'s Two-Man, K of N with the count if independent',
    check: { grep: { mlb: ['components/pages/LedgerShell.js', '<CardSection sport={sport} mode="record"'], nfl: ['components/pages/LedgerShell.js', '<CardSection sport={sport} mode="record"'], nhl: ['components/pages/LedgerShell.js', '<CardSection sport={sport} mode="record"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'todo: the Card\'s parts exist for BUCKETS as a PREVIEW (lib/card/nbaPreview.js, /api/buckets/card: same slots and floors) but nothing is locked: NBA is not in CARD_SPORTS until BUCKETS is public AND stored book lines exist (NBA_ODDS_CAPTURE). No Two-Man: BUCKETS has no yes/no market with a stored price' } },

  // ── the board's angles (MOONSHOT's angle row: components/BoardFilters.js) ──
  { key: 'angle.weak', page: 'Board', label: 'Angle: weak spot',
    check: { grep: { mlb: ['components/BoardFilters.js', "key: 'weak'"], nfl: ['components/nfl/NflBoardExtras.js', "key: 'weak'"], nhl: ['components/lamp/tabs/Board.js', "key: 'weak'"], nba: ['lib/nba/angles.js', "key: 'weak'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'n/a: measured on 2025-26 replayed (lib/nba/angleBacktest.json) -- opponent top 10 vs his position hit below each stat market\'s board rate; first basket alone edged it by under a point, so it isn\'t shown' } },
  { key: 'angle.aligned', page: 'Board', label: 'Angle: aligned',
    check: { grep: { mlb: ['components/BoardFilters.js', "key: 'aligned'"], nfl: ['components/nfl/tabs/Touchdowns.js', "key: 'aligned'"], nhl: ['components/lamp/tabs/Board.js', "key: 'aligned'"], nba: ['lib/nba/angles.js', "key: 'aligned'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'angle.hiconf', page: 'Board', label: 'Angle: high confidence',
    check: { grep: { mlb: ['components/BoardFilters.js', "key: 'hiconf'"], nfl: ['components/nfl/tabs/Touchdowns.js', "key: 'highconf'"], nhl: ['components/lamp/tabs/Board.js', "key: 'hiconf'"], nba: ['lib/nba/angles.js', "key: 'hiconf'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE RANKINGS ANATOMY (2026-10-08, Donovan on his iPhone: NBA and NHL Rankings were nothing like TUDDY's): one subtitle line,
  // Filters / Ledger / Watchlist beside the market chips, a count on every chip, How to read this with a real row.
  { key: 'rank.chipcounts', page: 'Board', label: 'Rankings market chips carry a count (how many players have a score for that market)',
    check: { grep: { nfl: ['components/nfl/tabs/BoardHub.js', 'count: counts[key]'], nhl: ['components/lamp/tabs/Board.js', 'count: marketCounts[m.key]'], nba: ['components/buckets/tabs/Board.js', 'count: marketCounts[o.key]'] } },
    sports: { mlb: 'n/a: MOONSHOT\'s Rankings is one board with no market chips (its markets are the columns)', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'rank.howrow', page: 'Board', label: 'How to read this on Rankings, drawn with a real row from tonight\'s board',
    check: { grep: { mlb: ['components/tabs/HitsHRR.js', 'howRow'], nfl: ['components/nfl/tabs/BoardHub.js', 'howRow'], nhl: ['components/lamp/tabs/Board.js', 'howRow'], nba: ['components/buckets/tabs/Board.js', 'howRow'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.boards', page: 'Board', label: 'One Rankings page: the ranked table, its own page (not under the cards)',
    check: { tab: { mlb: 'fullboard', nfl: 'research', nhl: 'fullboard', nba: 'fullboard' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── site-wide ──
  { key: 'home.tonight', page: 'Home', label: 'TONIGHT strip (went / lining up / still to go)',
    check: { file: { mlb: ['components/tonight/MlbTonight.js', 'components/tabs/Home.js'], nfl: ['components/tonight/NflTonight.js', 'components/nfl/tabs/Home.js'], nhl: ['components/tonight/NhlTonight.js', 'components/lamp/tabs/Home.js'], nba: ['components/tonight/NbaTonight.js', 'components/buckets/tabs/Home.js'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.props', page: 'Props', label: 'Props page', check: { tab: { mlb: 'props', nfl: 'picks', nhl: 'board', nba: 'board' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.ledger', page: 'Ledger', label: 'The Ledger (one tab: Tonight | Called | Record | Archive)', check: { tab: { mlb: 'ledger', nfl: 'ledger', nhl: 'ledger', nba: 'ledger' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE LEDGER, ONE PER SPORT (2026-10-07): the shell, the chip, the card block, the game line.
  { key: 'ledger.shell', page: 'Ledger', label: 'The Ledger shell: sub-tabs in the address (lv=), old keys as aliases',
    check: { grep: { mlb: ['components/Dashboard.js', '<LedgerShell sport="mlb"'], nfl: ['components/nfl/NflDashboard.js', '<LedgerShell sport="nfl"'], nhl: ['components/lamp/LampDashboard.js', '<LedgerShell sport="nhl"'], nba: ['components/buckets/BucketsDashboard.js', '<LedgerShell sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.chip', page: 'Ledger', label: 'Ledger chip in the Rankings Filters row (called who scored, e.g. 7/18)',
    check: { grep: { mlb: ['components/tabs/HitsHRR.js', "ledger={rankings ? 'mlb' : null}"], nfl: ['components/nfl/tabs/Boards.js', 'ledger="nfl"'], nhl: ['components/lamp/tabs/Board.js', 'ledger="nhl"'], nba: ['components/buckets/tabs/Board.js', 'ledger="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE WATCHLIST, UP (2026-10-07, Donovan: it was buried): first in the More drawer and a chip beside the Ledger chip.
  { key: 'watch.more', page: 'Watchlist', label: 'Watchlist leads the More drawer (first group, first entry)',
    check: { grep: { mlb: ['lib/routes.js', "['Tonight',  ['watch', 'games'"], nfl: ['lib/routes.js', "['This week', ['watchlist', 'games'"], nhl: ['lib/nhl/routes.js', "['Tonight',  ['watchlist', 'games'"], nba: ['lib/nba/routes.js', "['Tonight',  ['watchlist', 'games'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'watch.chip', page: 'Watchlist', label: 'Watchlist chip beside the Ledger chip in the Rankings Filters row',
    check: { grep: { mlb: ['components/FiltersDrawer.js', '<WatchChip sport={ledger}'], nfl: ['components/nfl/tabs/BoardHub.js', '<WatchChip sport="nfl"'], nhl: ['components/FiltersDrawer.js', '<WatchChip sport={ledger}'], nba: ['components/FiltersDrawer.js', '<WatchChip sport={ledger}'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE BET SLIP'S PAIR HELP (2026-10-07; the Parlay Builder is deleted, its useful parts moved here)
  { key: 'slip.pairs', page: 'Props', label: 'Bet slip: how each pair of legs has measured, and suggested partners (the deleted Parlay Builder\'s parts)',
    check: { grep: { mlb: ['components/tabs/PropsGrid.js', 'slipNotes:'] } },
    sports: { mlb: 'yes', nfl: 'n/a: the pair rules and co-HR history are MOONSHOT measurements on two homers; a pair of touchdowns has not been measured', nhl: 'n/a: no pair of goals has been measured, and LAMP prints no model probability until the calibration gate is met', nba: 'n/a: no pair of players has been measured' } },

  { key: 'ledger.player', page: 'Player', label: 'Player card: In the ledger (his rows, called / on the board / not, his lanes)',
    check: { grep: { mlb: ['components/PlayerModal.js', '<InTheLedger'], nfl: ['components/nfl/NflPlayerModal.js', '<InTheLedger'], nhl: ['components/lamp/tabs/Player.js', '<InTheLedger'], nba: ['components/buckets/tabs/Player.js', '<InTheLedger'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.game', page: 'Games', label: 'Game page: Ledger for this game (first scorer and his status)',
    check: { grep: { mlb: ['components/tabs/Games.js', '<GameLedgerLine'], nfl: ['components/nfl/NflSlate.js', '<GameLedgerLine'], nhl: ['components/lamp/tabs/Game.js', '<GameLedgerLine'], nba: ['components/buckets/tabs/Game.js', '<GameLedgerLine'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'game.sections', page: 'Games', label: 'Game sections: the order and names of what a game shows come from one list per sport (lib/game/sections.js), walked by the game component',
    check: { grep: { mlb: ['components/tabs/Games.js', "gameSections('mlb'"], nfl: ['components/nfl/NflSlate.js', "gameSections('nfl'"], nhl: ['components/lamp/tabs/Game.js', "gameSections('nhl'"], nba: ['components/buckets/tabs/Game.js', "gameSections('nba'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'numerology.lanes', page: 'Numerology', label: 'Lane scoreboard + tonight\'s players on these lanes',
    check: { grep: { mlb: ['components/Alignments.js', '<LaneTable'], nfl: ['components/nfl/tabs/Numerology.js', '<LaneTable'], nhl: ['components/lamp/tabs/Numerology.js', '<LaneTable'], nba: ['components/buckets/tabs/Numerology.js', '<LaneTable'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.team', page: 'Team', label: 'Team page (the shared TeamPage + a section list in lib/team/registry.js)',
    check: { all: [
      { tab: { mlb: 'team', nfl: 'team', nhl: 'team', nba: 'team' } },
      { grep: { mlb: ['components/tabs/Team.js', '<TeamPage'], nfl: ['components/nfl/tabs/Team.js', '<TeamPage'], nhl: ['components/lamp/tabs/Team.js', '<TeamPage'], nba: ['components/buckets/tabs/Team.js', '<TeamPage'] } },
      { teamRegistry: true },
    ] },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.numerology', page: 'Numerology', label: 'Numerology page', check: { tab: { mlb: 'numerology', nfl: 'numerology', nhl: 'numerology', nba: 'numerology' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // ── the Odds page (components/tabs/OddsBoard.js + OddsDiscrepancies: one component, every sport; 2026-10-07) ──
  { key: 'odds.move', page: 'Odds', label: 'Odds board: where each price opened and how far it moved (OPEN / MOVE)',
    check: { grep: { mlb: ['components/tabs/OddsBoard.js', "key: 'moveOpen'"], nfl: ['components/tabs/OddsBoard.js', "key: 'moveOpen'"], nhl: ['components/tabs/OddsBoard.js', "key: 'moveOpen'"], nba: ['components/tabs/OddsBoard.js', "key: 'moveOpen'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'odds.best', page: 'Odds', label: 'Odds board: the best price with the book that has it (BEST)',
    check: { grep: { mlb: ['components/tabs/OddsBoard.js', "key: 'best'"], nfl: ['components/tabs/OddsBoard.js', "key: 'best'"], nhl: ['components/tabs/OddsBoard.js', "key: 'best'"], nba: ['components/tabs/OddsBoard.js', "key: 'best'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'odds.linemove', page: 'Player', label: 'Line moved chip (opened X, now Y) on the player card and the boards',
    check: { grep: { mlb: ['components/PlayerModal.js', '<LineMoveChip'], nfl: ['components/nfl/NflPlayerModal.js', '<LineMoveChip'], nhl: ['components/lamp/LampProps.js', '<LineMoveChip'], nba: ['components/buckets/BucketsCard.js', '<LineMoveChip'] } },
    sports: { mlb: 'todo: MOONSHOT\'s card and boards stay pixel-identical; OddsLine takes `move` when he asks for it', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE LADDER (Wave 8, 2026-10-11): CALLED against the base rate for the same bar, n and a 95% Wilson range on every row, at the top of the Record tab (lib/record/ladderSports.js says which kind each sport draws).
  { key: 'record.ladder', page: 'Record', label: 'The ladder: CALLED against the base rate, n and a 95% range on each row (top of the Record tab and /called)',
    check: { grep: { mlb: ['components/tabs/Results.js', '<LadderFromApi sport="mlb"'], nfl: ['components/nfl/tabs/Accountability.js', '<LadderFromApi sport="nfl"'], nhl: ['components/lamp/tabs/Results.js', '<LadderFromApi sport="nhl"'], nba: ['components/buckets/tabs/Results.js', '<LadderFromApi sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'record.calls', page: 'Record', label: 'Every call, its price, its result (CallHistory)',
    check: { grep: { mlb: ['components/tabs/Results.js', '<CallHistory sport="mlb"'], nfl: ['components/nfl/tabs/Accountability.js', '<CallHistory sport="nfl"'], nhl: ['components/lamp/tabs/Results.js', '<CallHistory sport="nhl"'], nba: ['components/buckets/tabs/Results.js', '<CallHistory sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE ACCURACY LOOP (2026-10-12): the Record page's WHAT GOT AWAY carries the window's counts, the ON THE BOARD, NO CALL rate and what separated them (lib/learn, published by scripts/learn-report.mjs)
  { key: 'record.gotAway', page: 'Record', group: 'Record', label: 'What got away: the window\'s counts (on / off the board), the on-the-board-no-call rate beside the called rate, and what separated them (components/record/LearnNote.js via the shared RecordPage)',
    check: { grep: { mlb: ['components/record/RecordPage.js', '<LearnNote sport={r.noteSport}'], nfl: ['components/record/RecordPage.js', '<LearnNote sport={r.noteSport}'], nhl: ['components/record/RecordPage.js', '<LearnNote sport={r.noteSport}'], nba: ['components/record/RecordPage.js', '<LearnNote sport={r.noteSport}'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'record.byTeam', page: 'Record', label: 'Called accuracy this week and all season, and called picks by club (CalledByTeam)',
    check: { grep: { mlb: ['components/tabs/Results.js', '<CalledByTeam sport="mlb"'], nfl: ['components/nfl/tabs/Accountability.js', '<CalledByTeam sport="nfl"'], nhl: ['components/lamp/tabs/Results.js', '<CalledByTeam sport="nhl"'], nba: ['components/buckets/tabs/Results.js', '<CalledByTeam sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE SLATE'S EXPECTED NUMBER, FROM A TEAM MODEL (owner decision 2026-10-08: every sport, every time)
  { key: 'slate.teamExpected', page: 'Games', label: 'Slate game card: the expected number from a TEAM model (club scoring x opponent allowed, shrunk early in the season), one clause per card naming each club (lib/expectedLine.js), and on the game page',
    check: { grep: { mlb: ['components/GameStrip.js', 'expectedClause('], nfl: ['components/nfl/NflSlate.js', 'expectedClause('], nhl: ['components/lamp/LampSlate.js', 'expectedClause('], nba: ['components/buckets/tabs/Slate.js', 'useBucketsTeamModel'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE SLATE (X overhaul piece 3, 2026-10-09): one cross-sport X post; each sport has an adapter naming its strongest CALLED player
  // (lib/posts/<sport>.js). BUCKETS' line is built but appears only when it has regular-season games, and its name never gets a site pointer until BUCKETS is public.
  { key: 'x.slate', page: 'X', label: 'THE SLATE (X): the sport\u2019s strongest CALLED player on the one cross-sport post (lib/posts/slate.js)',
    check: { grep: { mlb: ['lib/posts/mlb.js', 'export function mlbSlate'], nfl: ['lib/posts/nfl.js', 'export function nflSlate'], nhl: ['lib/posts/nhl.js', 'export function nhlSlate'], nba: ['lib/posts/nba.js', 'export function nbaSlate'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE NIGHT RECEIPT (X overhaul piece 5, 2026-10-09): each sport grades its named players with the helper that already existed (lib/posts/<sport>.js *Outcome).
  { key: 'x.receipt', page: 'X', label: 'THE NIGHT RECEIPT (X): the sport\u2019s named players, cashed / missed / did not play, on the one cross-sport post (lib/posts/receipt.js)',
    check: { grep: { mlb: ['lib/posts/mlb.js', 'export function mlbOutcome'], nfl: ['lib/posts/nfl.js', 'export function nflOutcome'], nhl: ['lib/posts/nhl.js', 'export function nhlOutcome'], nba: ['lib/posts/nba.js', 'export function nbaOutcome'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'writeup.game', page: 'Games', label: 'Game write-up (THE CALL)',
    check: { grep: { mlb: ['lib/writeups/build.js', 'mlb: buildMlbWriteup'], nfl: ['lib/writeups/build.js', 'nfl: buildNflWriteup'], nhl: ['lib/writeups/build.js', 'nhl: buildNhlWriteup'], nba: ['lib/writeups/build.js', 'nba: buildNbaWriteup'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'n/a: not planned until BUCKETS is public' } },

  // ── the player card / page (the root of the portal drift, 2026-10-06 audit) ──
  // MOONSHOT's PlayerModal is the base; each check is a string the sport's own card file carries.
  { key: 'player.portal', page: 'Player', label: 'Player card: the shared verdict first (components/player/VerdictBlock), not a bare stats page',
    check: { grep: { mlb: ['components/PlayerModal.js', '<VerdictBlock'], nfl: ['components/nfl/NflPlayerModal.js', '<VerdictBlock'], nhl: ['components/lamp/tabs/Player.js', '<VerdictBlock'], nba: ['components/buckets/tabs/Player.js', '<VerdictBlock'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.tabs', page: 'Player', label: 'Player card: pill tabs, the tab in the address (view=)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'initialTab'], nfl: ['components/nfl/NflPlayerModal.js', 'initialTab'], nhl: ['components/lamp/tabs/Player.js', 'cardViewPush'], nba: ['components/buckets/tabs/Player.js', 'initialTab'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.splits', page: 'Player', label: 'Player card: splits',
    check: { grep: { mlb: ['components/PlayerModal.js', 'PlayerSplits'], nfl: ['components/nfl/NflPlayerModal.js', 'SplitsForMarket'], nhl: ['components/lamp/tabs/Player.js', 'PlayerSplits'], nba: ['components/buckets/tabs/Player.js', 'PlayerSplits'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.gamelog', page: 'Player', label: 'Player card: a game-by-game table',
    check: { grep: { mlb: ['components/MlbGameLog.js', 'GAME LOG'], nfl: ['components/nfl/NflPlayerModal.js', 'GAME LOG'], nhl: ['components/lamp/tabs/Player.js', 'GAME LOG'], nba: ['components/buckets/tabs/Player.js', 'GAME LOG'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.navigator', page: 'Player', label: 'Player card: previous / next through the list',
    check: { grep: { mlb: ['components/PlayerModal.js', '<Navigator'], nfl: ['components/nfl/NflPlayerModal.js', '<Navigator'], nhl: ['components/lamp/tabs/Player.js', '<Navigator'], nba: ['components/buckets/tabs/Player.js', '<Navigator'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.why', page: 'Player', label: 'Player card: a Why / evidence block',
    check: { grep: { mlb: ['components/player/VerdictBlock.js', '<WhyLines'], nfl: ['components/player/nflAdapter.js', 'why: whyLines'], nhl: ['components/player/nhlAdapter.js', 'why: [w?.why'], nba: ['components/player/nbaAdapter.js', 'why: [whyLine]'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.statrow', page: 'Player', label: 'Player card: his key numbers in ONE row (components/player/StatRow)',
    check: { grep: { mlb: ['components/PlayerModal.js', '<StatRow'], nfl: ['components/nfl/NflPlayerModal.js', '<StatRow'], nhl: ['components/lamp/tabs/Player.js', '<StatRow'], nba: ['components/buckets/tabs/Player.js', '<StatRow'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'numerology.player', page: 'Player', label: 'Player card: HisNumbers (his numbers and the date)',
    check: { grep: { mlb: ['components/PlayerModal.js', '<HisNumbers'], nfl: ['components/nfl/NflPlayerModal.js', '<HisNumbers'], nhl: ['components/lamp/tabs/Player.js', '<HisNumbers'], nba: ['components/buckets/tabs/Player.js', '<HisNumbers'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'team.links', page: 'Team', label: 'Club codes link to the team page (lib/routes.js teamHref)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'tab=team&team='], nfl: ['components/nfl/NflPlayerModal.js', 'tab=team&team='], nhl: ['components/lamp/StaticPage.js', 'tab=team&team='], nba: ['lib/routes.js', "'nhl', 'nba'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── the 📸 share cards (fix15, 2026-10-08): drawn on the server in the baseball-card look (lib/cards/shareCards.js via /api/card/share), a download button per page ──
  // TUDDY's Rankings share is on every market of the hub (BoardHub, 2026-10-13); 2+ TD, our own model, has none.
  // MOONSHOT and TUDDY's pick/result cards came first; LAMP and BUCKETS now have the player, ranked-list and game cards. BUCKETS' buttons
  // exist only for a visitor BUCKETS' gate lets in (components/card/ShareCardButton.js asks useSportOpen).
  { key: 'card.player', page: 'Player', label: 'Share card: a 📸 PNG of the player (face, club, word, score, his stat lines)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'playerUrl('], nfl: ['components/nfl/NflPlayerModal.js', "kind: 'pick'"], nhl: ['components/lamp/tabs/Player.js', 'playerUrl('], nba: ['components/buckets/tabs/Player.js', "kind: 'pick'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'card.rankings', page: 'Board', label: 'Share card: the top of the Rankings as a 📸 PNG (faces, clubs, scores)',
    check: { grep: { mlb: ['components/tabs/RankedBoard.js', "kind: 'ranked'"], nfl: ['components/nfl/tabs/BoardHub.js', "{ kind: 'ranked', sport: 'nfl', market }"], nhl: ['components/lamp/tabs/Board.js', "kind: 'ranked'"], nba: ['components/buckets/tabs/Board.js', "kind: 'ranked'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'card.game', page: 'Games', label: 'Share card: one game as a 📸 PNG (the two clubs, the called players, the team model\'s expected number)',
    check: { grep: { mlb: ['components/tabs/Games.js', "kind: 'game'"], nfl: ['components/nfl/NflSlate.js', "kind: 'game'"], nhl: ['components/lamp/LampSlate.js', "kind: 'game'"], nba: ['components/buckets/tabs/Slate.js', "kind: 'game'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── tables (components/DenseTable.js + components/table/v2.js; every sport's tables are this one) ──
  // 2026-10-07: sort in tiers. The first column groups the rows, each column added orders inside the group above it.
  { key: 'table.tiers', page: 'Tables', label: 'Sort in tiers: the first column groups, each added column orders inside it (+ Tiers, or shift-click)',
    check: { grep: { mlb: ['components/DenseTable.js', 'nextSort'], nfl: ['components/DenseTable.js', 'nextSort'], nhl: ['components/DenseTable.js', 'nextSort'], nba: ['components/DenseTable.js', 'nextSort'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // MOONSHOT's Rankings lays its 80-odd columns out the way he reads them (cols= in the address).
  { key: 'board.columnviews', page: 'Board', label: 'Rankings column sets: Short list / What I read / All (cols= in the address, remembered per device; lib/columnViews.js)',
    check: { grep: { mlb: ['components/tabs/HitsHRR.js', 'COLUMN_VIEWS'], nfl: ['components/nfl/NflBoardFilters.js', 'columnSet='], nhl: ['components/lamp/tabs/Board.js', 'columnSet:'], nba: ['components/buckets/tabs/Board.js', 'columnSet:'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // The boards that were lists of boxes (2026-10-07): MOONSHOT's Steal / Gap / Power (parks, fence riders) / Hot streaks are DenseTable now.
  { key: 'boards.dense', page: 'Boards', label: 'Steal, gap, power and streak boards drawn as the one dense table',
    check: { grep: { mlb: ['components/tabs/StealBoard.js', '<DenseTable'] } },
    sports: { mlb: 'yes', nfl: 'n/a: TUDDY has no steal or gap board; its Explosive and Streaks pages are tables already', nhl: 'n/a: LAMP has no steal or gap board', nba: 'n/a: BUCKETS has no steal or gap board' } },

  // ── search, filters, the board's top bar ──
  { key: 'search.global', page: 'Site', label: 'One search for every product: players, clubs and the day\u2019s games, this product\u2019s first (components/QuickSearch + lib/search)',
    check: { grep: { mlb: ['components/Dashboard.js', '<QuickSearch'], nfl: ['components/nfl/NflDashboard.js', '<QuickSearch'], nhl: ['components/lamp/LampDashboard.js', '<QuickSearch'], nba: ['components/buckets/BucketsDashboard.js', '<QuickSearch'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'search.headerButton', page: 'Site', label: 'The header\u2019s search button (the only way in on a phone; components/header/SearchButton)',
    check: { grep: { mlb: ['components/header/HeaderShell.js', '<SearchButton'], nfl: ['components/header/HeaderShell.js', '<SearchButton'], nhl: ['components/header/HeaderShell.js', '<SearchButton'], nba: ['components/header/HeaderShell.js', '<SearchButton'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'filters.drawer', page: 'Board', label: 'The Filters drawer (components/FiltersDrawer)',
    check: { grep: { mlb: ['components/BoardFilters.js', 'FiltersDrawer'], nfl: ['components/nfl/NflBoardFilters.js', 'FiltersDrawer'], nhl: ['components/lamp/tabs/Board.js', 'FiltersDrawer'], nba: ['components/buckets/tabs/Board.js', 'FiltersDrawer'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'board.topbar', page: 'Board', label: 'The board\'s top bar (components/BoardTopBar: search, sort, filters)',
    check: { grep: { mlb: ['components/Controls.js', 'BoardTopBar'], nfl: ['components/nfl/tabs/BoardHub.js', 'BoardTopBar'], nhl: ['components/lamp/tabs/Board.js', 'BoardTopBar'], nba: ['components/buckets/tabs/Board.js', 'BoardTopBar'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── THE MONTH'S ADDITIONS, sport by sport (BUCKETS parity pass, 2026-10-12). A 'yes' for BUCKETS means the code is built and drawn behind its gate (admin, early access, or public); ──
  // ── it says nothing about data: BUCKETS has no graded regular-season night yet, so its records say "tracking" and its card shelves are empty until it does. ──
  { key: 'rank.cardsview', page: 'Board', label: 'Rankings as cards (the shared RankCard: face, score, status, stat strip, flip)',
    check: { grep: { mlb: ['components/PlayerCard.js', 'RankCard'], nfl: ['components/nfl/tabs/Touchdowns.js', 'RankCard'], nhl: ['components/lamp/LampCard.js', 'RankCard'], nba: ['components/buckets/BucketsCard.js', 'RankCard'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'rank.move', page: 'Board', label: 'Rank-move arrows on the Rankings (up / down since the last read, board_rank_snapshots)',
    check: { grep: { mlb: ['components/tabs/RankedBoard.js', 'rankMove'], nfl: ['components/nfl/tabs/Touchdowns.js', 'rankMove'], nhl: ['components/lamp/tabs/Board.js', 'rankMove'], nba: ['components/buckets/tabs/Board.js', 'rankMove'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'rank.position', page: 'Board', label: 'Position filter on the Rankings (lib/positions.js, pos= in the address; BUCKETS: PG / SG / SF / PF / C and the G / F groups)',
    check: { grep: { mlb: ['components/tabs/RankedBoard.js', 'lib/positions'], nfl: ['components/nfl/tabs/Touchdowns.js', 'lib/positions'], nhl: ['components/lamp/tabs/Board.js', 'lib/positions'], nba: ['components/buckets/tabs/Board.js', 'lib/positions'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.birthday', page: 'Player', label: 'Player page: birthday chip (his birthday on the game’s own date)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'BirthdayChip'], nfl: ['components/nfl/NflPlayerModal.js', 'BirthdayChip'], nhl: ['components/lamp/tabs/Player.js', 'BirthdayChip'], nba: ['components/buckets/tabs/Player.js', 'BirthdayChip'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.injury', page: 'Player', label: 'Player page: the injury chip (the shared injury layer, lib/injuries)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'PlayerInjuryChip'], nfl: ['components/nfl/NflPlayerModal.js', 'PlayerInjuryChip'], nhl: ['components/lamp/tabs/Player.js', 'PlayerInjuryChip'], nba: ['components/buckets/tabs/Player.js', 'PlayerInjuryChip'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'card.flip', page: 'Player', label: 'Player page: the Card chip (the baseball-card front and the stat-table back)',
    check: { grep: { mlb: ['components/PlayerModal.js', '<CardFlip sport="mlb"'], nfl: ['components/nfl/NflPlayerModal.js', '<CardFlip sport="nfl"'], nhl: ['components/lamp/tabs/Player.js', '<CardFlip sport="nhl"'], nba: ['components/buckets/tabs/Player.js', '<CardFlip sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'card.shelf', page: 'Player', label: 'Player page: the "Cards earned" shelf at the end of the page (rarest first; no section when he has none)',
    check: { grep: { mlb: ['components/PlayerModal.js', '<CardsEarned sport="mlb"'], nfl: ['components/nfl/NflPlayerModal.js', '<CardsEarned sport="nfl"'], nhl: ['components/lamp/tabs/Player.js', '<CardsEarned sport="nhl"'], nba: ['components/buckets/tabs/Player.js', '<CardsEarned sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'card.moments', page: 'Cards', label: 'Special-card moments (lib/cards/moments.js; BUCKETS: 30 points, 40 points, double-double, triple-double, 10 threes, counted from graded regular-season rows; hidden)',
    check: { grep: { mlb: ['lib/cards/moments.js', "key: 'mlb_multi_hr'"], nfl: ['lib/cards/moments.js', "key: 'nfl_multi_td'"], nhl: ['lib/cards/moments.js', "key: 'nhl_goal'"], nba: ['lib/cards/moments.js', "key: 'nba_30_points'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'binder.tab', page: 'Binder', label: 'The Binder tab (MY CARDS from the watchlist, ALL CARDS)', check: { tab: { mlb: 'binder', nfl: 'binder', nhl: 'binder', nba: 'binder' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'team.cards', page: 'Team', label: 'Team page: the Cards section (cards its players earned in the last 30 days)',
    check: { grep: { mlb: ['lib/team/mlb.js', 'cardsSection(SPORT'], nfl: ['lib/team/nfl.js', 'cardsSection(SPORT'], nhl: ['lib/team/nhl.js', 'cardsSection(SPORT'], nba: ['lib/team/nba.js', 'cardsSection(SPORT'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'stamps.card', page: 'Cards', label: 'Situation stamps on the player card front and the special cards (lib/cards/situationData.js; BUCKETS: season-points milestone, 25+ point streak, season-highs on the market bars, birthday, rest, playoff round)',
    check: { grep: { mlb: ['lib/cards/situationData.js', 'mlb: mlbCtx'], nfl: ['lib/cards/situationData.js', 'nfl: nflCtx'], nhl: ['lib/cards/situationData.js', 'nhl: nhlCtx'], nba: ['lib/cards/situationData.js', 'nba: nbaCtx'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'stamps.rankcard', page: 'Cards', label: 'Situation stamps on the ranked card in the app (RankCard stampFor; the first nine cards of a list ask, components/card/useStamps.js stampArg)',
    check: { grep: { mlb: ['components/PlayerCard.js', 'stampFor='], nfl: ['components/nfl/tabs/Touchdowns.js', 'stampArg('], nhl: ['components/lamp/LampCard.js', 'stampArg('], nba: ['components/buckets/BucketsCard.js', 'stampArg('] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'numerology.record', page: 'Numerology', label: 'Lane nights recorded by the sport’s tick (BUCKETS: written only once public, lib/numerology/nbaTick.js; needs SQL 202610122000)',
    check: { grep: { mlb: ['lib/numerology/mlbWriter.js', 'writeNight'], nfl: ['app/api/dash/nfl/tick/route.js', 'writeNumerology'], nhl: ['app/api/lamp/tick/route.js', 'writeNumerology'], nba: ['app/api/buckets/tick/route.js', 'recordNbaLanes'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── PUSH ALERT CATEGORIES (2026-10-13, lib/dash/alerts.js + lib/dash/pushRules.js; every one OFF until chosen, counted by the daily soft cap) ──
  { key: 'alerts.called', page: 'Alerts', label: 'Push: any CALLED scorer, followed or not (the "everyone" alert, off by default, in no preset)',
    check: { grep: { nfl: ['lib/dash/alerts.js', "key: 'nflcalled'"], nhl: ['lib/dash/alerts.js', "key: 'nhlcalled'"], nba: ['lib/dash/alerts.js', "key: 'nbacalled'"] } },
    sports: { mlb: 'n/a: MOONSHOT’s version, the any-slate homer (slate), was cut for phones in the 10-09 push plan; it is about names you did not pick', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'alerts.multi', page: 'Alerts', label: 'Push: a multi-score game note (2+ touchdowns or 3 thrown, 2+ goals), once per game',
    check: { grep: { nfl: ['lib/dash/alerts.js', "key: 'nflmulti'"], nhl: ['lib/dash/alerts.js', "key: 'nhlmulti'"] } },
    sports: { mlb: 'n/a: a second homer already pushes on its own (the homer note carries the count in its key), so there is no separate multi-HR note', nfl: 'yes', nhl: 'yes', nba: 'n/a: the 30-point note is BUCKETS’ own milestone; there is no 2+ equivalent' } },
  { key: 'alerts.final', page: 'Alerts', label: 'Push: the final score of a game with a club you follow a player on, once per game',
    check: { grep: { nfl: ['lib/dash/alerts.js', "key: 'nflfinal'"], nhl: ['lib/dash/alerts.js', "key: 'nhlfinal'"] } },
    sports: { mlb: 'n/a: gamefinal was cut (never delivered alone); the nightly recap says how the night went', nfl: 'yes', nhl: 'yes', nba: 'todo: BUCKETS’ pregame snapshot does not carry finals yet; hidden until BUCKETS opens' } },
  { key: 'alerts.injury', page: 'Alerts', label: 'Push: a followed player moves to questionable / doubtful / day-to-day on the injury report (Out is the scratch push)',
    check: { grep: { nfl: ['lib/dash/alerts.js', "key: 'nflinj'"], nhl: ['lib/dash/alerts.js', "key: 'nhlinj'"] } },
    sports: { mlb: 'todo: MLB pushes Out only (scratched); a day-to-day listing has no push yet', nfl: 'yes', nhl: 'yes', nba: 'todo: BUCKETS pushes Out only (scratched); a day-to-day listing has no push yet' } },
  // ── 2026-10-13 parity batch: the 2+ board, the Ledger's Called and Archive, the watchlist's share ──
  { key: 'rank.two', page: 'Board', label: 'The 2+ board: who can score two (2+ HR, 2+ TD, 2+ goals), our own new ranking beside the anytime board',
    check: { grep: { mlb: ['components/tabs/HitsHRR.js', "key: 'hr2'"], nfl: ['components/nfl/tabs/TwoTouchdowns.js', 'TwoCard'], nhl: ['components/lamp/tabs/Board.js', 'G2'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'n/a: BUCKETS\' markets are fixed bars (25 pts, 10 reb, 8 ast, 4 3PM, 35 PRA, DD, TD, first basket); the double-double and triple-double markets already are its multi-stat bars' } },
  { key: 'ledger.called', page: 'Ledger', label: 'The Ledger\'s Called view: every event of a graded night, sorted CALLED / ON THE BOARD / NOT ON THE BOARD (BUCKETS: the 25-point games, off the record; the counts say tracking under the 30-night floor)',
    check: { grep: { mlb: ['components/Dashboard.js', 'called: () =>'], nfl: ['components/nfl/NflDashboard.js', 'called: () =>'], nhl: ['components/lamp/LampDashboard.js', 'called: () =>'], nba: ['components/buckets/BucketsDashboard.js', 'called: () =>'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'ledger.archive', page: 'Ledger', label: 'The Ledger\'s Archive view: past nights and the season window',
    check: { grep: { mlb: ['components/Dashboard.js', 'archive: () =>'], nfl: ['components/nfl/NflDashboard.js', 'archive: () =>'], nhl: ['components/lamp/LampDashboard.js', 'archive: () =>'], nba: ['components/buckets/BucketsDashboard.js', 'archive: () =>'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'watch.share', page: 'Watchlist', label: 'Watchlist: a share button (the list as a ranked card, in board order)',
    check: { grep: { mlb: ['components/tabs/Watchlist.js', 'ShareCardButton'], nfl: ['components/nfl/tabs/Watchlist.js', 'ShareCardButton'], nhl: ['components/lamp/tabs/Watchlist.js', 'ShareCardButton'], nba: ['components/buckets/tabs/Watchlist.js', 'ShareCardButton'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // ── 2026-10-13: the score-band table and the goalie give-up split (LAMP first; each other sport gets its own when its numbers are read) ──
  { key: 'record.scoreBands', page: 'Record', label: 'The record\'s score-band table: scored rate by model-score band, and the top band split by the call, with n and a small-sample note',
    check: { grep: { nhl: ['components/lamp/tabs/Results.js', '<LadderScoreBands'] } },
    sports: { mlb: 'todo: MOONSHOT has the rank bands in its Record (components/bands) but not a top-score band split by the call; build it from lib/record/scoreBands.js once its graded rows carry the stored score', nfl: 'todo: TUDDY\'s card markets are graded per market, not per score band; the band table waits for a stored per-skater score on the graded rows', nhl: 'yes', nba: 'n/a: BUCKETS is hidden and under its public-number floor; no band table until it is open' } },
  { key: 'board.goalieGiveUps', page: 'Goalies', label: 'Who scores on a goalie: his share of goals against by the scorer\'s position and by side of the ice, league share beside it, floors printed',
    check: { grep: { nhl: ['app/nhl/goalies/page.js', '<GoalieGiveUps'] } },
    sports: { mlb: 'todo: MOONSHOT has pitcher weak spots by zone (WeakSpotCards) and handedness; a by-position split of what he allows is not built', nfl: 'todo: TUDDY\'s defence-vs-position view is the twin (what a defence allows to WR / TE / RB); not built as a share table', nhl: 'yes', nba: 'n/a: BUCKETS has no goalie; the twin is a defense by position, built when BUCKETS opens' } },
]

export const isYes = (v) => v === 'yes'
export const naReason = (v) => (typeof v === 'string' && v.startsWith('n/a: ') ? v.slice(5).trim() : null)
export const todoReason = (v) => (typeof v === 'string' && v.startsWith('todo: ') ? v.slice(6).trim() : null)
