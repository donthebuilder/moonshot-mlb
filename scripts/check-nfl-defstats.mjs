#!/usr/bin/env node
// NFL DEFENSIVE STATS (lib/nfl/defStats.js, lib/nfl/defenseFeed.js, app/api/nfl/defense/route.js). All data below is TEST data,
// made up for this check only, in the SHAPE of ESPN's summary box score (clubs "T01".."T03", players "d1".."d9"); nothing
// here is a real player or a real number, and nothing here reaches the network (fetch is a fake).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nfl-defstats.mjs
import fs from 'node:fs'
import {
  parseSummary, addGame, finishBook, isDefender, teamGames, groupOf, isDefPosition, DEF_GROUPS, GROUP_COLUMNS, COLUMN_LABEL,
  defenderLine, turnoverPlayers, defenderPlayers, joinDefenders, sortGroup, keyDefenders, leadStat,
} from '../lib/nfl/defStats.js'
import { loadSeasonBook, finishedGames, _clearMemo, CONCURRENCY } from '../lib/nfl/defenseFeed.js'
import { GET } from '../app/api/nfl/defense/route.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ── TEST FIXTURE: ESPN's summary shape (groups carry their own `keys`; values are strings, "-" is blank) ──
const A = (id, name) => ({ id, displayName: name, shortName: name })
const G = {
  passing: (rows) => ({ name: 'passing', keys: ['completions/passingAttempts', 'passingYards', 'yardsPerPassAttempt', 'passingTouchdowns', 'interceptions', 'sacks-sackYardsLost', 'adjQBR', 'QBRating'], athletes: rows.map(([id, n, st]) => ({ athlete: A(id, n), stats: st })) }),
  rushing: (rows) => ({ name: 'rushing', keys: ['rushingAttempts', 'rushingYards', 'yardsPerRushAttempt', 'rushingTouchdowns', 'longRushing'], athletes: rows.map(([id, n, st]) => ({ athlete: A(id, n), stats: st })) }),
  receiving: (rows) => ({ name: 'receiving', keys: ['receptions', 'receivingYards', 'yardsPerReception', 'receivingTouchdowns', 'longReception', 'receivingTargets'], athletes: rows.map(([id, n, st]) => ({ athlete: A(id, n), stats: st })) }),
  fumbles: (rows) => ({ name: 'fumbles', keys: ['fumbles', 'fumblesLost', 'fumblesRecovered'], athletes: rows.map(([id, n, st]) => ({ athlete: A(id, n), stats: st })) }),
  defensive: (rows) => ({ name: 'defensive', keys: ['totalTackles', 'soloTackles', 'sacks', 'tacklesForLoss', 'passesDefended', 'QBHits', 'defensiveTouchdowns'], athletes: rows.map(([id, n, st]) => ({ athlete: A(id, n), stats: st })) }),
  interceptions: (rows) => ({ name: 'interceptions', keys: ['interceptions', 'interceptionYards', 'interceptionTouchdowns'], athletes: rows.map(([id, n, st]) => ({ athlete: A(id, n), stats: st })) }),
}
const summary = (id, a, b) => ({ header: { id }, boxscore: { players: [{ team: { abbreviation: a.t }, statistics: a.g }, { team: { abbreviation: b.t }, statistics: b.g }] } })
const WEEK1 = summary('g1',
  { t: 'T01', g: [
    G.passing([['q1', 'Test Passer', ['19/25', '189', '7.6', '1', '2', '3-21', '59.4', '90.1']]]),
    G.rushing([['r1', 'Test Back', ['21', '110', '5.2', '1', '20']]]),
    G.receiving([['w1', 'Test Wideout', ['5', '60', '12.0', '0', '20', '8']]]),
    G.fumbles([['r1', 'Test Back', ['2', '1', '0']], ['d1', 'Test Rusher', ['0', '0', '1']]]),
    G.defensive([['d1', 'Test Rusher', ['6', '4', '2', '1', '0', '3', '0']], ['d2', 'Test Corner Jr.', ['4', '4', '0', '0', '3', '0', '0']]]),
    G.interceptions([['d2', 'Test Corner Jr.', ['1', '12', '0']]]),
  ] },
  { t: 'T02', g: [
    G.passing([['q2', 'Other Passer', ['10/20', '90', '4.5', '0', '0', '1-8', '40.0', '60.0']]]),
    G.defensive([['d3', 'Other Backer', ['9', '6', '0', '2', '1', '0', '0']]]),
  ] })
