// POSTER FIXTURES (TEST data except CONTRERAS): the rows the 1200 x 675 posters are rendered from by scripts/check-poster-fit.mjs
// and scripts/render-poster-stress.mjs. Load through the proto loader:
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-poster-fit.mjs
//
// CONTRERAS is the posted example (Donovan's X screenshot, 2026-10-12): LAD @ MIL, the HRR pick at +780. Its numbers are read off the
// posted image; the one number the image cut off (the park's HR factor, after "American Family Field . +") is a labelled TEST value.
// Every other fixture says "Test" in the name, or is a real long NAME used only to stress the layout.
//
// STRESS = the worst case each poster can be handed: very long names, a long park, a 4-digit price, zero / NaN / undefined fields,
// six-digit numbers, and a missing headshot (no player id, so the poster draws the monogram).

const lazy = (path, name) => async (...a) => (await import(path))[name](...a)
export const H = () => import('../lib/dash/homerCard.js')
const goalCard = lazy('../lib/nhl/goalCard.js', 'goalCard')
const tdCard = lazy('../lib/nfl/tdCard.js', 'tdCard')
const spotlightCard = lazy('../lib/nfl/spotlightCard.js', 'spotlightCard')

export const LONG = 'Test Maximilian Featherstonehaugh-Villanueva'
const NAMES = ['Michael Brandsegg-Nygard', 'Jean-Gabriel Pageau', 'Yoshinobu Yamamoto', 'Dominic Fike']
const LONG_PARK = 'Estadio Alfredo Harp Helu Mexico City'
const site = { site: 'test.local' }
const day = '2026-10-12'

export const row = (o = {}) => ({
  name: 'Test Hitter', team: 'NYY', opponent: 'BOS', home: true, role: 'TOP', _roles: 'TOP', hr_score: 91, board_rank: 1, odds_over: 320, odds_book: 'TestBook', hr_n: 1,
  day: '2026-01-02', player_id: '682829',
  stats: { season_hr: 31, season_iso: 0.241, last5_hr: 2, last5_hits: 6, last5_xbh: 3, barrel: 0.14, hard_hit: 0.51, max_distance: 431, max_ev: 112, pitcher: 'Test Arm', pitcher_throws: 'R', pitcher_hr9: 1.62, pitcher_whip: 1.41, weak_side: 'LHB', bats: 'L', park_factor: 1.08, venue: 'Test Park' },
  hooks: ['🔁 TEST hook one: back-to-back nights', '🔥 TEST hook two: hot against this arm'], ...o,
})

/** The posted example, reconstructed from the image (see the header). */
export const CONTRERAS = () => row({
  name: 'William Contreras', team: 'MIL', opponent: 'LAD', home: true, role: 'HRR', _roles: 'HRR', hr_score: 36, board_rank: 12, odds_over: 780, odds_book: 'draftkings', hr_n: 1,
  day, player_id: '661388',
  stats: { postseason: true, post_nth: 3, season_hr: 18, season_iso: 0.147, last5_hr: 0, last5_hits: 4, last5_xbh: 0, barrel: 0.08, hard_hit: 0.6, max_distance: 406, max_ev: 109, pitcher: 'Yoshinobu Yamamoto', pitcher_throws: '—', pitcher_hr9: 0.97, pitcher_whip: 0.87, park_factor: 1.06 /* TEST value: the image cut this off after '+' */, venue: 'American Family Field' },
  hooks: ["Max Muncy (ATH): 7x same-day (3.2%) · not on tonight's slate", 'MOONSHOT Shape Score — pitch-mix fit: 84/100', 'MOONSHOT had him for 3 of his last 6 homers'],
})

