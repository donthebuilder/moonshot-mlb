// TEST ROWS for the special cards (pure data; every name says "Test"; no number here is a real event). Used by scripts/check-special-cards.mjs
// (unit tests of every moment rule) and scripts/render-special-cards.mjs (a card for a moment with no real example, which prints TEST DATA).
import { nhlGameLines, mlbGameLines, nflGameLines } from './moments'

const feed = (o = {}) => ({
  game_id: 1, player_id: 11, goal_n: 1, day: '2026-01-02', season: 20252026, period: 2, period_type: 'REG', time_in_period: '11:41', strength: 'pp', empty_net: false,
  team: 'TST', opp: 'EXA', name: 'Test Skater', season_goals: 12, assists: [{ id: 21, name: 'T. Helper', assistsToDate: 5 }, { id: 22, name: 'T. Passer', assistsToDate: 3 }],
  score_after: 'EXA 1 · TST 2', status: 'called', rank_in_game: 1, overturned_at: null, ...o,
})
export const TEST_GOAL = feed()
export const TEST_GOAL_NOCALL = feed({ status: 'off', strength: 'ev', name: 'Test Skater With A Very Long Surname Hyphenated', assists: [], season_goals: 3 })
export const TEST_GOAL_OT = feed({ period: 4, period_type: 'OT', time_in_period: '02:10', strength: 'ev', status: 'board' })
export const TEST_MILESTONE = feed({ season_goals: 50, status: 'called' })
const hatRows = [
  feed({ goal_n: 1, period: 1, time_in_period: '03:12', strength: 'ev', score_after: 'EXA 0 · TST 1', season_goals: 10, assists: [{ id: 21, name: 'T. Helper', assistsToDate: 5 }] }),
  feed({ goal_n: 2, period: 2, time_in_period: '11:41', strength: 'pp', score_after: 'EXA 1 · TST 2', season_goals: 11 }),
  feed({ goal_n: 3, period: 3, time_in_period: '18:55', strength: 'ev', empty_net: true, score_after: 'EXA 1 · TST 3', season_goals: 12, assists: [] }),
]
export const TEST_HAT_ROWS = hatRows
export const TEST_HAT = nhlGameLines(hatRows).get('1:11')
const ptRows = [
  feed({ player_id: 31, name: 'Test Playmaker', goal_n: 1, period: 1, time_in_period: '05:00', score_after: 'EXA 0 · TST 1', assists: [{ id: 11, name: 'T. Skater', assistsToDate: 4 }, { id: 22, name: 'T. Passer', assistsToDate: 3 }] }),
  feed({ player_id: 32, name: 'Test Winger', goal_n: 1, period: 2, time_in_period: '09:10', score_after: 'EXA 0 · TST 2', assists: [{ id: 11, name: 'T. Skater', assistsToDate: 5 }] }),
  feed({ player_id: 11, name: 'Test Skater', goal_n: 1, period: 3, time_in_period: '12:30', score_after: 'EXA 1 · TST 3', assists: [{ id: 22, name: 'T. Passer', assistsToDate: 4 }] }),
]
export const TEST_POINTS = nhlGameLines(ptRows).get('1:11')

const hr = (n, inning, o = {}) => ({ day: '2026-01-02', player_id: '900', hr_n: n, name: 'Test Slugger', team: 'TST', opponent: 'EXA', game_pk: '700', inning, home: true, role: 'TOP', on_board: true, board_rank: 2, stats: { board_of: 18 }, ...o })
export const TEST_MULTI_HR = mlbGameLines([hr(1, 'top 2nd'), hr(2, 'bot 5th'), hr(3, 'bot 8th')]).get('700:900')
export const TEST_MULTI_HR_2 = mlbGameLines([hr(1, 'top 2nd', { role: null, on_board: false, board_rank: 12 }), hr(2, 'bot 5th', { role: null, on_board: false, board_rank: 12 })]).get('700:900')

const td = (n, quarter, clock, kind, yards, o = {}) => ({ day: '2026-01-02', game_id: '800', td_n: n, team: 'TST', opponent: 'EXA', quarter, clock, kind, kind_word: kind === 'pass' ? 'PASS TD' : 'RUSH TD', yards, passer_name: kind === 'pass' ? 'Test Quarterback' : null, scorer_name: 'Test Runner', gsis_id: '00-TEST', on_bot: { market: 'td' }, td_board: { rank: 4, of: 200 }, ...o })
export const TEST_MULTI_TD = nflGameLines([td(1, 1, '5:26', 'pass', 51), td(2, 2, '8:46', 'rush', 2), td(3, 4, '1:12', 'rush', 17)]).get('800:00-TEST')
export const TEST_100 = { gsis_id: '00-TEST', name: 'Test Runner', team: 'TST', opp: 'EXA', season: 2026, week: 5, day: '2026-01-02', home: true, rush_yds: 151, rush_att: 25, rec_yds: 56, rec: 5, td: 2 }
export const TEST_200 = { ...TEST_100, rush_yds: 212, rush_att: 31 }
export const TEST_LONG_SHOT = { sport: 'nhl', player_id: '11', name: 'Test Skater', team: 'TST', opp: 'EXA', day: '2026-01-02', role: 'TOP', home: true, status: 'called', hit: true, market: 'anytime goal', best: 1520, books: 4 }

export { feed as testFeedRow }