const WEEK2 = summary('g2',
  { t: 'T01', g: [
    G.passing([['q1', 'Test Passer', ['20/30', '210', '7.0', '2', '0', '2-15', '70.0', '100.0']]]),
    G.defensive([['d1', 'Test Rusher', ['3', '3', '1', '0', '0', '1', '0']], ['d2', 'Test Corner Jr.', ['5', '3', '0', '0', '2', '0', '0']]]),
  ] },
  { t: 'T03', g: [G.defensive([['d4', 'Third Club Man', ['2', '2', '0', '0', '0', '0', '0']]])] })

// ── 1. PARSING FROM THE ESPN SHAPE ──────────────────────────────────────────
const g1 = parseSummary(WEEK1, { id: 'g1', week: 1, date: '2026-09-13T17:00Z' })
const by = Object.fromEntries(g1.players.map((p) => [p.id, p]))
check(g1.teams.join() === 'T01,T02' && g1.week === 1 && g1.id === 'g1', 'a box score parses to its two clubs, week and id')
check(by.d1.def.tot === 6 && by.d1.def.sck === 2 && by.d1.def.tfl === 1 && by.d1.def.qbh === 3 && by.d1.def.pd === 0, 'defensive group: tackles, sacks, TFL, QB hits, passes defended by KEY, not column order')
check(by.d2.def.int === 1 && by.d2.def.intyds === 12 && by.d2.def.pd === 3, 'interceptions group joins the same man’s defensive line')
check(by.d1.fum.rec === 1 && by.r1.fum.fum === 2 && by.r1.fum.lost === 1, 'fumbles group: fumbled, lost, recovered')
check(by.q1.off.att === 25 && by.q1.off.cmp === 19 && by.q1.off.int === 2 && by.q1.off.sacked === 3, 'passing "19/25" and "3-21" split by their keys: 25 attempts, 2 INT thrown, 3 sacks taken')
check(by.r1.off.car === 21 && by.w1.off.rec === 5 && by.w1.off.tgt === 8, 'carries, catches, targets')
check(by.d1.team === 'T01' && by.d1.opp === 'T02' && by.d3.team === 'T02' && by.d3.opp === 'T01', 'each man carries his club and his opponent')
check(by.d2.off == null && by.q1.def == null, 'a man with no group of a kind has none of it (null), never a zero line')
// reordering ESPN's columns must not move a number
const shuffled = JSON.parse(JSON.stringify(WEEK1))
const dg = shuffled.boxscore.players[0].statistics.find((g) => g.name === 'defensive')
dg.keys = [...dg.keys].reverse(); dg.athletes.forEach((a) => { a.stats = [...a.stats].reverse() })
const sh = Object.fromEntries(parseSummary(shuffled, { id: 'g1', week: 1 }).players.map((p) => [p.id, p]))
check(sh.d1.def.sck === 2 && sh.d1.def.qbh === 3 && sh.d1.def.tot === 6, 'parsing is by the group’s own keys: a reordered column changes nothing')
// blanks, missing groups, garbage
const messy = { boxscore: { players: [{ team: { abbreviation: 'T01' }, statistics: [G.defensive([['x1', 'Blank Man', ['-', '--', '', 'n/a', '2', '0', '0']]])] }, { team: { abbreviation: 'T02' }, statistics: [] }] } }
const mm = parseSummary(messy, { id: 'm' }).players[0]
check(mm.def.tot === null && mm.def.sck === null && mm.def.pd === 2, 'a blank "-" cell is null (unknown), not 0')
check(parseSummary({}, {}) === null && parseSummary({ boxscore: { players: [] } }, {}) === null && parseSummary(null, {}) === null, 'a payload with no box score players -> null, no throw')

