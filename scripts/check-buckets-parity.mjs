#!/usr/bin/env node
// BUCKETS (NBA) PARITY PASS, the rules it added (2026-10-12). TEST data only (every name says TEST); no network, no database, nothing posted.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-buckets-parity.mjs
// Holds:
//   1. the hidden moments: each rule, its tier, its call word (the stored label, never re-derived), nothing in the PUBLIC moment list, no banned word
//   2. nbaGameLines: graded regular-season rows -> one data row per player-game; preseason, void and ungraded rows never count; tens is exact or a lower bound
//   3. the Card for NBA: floors equal the model's own bars, the preview picks only PRICED CALLED players at a stored line that clears the bar, says `no priced picks`
//      when there are none, never invents a line, and NBA is NOT in CARD_SPORTS (nothing is locked or posted); the public card registry still answers false for it
//   4. NBA_ODDS_CAPTURE: off by default (no behaviour change), on adds NBA to the leagues the odds tick reads
//   5. lane nights: nothing is read or written while BUCKETS is hidden; with the switch on the shared record is called, preseason and started games left out
//   6. stamps for NBA: the new rules (season points milestone, 25+ streak, season-highs on the model's bars) and the log reader
import assert from 'node:assert/strict'

let n = 0
const ok = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`) }
delete process.env.BUCKETS_PUBLIC; delete process.env.NEXT_PUBLIC_BUCKETS_PUBLIC; delete process.env.NBA_ODDS_CAPTURE

const M = await import('../lib/cards/moments.js')
const CORE = await import('../lib/card/core.js')
const RULES = await import('../lib/card/rules.js')
const PREVIEW = await import('../lib/card/nbaPreview.js')
const REG = await import('../lib/cards/registry.js')
const SNAP = await import('../lib/odds/snap.js')
const LANES = await import('../lib/numerology/nbaTick.js')
const SIT = await import('../lib/cards/situations.js')
const SITD = await import('../lib/cards/situationData.js')
const MODEL = await import('../lib/nba/model.js')
const ADAPTER = await import('../lib/cards/adapters/nbaParts.js')
const SW = await import('../lib/openSwitch.js')

// ── 1 + 2. the moments ──
const row = (extra = {}) => ({ game_id: '401000001', player_id: '9001', day: '2026-11-20', name: 'TEST Player', team: 'LAL', opp: 'BOS', home: true, pts: 12, reb: 4, ast: 3, tpm: 1, tens: 1, status: { pts: 'called' }, ...extra })
await ok('the five hidden moments exist, marked hidden, and are NOT in the public moment list', () => {
  assert.deepEqual(M.NBA_MOMENT_KEYS, ['nba_30_points', 'nba_40_points', 'nba_double_double', 'nba_triple_double', 'nba_10_threes'])
  for (const k of M.NBA_MOMENT_KEYS) {
    const m = M.NBA_MOMENTS[k]
    assert.equal(m.sport, 'nba'); assert.equal(m.hidden, true)
    assert.ok(typeof m.trigger === 'function' && typeof m.tierOf === 'function' && typeof m.print === 'function' && typeof m.statusOf === 'function' && Array.isArray(m.needs) && m.needs.length)
    assert.ok(!M.MOMENT_KEYS.includes(k), `${k} must not be in the public list`)
    assert.ok(!Object.hasOwn(M.MOMENTS, k))
    assert.equal(M.isHiddenMoment(k), true)
    assert.equal(M.momentOf(k), m)
  }
  assert.equal(M.MOMENT_KEYS.length, 8, 'the public moments are unchanged')
  assert.equal(M.isHiddenMoment('nhl_goal'), false)
})
await ok('30-point game: 30 to 39 is STAR, 40+ has its own card (no duplicate), under 30 is nothing, a missing number is nothing', () => {
  const t = (k, r) => Boolean(M.NBA_MOMENTS[k].trigger(r))
  assert.equal(t('nba_30_points', row({ pts: 29 })), false)
  assert.equal(t('nba_30_points', row({ pts: 30 })), true)
  assert.equal(t('nba_30_points', row({ pts: 39 })), true)
  assert.equal(t('nba_30_points', row({ pts: 40 })), false)
  assert.equal(t('nba_30_points', row({ pts: null })), false)
  assert.equal(M.evaluate('nba_30_points', row({ pts: 33 })).tier, 'star')
})
await ok('40-point game: ELITE, 50+ LEGEND; holo from ELITE up', () => {
  assert.equal(M.evaluate('nba_40_points', row({ pts: 39 })), null)
  const e = M.evaluate('nba_40_points', row({ pts: 41 })); assert.equal(e.tier, 'elite'); assert.equal(e.holo, true); assert.match(e.print.kicker, /40-POINT/)
  const l = M.evaluate('nba_40_points', row({ pts: 52 })); assert.equal(l.tier, 'legend'); assert.match(l.print.kicker, /50-POINT/)
})
await ok('double-double is BASE and exactly two tens; a triple-double has its own ELITE card; one ten is nothing', () => {
  assert.equal(M.evaluate('nba_double_double', row({ tens: 1 })), null)
  assert.equal(M.evaluate('nba_double_double', row({ tens: 2, pts: 20, reb: 11, ast: 4 })).tier, 'base')
  assert.equal(M.evaluate('nba_double_double', row({ tens: 3 })), null)
  assert.equal(M.evaluate('nba_double_double', row({ tens: null })), null)
  const t = M.evaluate('nba_triple_double', row({ tens: 3, pts: 18, reb: 12, ast: 10 }))
  assert.equal(t.tier, 'elite'); assert.equal(t.print.hero.value, '18-12-10')
  assert.equal(M.evaluate('nba_triple_double', row({ tens: 2 })), null)
})
await ok('10 threes: ELITE, 12+ LEGEND, 9 is nothing', () => {
  assert.equal(M.evaluate('nba_10_threes', row({ tpm: 9 })), null)
  assert.equal(M.evaluate('nba_10_threes', row({ tpm: 10 })).tier, 'elite')
  assert.equal(M.evaluate('nba_10_threes', row({ tpm: 13 })).tier, 'legend')
})
await ok('the call word is the stored label of THAT market\'s row; a not-called or never-locked man carries none', () => {
  assert.equal(M.evaluate('nba_30_points', row({ pts: 31, status: { pts: 'called' } })).status, 'called')
  assert.equal(M.evaluate('nba_30_points', row({ pts: 31, status: { pts: 'board' } })).status, 'board')
  assert.equal(M.evaluate('nba_30_points', row({ pts: 31, status: { pts: 'off' } })).status, null)
  assert.equal(M.evaluate('nba_30_points', row({ pts: 31, status: {} })).status, null)
  assert.equal(M.evaluate('nba_30_points', row({ pts: 31, status: { '3pm': 'called' } })).status, null, 'a called 3PM row is not a called points row')
  assert.equal(M.evaluate('nba_10_threes', row({ tpm: 10, status: { '3pm': 'called' } })).status, 'called')
  assert.equal(M.evaluate('nba_triple_double', row({ tens: 3, status: { td: 'called' } })).status, 'called')
})
await ok('no card prints a probability, a lock, a due or a guarantee', () => {
  const banned = SIT.BANNED
  for (const [k, r] of [['nba_30_points', row({ pts: 31 })], ['nba_40_points', row({ pts: 44 })], ['nba_double_double', row({ tens: 2 })], ['nba_triple_double', row({ tens: 3 })], ['nba_10_threes', row({ tpm: 11 })]]) {
    const p = M.evaluate(k, r).print
    const text = JSON.stringify(p)
    assert.ok(!banned.test(text), `${k}: ${text}`)
    assert.ok(!/%|probab|chance|guarantee/i.test(text), `${k}: ${text}`)
  }
})
const L = (o) => ({ game_id: '401000009', player_id: '77', game_date: '2026-11-21', team: 'DEN', opp: 'PHX', home: false, name: 'TEST Joker', status: 'called', actual: 0, hit: true, void_reason: null, graded_at: '2026-11-22T05:00:00Z', season_type: 2, ...o })
await ok('nbaGameLines: markets fold into one row; tens is exact from the dd / td row, else counted from the three he has; preseason, void and ungraded never count', () => {
  const rows = [L({ market: 'pts', actual: 28 }), L({ market: 'reb', actual: 14 }), L({ market: 'ast', actual: 11, status: 'board' }), L({ market: '3pm', actual: 2 }), L({ market: 'td', actual: 3 })]
  const m = M.nbaGameLines(rows).get('401000009:77')
  assert.deepEqual([m.pts, m.reb, m.ast, m.tpm, m.tens], [28, 14, 11, 2, 3])
  assert.equal(m.status.pts, 'called'); assert.equal(m.status.ast, 'board'); assert.equal(m.status.td, 'called')
  assert.equal(M.evaluate('nba_triple_double', m).tier, 'elite')
  // no dd / td row: counted from points, rebounds, assists (a lower bound)
  const lb = M.nbaGameLines([L({ market: 'pts', actual: 20 }), L({ market: 'reb', actual: 12 }), L({ market: 'ast', actual: 6 })]).get('401000009:77')
  assert.equal(lb.tens, 2); assert.equal(M.evaluate('nba_double_double', lb).tier, 'base')
  const one = M.nbaGameLines([L({ market: 'pts', actual: 20 }), L({ market: 'reb', actual: 8 }), L({ market: 'ast', actual: 6 })]).get('401000009:77')
  assert.equal(one.tens, 1); assert.equal(M.evaluate('nba_double_double', one), null)
  const dd = M.nbaGameLines([L({ market: 'pts', actual: 20 }), L({ market: 'reb', actual: 12 }), L({ market: 'ast', actual: 10 })]).get('401000009:77')
  assert.equal(dd.tens, 3, 'three of the three he has is a triple-double on the box itself')
  assert.equal(M.nbaGameLines([L({ market: 'pts', actual: 35, season_type: 1 })]).size, 0, 'preseason')
  assert.equal(M.nbaGameLines([L({ market: 'pts', actual: 35, void_reason: 'did not play' })]).size, 0, 'void')
  assert.equal(M.nbaGameLines([L({ market: 'pts', actual: null, hit: null })]).size, 0, 'ungraded')
  assert.equal(M.nbaGameLines([L({ market: 'pts', actual: 35, graded_at: null })]).size, 0, 'not graded')
  // a tens count read from the exact row is never LOWERED by the three-way count
  assert.equal(M.nbaGameLines([L({ market: 'dd', actual: 2 }), L({ market: 'pts', actual: 22 }), L({ market: 'reb', actual: 12 })]).get('401000009:77').tens, 2)
})

// ── 3. the Card ──
await ok('the NBA floors ARE the model\'s own bars (no new number); the Card map has the five markets and three slots', () => {
  for (const [k, def] of Object.entries(MODEL.NBA_MARKETS)) if (RULES.MIN_BAR.nba[k] != null) assert.equal(RULES.MIN_BAR.nba[k], def.bar, k)
  assert.deepEqual(Object.keys(RULES.MIN_BAR.nba).sort(), ['3pm', 'ast', 'pra', 'pts', 'reb'])
  assert.deepEqual(Object.keys(CORE.MARKETS.nba).sort(), ['3pm', 'ast', 'pra', 'pts', 'reb'])
  for (const [k, def] of Object.entries(CORE.MARKETS.nba)) assert.ok(['pts', 'reb', 'ast', '3pm', 'pra'].includes(def.lineMarket) && k === def.lineMarket)
  assert.equal(CORE.SLOTS.nba.length, 3)
  assert.equal(CORE.CARD_WORDS.nba.brand, 'BUCKETS', 'CARD_WORDS is how the posters ask "is this a Card sport": BUCKETS is one since 2026-10-20')
  assert.equal(CORE.PREVIEW_CARD_WORDS.nba, undefined)
})
await ok('NBA IS a locking Card sport (2026-10-20, Donovan "turn it on"): in CARD_SPORTS, no longer a preview; the public card registry has cards for it', () => {
  assert.ok(CORE.CARD_SPORTS.includes('nba'))
  assert.deepEqual(CORE.PREVIEW_CARD_SPORTS, [])
  assert.equal(REG.hasCards('nba'), true)
  assert.equal(REG.hasPreviewCards('nba'), false)
  assert.ok(REG.cardSports().includes('nba'))
})
const NOW = Date.parse('2026-11-21T22:00:00Z')
const cand = (id, game, score, extra = {}) => ({ status: 'called', player_id: id, name: `TEST ${id}`, team: 'AAA', opp: 'BBB', pos: 'G', game_id: game, game_date: '2026-11-21', start_ms: NOW + 3600e3, score, rate: null, role: 'TOP', why: 'test', ...extra })
const priced = (c, line, median) => ({ ...c, line, price: { median, best: median, books: 4, taken_at: '2026-11-21T20:00:00Z' } })
await ok('the preview: no stored line and price = `no priced picks`, no pick, nothing invented', () => {
  const p = PREVIEW.planNbaPreview({ byMarket: { pts: { cands: [cand('1', 'g1', 90), cand('2', 'g2', 80)], board: [90, 80] }, reb: { cands: [], board: [] }, ast: { cands: [], board: [] }, '3pm': { cands: [], board: [] }, pra: { cands: [], board: [] } }, games: 2, now: NOW })
  assert.equal(p.picks.length, 0); assert.match(p.message, /No priced picks/); assert.equal(p.priced, 0); assert.equal(p.called, 2)
})
await ok('the preview: a called player with a stored line that clears the bar and a +120 price is a pick; a short price or a low line is tracked, not carded; one pick per game', () => {
  const bm = {
    pts: { cands: [priced(cand('1', 'g1', 95), 27.5, 150), priced(cand('2', 'g1', 90), 29.5, 200), priced(cand('3', 'g2', 85), 23.5, 110), priced(cand('4', 'g3', 80), 14.5, 300)], board: [95, 90, 85, 80] },
    reb: { cands: [priced(cand('5', 'g2', 88), 11.5, 130)], board: [88] }, ast: { cands: [], board: [] }, '3pm': { cands: [], board: [] }, pra: { cands: [], board: [] },
  }
  const p = PREVIEW.planNbaPreview({ byMarket: bm, games: 3, now: NOW })
  // 3 games: 2 straights. Slot 1 = points: the best-scored that clears (player 1 at 27.5, +150). Slot 2 = rebounds over: player 5 (game g2).
  assert.equal(p.picks.length, 2)
  assert.deepEqual(p.picks.map((x) => [x.slot, x.market, x.player_id, x.line, x.price]), [[1, 'pts', '1', 27.5, 150], [2, 'reb', '5', 11.5, 130]])
  assert.ok(new Set(p.picks.map((x) => x.game_id)).size === p.picks.length, 'one per game')
  assert.equal(p.message, null)
  // the pre-floor rule's pick that fails a floor is tracked with its reason
  const t = PREVIEW.planNbaPreview({ byMarket: { ...bm, pts: { cands: [priced(cand('3', 'g2', 85), 23.5, 110)], board: [85] } }, games: 3, now: NOW })
  assert.ok(t.tracked.some((x) => x.player_id === '3' && x.reason_code === 'line'), JSON.stringify(t.tracked))
  const short = PREVIEW.planNbaPreview({ byMarket: { ...bm, pts: { cands: [priced(cand('9', 'g9', 99), 30.5, -150)], board: [99] } }, games: 3, now: NOW })
  assert.ok(short.tracked.some((x) => x.player_id === '9' && x.reason_code === 'price'))
  assert.ok(!short.picks.some((x) => x.player_id === '9'))
})
await ok('the preview: a game that has started is not eligible; no games is said plainly', () => {
  const late = PREVIEW.planNbaPreview({ byMarket: { pts: { cands: [priced(cand('1', 'g1', 95, { start_ms: NOW - 1000 }), 27.5, 150)], board: [95] } }, games: 1, now: NOW })
  assert.equal(late.picks.length, 0)
  const none = PREVIEW.planNbaPreview({ byMarket: {}, games: 0, now: NOW })
  assert.match(none.message, /No regular-season game/)
})
await ok('the preview words come from the same config (floors in words)', () => {
  const r = PREVIEW.previewRules()
  assert.match(r.lineFloors, /points 25\+/); assert.match(r.lineFloors, /PRA 35\+/); assert.match(r.note, /Nothing is locked/)
})
await ok('the adapter: best row = a CALLED row first, then the higher score; tiles carry the market\'s legs with their percentile', () => {
  const markets = { pts: [{ playerId: '5', score: 60, status: 'board', legs: { ok: true, ptsPg: 22 } }], reb: [{ playerId: '5', score: 40, status: 'called', legs: { ok: true, rebPg: 11 } }], ast: [{ playerId: '6', score: 99, status: 'called' }] }
  const b = ADAPTER.bestRow(markets, '5')
  assert.equal(b.market, 'reb'); assert.equal(ADAPTER.bestRow(markets, '404'), null)
  const t = ADAPTER.statsOf('pts', { legs: { ok: true, ptsPg: 22.4, minPg: 34, fgaPg: 17 }, pct: { ptsPg: 91.2, minPg: 80 } })
  assert.ok(t.some((x) => x.label === 'PTS/G' && x.value === '22.4' && x.pct === 91))
  const back = ADAPTER.backFromLines({ lines: [{ season: '2025-26', line: { gp: 70, min: 33.1, pts: 24.2, reb: 5.1, ast: 4.4, tpm: 2.2, fga: 17.4 } }, { season: '2026-27', line: null }], bio: [['TEAM', 'LAL']] })
  assert.equal(back.rows.length, 1); assert.equal(back.rows[0].pts, '24.2'); assert.ok(back.cols.length >= 6)
})

// ── 4. NBA_ODDS_CAPTURE ──
await ok('NBA_ODDS_CAPTURE: off by default (no NBA league), on adds it; the public switch still adds it; the other three never change', () => {
  assert.equal(SNAP.nbaOddsCapture(), false)
  assert.ok(!SNAP.activeLeagues(false, SNAP.nbaOddsCapture()).includes('NBA'))
  assert.deepEqual(SNAP.activeLeagues(false), ['NFL', 'MLB', 'NHL'])
  process.env.NBA_ODDS_CAPTURE = 'on'
  assert.equal(SNAP.nbaOddsCapture(), true)
  assert.ok(SNAP.activeLeagues(false, SNAP.nbaOddsCapture()).includes('NBA'))
  process.env.NBA_ODDS_CAPTURE = 'yes'; assert.equal(SNAP.nbaOddsCapture(), false, 'only the word on')
  delete process.env.NBA_ODDS_CAPTURE
  assert.ok(SNAP.activeLeagues(true).includes('NBA'))
})

// ── 5. lane nights ──
const GAMES = [
  { id: 'g1', seasonType: 2, state: 'pre', start: '2026-11-21T23:30:00Z', away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' } },
  { id: 'g2', seasonType: 1, state: 'pre', start: '2026-11-21T23:30:00Z', away: { abbrev: 'CCC' }, home: { abbrev: 'DDD' } },
  { id: 'g3', seasonType: 2, state: 'in', start: '2026-11-21T20:00:00Z', away: { abbrev: 'EEE' }, home: { abbrev: 'FFF' } },
]
await ok('lane nights: games to record = regular season / playoffs, still ahead; preseason and started games are out', () => {
  assert.deepEqual(LANES.lanesGames(GAMES, NOW).map((g) => g.id), ['g1'])
})
await ok('lane nights: hidden = nothing read, nothing written (the reader and the writer are never called)', async () => {
  let touched = 0
  const r = await LANES.recordNbaLanes({}, { date: '2026-11-21', games: GAMES, now: NOW, read: async () => { touched += 1; return { all: [] } }, write: async () => { touched += 1; return {} } })
  assert.deepEqual(r, { skipped: 'hidden' }); assert.equal(touched, 0)
  const g = await LANES.gradeNbaLanes({ from() { touched += 1; return null } }, { game: GAMES[0], day: '2026-11-21', box: [] })
  assert.deepEqual(g, { skipped: 'hidden' }); assert.equal(touched, 0)
  assert.equal(SW.bucketsOpen(), false)
})
await ok('lane nights: open = the roster players of the game still ahead are written (not a started game\'s, not box-listed ones); preseason is not graded', async () => {
  const seen = []
  const read = async () => ({ all: [
    { id: '1', name: 'TEST A', jersey: 23, birthDate: '2000-01-02', team: 'AAA', opp: 'BBB', gameId: 'g1', from: 'roster' },
    { id: '2', name: 'TEST B', jersey: 7, birthDate: '1999-05-05', team: 'EEE', opp: 'FFF', gameId: 'g3', from: 'box' },
    { id: '3', name: 'TEST C', jersey: 9, birthDate: '1998-03-03', team: 'CCC', opp: 'DDD', gameId: 'g2', from: 'roster' },
    { id: '4', name: 'TEST D', jersey: 1, birthDate: '1997-04-04', team: 'BBB', opp: 'AAA', gameId: 'g1', from: 'box' },
  ] })
  const r = await LANES.recordNbaLanes({}, { date: '2026-11-21', games: GAMES, now: NOW, read, open: () => true, write: async (db, sport, day, players) => { seen.push({ sport, day, ids: players.map((p) => p.player_id) }); return { players: players.length, rows: players.length * 3 } } })
  assert.deepEqual(seen, [{ sport: 'nba', day: '2026-11-21', ids: ['1'] }]); assert.equal(r.players, 1)
  const pre = await LANES.gradeNbaLanes({}, { game: GAMES[1], day: '2026-11-21', box: [], open: () => true })
  assert.match(pre.skipped, /preseason/)
  const calls = []
  const db = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ in: () => ({ is: async () => ({ data: [{ player_id: '1' }, { player_id: '8' }] }) }) }) }) }) }) }) }
  const g = await LANES.gradeNbaLanes(db, { game: GAMES[0], day: '2026-11-21', box: [{ id: '1', dnp: false, pts: 30 }], open: () => true, grade: async (d, sport, day, results) => { calls.push([sport, day, [...results.entries()]]); return 2 }, refresh: async () => 1 })
  assert.equal(g.graded, 2)
  assert.deepEqual(calls[0][2], [['1', { played: true, hit: true }], ['8', { played: false, hit: false }]], 'a logged man with no box line did not play: void, never a miss')
})

// ── 6. stamps ──
await ok('stamps: a season-points milestone is a real total within 10 of a mark, fresh, never stale', () => {
  const s = SIT.stampsFor({ sport: 'nba', day: '2026-11-21', phase: 'pre', totals: { stat: 'pts', before: 992, asOf: '2026-11-20' } })
  assert.equal(s[0]?.key, 'milestone'); assert.equal(s[0].text, '8 points from 1,000')
  assert.equal(SIT.stampsFor({ sport: 'nba', day: '2026-11-21', phase: 'pre', totals: { stat: 'pts', before: 980, asOf: '2026-11-20' } }).length, 0, '20 short is too far')
  assert.equal(SIT.stampsFor({ sport: 'nba', day: '2026-11-21', phase: 'pre', totals: { stat: 'pts', before: 995, asOf: '2026-11-20', stale: true } }).length, 0)
})
const G = (day, pts, extra = {}) => ({ day, pts, reb: 5, ast: 4, tpm: 2, pts25: pts == null ? null : pts >= 25 ? 1 : 0, ...extra })
await ok('stamps: a 25+ point streak counts games with 25 or more, from three; a season-high needs ten earlier games and the market\'s bar', () => {
  const log = [G('2026-11-21', 31), G('2026-11-19', 27), G('2026-11-17', 25), G('2026-11-15', 12), G('2026-11-13', 30)]
  const st = SIT.stampsFor({ sport: 'nba', day: '2026-11-21', phase: 'post', log })
  assert.ok(st.some((x) => x.key === 'streak' && x.text === '25+ points in 3 straight'), JSON.stringify(st))
  const prior = Array.from({ length: 10 }, (_, i) => G(`2026-11-${String(10 - i).padStart(2, '0')}`, 20 + (i % 4)))
  const high = SIT.stampsFor({ sport: 'nba', day: '2026-11-21', phase: 'post', log: [G('2026-11-21', 38), ...prior] })
  assert.ok(high.some((x) => x.key === 'high' && /Season-high 38 points/.test(x.text)), JSON.stringify(high))
  const few = SIT.stampsFor({ sport: 'nba', day: '2026-11-21', phase: 'post', log: [G('2026-11-21', 38), ...prior.slice(0, 5)] })
  assert.ok(!few.some((x) => x.key === 'high'), 'five earlier games is too few')
  const under = SIT.stampsFor({ sport: 'nba', day: '2026-11-21', phase: 'post', log: [G('2026-11-21', 24), ...prior.map((g) => ({ ...g, pts: 10 }))] })
  assert.ok(!under.some((x) => x.key === 'high'), 'under the 25-point bar is not a stamp')
  const pre = SIT.stampsFor({ sport: 'nba', day: '2026-11-21', phase: 'pre', log: [G('2026-11-19', 27), G('2026-11-17', 26), G('2026-11-15', 28)] })
  assert.ok(pre.some((x) => x.key === 'streak' && /coming|25\+ points in 3 straight/.test(x.text)))
})
await ok('stamps: the ESPN log reader keeps regular-season games only, newest first, with the 25-point flag; the playoff round loses the game number', () => {
  const raw = [
    { seasonType: 2, date: '2026-11-19T01:00:00Z', pts: 26, reb: 7, ast: 5, tpm: 3 }, { seasonType: 1, date: '2026-10-10T01:00:00Z', pts: 30 },
    { seasonType: 2, date: '2026-11-21T01:00:00Z', pts: 24, reb: 4, ast: 2, tpm: 1 },
  ]
  const log = SITD.nbaLogOf(raw)
  assert.equal(log.length, 2); assert.equal(log[0].day, '2026-11-20'); assert.equal(log[0].pts25, 0); assert.equal(log[1].day, '2026-11-18'); assert.equal(log[1].pts25, 1)
  assert.equal(SITD.nbaRoundOf('East 1st Round - Game 3'), 'East 1st Round'); assert.equal(SITD.nbaRoundOf(''), '')
  assert.equal(SITD.nbaSeasonOf('2026-11-21'), 2027); assert.equal(SITD.nbaSeasonOf('2027-04-02'), 2027)
  assert.equal(SIT.stampsFor({ sport: 'nba', day: '2027-04-20', postseason: { type: 'P', roundName: 'East 1st Round' } })[0].text, 'East 1st Round')
})

console.log(`\n${n} checks passed`)
