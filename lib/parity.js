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
    check: { grep: { mlb: ['components/PlayerModal.js', '<WhyLines'], nfl: ['components/nfl/NflPlayerModal.js', '<WhyLines'], nhl: ['components/lamp/tabs/Player.js', '<WhyLines'], nba: ['components/buckets/tabs/Player.js', '<WhyLines'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'numerology.player', page: 'Player', label: 'Player card: HisNumbers (his numbers and the date)',
    check: { grep: { mlb: ['components/PlayerModal.js', '<HisNumbers'], nfl: ['components/nfl/NflPlayerModal.js', '<HisNumbers'], nhl: ['components/lamp/tabs/Player.js', '<HisNumbers'], nba: ['components/buckets/tabs/Player.js', '<HisNumbers'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'team.links', page: 'Team', label: 'Club codes link to the team page (lib/routes.js teamHref)',
    check: { grep: { mlb: ['components/PlayerModal.js', 'tab=team&team='], nfl: ['components/nfl/NflPlayerModal.js', 'tab=team&team='], nhl: ['components/lamp/StaticPage.js', 'tab=team&team='], nba: ['lib/routes.js', "'nhl', 'nba'"] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── search, filters, the board's top bar ──
  { key: 'search.global', page: 'Site', label: 'Search anywhere: QuickSearch (roster file + live people-search)',
    check: { grep: { mlb: ['components/Dashboard.js', '<QuickSearch'], nfl: ['components/nfl/NflDashboard.js', '<QuickSearch'], nhl: ['components/lamp/LampDashboard.js', '<QuickSearch'], nba: ['components/buckets/BucketsDashboard.js', '<QuickSearch'] } },
    sports: { mlb: 'yes', nfl: 'todo: the Players tab and the board search the slate only', nhl: 'todo: the Players tab and the board search the slate only', nba: 'todo: the Players tab searches the roster list only' } },
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
