// POST LAYOUT GUARD (Donovan 2026-10-16: X and Discord text posts went out as solid stacks of lines).
// Renders every plain-text post builder with TEST data only (every name says TEST) and asserts one layout:
//   * the first line is the label / headline (never blank)
//   * no leading or trailing blank line, no doubled blank line, no trailing space
//   * no solid stack of more than 4 consecutive non-blank lines, EXCEPT a ranked list of rows, which may be up to 8
//     (each builder says which it is: `list: true`). A list is rows of one kind (names, results), never prose.
//   * the length stays inside the builder's own limit (280 for X, X's weighted count; 1900 for a Discord message; the
//     builder's own larger limit where it has one)
//   * a post with more than two lines has a blank line right after its label line (`label: false` only for a one-sentence post)
// It does NOT cover: embeds (buildCard), push copy (lib/copy/notifications.js) or the live CALLED IT posts
// (lib/dash/homerFeed.js postText, lib/nfl/tdFeed.js tdPostText, lib/nhl/goalFeed.js postText), which keep their layout.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-post-layout.mjs
import { xLen } from '../lib/posts/slate.js'
import { renderSlate } from '../lib/posts/slate.js'
import { renderLampSlate } from '../lib/posts/lampSlate.js'
import { renderReceipt, renderPeriod } from '../lib/posts/receipt.js'
import { templateDrafts } from '../lib/facts/write.js'
import { listFacts } from '../lib/facts/players.js'
import { decorate } from '../lib/facts/label.js'
import { listText } from '../lib/lists/shape.js'
import { digestTexts } from '../lib/cards/digestRank.js'
import { nhlRecap } from '../lib/posts/recapPost.js'
import { playsText } from '../lib/posts/sportPlans.js'
import { longshotsText } from '../lib/dash/longshotsPost.js'
import { multiClubText } from '../lib/dash/multiClubPost.js'
import { mlbMembersGrade } from '../lib/dash/membersPost.js'
import { storyResultText } from '../lib/dash/storyThread.js'
import { buildReveal, buildPickOne } from '../lib/dash/polls/build.js'
import { renderWriteup } from '../lib/writeups/text.js'
import { totalsPostText } from '../lib/totals/core.js'
import { briefingText } from '../lib/card/briefing.js'
import { historyWatchText } from '../lib/history/watch.js'
import { splitsPostText } from '../lib/mlb/splitsPost.js'
import { roundupText } from '../lib/dash/membersFolds.js'
import { pregameText, longshotText, communityPickText, botPollText, moonshotBoardText } from '../lib/dash/homerFeed.js'
import { xText as postseasonXText } from '../lib/posts/postseasonCard.js'
import {
  xCardText, nManXText, todayText, longShotText, longShotResultText, resultText, doubleResultText, nManResultText, donStraightXText, membersCardText, dayText,
} from '../lib/card/text.js'
import {
  hottestContactText, dangerComboText, backToBackText, funFactsText, theFourText, bestAirText, storylinesText, callOfTheNightText, matchupLinesText,
  streaksText, hrVsStarterText, careerVsStarterText, milestoneText, revengeGiveawayText, hotStretchText, anglesText, hotSheetText, hrLeadersByDowText, storylineWatchText,
} from '../lib/dash/tweetFeed.js'
import {
  milestoneText as nflMilestoneText, opportunityText, tdHistoryText, whyOnBoardText, bigWeekText, spotlightText, nflBoardText, nflBotPollText, nflCommunityPickText,
  nflBoardResultsText, tdCallNeighborsText,
} from '../lib/nfl/tweetFeed.js'

let bad = 0
const fail = (m) => { bad += 1; console.log('ERROR ' + m) }
const seen = []
const show = process.argv.includes('--show')

/**
 * check(name, text, { list, limit, label })
 *   list  true = a ranked list of rows (run of up to 8 allowed); false = prose blocks (run of up to 4)
 *   limit the builder's own limit, counted the way it counts (xLen = X's weighted count)
 */
