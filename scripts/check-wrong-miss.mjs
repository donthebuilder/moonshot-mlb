// "WE SAID HE MISSED AND HE SCORED" (2026-10-11): the three ways a miss could be wrong or read wrong.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-wrong-miss.mjs
// ALL DATA IS TEST DATA: every player is "Test ...", every id is a TEST id. The shapes are the real ones (card_calls rows,
// lamp_goal_log / lamp_prop_log rows, the league boxscore's playerByGameStats, lamp_goal_feed rows).
//   A  a Card result names the MARKET of a leg that is not the plain scorer market. "✗ <name>" under a goal card read as "he did not
//      score" for a man whose leg was shots on goal over 2.5 and who scored (CAR@PHI 10-11). Anytime legs keep the bare name.
//   B  the late scoring change: a goal re-credited by the league after our grade is picked up by re-running the SAME grader; the
//      locked model columns are never part of the write; an unchanged row is not written; the recheck window is bounded.
//   C  a goal moved to a teammate is "re-credited", not "overturned": the correction says so and never says the goal is off the board.
//   D  2+ GOALS (goal2_site_v1): one goal is a miss ON THE 2+ LINE, by definition, and never a "missed a goal"; no reader of the
//      lamp_prop_log GOAL market may skip the model_version filter (the 2+ rows share market 'GOAL' with the goal shadows).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resultText, resultEmbed, legTag, resultMarketWords } from '../lib/card/text.js'
import { gradeRows } from '../lib/nhl/goalModel.js'
import { gradeGoal2Rows } from '../lib/nhl/goal2Model.js'
import { gradeSogRows } from '../lib/nhl/sogModel.js'
import { recheckReason, changedResults, resultPatch, RECHECK_FROM_MS, RECHECK_TO_MS, RECHECK_MAX_MS } from '../lib/nhl/regrade.js'
import { recreditedTo, correctionText, correctionEmbed } from '../lib/nhl/goalFeed.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// ── A ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const leg = (id, name, extra = {}) => ({ player_id: id, name, team: 'TST', opp: 'EXA', market: 'anytime', ...extra })
const rows = [
  { lane: 'bot', product: 'straight', slot: 1, result: 'miss', legs: [leg('T1', 'Test Defender')] },
  { lane: 'bot', product: 'straight', slot: 2, result: 'miss', legs: [leg('T2', 'Test Scorer', { market: 'sog', line: 2.5 })] },
  { lane: 'bot', product: 'two_man', slot: 1, result: 'miss', legs: [leg('T1', 'Test Defender'), leg('T3', 'Test Passer')] },
]
const t = resultText({ sport: 'nhl', day: '2099-01-01', rows })
check(/✗ Test Defender\b(?! \()/.test(t.text), 'A1 an anytime leg keeps the bare name')
check(/✗ Test Scorer \(shots on goal over 2\.5\)/.test(t.text), 'A2 a shots leg says its market, so "✗ Test Scorer" never reads as "did not score"')
check(t.text.length <= 280, 'A3 the post still fits')
const emb = JSON.stringify(resultEmbed({ sport: 'nhl', day: '2099-01-01', rows }))
check(emb.includes('Test Scorer (TST) 3+ shots'), 'A4 the Discord card says the market too (plain words since #265: "3+ shots")')
check(emb.includes('Test Defender (TST) to score') && emb.includes('0 of 2 picks hit'), 'A5 each pick says its own market; the description is the count, no market list (#265)')
check(resultMarketWords('nhl', [rows[0]]) === 'anytime goal', 'A6 an all-anytime card is described exactly as before')
check(legTag('nhl', leg('x', 'y')) === '' && legTag('mlb', leg('x', 'y', { market: 'hit', line: 0.5 })) === ' (hits over 0.5)' && legTag('nfl', leg('x', 'y', { market: 'rec_yds', line: 54.5 })) === ' (receiving yards over 54.5)', 'A7 legTag: bare for anytime, the market words for every other market of all three sports')

// ── B ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TEST game: the goal was graded to Test Schaefer; the league later gave it to Test Pageau.
const stored = [
  { game_id: 9001, player_id: 1, name: 'Test Schaefer', status: 'board', score: 90, rank_in_game: 5, dressed: true, goals: 1, hit: true, graded_at: '2099-01-01T02:10:00Z' },
  { game_id: 9001, player_id: 2, name: 'Test Pageau', status: 'off', score: 45, rank_in_game: 21, dressed: true, goals: 0, hit: false, graded_at: '2099-01-01T02:10:00Z' },
  { game_id: 9001, player_id: 3, name: 'Test Winger', status: 'called', score: 80, rank_in_game: 2, dressed: true, goals: 0, hit: false, graded_at: '2099-01-01T02:10:00Z' },
  { game_id: 9001, player_id: 4, name: 'Test Scratched', status: 'off', score: 20, rank_in_game: 30, dressed: false, goals: null, hit: null, graded_at: '2099-01-01T02:10:00Z' },
]
const box = (g) => ({ awayTeam: { forwards: [{ playerId: 1, goals: g[1], assists: 0, points: g[1], sog: 2 }, { playerId: 2, goals: g[2], assists: 0, points: g[2], sog: 1 }], defense: [] }, homeTeam: { forwards: [{ playerId: 3, goals: g[3], assists: 1, points: 1, sog: 3 }], defense: [] } })
const same = gradeRows(stored.map((r) => ({ ...r, playerId: r.player_id })), box({ 1: 1, 2: 0, 3: 0 }))
check(changedResults(stored, same, 'goals').length === 0, 'B1 a box that did not change writes nothing')
const late = gradeRows(stored.map((r) => ({ ...r, playerId: r.player_id })), box({ 1: 0, 2: 1, 3: 0 }))
const ch = changedResults(stored, late, 'goals')
check(ch.length === 2 && ch.some((c) => c.row.name === 'Test Pageau' && c.to.hit === true && c.from.hit === false) && ch.some((c) => c.row.name === 'Test Schaefer' && c.to.hit === false && c.from.hit === true), 'B2 the re-credited goal flips BOTH rows: the new scorer a hit, the old one a miss')
check(ch.every((c) => JSON.stringify(Object.keys(resultPatch('goals', c.to)).sort()) === JSON.stringify(['dressed', 'goals', 'hit'])), 'B3 the write is the three result columns only: never score, status, rank, legs or locked_at')
const sogRows = [{ game_id: 9001, player_id: 2, market: 'SOG', model_version: 'test', bar: 3, dressed: true, value: 2, hit: false }]
const sogBox = { awayTeam: { forwards: [{ playerId: 2, sog: 4 }], defense: [] }, homeTeam: { forwards: [], defense: [] } }
const sc = changedResults(sogRows, gradeSogRows(sogRows, sogBox), 'value')
check(sc.length === 1 && sc[0].to.hit === true && sc[0].to.value === 4 && sc[0].from.hit === false, 'B4 a shots count corrected upward turns a wrong miss into a hit through the same SOG grader')
const t0 = Date.parse('2099-01-01T02:10:00Z')
const feedLate = [{ first_seen_at: '2099-01-01T03:39:01Z', confirmed_at: null, overturned_at: null }]
check(/goal feed changed/.test(recheckReason({ gradedAt: '2099-01-01T02:10:00Z', now: t0 + 95 * 60e3, feedRows: feedLate }) || ''), 'B5 a goal first seen after the grade triggers a recheck')
check(/overturned_at/.test(recheckReason({ gradedAt: '2099-01-01T02:10:00Z', now: t0 + 95 * 60e3, feedRows: [{ overturned_at: '2099-01-01T03:39:00Z' }] }) || ''), 'B6 an overturn after the grade triggers one')
check(recheckReason({ gradedAt: '2099-01-01T02:10:00Z', now: t0 + 30 * 60e3, feedRows: [{ first_seen_at: '2099-01-01T01:00:00Z', confirmed_at: '2099-01-01T01:02:00Z' }] }) === null, 'B7 a feed that settled BEFORE the grade, 30 minutes after it: nothing to recheck')
check(recheckReason({ gradedAt: '2099-01-01T02:10:00Z', now: t0 + RECHECK_FROM_MS + 60e3, feedRows: [] }) === 'settle window' && recheckReason({ gradedAt: '2099-01-01T02:10:00Z', now: t0 + RECHECK_TO_MS + 60e3, feedRows: [] }) === null, 'B8 one settle read in a bounded window, then none')
check(recheckReason({ gradedAt: '2099-01-01T02:10:00Z', now: t0 + RECHECK_MAX_MS + 60e3, feedRows: feedLate }) === null && recheckReason({ gradedAt: null, now: t0, feedRows: feedLate }) === null, 'B9 nothing older than 12 hours, nothing ungraded')
const route = readFileSync(new URL('../app/api/lamp/tick/route.js', import.meta.url), 'utf8')
check(/changedResults\(goalLog\.data, goalAfter, 'goals'\)/.test(route) && /resultPatch\('value', c\.to\)/.test(route) && !/recheck[\s\S]{0,4000}\.upsert\(/.test(route.slice(route.indexOf('── RECHECK'), route.indexOf('HOT NUMBERS'))), 'B10 the route re-runs the existing graders and writes with update(), never an upsert of a whole row')

// ── C ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const gOld = { game_id: 9001, player_id: 1, name: 'Test Schaefer', team: 'TST', period: 2, time_in_period: '11:39', score_after: 'EXA 3 · TST 2', overturned_at: '2099-01-01T03:39:00Z' }
const gNew = { game_id: 9001, player_id: 2, name: 'Test Pageau', team: 'TST', period: 2, time_in_period: '11:41', score_after: 'EXA 3 · TST 2', overturned_at: null }
const other = { game_id: 9001, player_id: 5, name: 'Test Other', team: 'TST', period: 2, time_in_period: '19:53', score_after: 'EXA 3 · TST 3', overturned_at: null }
check(recreditedTo(gOld, [gOld, other, gNew])?.name === 'Test Pageau', 'C1 the same goal at the same moment under a teammate is a re-credit')
check(recreditedTo(gOld, [gOld, other]) === null && recreditedTo({ ...gOld, team: 'EXA' }, [gNew]) === null && recreditedTo(gOld, [{ ...gNew, overturned_at: 'x' }]) === null, 'C2 a true overturn (no standing goal at that moment, another club, or a re-credit itself undone) stays an overturn')
const ct = correctionText(gOld, null, gNew)
check(/Test Pageau/.test(ct) && /Test Schaefer/.test(ct) && !/overturned|off the board/i.test(ct) && ct.length <= 280, 'C3 the re-credit reply names both men and never says the goal was overturned or off the board')
check(/overturned on review/.test(correctionText(gOld)) && /off the board/.test(correctionText(gOld)), 'C4 a true overturn keeps its text')
const ce = JSON.stringify(correctionEmbed(gOld, null, 0, gNew))
check(/re-credited/.test(ce) && /The goal stands/.test(ce) && !/no longer counts/.test(ce), 'C5 the Discord card says the goal stands')

// ── D ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const g2 = [{ game_id: 9001, player_id: 1, market: 'GOAL', model_version: 'goal2_site_v1', bar: 2 }, { game_id: 9001, player_id: 2, market: 'GOAL', model_version: 'goal2_site_v1', bar: 2 }, { game_id: 9001, player_id: 9, market: 'GOAL', model_version: 'goal2_site_v1', bar: 2 }]
const g2g = gradeGoal2Rows(g2, box({ 1: 1, 2: 2, 3: 0 }))
check(g2g[0].value === 1 && g2g[0].hit === false && g2g[1].hit === true && g2g[2].dressed === false && g2g[2].hit === null, 'D1 2+ goals: one goal is value 1, hit false (a miss ON THE 2+ LINE); two is a hit; not dressed is void')
// no module that words a result may call a 2+ row "missed a goal": the 2+ board prints the goal COUNT, grey when under the bar
const board = readFileSync(new URL('../components/lamp/tabs/Board.js', import.meta.url), 'utf8')
check(!/goal2[^\n]*missed|G2[^\n]*missed a goal/i.test(board) && /result: 'GOALS'/.test(board), 'D2 the 2+ board shows a goal COUNT under the heading GOALS; no "missed" wording on it')
// every read of lamp_prop_log market 'GOAL' carries a model_version filter (the 2+ rows share the market with the goal shadows)
const walk = (d, out = []) => { for (const f of readdirSync(d)) { if (f === 'node_modules' || f === '.next' || f.startsWith('.')) continue; const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p, out); else if (/\.(js|mjs)$/.test(f)) out.push(p) } return out }
const root = new URL('..', import.meta.url).pathname
const loose = []
for (const f of [...walk(join(root, 'lib')), ...walk(join(root, 'app')), ...walk(join(root, 'components'))]) {
  const src = readFileSync(f, 'utf8').split('\n')
  src.forEach((line, i) => {
    if (!/from\('lamp_prop_log'\)/.test(line)) return
    const block = src.slice(i, i + 6).join('\n')
    if (/\.(delete|upsert|insert)\(/.test(block) && !/\.select\(/.test(block)) return
    if (/market['"]?,\s*['"](SOG|PTS|AST)['"]/.test(block) || /LOG_MARKET|market\)/.test(block) && /model_version/.test(block)) return
    if (/'GOAL'|GOAL\b/.test(block) && !/model_version/.test(block)) loose.push(`${f.replace(root, '')}:${i + 1}`)
  })
}
check(loose.length === 0, `D3 every lamp_prop_log GOAL read filters model_version${loose.length ? ` (loose: ${loose.join(', ')})` : ''}`)

console.log(failed ? `\n${failed} FAILED` : '\nall wrong-miss checks pass')
process.exit(failed ? 1 : 0)
