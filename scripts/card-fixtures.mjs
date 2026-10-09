// TEST DATA for scripts/check-cards.mjs. Every name and number below is made up
// for the test: none of it is a real player's line. Club codes are real codes
// (a card needs a logo to draw); 'TEST' is in every name so no sample can be
// mistaken for a record.
const SHAPE = { n: 9, wall_scraper: 1, laser: 2, standard: 3, moonshot: 2, no_doubter: 1, la_lo: 22, la_hi: 31 }

const hitter = (i, o = {}) => ({
  player_id: 900000 + i, name: o.name || `Test Hitter ${i}`, team: o.team || 'NYY', opp: o.opp || 'BOS',
  hr_score: o.hr_score ?? 80 - i * 4, hit_score: 61, hrr_score: 55, contact_score: 58, overall_score: 66,
  game_pick_role: o.role === undefined ? 'HR' : o.role, board_rank: i, board_of: 30,
  season_hr: 28 - i, last5_hr: i % 3, last5_hits: 6, last5_xbh: 2, season_iso: 0.231, games_since_last_hr: i % 4,
  recent_barrel_rate: 0.14, recent_hard_hit_rate: 0.47, hr_shape_components: { max_ev: 112, max_distance: 431 },
  pitcher_name: 'Test Starter', pitcher_throws: 'R', pitcher_hr9: 1.62, pitcher_whip: 1.41, pitcher_weak_side: 'LHB', bats: 'L',
  park_hr_factor: 1.08, venue_name: 'Test Park', lineup_spot: 3, hr_shape_profile: SHAPE,
  best_bet_type: 'HR', ...o.extra,
})

export const FIX = {
  hitters: [
    hitter(1, { name: 'Test Hitter One', team: 'LAD', opp: 'SF' }),
    hitter(2, { name: 'Test Hitter Two-Hernandez Jr.', team: 'NYY', opp: 'BOS', role: 'HIT' }),
    hitter(3, { name: 'Test Hitter Three', team: 'ATL', opp: 'PHI', role: 'WATCH' }),
    hitter(4, { name: 'Test Hitter Four', team: 'HOU', opp: 'TEX', role: '' }),
    hitter(5, { team: 'SEA', opp: 'OAK' }), hitter(6, { team: 'BAL', opp: 'TB' }), hitter(7, { team: 'MIN', opp: 'CLE' }),
    hitter(8, { team: 'CHC', opp: 'STL' }), hitter(9, { team: 'SD', opp: 'COL' }), hitter(10, { team: 'TOR', opp: 'DET' }),
    hitter(11, { team: 'PIT', opp: 'MIL' }), hitter(12, { team: 'MIA', opp: 'WSH' }), hitter(13, { team: 'KC', opp: 'CWS' }),
  ],
  gameExtra: { actual_hr: 1, actual_hits: 2 },
  record: {
    rows: [
      { cat: { label: 'TOP' }, ok: 12, n: 40, base: 30.0, grade: { g: 'B' } },
      { cat: { label: 'HR' }, ok: 30, n: 160, base: 18.8, grade: { g: 'B+' } },
      { cat: { label: 'HIT' }, ok: 90, n: 150, base: 60.0, grade: { g: 'C' } },
      { cat: { label: 'HRR' }, ok: 70, n: 150, base: 46.7, grade: { g: 'B' } },
      { cat: { label: 'CONTACT' }, ok: 55, n: 100, base: 55.0, grade: { g: 'A-' } },
    ],
    seasonOk: 257, seasonN: 600, seasonPct: 42.8, lockOk: 40, lockN: 80, lockPct: 50.0, lockNights: 9, days: 120,
  },
  pitcher: {
    name: 'Test Starter-Gonzalez III', team: 'BOS', opp: 'NYY', throws: 'R', weakSide: 'LHB',
    tiles: [
      { label: 'HR/9', value: '1.62', tone: 'hot' }, { label: 'WHIP', value: '1.41', tone: 'hot' }, { label: 'K%', value: '19%', tone: 'hot' },
      { label: 'BARREL%', value: '9%', tone: 'cold' }, { label: 'ERA', value: '4.88' }, { label: 'IP/G', value: '5.1' },
      { label: 'FB%', value: '41%' }, { label: 'HARD%', value: '36%', tone: 'cold' },
    ],
  },
  nflPre: { name: 'Test Receiver One', team: 'KC', opp: 'BUF', position: 'WR', market: 'TD', marketLabel: 'Anytime TD', rank: 2, bar: 1, score: 71.4, grade: 'A-' },
  nflHit: { name: 'Test Receiver One', team: 'KC', opp: 'BUF', position: 'WR', market: 'REC_YDS', marketLabel: 'Receiving yards', rank: 1, bar: 60, actual: 88, hit: true, grade: 'A' },
  nflMiss: { name: 'Test Runner Two', team: 'SF', opp: 'SEA', position: 'RB', market: 'RUSH_YDS', marketLabel: 'Rushing yards', rank: 3, bar: 70, actual: 41, hit: false, grade: 'B+' },
  nflVoid: { name: 'Test Runner Three', team: 'DAL', opp: 'PHI', position: 'RB', market: 'RUSH_YDS', marketLabel: 'Rushing yards', rank: 4, bar: 70, void: true, hit: null },
}

// ── LAMP and BUCKETS (fix15). TEST data in the shape the wrappers hand the card layouts: every name says "Test",
// every number is made up for the layout (none is a real line). Club codes are real codes (a card needs a logo).
const nhlRow = (i, team, opp, o = {}) => ({ rank: i, name: `Test Skater ${i}`, team, opp, id: 7000000 + i, photo: null, status: o.status || 'board', score: o.score ?? 90 - i * 6, ...o.extra })
const nbaRow = (i, team, opp, o = {}) => ({ rank: i, name: `Test Guard ${i}`, team, opp, id: 9000000 + i, status: o.status || 'board', score: o.score ?? 88 - i * 5, ...o.extra })