function check(name, text, { list = false, limit = 280, count = xLen, label = true } = {}) {
  seen.push(name)
  if (!text || typeof text !== 'string') return fail(`${name}: builder returned no text (test data should render)`)
  if (show) console.log(`--- ${name}\n${text}\n`)
  const why = []
  const lines = text.split('\n')
  if (lines[0].trim() === '') why.push('leading blank line')
  if (lines[lines.length - 1].trim() === '') why.push('trailing blank line')
  if (/\n[ \t]*\n[ \t]*\n/.test(text)) why.push('doubled blank line')
  if (lines.some((l) => /[ \t]$/.test(l))) why.push('trailing space')
  let run = 0, worst = 0
  for (const l of lines) { run = l.trim() === '' ? 0 : run + 1; worst = Math.max(worst, run) }
  const cap = list ? 8 : 4
  if (worst > cap) why.push(`${worst} lines stacked solid (max ${cap}${list ? ', ranked list' : ''})`)
  if (label && lines.length > 2 && lines[1] !== '') why.push('no blank line after the label line')
  if (count(text) > limit) why.push(`${count(text)} > ${limit}`)
  if (why.length) fail(`${name}: ${why.join('; ')}  ${JSON.stringify(text.slice(0, 90))}`)
}
const safe = (name, fn) => { try { fn() } catch (e) { fail(`${name} threw ${e && e.message}`) } }

// ── Slate / LAMP slate / Receipt (X, 280)
const cand = (sport, i) => ({ sport, id: `t${sport}${i}`, name: `TEST Player ${sport.toUpperCase()}${i}`, teamName: 'TEST Club', rank: i, of: 20, proof: '#1 of 20 tonight' })
safe('slate', () => check('slate', renderSlate({ day: '2026-10-09', cotn: cand('mlb', 1), lines: [cand('nfl', 2), cand('nhl', 3)], activeSports: ['mlb', 'nfl', 'nhl'] }).text, { list: true }))
safe('lampSlate', () => {
  const picks = [1, 2, 3, 4, 5].map((i) => ({ name: `TEST Skater ${i}`, team: 'TST', opp: 'OPP', fact: 'shots 99th' }))
  check('lampSlate', renderLampSlate({ day: '2026-10-09', picks, calledCount: 9, allIn: false }).text, { list: true })
})
safe('receipt', () => {
  const graded = [
    { sport: 'mlb', id: 'a', name: 'TEST Hitter A', market: 'home run', outcome: 'cashed' }, { sport: 'mlb', id: 'a2', name: 'TEST Hitter A2', market: 'home run', outcome: 'cashed' },
    { sport: 'nhl', id: 'b', name: 'TEST Skater B', market: 'goal', outcome: 'missed' }, { sport: 'nhl', id: 'b2', name: 'TEST Skater B2', market: 'goal', outcome: 'cashed' },
  ]
  check('receipt', renderReceipt({ day: '2026-10-09', graded }).text, { list: true })
  check('receipt (2 rows)', renderReceipt({ day: '2026-10-09', graded: graded.slice(0, 2) }).text, { list: true })
})
safe('receipt period', () => {
  const c = { cashed: 5, missed: 3, void: 1 }
  const totals = { total: c, bySport: { mlb: { cashed: 3, missed: 1, void: 0 }, nhl: { cashed: 2, missed: 2, void: 1 } }, nights: 6 }
  check('receipt weekly', renderPeriod({ kind: 'weekly', from: '2026-10-05', to: '2026-10-11', totals }), { list: true })
  check('receipt monthly', renderPeriod({ kind: 'monthly', from: '2026-09-01', to: '2026-09-30', totals }), { list: true })
})

