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
  { key: 'totals.slate', page: 'Slate', label: 'Top totals: the three highest projected-total games, CALLED before the first game',
    check: { grep: { mlb: ['components/Dashboard.js', '<TopTotals sport="mlb"'], nfl: ['components/nfl/NflDashboard.js', '<TopTotals sport="nfl"'], nhl: ['components/lamp/LampDashboard.js', '<TopTotals sport="nhl"'], nba: ['components/buckets/BucketsDashboard.js', '<TopTotals sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'totals.record', page: 'Ledger', label: 'Top totals: the record and graded calls in the Ledger\'s Record view',
    check: { grep: { mlb: ['components/pages/LedgerShell.js', '<TopTotals sport={sport} mode="record"'], nfl: ['components/pages/LedgerShell.js', '<TopTotals sport={sport} mode="record"'], nhl: ['components/pages/LedgerShell.js', '<TopTotals sport={sport} mode="record"'], nba: ['components/pages/LedgerShell.js', '<TopTotals sport={sport} mode="record"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

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
  { key: 'numerology.lanes', page: 'Numerology', label: 'Lane scoreboard + tonight\'s players on these lanes',
    check: { grep: { mlb: ['components/Alignments.js', '<LaneTable'], nfl: ['components/nfl/tabs/Numerology.js', '<LaneTable'], nhl: ['components/lamp/tabs/Numerology.js', '<LaneTable'], nba: ['components/buckets/tabs/Numerology.js', '<LaneTable'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'todo: BUCKETS records no lane nights yet (/api/numerology/lanes answers 400 for it)' } },
  { key: 'tab.team', page: 'Team', label: 'Team page', check: { tab: { mlb: 'team', nfl: 'team', nhl: 'team', nba: 'team' } },
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
    check: { grep: { mlb: ['components/PlayerModal.js', '<LineMoveChip'], nfl: ['components/nfl/NflPlayerModal.js', '<LineMoveChip'] } },
    sports: { mlb: 'todo: MOONSHOT\'s card and boards stay pixel-identical; OddsLine takes `move` when he asks for it', nfl: 'yes', nhl: 'todo: LAMP\'s card and board do not carry the chip yet (OddsLine `move` is ready)', nba: 'todo: BUCKETS has no chip yet' } },
  { key: 'record.calls', page: 'Record', label: 'Every call, its price, its result (CallHistory)',
    check: { grep: { mlb: ['components/tabs/Results.js', '<CallHistory sport="mlb"'], nfl: ['components/nfl/tabs/Accountability.js', '<CallHistory sport="nfl"'], nhl: ['components/lamp/tabs/Results.js', '<CallHistory sport="nhl"'], nba: ['components/buckets/tabs/Results.js', '<CallHistory sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE SLATE'S EXPECTED NUMBER, FROM A TEAM MODEL (owner decision 2026-10-08: every sport, every time)
  { key: 'slate.teamExpected', page: 'Games', label: 'Slate game card: the expected number from a TEAM model (club scoring x opponent allowed, shrunk early in the season), and on the game page',
    check: { grep: { nba: ['components/buckets/tabs/Slate.js', 'useBucketsTeamModel'] } },
    sports: { mlb: 'todo: the dial is Game Score (a slate-relative rank); an expected-runs team model is not built yet', nfl: 'todo: the dial is the sum of each scored player\'s xTD, not a team model', nhl: 'todo: the dial is the sum of each skater\'s goals a game, not a team model', nba: 'yes' } },
  // THE SLATE (X overhaul piece 3, 2026-10-09): one cross-sport X post; each sport has an adapter naming its strongest CALLED player
  // (lib/posts/<sport>.js). BUCKETS' line is built but appears only when it has regular-season games, and its name never gets a site pointer until BUCKETS is public.
  { key: 'x.slate', page: 'X', label: 'THE SLATE (X): the sport\u2019s strongest CALLED player on the one cross-sport post (lib/posts/slate.js)',
    check: { grep: { mlb: ['lib/posts/mlb.js', 'export function mlbSlate'], nfl: ['lib/posts/nfl.js', 'export function nflSlate'], nhl: ['lib/posts/nhl.js', 'export function nhlSlate'], nba: ['lib/posts/nba.js', 'export function nbaSlate'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // THE NIGHT RECEIPT (X overhaul piece 5, 2026-10-09): each sport grades its named players with the helper that already existed (lib/posts/<sport>.js *Outcome).
  { key: 'x.receipt', page: 'X', label: 'THE NIGHT RECEIPT (X): the sport\u2019s named players, cashed / missed / did not play, on the one cross-sport post (lib/posts/receipt.js)',
    check: { grep: { mlb: ['lib/posts/mlb.js', 'export function mlbOutcome'], nfl: ['lib/posts/nfl.js', 'export function nflOutcome'], nhl: ['lib/posts/nhl.js', 'export function nhlOutcome'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'todo: BUCKETS has no receipt grader until it is public (its Slate line stays off until then)' } },
  { key: 'writeup.game', page: 'Games', label: 'Game write-up (THE CALL)',
    check: { grep: { mlb: ['lib/writeups/build.js', 'mlb: buildMlbWriteup'], nfl: ['lib/writeups/build.js', 'nfl: buildNflWriteup'], nhl: ['lib/writeups/build.js', 'nhl: buildNhlWriteup'], nba: ['lib/writeups/build.js', 'nba: buildNbaWriteup'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'n/a: not planned until BUCKETS is public' } },

  // ── the player card / page (the root of the portal drift, 2026-10-06 audit) ──
  // MOONSHOT's PlayerModal is the base; each check is a string the sport's own card file carries.
  { key: 'player.portal', page: 'Player', label: 'Player card: the shared VerdictHero card (not a bare stats page)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'VerdictHero'], nfl: ['components/nfl/NflPlayerModal.js', 'VerdictHero'], nhl: ['components/lamp/tabs/Player.js', 'VerdictHero'], nba: ['components/buckets/tabs/Player.js', 'VerdictHero'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'player.tabs', page: 'Player', label: 'Player card: pill tabs, the tab in the address (view=)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'initialTab'], nfl: ['components/nfl/NflPlayerModal.js', 'initialTab'], nhl: ['components/lamp/tabs/Player.js', 'initialTab'], nba: ['components/buckets/tabs/Player.js', 'initialTab'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'todo: LAMP\'s player page is one long scroll; the pill tabs are being rebuilt', nba: 'yes' } },
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
    check: { grep: { mlb: ['components/player/VerdictBlock.js', '<WhyLines'], nfl: ['components/nfl/NflPlayerModal.js', '<WhyLines'], nhl: ['components/lamp/tabs/Player.js', '<WhyLines'], nba: ['components/buckets/tabs/Player.js', '<WhyLines'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'numerology.player', page: 'Player', label: 'Player card: HisNumbers (his numbers and the date)',
    check: { grep: { mlb: ['components/PlayerModal.js', '<HisNumbers'], nfl: ['components/nfl/NflPlayerModal.js', '<HisNumbers'], nhl: ['components/lamp/tabs/Player.js', '<HisNumbers'], nba: ['components/buckets/tabs/Player.js', '<HisNumbers'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'team.links', page: 'Team', label: 'Club codes link to the team page (lib/routes.js teamHref)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'tab=team&team='], nfl: ['components/nfl/NflPlayerModal.js', 'tab=team&team='], nhl: ['components/lamp/StaticPage.js', 'tab=team&team='], nba: ['lib/routes.js', "'nhl', 'nba'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── the 📸 share cards (fix15, 2026-10-08): one kit (lib/cards/kit.js + cards.js), a download button per page ──
  // MOONSHOT and TUDDY's pick/result cards came first; LAMP and BUCKETS now have the player, ranked-list and game cards. BUCKETS' buttons
  // exist only once the sport is public (components/CardButton.js reads isHiddenSport).
  { key: 'card.player', page: 'Player', label: 'Share card: a 📸 PNG of the player (face, club, word, score, his stat lines)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'downloadPlayerCard'], nfl: ['components/nfl/NflPlayerModal.js', 'downloadNflPickCard'], nhl: ['components/lamp/tabs/Player.js', 'downloadLampPlayerCard'], nba: ['components/buckets/tabs/Player.js', 'downloadBucketsPlayerCard'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'card.rankings', page: 'Board', label: 'Share card: the top of the Rankings as a 📸 PNG (faces, clubs, scores)',
    check: { grep: { mlb: ['components/tabs/RankedBoard.js', 'downloadBoardCard'], nhl: ['components/lamp/tabs/Board.js', 'downloadLampBoardCard'], nba: ['components/buckets/tabs/Board.js', 'downloadBucketsBoardCard'] } },
    sports: { mlb: 'yes', nfl: 'todo: TUDDY\'s cards are the pick and result card only; the ranked-list layout (lib/cards/cards.js rankedCard) takes the sport, the button is not wired', nhl: 'yes', nba: 'yes' } },
  { key: 'card.game', page: 'Games', label: 'Share card: one game as a 📸 PNG (the two clubs, the called players, the team model\'s expected number)',
    check: { grep: { mlb: ['components/tabs/Games.js', 'downloadGameCard'], nhl: ['components/lamp/LampSlate.js', 'downloadLampGameCard'], nba: ['components/buckets/tabs/Slate.js', 'downloadBucketsGameCard'] } },
    sports: { mlb: 'yes', nfl: 'todo: TUDDY has no game card; the ranked-list layout takes the sport, the button is not wired', nhl: 'yes', nba: 'yes' } },

  // ── tables (components/DenseTable.js + components/table/v2.js; every sport's tables are this one) ──
  // 2026-10-07: sort in tiers. The first column groups the rows, each column added orders inside the group above it.
  { key: 'table.tiers', page: 'Tables', label: 'Sort in tiers: the first column groups, each added column orders inside it (+ Tiers, or shift-click)',
    check: { grep: { mlb: ['components/DenseTable.js', 'nextSort'], nfl: ['components/DenseTable.js', 'nextSort'], nhl: ['components/DenseTable.js', 'nextSort'], nba: ['components/DenseTable.js', 'nextSort'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  // MOONSHOT's Rankings lays its 80-odd columns out the way he reads them (cols= in the address).
  { key: 'board.columnviews', page: 'Board', label: 'Rankings column views: All / What I read / Short list (cols= and sort= in the address)',
    check: { grep: { mlb: ['components/tabs/HitsHRR.js', 'COLUMN_VIEWS'] } },
    sports: { mlb: 'yes', nfl: 'todo: the NFL board keeps its own grouped columns; the cols= views are built on the MOONSHOT column list', nhl: 'todo: the LAMP board keeps its own grouped columns; the cols= views are built on the MOONSHOT column list', nba: 'todo: BUCKETS is hidden, and its board has its own column list' } },
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
]

export const isYes = (v) => v === 'yes'
export const naReason = (v) => (typeof v === 'string' && v.startsWith('n/a: ') ? v.slice(5).trim() : null)
export const todoReason = (v) => (typeof v === 'string' && v.startsWith('todo: ') ? v.slice(6).trim() : null)