// ── 2. AGGREGATION: finished games summed, per-game log kept ────────────────
const book = {}
addGame(book, parseSummary(WEEK2, { id: 'g2', week: 2 }))
addGame(book, g1)   // added out of order on purpose
finishBook(book)
check(book.d1.games === 2 && book.d1.def.tot === 9 && book.d1.def.sck === 3 && book.d1.def.qbh === 4, 'two games summed: 6+3 tackles, 2+1 sacks, 3+1 hits')
check(book.d1.log.map((l) => l.w).join() === '1,2' && book.d1.log[0].def.tot === 6, 'the game log is in week order whatever order the games arrived in')
check(book.d2.def.int === 1 && book.d2.def.pd === 5 && book.d2.games === 2, 'interceptions and passes defended add across games')
check(book.q1.off.att === 55 && book.q1.off.int === 2 && book.q1.games === 2, 'a passer’s attempts and interceptions add across games')
check(teamGames(book).T01 === 2 && teamGames(book).T02 === 1 && teamGames(book).T03 === 1, 'a club’s games = the most any of its men appear in')
check(isDefender(book.d1) && !isDefender(book.q1) && !isDefender(book.r1), 'isDefender: a defensive line, not a quarterback or a back')
const tp = turnoverPlayers(book)
check(tp.r1.fum === 2 && tp.r1.lost === 1 && tp.q1.att === 55 && tp.q1.int === 2 && !tp.d3 && !tp.d1, 'the turnover payload keeps offensive men and fumblers only; a defender with no fumble is not in it')
check(Object.keys(tp).length < 10 && JSON.stringify(tp).length < 2000, 'and it is small')
const dp = defenderPlayers(book, ['T01'])
check(dp.d1 && dp.d2 && !dp.d3 && !dp.q1 && dp.d1.log.length === 2 && dp.d1.fum.rec === 1, 'the defender payload is one club’s men with a game log each')
const traded = {}
addGame(traded, { id: 'a', week: 1, players: [{ id: 'z1', name: 'Mover', team: 'T01', opp: 'T02', def: { tot: 1 }, off: null, fum: null }] })
addGame(traded, { id: 'b', week: 3, players: [{ id: 'z1', name: 'Mover', team: 'T03', opp: 'T02', def: { tot: 2 }, off: null, fum: null }] })
check(traded.z1.team === 'T03' && traded.z1.def.tot === 3, 'a man traded mid-season is filed under the club of his latest game')

// ── 3. POSITION GROUPS AND THE RIGHT COLUMNS ────────────────────────────────
check(groupOf('DE') === 'DL' && groupOf('NT') === 'DL' && groupOf('OLB') === 'LB' && groupOf('CB') === 'CB' && groupOf('FS') === 'S' && groupOf('SAF') === 'S' && groupOf('DB') === 'DB', 'positions fold into DL / LB / CB / S, and a bare "DB" stays DB (never guessed)')
check(groupOf('WR') === null && groupOf('DEF') === null && groupOf('') === null && !isDefPosition('QB') && isDefPosition('CB'), 'offence, the team-defense pseudo-row and blanks are not defenders')
check(DEF_GROUPS.join() === 'DL,LB,CB,S,DB', 'groups in table order')
check(!GROUP_COLUMNS.CB.includes('sck') && !GROUP_COLUMNS.CB.includes('qbh') && GROUP_COLUMNS.DL.includes('sck') && GROUP_COLUMNS.DL.includes('qbh') && GROUP_COLUMNS.CB.includes('int') && !GROUP_COLUMNS.DL.includes('int'), 'a lineman gets sacks and hits and no interceptions column; a corner the reverse')
check(Object.keys(COLUMN_LABEL).every((k) => COLUMN_LABEL[k][0] && COLUMN_LABEL[k][1]) && leadStat('DL') === 'sck' && leadStat('CB') === 'pd', 'every column has a label and a meaning; DL leads on sacks, CB on passes defended')