// ── Fact posts (every family), through the template + compose
const FACTS = [
  { family: 'p_streak', sport: 'mlb', player: 'TEST Hitter', team: 'TST', what: 'a home run', n: 4, rank: 3, opp: 'OPP', when: '7:05 PM ET', market: 'home run' },
  { family: 'p_form', sport: 'nhl', player: 'TEST Skater', team: 'TST', bar: 'shots 3+', cleared: 8, of: 10, rank: 5, opp: 'OPP', when: '7:05 PM ET' },
  { family: 'p_birthday', sport: 'nfl', player: 'TEST Receiver', team: 'TST', age: 27, born: 'Oct 16, 1999', opp: 'at OPP', when: 'Sun 1:00 PM ET' },
  { family: 'p_vs_team', sport: 'nfl', player: 'TEST Runner', team: 'TST', tds: 3, meetings: 4, opp: 'OPP', since: 2019, when: 'Sun 1:00 PM ET' },
  { family: 'p_milestone', sport: 'nfl', player: 'TEST Back', team: 'TST', have: 990, games: 6, perGame: 165, gap: 10, next: 1000, stat: 'rushing yards', opp: 'OPP', when: 'Sun 1:00 PM ET' },
  { family: 'p_vs_starter', sport: 'mlb', player: 'TEST Hitter', team: 'TST', pitcher: 'TEST Starter', pitcherTeam: 'OPP', ab: 12, hits: 6, hr: 2, avg: '.500', rank: 9, opp: 'OPP', when: '7:05 PM ET' },
  { family: 'both_unbeaten', sport: 'nfl', week: 5, teams: [{ name: 'TestA', record: '4-0' }, { name: 'TestB', record: '4-0' }], prior: 0, since: 1999, last: { winner: 'TestA', winnerPts: 20, loser: 'TestB', loserPts: 10, date: 'Jan 4', tie: false } },
  { family: 'both_winless', sport: 'nfl', week: 5, teams: [{ name: 'TestA', record: '0-4' }, { name: 'TestB', record: '0-4' }], prior: 0, since: 1999 },
  { family: 'team_start_unbeaten', sport: 'nfl', teams: [{ name: 'TestA', record: '4-0' }], running: 2, since: 1999, seasons: [2019, 2020, 2021] },
  { family: 'team_start_winless', sport: 'nfl', teams: [{ name: 'TestA', record: '0-4' }], running: 0, since: 1999, seasons: [2019, 2020] },
  { family: 'themed_week', sport: 'nfl', theme: 'cats', members: 8, prior: 0, since: 1999, count: 4, games: [1, 2, 3, 4].map((i) => ({ away: `TestA${i}`, home: `TestB${i}` })) },
  { family: 'themed_week', sport: 'nfl', theme: 'birds', members: 8, prior: 0, since: 1999, count: 3, games: [1, 2, 3].map((i) => ({ away: `TestA${i}`, home: `TestB${i}` })) },
  { family: 'win_streak', sport: 'mlb', teams: [{ name: 'TestA', record: '90-60' }], streak: 8, opp: 'vs TestB', when: '7:05 PM ET' },
  { family: 'unbeaten_start', sport: 'nhl', teams: [{ name: 'TestA', record: '4-0-0' }], opp: 'at TestB', when: '7:05 PM ET' },
  { family: 'bot_called', sport: 'mlb', player: 'TEST Hitter', brand: 'MOONSHOT', called: { g: 13, hrG: 8, hr: 10 }, not: { g: 5, hrG: 1 }, basis: 'Picks locked before each game', since: 'Apr 1' },
  { family: 'bot_blind_spot', sport: 'mlb', player: 'TEST Hitter', brand: 'MOONSHOT', not: { g: 9, hrG: 5, hr: 6 }, basis: 'Picks locked before each game', since: 'Apr 1' },
]
for (const f of FACTS) {
  safe(`fact ${f.family}`, () => {
    const d = decorate({ ...f, id: `test:${f.family}` })
    const drafts = templateDrafts(d)
    if (!drafts.length) return fail(`fact ${f.family}: no draft`)
    drafts.forEach((t, i) => {
      check(`fact ${f.family}${i ? `#${i}` : ''}${f.theme ? `/${f.theme}` : ''}`, t)
    })
  })
}

// ── THE LIST (2026-10-20, lib/facts/players.js listFacts, a fact post): a ranked list, rows together
safe('the list', () => {
  const players = [1, 2, 3, 4, 5].map((i) => ({ id: `T${i}`, name: `TEST Player ${i}`, team: 'TST', startMs: 0, rank: i, gameDay: '2026-10-21' }))
  const f = listFacts({ sport: 'nhl', players, streaks: players.map((p, i) => ({ id: p.id, what: 'a goal', whatKey: 'goal', n: 9 - i, min: 3 })), today: '2026-10-21' })[0]
  templateDrafts(f).slice(0, 2).forEach((t, i) => check(`the list #${i}`, t, { list: true, limit: 890 }))
})

// ── Lists (lib/lists/shape.js listText)
safe('lists', () => {
  const rows = (n, fact) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `TEST Name ${i}`, team: 'TST', fact: fact ? `${fact} ${i}` : null }))
  check('list ranked (facts)', listText({ title: 'TEST most home runs:', ranked: true, rows: rows(4, 'HR'), footnote: 'TEST footnote.' }), { list: true })
  check('list club (bare)', listText({ title: 'TEST players in the club:', rows: rows(6, null), footnote: 'TEST footnote.' }), { list: true })
  check('list mixed', listText({ title: 'TEST played every game:', rows: [...rows(2, 'games'), ...rows(3, null)], footnote: null }), { list: true })
})

