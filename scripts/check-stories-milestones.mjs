// lib/stories/milestones.js + the milestone bars in lib/stories/grade.js (2026-10-20).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-stories-milestones.mjs
// Pure, offline. TEST DATA ONLY: the totals below are made up to land on the rungs; nothing here is shown anywhere.
import { nearestMilestones, milestoneStory, MILES } from '../lib/stories/milestones.js'
import { gradeStory } from '../lib/stories/grade.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const base = (sport, p) => ({ sport, day: '2026-10-20', game_id: 'g1', player_id: p.id, name: p.name, team: p.team })

// One story per player, his nearest rung (TEST players)
const nhl = nearestMilestones('nhl', [
  { p: { id: 't1', name: 'Test Skater A', team: 'AAA' }, season: { goals: 19, points: 40 }, career: { goals: 299, assists: 150, points: 449, gamesPlayed: 700 } },
  { p: { id: 't2', name: 'Test Skater B', team: 'BBB' }, season: { goals: 1, points: 2 }, career: { goals: 50, assists: 90, points: 140, gamesPlayed: 999 } },
  { p: { id: 't3', name: 'Test Skater C', team: 'CCC' }, season: { goals: 1, points: 2 }, career: { goals: 50, assists: 90, points: 140, gamesPlayed: 300 } },
])
check(nhl.length === 2 && new Set(nhl.map((x) => x.p.id)).size === 2, `NHL: one row per player, nobody out of reach (${nhl.map((x) => `${x.p.id}:${x.m.word}`).join(', ')})`)
check(nhl[0].p.id === 't2' && nhl[0].m.games, 'NHL: game 1,000 sorts first')
const s2 = milestoneStory(base('nhl', nhl[0].p), nhl[0], 'test')
check(/plays game 1,000 of his career tonight/.test(s2.text) && s2.rarity === 0.8, `NHL games rung words + rarity: "${s2.text}"`)
const s1 = milestoneStory(base('nhl', nhl[1].p), nhl[1], 'test')
check(s1.numbers.need === 1 && /— could land tonight$/.test(s1.text), `NHL one away: "${s1.text}"`)

// Grading: he reached it on his own line
check(gradeStory(s1, { g: 1, a: 0, pts: 1, sog: 3, gp: 1 })?.outcome === 'hit', 'NHL goal rung: a goal reaches it')
check(gradeStory(s2, { g: 0, a: 0, pts: 0, sog: 0, gp: 1 })?.outcome === 'hit', 'NHL game 1,000: any line reaches it')
check(gradeStory(s2, null)?.outcome === 'void', 'NHL game 1,000: no line = void, never a miss')

// NFL: a rung the line does not carry grades PRODUCTIVE; yards grade on the line; 'this week'
const nfl = nearestMilestones('nfl', [{ p: { player_id: 'n1', name: 'Test QB', team: 'AAA' }, season: { pass_yds: 900, pass_td: 5 }, career: { pass_td: 199, pass_yds: 20000, total_td: 3, rec: 0, rec_yds: 0, rush_yds: 300 } }])
const sq = milestoneStory({ sport: 'nfl', day: '2026-10-20', game_id: 'g', player_id: 'n1', name: 'Test QB', team: 'AAA' }, nfl[0], 'test', 'this week')
check(nfl[0].m.key === 'pass_td' && gradeStory(sq, { PASS_YDS: 250, TD: 0, RUSH_YDS: 5 })?.bar === 'productive', 'NFL passing TDs: not on the line -> productive')
check(/could land this week$/.test(sq.text), `NFL words: "${sq.text}"`)
const ny = nearestMilestones('nfl', [{ p: { player_id: 'n2', name: 'Test RB', team: 'AAA' }, season: { rush_yds: 300 }, career: { rush_yds: 4950 } }])
const sy = milestoneStory({ sport: 'nfl', day: 'd', game_id: 'g', player_id: 'n2', name: 'Test RB', team: 'AAA' }, ny[0], 'test', 'this week')
check(gradeStory(sy, { RUSH_YDS: 50 })?.outcome === 'hit' && gradeStory(sy, { RUSH_YDS: 49 })?.outcome === 'miss', 'NFL rushing yards: 50 needed, 50 reaches it, 49 does not')

// NBA: points and threes on the ESPN line
const nb = nearestMilestones('nba', [{ p: { playerId: 'b1', name: 'Test Guard', team: 'AAA' }, career: { gp: 600, pts: 9990, reb: 2000, ast: 1500, tpm: 450 } }])
const sb = milestoneStory({ sport: 'nba', day: 'd', game_id: 'g', player_id: 'b1', name: 'Test Guard', team: 'AAA' }, nb[0], 'test')
check(nb[0].m.key === 'pts' && gradeStory(sb, { pts: 10, reb: 0, ast: 0, tpm: 0, gp: 1 })?.outcome === 'hit', `NBA points: "${sb.text}"`)

// Every rung list has a word, a window and either a line field or an explicit null
for (const [sport, list] of Object.entries(MILES)) check(list.every((m) => m.word && m.within > 0 && m.targets.length && (m.bar === null || typeof m.bar === 'string')), `${sport}: every rung is complete`)

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