// ── 4. THE LINE: box score leads where it has the column, the bot fills the rest ──
const BOT = { name: 'Test Rusher', team: 'T01', position: 'DE', pos_group: 'DL', games: 2, stats: { tackles: 8, tackles_for_loss: 1, sacks: 3, qb_hits: 4, pass_defended: 0, fumbles_forced: 1 }, percentiles: { sacks: 90 }, grade: 77 }
const lineBoth = defenderLine({ gsis: 'G-d1', espnId: 'd1', roster: { position: 'DL', name: 'Test Rusher', team: 'T01' }, bot: BOT, box: book.d1 })
check(lineBoth.tkl === 9 && lineBoth.sck === 3 && lineBoth.ff === 1 && lineBoth.fr === 1 && lineBoth.int === 0 && lineBoth.source === 'espn+bot' && lineBoth.group === 'DL', 'box score tackles (9) beat the bot’s (8) for the same column; forced fumbles are the bot’s; INT / FR from the box; the source is named')
const lineBot = defenderLine({ gsis: 'G-d1', bot: BOT, box: null })
check(lineBot.tkl === 8 && lineBot.int === null && lineBot.fr === null && lineBot.source === 'bot', 'with no box score: the bot’s numbers, and INT / FR are null (unknown), not 0')
const lineBox = defenderLine({ espnId: 'd2', roster: { position: 'DB', name: 'Test Corner Jr.', team: 'T01' }, bot: null, box: book.d2 })
check(lineBox.ff === null && lineBox.int === 1 && lineBox.group === 'DB' && lineBox.source === 'espn', 'box score only: forced fumbles unknown (null); a roster "DB" is group DB')
check(defenderLine({ bot: null, box: null }) === null && defenderLine({ box: book.q1 }) === null, 'nothing, or a quarterback’s box line -> no defender line')

// ── 5. JOINING ONE CLUB ─────────────────────────────────────────────────────
const roster = [
  { gsis_id: 'G-d1', espn_id: 'd1', name: 'Test Rusher', team: 'T01', position: 'DL', status_word: 'Active' },
  { gsis_id: 'G-d2', espn_id: null, name: 'Test Corner', team: 'T01', position: 'DB', status_word: 'IR / reserve' },   // no ESPN id: joins on name (suffix dropped)
  { gsis_id: 'G-q1', espn_id: 'q1', name: 'Test Passer', team: 'T01', position: 'QB' },
  { gsis_id: 'G-z9', espn_id: 'z9', name: 'Nobody Yet', team: 'T01', position: 'LB' },
]
const disruption = { 'G-d1': BOT, 'G-b7': { name: 'Bot Only', team: 'T01', position: 'CB', pos_group: 'DB', games: 4, stats: { tackles: 5, tackles_for_loss: 0, sacks: 0, qb_hits: 0, pass_defended: 2, fumbles_forced: 0 }, percentiles: {}, grade: 50 } }
const boxT01 = { ...defenderPlayers(book, ['T01']), d9: { name: 'Mystery Man', team: 'T01', games: 1, def: { tot: 1 }, fum: { rec: 0 }, log: [] } }
const J = joinDefenders({ team: 'T01', roster, disruption, box: boxT01 })
const jr = Object.fromEntries(J.rows.map((r) => [r.name, r]))
check(jr['Test Rusher'].source === 'espn+bot' && jr['Test Rusher'].id === 'G-d1', 'joined on the ESPN id: box + bot + roster')
check(jr['Test Corner'] && jr['Test Corner'].int === 1 && jr['Test Corner'].status === 'IR / reserve', 'joined on a normalised name (Jr. dropped) when the roster has no ESPN id; his roster status rides along')
check(jr['Bot Only'] && jr['Bot Only'].source === 'bot' && jr['Bot Only'].group === 'CB', 'a man only the bot knows is kept, with the bot’s position')
check(!jr['Test Passer'], 'a quarterback on the roster is not a defender')
check(!jr['Nobody Yet'], 'a roster defender with no line anywhere is left out (no empty row)')
check(J.unplaced === 1, 'a box-score man with no position anywhere is counted as unplaced, never filed under a guessed group')
const empty = joinDefenders({ team: 'T01', roster: [], disruption: {}, box: {} })
check(empty.rows.length === 0 && empty.unplaced === 0 && joinDefenders({}).rows.length === 0, 'nothing in -> nothing out, no throw')
const sorted = sortGroup([{ name: 'a', sck: 1, tkl: 9 }, { name: 'b', sck: 3, tkl: 2 }, { name: 'c', sck: 3, tkl: 5 }, { name: 'd', sck: null, tkl: 1 }], 'DL')
check(sorted.map((r) => r.name).join('') === 'cbad', 'a group leads on its own stat, ties by tackles, unknown last')
const kd = keyDefenders([
  { name: 'r1', group: 'DL', sck: 2, qbh: 1 }, { name: 'r2', group: 'LB', sck: 2, qbh: 4 }, { name: 'r3', group: 'DL', sck: 0, qbh: 0 }, { name: 'r4', group: 'DL', sck: 1, qbh: 0 },
  { name: 'c1', group: 'CB', pd: 3, int: 0 }, { name: 'c2', group: 'DB', pd: 1, int: 2 }, { name: 'c3', group: 'S', pd: 9, int: 9 }, { name: 'c4', group: 'CB', pd: 0, int: 0 },
], { rushers: 2, corners: 2 })
check(kd.rushers.map((r) => r.name).join() === 'r2,r1' && kd.corners.map((r) => r.name).join() === 'c2,c1', 'key defenders: rushers by sacks then hits (a man with none is not a rusher); corners by PBU + INT, safeties excluded')