// ── Digest (lib/cards/digestRank.js)
safe('digest', () => {
  const picks = [1, 2, 3].map((i) => ({ name: `TEST Skater ${i}`, team: 'TST', line: `${i} goals` }))
  const t = digestTexts(picks, { sport: 'nhl' })
  check('digest x', t.x, { list: true }); check('digest discord', t.discord, { list: true })
})

// ── Recap (lib/posts/recapPost.js, Discord plain text)
safe('recap', () => {
  const called = [1, 2, 3, 4].map((i) => ({ game_id: 'g1', game_date: '2026-10-09', player_id: `p${i}`, team: 'TST', name: `TEST Skater ${i}`, status: 'called', graded_at: '2026-10-10T01:00:00Z', dressed: true, hit: i < 3, goals: i < 3 ? 1 : 0 }))
  const goals = [1, 2].map((i) => ({ game_id: 'g1', player_id: `p${i}`, goal_n: 1, period: 1, period_type: 'REG', time_in_period: '10:00', strength: 'ev', empty_net: false, clip_url: '' }))
  const r = nhlRecap({ date: '2026-10-09', called, goals })
  check('recap nhl', r.text, { list: true, limit: 1900, count: (t) => [...t].length })
})

// ── Sport plans (Discord)
safe('plays', () => check('plays', playsText({ sport: 'mlb', day: '2026-10-09', leadText: '\u{1F3AF} TEST lead pick\nTEST Hitter (TST)\nhome run' }), { limit: 1900, count: (t) => [...t].length }))