const pick = (o = {}) => ({ name: 'Test Hitter', team: 'NYY', opponent: 'BOS', player_id: '682829', role: 'TOP', hr_score: 88, over: 650, book: 'TestBook', pitcher: 'Test Arm', pitcherTeam: 'BOS', pitcherHr9: 1.74, blastPct: 21, barrelPct: 17, hardHitPct: 52, ...o })
const hs = (o = {}) => ({ name: 'Test Hitter', team: 'NYY', player_id: '682829', ops: '1.012', avg: '.351', obp: '.420', slg: '.592', hr: 7, rbi: 19, games: 15, ab: 57, pitcher: 'Test Arm', season: { games: 140, avg: '.272', obp: '.341', slg: '.488', ops: '.829' }, ...o })
const goal = (o = {}) => ({ name: 'Test Skater', team: 'EDM', opp: 'TOR', status: 'called', season: '20252026', player_id: '8478402', season_goals: 40, period: 2, time_in_period: '12:44', strength: 'pp', score_after: 'EDM 3 - TOR 2', assists: [{ name: 'Test Helper' }, { name: 'Test Passer' }], lamp_score: 91, rank_in_game: 1, day: '2026-01-02', ...o })
const td = (o = {}) => ({
  scorerName: 'Test Receiver', team: 'BUF', opponent: 'MIA', position: 'WR', jersey: 14, gsisId: '00-0023459', day: '2026-01-02', kindWord: 'Passing TD',
  awayScore: 17, homeScore: 21, quarter: 3, clock: '4:12', parsed: { yards: 38, passer: 'Test Passer', kind: 'pass' },
  onBot: { score: 87, rank: 2, market: 'TD', grade: 'A' }, tdBoard: { rank: 2, of: 120 },
  seasonToDate: { td: 8, games: 9, last3Games: 3, last3Td: 4 },
  defense: { tag: 'TARGET', detail: 'MIA allows 1.8 TD / game to WR1', role: 'WR1' }, ...o,
})
const spot = (o = {}) => ({ name: 'Test Quarterback', team: 'BUF', player_id: '00-0023459', jersey: 17, position: 'QB', opp: 'MIA', seasonTd: 31, patd: 3, rutd: 2, rectd: 0, payd: 312, ruyd: 64, rec: 0, recyd: 0, avg: { td: 2.4, xtd: 2.1, payd: 245.5, ruyd: 31.2, rz: 4.0 }, ...o })

const bigStats = {
  postseason: true, post_nth: 123456, season_hr: 123456, season_iso: 0.147, last5_hr: 12, last5_hits: 15, last5_xbh: 11, barrel: 0.123, hard_hit: 0.987,
  max_distance: 999999, max_ev: 123456, pitcher: 'Michael Brandsegg-Nygard', pitcher_throws: 'R', pitcher_hr9: 12.34, pitcher_whip: 3.21, weak_side: 'LHB', bats: 'L',
  park_factor: 1.14, venue: LONG_PARK,
}
const jersey = (n, t, o = {}) => ({ name: n, team: t, opponent: 'BOS', jersey: 22, role: 'HR', nth: 1, player_id: n, ...o })

