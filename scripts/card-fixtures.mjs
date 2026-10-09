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