// ── Cards (lib/card/text.js)
const leg = (i = 1, extra = {}) => ({ player_id: `p${i}`, name: `TEST Hitter ${i}`, team: 'TST', opp: 'OPP', market: 'anytime', status: 'called', why: 'TEST why line', ...extra })
safe('cards', () => {
  const note = 'TEST note line one.\nTEST note line two.'
  check('card x (straight + his two-man)', xCardText({ sport: 'mlb', day: '2026-10-09', straight: leg(1), donovan: { legs: [leg(2), leg(3)], note } }).text)
  check('card x (straight only)', xCardText({ sport: 'mlb', day: '2026-10-09', straight: leg(1) }).text)
  check('card x (two-man only)', xCardText({ sport: 'mlb', day: '2026-10-09', donovan: { legs: [leg(2), leg(3)], note } }).text)
  check('card today', todayText({ day: '2026-10-09', lead: { sport: 'mlb', leg: leg(1) } }).text)
  check('card longshot', longShotText({ sport: 'mlb', day: '2026-10-09', leg: { ...leg(1), price: { median: 450, books: 3 } } }).text)
  const ls = { result: 'miss', legs: [leg(1)], product: 'long_shot' }
  check('card longshot result', longShotResultText({ sport: 'mlb', day: '2026-10-09', row: ls, rec: { graded: 2, voids: 0, pushes: 0, hits: 1 } }).text)
  check('card double result', doubleResultText({ day: '2026-10-09', row: { result: 'hit', legs: [leg(1, { sport: 'mlb' }), leg(2, { sport: 'nhl' })], leg_results: [{ result: 'hit' }, { result: 'hit' }] } }).text)
  const nrow = { product: 'n_man', result: 'miss', legs: [1, 2, 3, 4].map((i) => leg(i)), leg_results: [1, 2, 3, 4].map((i) => ({ player_id: `p${i}`, result: i < 4 ? 'hit' : 'miss' })), note }
  check('card nman x', nManXText({ sport: 'mlb', day: '2026-10-09', row: { ...nrow, result: null } }).text)
  check('card nman result', nManResultText({ sport: 'mlb', day: '2026-10-09', row: nrow }).text, { list: true })
  check('card his straight x', donStraightXText({ sport: 'mlb', day: '2026-10-09', row: { legs: [leg(1)], note } }).text)
  const rows = [
    { lane: 'bot', product: 'straight', slot: 1, legs: [leg(1)], result: 'hit' }, { lane: 'bot', product: 'straight', slot: 2, legs: [leg(2)], result: 'miss' },
    { lane: 'bot', product: 'two_man', legs: [leg(3), leg(4)], result: 'hit', stake: 0.5, rule: 'diff' },
    { lane: 'donovan', product: 'two_man', legs: [leg(5), leg(6)], result: 'miss', stake: 1 },
  ]
  check('card result', resultText({ sport: 'mlb', day: '2026-10-09', rows }).text, { list: true })
  check('card members (discord)', membersCardText({ sport: 'mlb', day: '2026-10-09', rows }).text, { list: true, limit: 1900, count: (t) => [...t].length })
  check('card day (members)', dayText({ day: '2026-10-09', rows: rows.map((r) => ({ ...r, sport: 'mlb' })) }), { list: true, limit: 1900, count: (t) => [...t].length })
})

// ── Members boards (Discord plain text)
safe('members grade', () => {
  const picks = [1, 2, 3, 4].map((i) => ({ rank: i, player_id: `p${i}`, name: `TEST Hitter ${i}`, team: 'TST' }))
  check('members mlb grade', mlbMembersGrade({ board: { day: '2026-10-09', picks }, events: [{ player_id: 'p1' }] }).text, { list: true, limit: 1900, count: (t) => [...t].length })
})

// ── Longshots / 2+ Club / story / polls
safe('longshots', () => {
  const rows = [1, 2, 3, 4, 5].map((i) => ({ id: `l${i}`, name: `TEST Longshot ${i}`, team: 'TST', median: 400 + i, score: 70 - i }))
  check('longshots', longshotsText({ sport: 'mlb', market: 'HR', longAt: 400, rows }, Date.now(), { rows }), { list: true })
})
safe('multiClub', () => {
  const players = [1, 2, 3, 4, 5].map((i) => ({ name: `TEST Player ${i}`, team: 'TST', multi: 9 - i, recorded: true, called: 2 }))
  check('multiClub', multiClubText({ kind: 'HR', seasonLabel: '2026', players }), { list: true })
})
safe('story', () => {
  check('story cleared', storyResultText({ name: 'TEST Hitter', role: 'TOP', line: { ab: 4, h: 2, hr: 1, tb: 5, r: 1, rbi: 2 } }))
  check('story missed', storyResultText({ name: 'TEST Hitter', role: 'TOP', line: { ab: 4, h: 0, hr: 0, tb: 0, r: 0, rbi: 0 } }))
})
safe('polls', () => {
  const players = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `TEST Player ${i}`, team: 'TST', opp: 'OPP' }))
  const p = buildPickOne({ sport: 'mlb', day: '2026-10-09', players })
  check('poll text', p && p.text); check('poll discord', p && p.discordText)
  const r = buildReveal({ sport: 'mlb', guess: { metric: 'hr_most' }, result: { known: true, ranking: [{ id: 'p1', name: 'TEST Player 1', value: 2 }] } })
  check('poll reveal', r && r.text)
})

