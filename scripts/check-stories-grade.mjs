// lib/stories/grade.js rules on TEST lines (made up, labelled), plus NFL's
// productive bars against week 3's real graded lines.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-stories-grade.mjs [--offline]
import { gradeStory, baseBars } from '../lib/stories/grade.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const S = (sport, type, numbers = {}, player_id = 'TEST1') => ({ sport, type, numbers, player_id })
const g = (s, l) => JSON.stringify(gradeStory(s, l))

check(g(S('mlb', 'b2b'), { h: 1, hr: 1 }) === '{"bar":"hr","outcome":"hit","outcome_strong":"miss"}', 'MLB b2b: a homer is a hit, one homer is not the strong bar')
check(gradeStory(S('mlb', 'b2b'), null).outcome === 'void', 'no line (did not play) -> void, never a miss')
check(gradeStory(S('mlb', 'duel', { own: false }), { h: 2, hr: 0 }).bar === 'hit' && gradeStory(S('mlb', 'duel', { own: false }), { h: 2, hr: 0 }).outcome_strong === 'hit', 'MLB never-solved duel: graded on hits, 2 hits = strong')
check(gradeStory(S('mlb', 'milestone', { need: 2, word: 'hits this season' }), { h: 2 }).outcome === 'hit', 'MLB milestone 2 hits away, 2 hits -> reached')
check(gradeStory(S('mlb', 'milestone', { need: 1, word: 'career homers' }), { hr: 0, h: 3 }).outcome === 'miss', 'MLB career-homer milestone, no homer -> miss (3 hits do not count)')
check(gradeStory(S('mlb', 'milestone', { need: 1, word: 'steals this season' }), { h: 1 }).bar === 'productive', 'MLB steals milestone: not on the line -> graded productive, and says so')
check(g(S('mlb', 'birthday'), { h: 1, hr: 0 }) === '{"bar":"productive","outcome":"hit","outcome_strong":"miss"}', 'MLB birthday: 1 hit = productive, not strong')
check(gradeStory(S('mlb', 'rivalry', {}, '_game'), { h: 1 }) === null, 'game-level story: not graded')
check(gradeStory(S('nhl', 'rest', {}, 'team:TOR'), { g: 1 }) === null, 'team-level story: not graded')
check(gradeStory(S('nfl', 'streak', { market: 'REC_YDS', bar: 40 }), { REC_YDS: 41 }).outcome === 'hit', 'NFL streak 40+ rec yds, 41 -> extended')
check(gradeStory(S('nfl', 'streak', { market: 'REC_YDS', bar: 40 }), { REC_YDS: 39 }).outcome === 'miss', 'NFL streak, 39 -> ended')
check(g(S('nfl', 'birthday'), { REC_YDS: 12 }) === '{"bar":"productive","outcome":"hit","outcome_strong":"miss"}', 'NFL productive: 12 scrimmage yds clears 10, not 50')
check(gradeStory(S('nhl', 'hot'), { g: 0, a: 2, pts: 2 }).outcome === 'miss', 'NHL hot stick: two assists, no goal -> miss on its own bar')
check(gradeStory(S('nhl', 'multi'), { g: 2, pts: 2 }).outcome_strong === 'hit', 'NHL 2+ Club: two goals = strong')
check(baseBars('mlb').map(([k]) => k).join(',') === 'productive,productive_strong,hr,hr_strong,hit,hit_strong', 'MLB base bars kept per night')

if (!process.argv.includes('--offline')) {
  const { nflResultsPaths, fetchNfl } = await import('../lib/nfl/dataSource.js')
  const j = await fetchNfl(nflResultsPaths().filter((p) => p.startsWith('http')))
  const skill = Object.values(j?.lines || {}).filter((l) => l.REC_YDS != null || l.RUSH_YDS != null || l.TD != null)
  const sc = (l) => (Number(l.REC_YDS) || 0) + (Number(l.RUSH_YDS) || 0)
  const c = (f) => skill.filter(f).length
  console.log(`   NFL week ${j?.week} graded lines, ${skill.length} skill players: TD ${c((l) => l.TD >= 1)} · TD or 10+ yds ${c((l) => l.TD >= 1 || sc(l) >= 10)} · TD or 50+ yds ${c((l) => l.TD >= 1 || sc(l) >= 50)}`)
  check(skill.length > 0 && c((l) => l.TD >= 1 || sc(l) >= 50) < c((l) => l.TD >= 1 || sc(l) >= 10), 'the strong NFL bar is strictly harder than the base bar on real lines')
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