/** name -> () => Promise<Response|bytes>. `contreras` is the posted example; every other key is a stress case. */
export const FX = {
  contreras: async () => (await H()).homerCard(CONTRERAS(), site),
  'homer-called-longname': async () => (await H()).homerCard(row({ name: LONG, odds_over: 1550, role: 'HRR', _roles: 'HRR' }), site),
  'homer-called-bigstats': async () => (await H()).homerCard(row({ name: NAMES[0], role: 'HR/CONTACT', _roles: 'HR/CONTACT', hr_score: 123456, board_rank: 123456, odds_over: 1550, hr_n: 2, stats: bigStats }), site),
  'homer-board-nan': async () => (await H()).homerCard(row({ name: NAMES[1], role: 'TOP15', _roles: 'TOP15', hr_score: NaN, board_rank: undefined, odds_over: NaN, odds_book: undefined, stats: { season_hr: 0, barrel: 0, hard_hit: NaN, pitcher: undefined, venue: undefined, park_factor: 0 } }), site),
  'homer-off-nofaces': async () => (await H()).homerCard(row({ name: NAMES[2], player_id: '', role: '', _roles: '', board_rank: 41, hr_score: 0, odds_over: 0, hooks: [], stats: { season_hr: 1, pitcher: NAMES[0], pitcher_hr9: 0, venue: LONG_PARK, park_factor: 0.9 } }), site),
  'homer-hooks-long': async () => (await H()).homerCard(row({ name: NAMES[3], hooks: ['TEST hook one that is far too long to fit on one line of a poster at the type floor, with more words after it', 'TEST hook two that is also far too long to fit on one line of a poster at the type floor', 'TEST hook three'] }), site),
  mlbhr: async () => (await H()).mlbhrCard(row({ name: LONG }), { kind: 'solo', distance: 431, seasonHr: 31 }, { ...site, boardSize: 36, postedAt: '2026-01-02T22:05:00Z' }),
  'mlbhr-big': async () => (await H()).mlbhrCard(row({ name: NAMES[0], hr_score: 123456, board_rank: 123456, stats: { pitcher: 'Michael Brandsegg-Nygard' }, opponent: 'LAD' }), { kind: 'grand slam', distance: 999999, seasonHr: 123456 }, { ...site, boardSize: 123456, postedAt: '2026-01-02T22:05:00Z' }),
  'hotstretch': async () => (await H()).hotStretchCard(day, hs({ name: LONG, pitcher: 'Michael Brandsegg-Nygard' }), { ...site, window: 'month', windowLabel: 'LAST 15 GAMES' }),
  'hotstretch-nan': async () => (await H()).hotStretchCard(day, hs({ name: NAMES[1], player_id: '', avg: undefined, obp: null, hr: 0, rbi: 123456, ops: '10.123', games: NaN, ab: undefined, season: null }), { ...site, window: 'week' }),
  longshot: async () => (await H()).longshotCard(day, pick({ name: LONG, role: 'HR', over: 1550, pitcher: 'Michael Brandsegg-Nygard', pitcherTeam: 'MIL', opponent: 'LAD' }), site),
  'longshot-nan': async () => (await H()).longshotCard(day, pick({ name: NAMES[1], player_id: '', over: NaN, book: undefined, hr_score: 123456, blastPct: 100, pitcher: undefined, pitcherHr9: 0 }), site),
  'numerology-jersey': async () => (await H()).numerologyCard(day, { tier: 'jersey', jersey: 22, players: [jersey(LONG, 'NYY'), jersey(NAMES[0], 'LAD', { role: null }), jersey(NAMES[1], 'ATL', { role: 'HRR' }), jersey(NAMES[2], 'SEA', { opponent: 'HOU' }), jersey(NAMES[3], 'CHC', { nth: 123456 }), jersey('Test Six', 'BOS')] }, site),
  'numerology-gematria': async () => (await H()).numerologyCard(day, { tier: 'gematria', players: [{ name: LONG, team: 'NYY', opponent: 'BOS', gem: { dateText: 'October 12, 2026', value: 123456 }, player_id: 'a' }, { name: NAMES[0], team: 'LAD', opponent: 'SF', gem: { dateText: 'October 12, 2026', value: 123456 }, player_id: 'b' }] }, site),
  'numerology-trifecta': async () => (await H()).numerologyCard(day, { tier: 'trifecta', root: 7, players: [jersey(NAMES[2], 'NYY', { jersey: 16, role: 'HRR' }), jersey(NAMES[3], 'LAD', { jersey: 25, role: null, nth: 16 })] }, site),
  pairs: async () => (await H()).pairsCard(day, [
    { count: 123456, rate: 100, sameGame: 123456, a: { name: LONG, team: 'NYY', opponent: 'BOS', player_id: 'a', blastPct: 19, pitcher: 'Michael Brandsegg-Nygard', pitcherTeam: 'BOS', over: 1550, book: 'TestBookWithLongName', hr_score: 123456 }, b: { name: NAMES[1], team: 'NYY', opponent: 'BOS', player_id: 'b', pitcher: 'Test Arm', pitcherTeam: 'BOS', over: NaN, book: undefined, hr_score: 0 } },
    { count: 6, a: { name: LONG, player_id: 'c' }, b: { name: LONG, player_id: 'd' } },
  ], site),
  stat: async () => (await H()).statCard(day, { pill: 'TEST PILL THAT IS LONG', label: 'TEST STAT LABEL THAT RUNS LONG', headline: 'Test headline that says something moderately long about the night and keeps going well past the width of the poster at any size', lines: ['Test line one that is long enough to need a wrap at the floor size because it just keeps going and going past the edge', 'Test line two', 'Test line three', 'Test line four', 'Test line five'] }, site),
  pregame: async () => (await H()).pregameCard(day, Array.from({ length: 10 }, (_, i) => ({ name: [LONG, ...NAMES][i % 5] || `Test Hitter ${i}`, team: ['NYY', 'LAD', 'ATL', 'SEA'][i % 4], opponent: 'BOS', pitcher: 'Michael Brandsegg-Nygard', hr_score: i === 1 ? 123456 : 90 - i, odds_over: i < 4 ? 1550 : i === 5 ? NaN : null, odds_book: i === 2 ? 'TestBookWithLongName' : 'TestBook', pitcher_l3_hr9: i === 6 ? NaN : 1.3 + i / 10, player_id: String(i) })), site),
  recap: async () => (await H()).recapCard(day, [row({ name: LONG }), row({ name: NAMES[0], role: 'HR', _roles: 'HR', board_rank: 2 }), row({ name: NAMES[1], role: 'HRR', _roles: 'HRR', board_rank: 3 }), row({ name: NAMES[2], role: 'HIT', _roles: 'HIT', board_rank: 4 }), row({ name: NAMES[3], role: 'CONTACT', _roles: 'CONTACT', board_rank: 5 }), row({ name: 'Test Three', role: 'WATCH', _roles: 'WATCH', board_rank: 12 }), row({ name: 'Test Four', role: '', _roles: '', board_rank: 80 })], [row({ day: '2026-10-11' }), row({ day: '2026-10-11', role: '' }), row({ day: '2026-10-10' })], site),
  'goal-called': async () => goalCard(goal({ name: NAMES[0] }), site),
  'goal-long': async () => goalCard(goal({ name: LONG, opp: 'TOR', season_goals: 123456, lamp_score: 123456, rank_in_game: 123456, time_in_period: '19:59', score_after: 'EDM 123456 - TOR 123456', assists: [{ name: 'Test Assistant With A Long Name' }, { name: 'Jean-Gabriel Pageau' }, { name: 'Michael Brandsegg-Nygard' }] }), site),
  'goal-board-nan': async () => goalCard(goal({ name: NAMES[1], status: 'board', rank_in_game: NaN, strength: undefined, season_goals: 0, lamp_score: NaN, player_id: '', assists: [], score_after: null, time_in_period: null }), site),
  'goal-off': async () => goalCard(goal({ status: 'off', lamp_score: null, rank_in_game: null, assists: [], season_goals: null }), site),
  'td-called': async () => tdCard(td({ scorerName: NAMES[0] }), site),
  'td-long': async () => tdCard(td({ scorerName: LONG, kindWord: 'Interception return touchdown', jersey: 123456, awayScore: 123, homeScore: 456, parsed: { yards: 99, passer: 'Michael Brandsegg-Nygard', kind: 'pass' }, seasonToDate: { td: 123456, games: 9, last3Games: 3, last3Td: 123456 }, defense: { tag: 'AVOID', detail: 'Estadio Alfredo Harp Helu allows 12.3 TD / game to WR1 and some', role: 'WR1' }, onBot: { score: 123456, rank: 2, market: 'TD', grade: 'A+' } }), site),
  'td-board-nan': async () => tdCard(td({ scorerName: NAMES[1], gsisId: '', onBot: null, tdBoard: { rank: NaN, of: undefined }, parsed: null, awayScore: undefined, seasonToDate: null, defense: null, quarter: undefined }), site),
  'td-off': async () => tdCard(td({ onBot: null, tdBoard: null, defense: null, seasonToDate: null }), site),
  spotlight: async () => spotlightCard(spot({ name: NAMES[0] }), { ...site, windowLabel: 'WEEK 5', statement: 'Five total touchdowns on Thursday night', context: 'THE BIGGEST NIGHT OF THE WEEK' }),
  'spotlight-long': async () => spotlightCard(spot({ name: LONG, payd: 123456, ruyd: 123456, rec: 123456, recyd: 123456, patd: 12, seasonTd: 123456, jersey: 123456, player_id: '', avg: { td: 123.4, xtd: 2.1, payd: 245.5, ruyd: 31.2, rz: 4.0 } }), { ...site, windowLabel: 'WEEK 5 OF THE REGULAR SEASON', statement: 'Five total touchdowns on Thursday night, a long claim line for the test that keeps going', context: 'THE BIGGEST NIGHT OF THE WEEK, A VERY LONG CONTEXT LINE THAT KEEPS GOING PAST THE EDGE' }),
}