// ── Write-ups (X long/short + Discord/site full)
const lines = (...t) => t.map((x) => ({ t: x, v: [] }))
const player = (i, extra = {}) => ({ name: `TEST Player ${i}`, team: 'TST', opp: 'OPP', role: 'TOP', status_word: 'CALLED', bar: 'home run', score: 80, scoreName: 'MOONSHOT score', rank: 1, of: 20, spot: 3, position: 'C', tdScore: 80, grade: 'A', posRank: 1, posOf: 10, band: null, markets: [], why: lines('TEST why one', 'TEST why two'), watch: lines('TEST watch one'), price: null, ...extra })
const W = (sport, extra = {}) => ({ sport, away: 'AAA', home: 'BBB', when: '7:05 PM ET', header: { t: 'TEST header line.' }, game: lines('TEST game one', 'TEST game two'), players: [player(1), player(2)], noCall: [], bottom: lines('TEST bottom line.'), footer: 'TEST footer', ...extra })
for (const sport of ['mlb', 'nhl', 'nfl']) {
  safe(`writeup ${sport}`, () => {
    const r = renderWriteup(W(sport), { xLimit: 4000 })
    check(`writeup ${sport} full`, r.full, { limit: 4000, count: (t) => [...t].length })
    check(`writeup ${sport} short`, r.short)
    const rs = renderWriteup(W(sport), { xLimit: 280 })
    check(`writeup ${sport} x(280)`, rs.x)
    // the paid long post (X_TEXT_LIMIT 900 in prod, less the margin): the X layout, 2026-10-20
    const rl = renderWriteup(W(sport), { xLimit: 890 })
    check(`writeup ${sport} x(890)`, rl.x, { limit: 890 })
  })
}
safe('writeup nba', () => {
  const m = [{ word: 'points', score: 70, rank: 1, of: 10, role: 'TOP' }]
  const r = renderWriteup(W('nba', { players: [player(1, { markets: m }), player(2, { markets: m })] }), { xLimit: 4000 })
  check('writeup nba full', r.full, { limit: 4000, count: (t) => [...t].length })
  check('writeup nba short', r.short)
})

// ── Postseason single post
safe('postseason x', () => {
  const model = { name: 'TEST Hitter', teamName: 'TEST Club', group: 'hitting', season: 2026, games: 5, last: { round: 'ALDS', opp: 'OPP', isHome: true, counts: { homeRuns: 2, hits: 3, atBats: 4, rbi: 4, doubles: 0, triples: 0 } }, total: { hr: 3, rbi: 8, avg: '.300' } }
  check('postseason x', postseasonXText(model), { label: false })
})