const nhlPlayer = (o = {}) => ({
  label: 'Player card', name: 'Test Skater-Fitzgerald Jr.', team: 'EDM', where: 'vs CGY', id: 7000001, photo: null, number: 97,
  bits: ['Centre', 'shoots L'], status: 'called', score: 91, scoreLabel: 'GOAL SCORE', rank: 3, rankOf: 212, pool: 'skaters',
  tiles: [{ label: 'SHOTS / GP', value: '3.84', hot: true }, { label: 'GOALS / GP', value: '0.52', hot: true }, { label: 'ICE TIME', value: '21:07' }, { label: 'PP GOALS', value: '9' }],
  lines: [
    { label: '2025-26 season', value: '31 G · 44 A · 75 PTS · 68 GP' },
    { label: 'Goals, recent form', value: 'L5 3 · L10 5', hot: true },
    { label: 'Since his last goal', value: '2 games' },
    { label: 'Opposing net', value: 'Test Goalie · 3.12 GA/G' },
  ],
  ...o,
})
const nbaPlayer = (o = {}) => ({
  label: 'Player card', name: 'Test Guard-Okonkwo-Smith', team: 'BOS', where: '@ NY', id: 9000001, photo: null, number: 7,
  bits: ['G', `6' 4"`], status: 'called', score: 88, scoreLabel: 'PTS 25+ SCORE', rank: 2, rankOf: 164, pool: 'players',
  tiles: [{ label: 'PTS / G', value: '27.4' }, { label: 'REB / G', value: '5.1' }, { label: 'AST / G', value: '6.8' }, { label: 'xPTS', value: '26.9', hot: true }],
  lines: [
    { label: '2025-26 per game', value: '64 GP · 35.2 MIN' },
    { label: 'Last 5 games', value: '29.2 PTS · 4.8 REB · 7.0 AST' },
    { label: 'Projection built from', value: '34.8 MIN × 0.77 PTS/MIN' },
  ],
  ...o,
})
const gradedFor = (p, hit, word, actual, label) => ({ ...p, result: { word, hit, actual, actualLabel: label } })

export const NHL = {
  player: nhlPlayer(),
  hit: gradedFor(nhlPlayer(), true, 'GOAL', 2, 'GOALS'),
  miss: gradedFor(nhlPlayer({ name: 'Test Skater Two' }), false, 'MISS', 0, 'GOALS'),
  void: gradedFor(nhlPlayer({ name: 'Test Skater Three' }), null, 'VOID'),
  off: nhlPlayer({ name: 'Test Skater Four', status: 'off', score: null, rank: null, rankOf: null, lines: [{ label: '2025-26 season', value: '4 G · 6 A · 10 PTS · 22 GP' }] }),
  rows: [nhlRow(1, 'EDM', 'CGY', { status: 'called' }), nhlRow(2, 'TOR', 'BOS', { status: 'called' }), nhlRow(3, 'NYR', 'NJD'), nhlRow(4, 'COL', 'DAL'), nhlRow(5, 'BOS', 'TOR'), nhlRow(6, 'VGK', 'LAK'), nhlRow(7, 'TBL', 'FLA'), nhlRow(8, 'WPG', 'MIN'), nhlRow(9, 'SEA', 'VAN')],
  gameRows: [nhlRow(1, 'EDM', 'CGY', { status: 'called', extra: { result: { text: '2 G', hot: true } } }), nhlRow(2, 'CGY', 'EDM', { status: 'called', extra: { result: { text: 'MISS', hot: false }, miss: true } }), nhlRow(3, 'EDM', 'CGY', { extra: { result: { text: 'VOID', hot: false }, miss: true } }), nhlRow(4, 'CGY', 'EDM')],
}
export const NBA = {
  player: nbaPlayer(),
  hit: gradedFor(nbaPlayer(), true, 'HIT', 31, 'PTS'),
  miss: gradedFor(nbaPlayer({ name: 'Test Guard Two' }), false, 'MISS', 18, 'PTS'),
  void: gradedFor(nbaPlayer({ name: 'Test Guard Three' }), null, 'VOID'),
  off: nbaPlayer({ name: 'Test Guard Four', status: 'off', score: null, rank: null, rankOf: null, tiles: [{ label: 'PTS / G', value: '2.1' }, { label: 'REB / G', value: '1.0' }, { label: 'AST / G', value: '0.4' }, { label: 'MIN / G', value: '6.0' }] }),
  rows: [nbaRow(1, 'BOS', 'NY', { status: 'called' }), nbaRow(2, 'LAL', 'GS', { status: 'called' }), nbaRow(3, 'MIA', 'CHI'), nbaRow(4, 'DEN', 'PHX'), nbaRow(5, 'DAL', 'HOU'), nbaRow(6, 'MIL', 'ATL'), nbaRow(7, 'SA', 'OKC'), nbaRow(8, 'PHI', 'TOR'), nbaRow(9, 'MIN', 'UTAH')],
  gameRows: [nbaRow(1, 'BOS', 'NY', { status: 'called', extra: { result: { text: '31 PTS', hot: true } } }), nbaRow(2, 'NY', 'BOS', { status: 'called', extra: { result: { text: 'MISS', hot: false }, miss: true } }), nbaRow(3, 'BOS', 'NY', { extra: { result: { text: 'VOID', hot: false }, miss: true } }), nbaRow(4, 'NY', 'BOS')],
}
