// WHAT EVERY SPORT HAS (BATCH-ONE-SITE step 2, 2026-10-05). One list of the features
// each product's pages carry, sport by sport: 'yes', or 'n/a: <reason>' -- a gap is
// written down with its reason, never left blank. scripts/check-parity.mjs (in the push
// gate) fails when a value is missing, when a 'yes' isn't backed by the code, or when a
// feature the code now has is still marked n/a. /admin prints the grid.
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
  { key: 'tab.boards', page: 'Board', label: 'The ranked table, its own page (not under the cards)',
    check: { tab: { mlb: 'fullboard', nfl: 'research', nhl: 'fullboard', nba: 'fullboard' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },

  // ── site-wide ──
  { key: 'home.tonight', page: 'Home', label: 'TONIGHT strip (went / lining up / still to go)',
    check: { file: { mlb: ['components/tonight/MlbTonight.js', 'components/tabs/Home.js'], nfl: ['components/tonight/NflTonight.js', 'components/nfl/tabs/Home.js'], nhl: ['components/tonight/NhlTonight.js', 'components/lamp/tabs/Home.js'], nba: ['components/tonight/NbaTonight.js', 'components/buckets/tabs/Home.js'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.props', page: 'Props', label: 'Props page', check: { tab: { mlb: 'props', nfl: 'picks', nhl: 'board', nba: 'board' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.ledger', page: 'Ledger', label: 'Ledger page', check: { tab: { mlb: 'ledger', nfl: 'ledger', nhl: 'ledger', nba: 'ledger' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.team', page: 'Team', label: 'Team page', check: { tab: { mlb: 'team', nfl: 'team', nhl: 'team', nba: 'team' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'tab.numerology', page: 'Numerology', label: 'Numerology page', check: { tab: { mlb: 'align', nfl: 'numerology', nhl: 'numerology', nba: 'numerology' } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'record.calls', page: 'Record', label: 'Every call, its price, its result (CallHistory)',
    check: { grep: { mlb: ['components/tabs/Results.js', '<CallHistory sport="mlb"'], nfl: ['components/nfl/tabs/Accountability.js', '<CallHistory sport="nfl"'], nhl: ['components/lamp/tabs/Results.js', '<CallHistory sport="nhl"'], nba: ['components/buckets/tabs/Results.js', '<CallHistory sport="nba"'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'yes' } },
  { key: 'writeup.game', page: 'Games', label: 'Game write-up (THE CALL)',
    check: { grep: { mlb: ['lib/writeups/build.js', 'mlb: buildMlbWriteup'], nfl: ['lib/writeups/build.js', 'nfl: buildNflWriteup'], nhl: ['lib/writeups/build.js', 'nhl: buildNhlWriteup'], nba: ['lib/writeups/build.js', 'nba: buildNbaWriteup'] } },
    sports: { mlb: 'yes', nfl: 'yes', nhl: 'yes', nba: 'n/a: not planned until BUCKETS is public' } },
]

export const isYes = (v) => v === 'yes'
export const naReason = (v) => (typeof v === 'string' && v.startsWith('n/a: ') ? v.slice(5).trim() : null)