// ── Other plain-text posts
safe('totals', () => {
  const rows = [1, 2, 3].map((i) => ({ sport: 'mlb', rank: i, field_size: 12, called: true, away: `TA${i}`, home: `TB${i}`, projected_total: 2.5 + i, line_source: 'model', line: 2 }))
  check('totals', totalsPostText({ sport: 'mlb', day: '2026-10-09', rows }), { list: true })
})
safe('history watch', () => check('history watch', historyWatchText([{ name: 'TEST Hitter', team: 'TST', hr: 49, claim: 'TEST claim', proof: {}, more: [] }, { name: 'TEST B', team: 'TST', kind: 'X', claim: 'TEST claim b' }, { name: 'TEST C', team: 'TST', kind: 'X', claim: 'TEST claim c' }])))
safe('splits', () => check('splits', splitsPostText({ name: 'TEST Hitter', rows: [{ code: 'vl', pa: 50, avg: 0.3, ops: 0.9, hr: 4 }, { code: 'vr', pa: 150, avg: 0.25, ops: 0.8, hr: 9 }, { code: 'risp', pa: 60, avg: 0.28, ops: 0.85, hr: 2 }] }), { list: true }))
safe('roundup', () => check('roundup (members)', roundupText({ sport: 'nhl', day: '2026-10-09', items: [1, 2, 3].map((i) => ({ teams: [`TA${i}`, `TB${i}`], headline: `TEST headline ${i}`, game_id: `g${i}` })) }), { list: true, limit: 1900, count: (t) => [...t].length }))
safe('briefing', () => check('briefing (members day, added)', briefingText({ day: '2026-10-09', rows: [{ lane: 'bot', sport: 'mlb', product: 'straight', slot: 1, legs: [leg(1)] }], update: true }), { list: true, limit: 1900, count: (t) => [...t].length }))
safe('homerFeed other', () => {
  check('mlb called shots', pregameText([1, 2, 3].map((i) => ({ name: `TEST Hitter ${i}`, team: 'TST', pitcher: 'TEST Arm' })), { site: 'dash.test', handle: '@test' }), { list: true })
  check('mlb moonshot', longshotText({ name: 'TEST Hitter', over: 900, team: 'TST', opponent: 'OPP' }, { site: 'dash.test', handle: '@test' }))
  check('mlb community pick', communityPickText({ site: 'dash.test', handle: '@test' }))
  check('mlb bot poll', botPollText({ site: 'dash.test', handle: '@test' }))
  check('mlb board landed', moonshotBoardText([1, 2, 3, 4].map((i) => ({ rank: i, player_id: `p${i}`, name: `TEST Hitter ${i}`, team: 'TST', score: 90 - i })), 'p2', { site: 'dash.test', handle: '@test' }), { list: true })
})

// ── MLB tweetFeed (X)
const site = 'dash.test', handle = '@test'
const P = (i, extra = {}) => ({ name: `TEST Hitter ${i}`, team: 'TST', pitcher: 'TEST Arm', blastPct: 20 + i, pitcherHrBbePct: 5, hr: 3, need: 2, t: 500, word: 'HR', l3hr9: 2.5, last5_hr: 1, last5_status: 'ok', score: 80, key: ['TOP', 'HR', 'HIT', 'HRR'][i % 4], h: 5, ab: 12, avg: 0.416, venue: 'TEST Park', matchup: 'AAA @ BBB', label: 'Open · 85°F · +5% HR', text: `TEST line ${i} for a hitter.`, icon: '*', span: '3 games', opp: 'OPP', age: 30, ...extra })
const picks = (n) => Array.from({ length: n }, (_, i) => P(i + 1))
const tf = { site, handle, day: '2026-10-09' }
safe('tweetFeed mlb', () => {
  check('mlb hottest contact', hottestContactText(picks(5), tf), { list: true })
  check('mlb danger combos', dangerComboText(picks(3), tf), { list: true })
  check('mlb back-to-back', backToBackText(picks(5), tf), { list: true })
  check('mlb fun facts', funFactsText(picks(3), tf), { list: true })
  check('mlb the four', theFourText(picks(4), tf), { list: true })
  check('mlb best air', bestAirText(picks(3), tf), { list: true })
  check('mlb storylines (arms)', storylinesText(picks(5), tf), { list: true })
  check('mlb call of the night', callOfTheNightText({ ...P(1), pct: 90, edgeSd: 0.4, armL3: 2.1, price: { odds: '+450', book: 'TESTBOOK', breakeven: 18 } }, tf), { list: true })
  check('mlb matchup lines', matchupLinesText(picks(3), tf), { list: true })
  check('mlb streaks', streaksText(P(1), tf))
  check('mlb hr vs starter', hrVsStarterText(picks(5), tf), { list: true })
  check('mlb career vs starter', careerVsStarterText(picks(5), tf), { list: true })
  check('mlb milestones', milestoneText(picks(6), tf), { list: true })
  check('mlb revenge/giveaways', revengeGiveawayText({ revenge: picks(2), giveaways: [{ home: 'TST', name: 'TEST Item', star: { name: 'TEST Star' } }] }, tf), { list: true })
  check('mlb hr leaders by dow', hrLeadersByDowText(picks(5), 'Friday', tf), { list: true })
  check('mlb storyline watch', storylineWatchText(picks(4), { ...tf, slot: 1 }), { list: true })
  check('mlb hot stretch', hotStretchText({ name: 'TEST Hitter', team: 'TST', ops: '1.000', avg: '.400', obp: '.450', slg: '.550', hr: 4, rbi: 9, pitcher: 'TEST Arm' }, { ...tf, window: 'month' }), { list: true })
  check('mlb angles (big)', anglesText({ arms: picks(4), parks: picks(2), matchups: picks(3), streak: P(1), milestones: picks(3), birthdays: picks(2), revenge: { revenge: picks(3) } }, { ...tf, limit: 900 }), { list: true, limit: 900, count: (t) => t.length })
  check('mlb hot sheet (big)', hotSheetText({ hot: picks(4), danger: picks(3), b2b: picks(4), leaders: picks(4), dow: 'Friday' }, { ...tf, limit: 900 }), { list: true, limit: 900, count: (t) => t.length })
})