// ── 6. THE FEED: finished games only, caps, partial reads said out loud ─────
const calls = []
const SB = (w, evs, type = 2) => ({ season: { year: 2026, type }, week: { number: 2 }, events: evs.map(([id, state]) => ({ id, date: `2026-09-1${w}T17:00Z`, status: { type: { state } } })) })
const mkFetch = ({ failIds = [], liveIds = ['g3'] } = {}) => async (url) => {
  calls.push(url)
  const ok = (j) => ({ ok: true, json: async () => j })
  if (/scoreboard/.test(url)) return /week=1/.test(url) ? ok(SB(1, [['g1', 'post']])) : ok(SB(2, [['g2', 'post'], ['g3', liveIds.includes('g3') ? 'in' : 'post']]))
  const id = new URL(url).searchParams.get('event')
  if (failIds.includes(id)) return { ok: false, json: async () => null }
  return ok({ g1: WEEK1, g2: WEEK2, g3: WEEK2 }[id])
}
_clearMemo(); calls.length = 0
const full = await loadSeasonBook({ season: 2026, fetchImpl: mkFetch(), fresh: true })
check(full && full.expected === 2 && full.read === 2 && !full.partial && full.week === 2 && full.season === 2026, 'a game in progress is not read: 2 finished games expected, 2 read, not partial')
check(!calls.some((u) => /event=g3/.test(u)), 'the in-progress game’s box score is never fetched')
check(calls.every((u) => /^https:\/\/site\.web\.api\.espn\.com\//.test(u)), 'every call goes to site.web.api.espn.com (the host Vercel can reach)')
check(full.book.d1.games === 2 && full.teamGames.T01 === 2, 'the book is the sum of the finished games')
const part = await loadSeasonBook({ season: 2026, fetchImpl: mkFetch({ failIds: ['g2'] }), fresh: true })
check(part.partial === true && part.missing === 1 && part.read === 1 && part.book.d1.games === 1, 'one box score failing: partial true, missing 1, and the book is what was read (never presented as whole)')
const cut = await loadSeasonBook({ season: 2026, fetchImpl: mkFetch(), fresh: true, deadlineMs: -1 })
check(cut.partial === true && cut.read === 0 && cut.missing === 2, 'a spent time budget stops reading and says so')
check(await loadSeasonBook({ season: 2026, fetchImpl: async () => ({ ok: false, json: async () => null }), fresh: true }) === null, 'the schedule failing -> null (the route answers 503), not an empty season')
check(!calls.some((u) => /scoreboard\?dates=\d+&seasontype=2$/.test(u)), 'the week is never read off a calendar-year scoreboard (in January it answers with the PREVIOUS season\u2019s week 18)')
const pre = await finishedGames({ season: null, fetchImpl: async (url) => ({ ok: true, json: async () => (/week=/.test(url) ? SB(1, [['g1', 'post']]) : SB(1, [], 1)) }) })
check(pre.events.length === 0 && pre.week === 0, 'preseason on the dateless scoreboard: no regular-season weeks to read')
const over = await finishedGames({ season: null, fetchImpl: async (url) => ({ ok: true, json: async () => (/week=/.test(url) ? SB(1, [['g' + url.slice(-2), 'post']]) : SB(1, [], 4)) }) })
check(over.week === 18 && over.events.length === 18, 'offseason: the whole 18-week regular season is read')
const future = await finishedGames({ season: 2027, fetchImpl: mkFetch() })
check(future.events.length === 0, 'a season that has not started has no finished games')
check(CONCURRENCY <= 8, 'at most 8 box scores in flight')
check((await finishedGames({ season: 2026, fetchImpl: mkFetch() })).events.length === 2, 'finishedGames lists only state "post"')
const fsrc = read('lib/nfl/defenseFeed.js')
check(/revalidate/.test(fsrc) && /86400/.test(fsrc) && !/setInterval|cron|setTimeout\(/.test(fsrc.replace(/\/\/.*$/gm, '')), 'a finished game is cached for a day (revalidate 86400); no timer, no cron')
check(!fs.existsSync(new URL('../.github', import.meta.url)) && !/api\/nfl\/defense/.test(read('vercel.json')), 'no cron entry and no workflow was added for this route')

// ── 7. THE ROUTE ────────────────────────────────────────────────────────────
const realFetch = globalThis.fetch
globalThis.fetch = mkFetch()
_clearMemo()
const call = async (qs) => { const r = await GET(new Request(`http://x/api/nfl/defense${qs}`)); return { status: r.status, cache: r.headers.get('cache-control'), body: await r.json() } }
const league = await call('?season=2026')
check(league.status === 200 && league.body.available && league.body.games === 2 && league.body.partial === false && league.body.players.q1.att === 55, 'the league call: turnover lines, games read, not partial')
check(/s-maxage=21600/.test(league.cache), 'a whole read is cached at the edge for 6 hours')
check(league.body.league && league.body.league.lostPer100 != null && league.body.team_games.T01 === 2, 'it carries the league rate the tags explain themselves against, and each club’s games')
const t1 = await call('?season=2026&team=t01')
check(t1.status === 200 && t1.body.players.d1 && !t1.body.players.d3 && t1.body.teams.join() === 'T01' && t1.body.team_games.T01 === 2, 'team=T01 (case-insensitive): that club’s defenders only')
check((await call('?season=2026&team=TOOLONG')).status === 400 && (await call('?season=1999')).status === 400 && (await call('?season=2026&team=T01;DROP')).status === 400, 'a bad team or season is a 400')
globalThis.fetch = mkFetch({ failIds: ['g2'] }); _clearMemo()
const p2 = await call('?season=2026')
check(p2.body.partial === true && p2.body.missing === 1 && /s-maxage=120/.test(p2.cache), 'a partial read is flagged and cached for two minutes only')
globalThis.fetch = async () => ({ ok: false, json: async () => null }); _clearMemo()
const down = await call('?season=2026')
check(down.status === 503 && down.body.available === false && down.cache === 'no-store', 'ESPN down: 503, available false, never cached')
globalThis.fetch = realFetch

// ── 8. EMPTY STATES AND PLACEMENT ───────────────────────────────────────────
const dt = read('components/nfl/DefenseTable.js')
check(/if \(!rows\.length \|\| !group\) return null/.test(dt), 'the table renders nothing when there are no defenders')
const sec = read('components/nfl/DefenseSections.js')
check(/neither TUDDY’s table nor ESPN box scores could be read/.test(sec) && /Loading/.test(sec) && /no finished game has a defensive line/.test(sec), 'the sections say loading / failed / nothing yet, in words')
check(/Snap counts are not published for defenders/.test(sec) && /Snap counts are not published for defenders/.test(dt), 'snaps are named as unavailable, not faked')
check(/sticky: true/.test(dt) && /FilterPill/.test(dt) && /group: COL_GROUP/.test(dt) && /group: WHO/.test(dt), 'first column sticky, columns carry groups, a pill per position group')
check(/season|this season/i.test(dt) && /games/.test(dt), 'the caption states the season and the games')
check(/Forced fumbles/.test(dt) && /TUDDY/.test(dt), 'forced fumbles are named as TUDDY’s number')
check(/DefenderFile/.test(read('components/nfl/NflPlayerModal.js')) && /isDefPosition/.test(read('components/nfl/NflPlayerModal.js')), 'a defender’s page shows the defense file')
check(!/\bwill\b/i.test(sec.replace(/\/\/.*$/gm, '').replace(/What he has done, not what he will do/i, '')), 'no "will" language in the defense sections (apart from the sentence that denies it)')
check(read('lib/nfl/dataSource.js').includes('nflMatchupExtraPaths') && read('lib/nfl/useDefense.js').includes('nflMatchupExtraPaths'), 'the bot’s defender table is read through dataSource.js, the one place that names the data branch')

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