// ── NFL tweetFeed (X)
safe('tweetFeed nfl', () => {
  const data = { week: 5 }
  const N = (i) => ({ name: `TEST Back ${i}`, team: 'TST', opp: 'OPP', position: 'RB', score: 80, tds: 3, streak: 4, n: 4, rank: i, total: 5, him: i === 3, grade: 'A', label: 'TEST', value: 80, stat: 'RZ', rz: 3, text: 'TEST line', done: 5, week: 5, payd: 200, patd: 2, ruyd: 20, rutd: 1, recyd: 0, rec: 0, rectd: 0, avg: { td: 1.2, xtd: 1.1 }, components: [1, 2, 3, 4, 5].map((j) => ({ label: `TEST part ${j}`, value: 90 - j })), pct: 50, season_tds: 5, meetings: 3, td: 3, g: 2 })
  const ps = [1, 2, 3, 4, 5].map(N)
  const tryit = (name, fn, opts) => safe(name, () => { const t = fn(); if (t) check(name, t, opts); else console.log(`note: ${name} rendered nothing with generic test data (skipped)`) })
  tryit('nfl milestones', () => nflMilestoneText(ps.map((x) => ({ player: x, marketKey: 'anytime_td', marketBar: 0.5, streak: 4 })), data, { site, handle }), { list: true })
  tryit('nfl opportunity', () => opportunityText(ps, data, 'RZ', { site, handle }), { list: true })
  tryit('nfl td history', () => tdHistoryText(ps, data, { site, handle }), { list: true })
  tryit('nfl why on board', () => whyOnBoardText(N(1), data, { site, handle }), { list: true })
  tryit('nfl big week', () => bigWeekText(ps, data, { site, handle }), { list: true })
  tryit('nfl spotlight', () => spotlightText(N(1), data, { site, handle }), { list: true })
  tryit('nfl board', () => nflBoardText(ps, data, { site, handle }), { list: true })
  tryit('nfl bot poll', () => nflBotPollText(ps, data, { site, handle }))
  tryit('nfl community pick', () => nflCommunityPickText({ site, handle }))
  tryit('nfl board results', () => nflBoardResultsText(ps, new Set(['test back 1']), data, { site, handle }), { list: true })
  tryit('nfl call neighbors', () => tdCallNeighborsText(ps, { site, handle }), { list: true })
})

console.log(bad ? `\n${bad} problem(s) across ${seen.length} posts` : `check-post-layout: OK (${seen.length} posts)`)
process.exit(bad ? 1 : 0)
