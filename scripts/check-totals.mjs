#!/usr/bin/env node
// TOP TOTALS (lib/totals). Every input is TEST data (clubs AAA..ZZZ, made-up numbers), nothing real.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-totals.mjs
// Covers: lock-before-start, top-3 selection, grading, no rewrite (a fake table that holds the migration's rules),
// the status words, the post (no link, no player, fits), the post kind's tag, the migration's guards.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { lineWord, lineFor, recordBySource, BOOK_LINE_SPORTS, rankField, lockRows, lockWindowOpen, gradeRow, tally, recordOf, totalsPostText, mayLockRow, TOTALS_VERSION, TOTALS_SPORTS, TOTALS_UNITS, LOCK_LEAD_MIN } from '../lib/totals/core.js'
import { totalsCallStatus, TOTALS_CALLS } from '../lib/callStatus.js'
import { lockSlate, gradeRows } from '../lib/totals/store.js'
import { gameTotalRow, bookTotalsFor, bookTeamKey } from '../lib/odds/gameTotal.js'
import { KIND_TAGS, tagOf, untagged, kindInfo, mayPostNow } from '../lib/dash/xSchedule.js'
import { sportOfKind, tierOf } from '../lib/dash/xPolicy.js'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const H = 3600e3
const NOW = Date.parse('2026-10-10T16:00:00Z')
// six TEST games: id, start offset from NOW (ms), projected total
const G = (id, startH, projected, extra = {}) => ({ game_id: id, game_date: '2026-10-10', start_ms: NOW + startH * H, away: `A${id}`, home: `H${id}`, projected, ...extra })
const FIELD = [G('g1', 2, 5.2), G('g2', 3, 7.9), G('g3', 2, 7.9), G('g4', 4, 6.4), G('g5', 5, 8.8), G('g6', 6, 4.1)]

await t('top-3 selection: highest projection first, a tie goes to the earlier start, then the id', () => {
  const r = rankField(FIELD)
  assert.deepEqual(r.map((g) => g.game_id), ['g5', 'g3', 'g2', 'g4', 'g1', 'g6'])   // g3 and g2 tie at 7.9; g3 starts earlier
  assert.deepEqual(r.map((g) => g.rank), [1, 2, 3, 4, 5, 6])
  // the feed's order does not matter
  assert.deepEqual(rankField([...FIELD].reverse()).map((g) => g.game_id), r.map((g) => g.game_id))
})

await t('a game with no projection or no start is left out, never given a made-up number', () => {
  const r = rankField([...FIELD, G('x1', 1, null), G('x2', 1, NaN), G('x3', 1, undefined), { ...G('x4', 1, 9), start_ms: NaN }])
  assert.equal(r.length, 6)
})

await t('the lock: three CALLED of a field with more than three games, the rest not called; the line is the projection', () => {
  const rows = lockRows({ sport: 'mlb', slate_key: '2026-10-10', games: FIELD, now: NOW })
  assert.equal(rows.length, 6)
  assert.deepEqual(rows.filter((r) => r.called).map((r) => r.game_id).sort(), ['g2', 'g3', 'g5'])
  for (const r of rows) {
    assert.equal(r.line, r.projected_total); assert.equal(r.line_source, 'projection'); assert.equal(r.model_version, TOTALS_VERSION)
    assert.equal(r.field_size, 6); assert.ok(Date.parse(r.locked_at) < Date.parse(r.start_at), 'locked before the start')
  }
  assert.equal(TOTALS_CALLS, 3)
})

await t('a slate of three games or fewer calls nothing (nothing to pick between)', () => {
  const rows = lockRows({ sport: 'nhl', slate_key: 'k', games: FIELD.slice(0, 3), now: NOW })
  assert.equal(rows.length, 3); assert.equal(rows.filter((r) => r.called).length, 0)
  assert.equal(rows.every((r) => totalsCallStatus(r) !== 'called'), true)
})

await t('lock-before-start: a game that has started (at or after its start) is never in the lock', () => {
  const rows = lockRows({ sport: 'mlb', slate_key: 'k', games: FIELD, now: NOW + 2 * H })      // g1 and g3 start exactly now
  assert.deepEqual(rows.map((r) => r.game_id).sort(), ['g2', 'g4', 'g5', 'g6'])
  assert.equal(lockRows({ sport: 'mlb', slate_key: 'k', games: FIELD, now: NOW + 7 * H }).length, 0)
  assert.equal(mayLockRow({ start_at: new Date(NOW).toISOString() }, NOW), false)
  assert.equal(mayLockRow({ start_at: new Date(NOW + 1).toISOString() }, NOW), true)
  // the field is the games still to come: a started favourite is not ranked against
  assert.equal(rows.find((r) => r.game_id === 'g5').rank, 1)
})

await t('the lock window opens LOCK_LEAD_MIN before the slate\'s first game, not before', () => {
  assert.equal(LOCK_LEAD_MIN, 90)
  assert.equal(lockWindowOpen(FIELD, NOW + 2 * H - 91 * 60e3 - 1), false)
  assert.equal(lockWindowOpen(FIELD, NOW + 2 * H - 90 * 60e3), true)
  assert.equal(lockWindowOpen([], NOW), false)
})

await t('grading: over / under / push / void; hit only on OVER; a line of 7.9 vs 8 is over, vs 7.9 a push', () => {
  const row = { line: 7.9 }
  assert.deepEqual(gradeRow(row, 8), { actual_total: 8, result: 'over', hit: true })
  assert.deepEqual(gradeRow(row, 7), { actual_total: 7, result: 'under', hit: false })
  assert.deepEqual(gradeRow(row, 7.9), { actual_total: 7.9, result: 'push', hit: null })
  assert.deepEqual(gradeRow(row, 'void'), { actual_total: null, result: 'void', hit: null })
  assert.equal(gradeRow(row, null), null); assert.equal(gradeRow(row, undefined), null); assert.equal(gradeRow(row, 'abc'), null)
  assert.equal(gradeRow({ line: null }, 3), null)
})

await t('the record: hits / (hits + misses); pushes and voids do not count either way; CALLED and ON THE BOARD are separate', () => {
  // a field of 12: the board cut is the top third (4), so ranks 4 is ON THE BOARD and 5.. are NOT
  const big = [...FIELD, G('g7', 7, 3.0), G('g8', 8, 3.1), G('g9', 9, 3.2), G('g10', 10, 3.3), G('g11', 11, 3.4), G('g12', 12, 3.5)]
  const rows = lockRows({ sport: 'nba', slate_key: 'k', games: big, now: NOW }).map((r) => ({ ...r, ...(r.game_id === 'g5' ? gradeRow(r, 9) : r.game_id === 'g3' ? gradeRow(r, 3) : r.game_id === 'g2' ? gradeRow(r, r.line) : r.game_id === 'g4' ? gradeRow(r, 6) : {}) }))
  const rec = recordOf(rows)
  assert.equal(rec.called.n, 3); assert.equal(rec.called.hits, 1); assert.equal(rec.called.misses, 1); assert.equal(rec.called.pushes, 1); assert.equal(rec.called.pct, 0.5)
  assert.equal(rec.board.n, 1); assert.equal(rec.board.misses, 1)       // g4, rank 4, graded UNDER
  assert.equal(rec.off.n, 8)
  assert.equal(tally([]).pct, null)
})

await t('status words: CALLED = the stored call; ON THE BOARD = the top third; the rest NOT ON THE BOARD', () => {
  const rows = lockRows({ sport: 'mlb', slate_key: 'k', games: [...FIELD, G('g7', 7, 3.0), G('g8', 8, 3.1), G('g9', 9, 3.2)], now: NOW })
  const by = Object.fromEntries(rows.map((r) => [r.game_id, totalsCallStatus(r)]))
  assert.equal(rows.length, 9)
  assert.equal(by.g5, 'called'); assert.equal(by.g3, 'called'); assert.equal(by.g2, 'called')
  assert.equal(by.g1, 'off'); assert.equal(by.g9, 'off')
})

// ── a fake table that holds the migration's rules, so "no rewrite" is tested on the real store functions ──
function fakeDb({ clock, books = null }) {
  const rows = []
  const key = (r) => `${r.sport}|${r.game_id}|${r.model_version}`
  const chain = (list, tail) => ({
    _l: list,
    in(k, v) { this._l = this._l.filter((r) => v.includes(r[k])); return this },
    eq(k, v) { this._l = this._l.filter((r) => r[k] === v); return this },
    gte(k, v) { this._l = this._l.filter((r) => r[k] >= v); return this },
    lt(k, v) { this._l = this._l.filter((r) => (typeof v === 'string' && /^\d{4}-/.test(v) ? Date.parse(r[k]) < Date.parse(v) : r[k] < v)); return this },
    is(k, v) { this._l = this._l.filter((r) => (v === null ? r[k] == null : r[k] === v)); return this },
    match(o) { this._l = this._l.filter((r) => Object.entries(o).every(([k, v]) => r[k] === v)); return this },
    order() { return this }, limit() { return this },
    select() { return tail ? tail(this._l) : this },
    then(res) { return Promise.resolve({ data: this._l, error: null }).then(res) },
  })
  return {
    rows,
    from(table) {
      if (table === 'odds_game_totals') return { select: () => chain(books ? books.slice() : []) }
      return {
        select: () => chain(rows.slice()),
        upsert(batch, opts) {
          let n = 0
          for (const r of batch) {
            if (Date.parse(r.start_at) <= clock()) return Promise.resolve({ error: { message: 'locked at or after the start' } })   // the insert trigger
            if (rows.some((x) => key(x) === key(r))) { if (opts?.ignoreDuplicates) continue; return Promise.resolve({ error: { message: 'dup' } }) }
            rows.push({ result: null, actual_total: null, hit: null, ...r }); n += 1
          }
          return Promise.resolve({ error: null, n })
        },
        update(patch) {
          const c = chain(rows.slice())
          const run = (list) => {
            for (const r of list) {
              if (r.result != null) throw new Error('a graded call is never regraded')   // the update trigger
              Object.assign(rows.find((x) => key(x) === key(r)), patch)
            }
            return Promise.resolve({ data: list.map((r) => ({ game_id: r.game_id })), error: null })
          }
          c.select = () => run(c._l)
          return c
        },
      }
    },
  }
}

await t('no rewrite: a second lock pass with different numbers writes nothing; the stored rows are unchanged', async () => {
  let clock = NOW
  const db = fakeDb({ clock: () => clock })
  const slate = { ok: true, slate_key: '2026-10-10', day: '2026-10-10', games: FIELD }
  assert.match(await lockSlate(db, 'mlb', slate, { now: NOW + 1 * H }), /^locked 6 \(3 called\)/)
  const before = JSON.stringify(db.rows)
  const moved = { ...slate, games: FIELD.map((g, i) => ({ ...g, projected: g.projected + (i % 2 ? 4 : -3) })) }
  assert.equal(await lockSlate(db, 'mlb', moved, { now: NOW + 1.5 * H }), 'already-locked')
  assert.equal(JSON.stringify(db.rows), before)
})

await t('lock-before-start in the store: nothing is written before the window opens or once every game has started', async () => {
  const db = fakeDb({ clock: () => NOW })
  const slate = { ok: true, slate_key: 'k', day: 'k', games: FIELD }
  assert.equal(await lockSlate(db, 'mlb', slate, { now: NOW - 10 * H }), 'window-not-open')
  assert.equal(await lockSlate(db, 'mlb', slate, { now: NOW + 7 * H }), 'nothing-before-start')
  assert.equal(db.rows.length, 0)
  assert.match(await lockSlate(db, 'mlb', { ok: false, why: 'x', games: [] }, { now: NOW }), /^no-slate/)
})

await t('grading writes once: the first final sticks, a later feed value cannot change it', async () => {
  const db = fakeDb({ clock: () => NOW })
  await lockSlate(db, 'nhl', { ok: true, slate_key: 'k', day: 'k', games: FIELD }, { now: NOW + 1 * H })
  const open = db.rows.filter((r) => r.result == null).map((r) => ({ ...r }))
  const finals = new Map([['g5', 9], ['g3', 'void']])
  assert.equal(await gradeRows(db, open, finals, NOW + 9 * H), 2)
  const g5 = db.rows.find((r) => r.game_id === 'g5')
  assert.equal(g5.result, 'over'); assert.equal(g5.hit, true); assert.equal(g5.actual_total, 9)
  assert.equal(db.rows.find((r) => r.game_id === 'g3').result, 'void')
  // the same rows offered again with another number: the update is guarded on result is null, and the table refuses
  await gradeRows(db, db.rows.filter((r) => r.game_id === 'g5').map((r) => ({ ...r, result: null })), new Map([['g5', 0]]), NOW + 10 * H).catch(() => {})
  assert.equal(db.rows.find((r) => r.game_id === 'g5').actual_total, 9)
  // a game not final yet (absent from the feed) is not graded
  assert.equal(await gradeRows(db, open.filter((r) => r.game_id === 'g1'), new Map(), NOW), 0)
})

await t('the post: three calls, no link, no hashtag, no player, fits 280; fewer than three calls = no post', () => {
  for (const sport of TOTALS_SPORTS) {
    const rows = lockRows({ sport, slate_key: 'k', games: FIELD, now: NOW })
    const text = totalsPostText({ sport, day: '2026-10-10', rows })
    assert.ok(text, `${sport} text`)
    assert.ok(!/https?:|www\.|\.com|#|@\w/.test(text.replace(/ @ /g, ' at ')), 'no link, no hashtag')
    assert.ok([...text].length + 4 <= 280, `${sport} fits`)
    assert.ok(text.includes(TOTALS_UNITS[sport].unit))
    assert.equal((text.match(/^\d\. /gm) || []).length, 3)
    assert.ok(!/bucket|moonshot|tuddy|lamp/i.test(text), 'no product pointer')
  }
  const few = lockRows({ sport: 'mlb', slate_key: 'k', games: FIELD.slice(0, 3), now: NOW })
  assert.equal(totalsPostText({ sport: 'mlb', day: '2026-10-10', rows: few }), '')
})

await t('the post kinds are tagged INFO, known to the scheduler, each in its own sport, and none is untagged', async () => {
  const { TOTALS_KIND } = await import('../lib/totals/post.js')
  assert.deepEqual(Object.keys(TOTALS_KIND).sort(), [...TOTALS_SPORTS].sort())
  assert.deepEqual(untagged(), [])
  for (const sport of TOTALS_SPORTS) {
    const k = TOTALS_KIND[sport]
    assert.equal(tagOf(k), 'INFO', k)
    assert.equal(kindInfo(k).mode, 'event')
    assert.equal(sportOfKind(k), sport, `${k} is read as ${sport} by the NFL 7-day window`)
    assert.equal(tierOf(k), 'writeup')
    assert.equal(mayPostNow({ kind: k, now: NOW }).ok, true, `${k} may post`)
    assert.ok(KIND_TAGS[k])
  }
})

await t('the migration: the guards, the four kinds, no `set role`', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/202610091600_top_totals.sql', import.meta.url), 'utf8')
  for (const k of ['top_totals', 'nfl_top_totals', 'nhl_top_totals', 'nba_top_totals']) assert.ok(sql.includes(`'${k}'`), k)
  assert.ok(/check \(locked_at < start_at\)/.test(sql) && /now\(\) >= new\.start_at/.test(sql), 'insert guard')
  assert.ok(/never rewritten/.test(sql) && /never regraded/.test(sql), 'update guards')
  assert.ok(/primary key \(sport, game_id, model_version\)/.test(sql), 'one row per game x model_version')
  assert.ok(!/set\s+role/i.test(sql.replace(/--.*$/gm, '')), 'no set role')
  assert.ok(/enable row level security/.test(sql))
})

// ── BOOK LINES (NHL goals / NBA points only). All TEST data. ──
const evOf = (league) => ({
  eventID: 'EV1', leagueID: league, status: { startsAt: '2026-10-10T23:00:00.000Z' },
  teams: { away: { names: { short: 'LA' } }, home: { names: { short: 'NJ' } } },
  odds: {
    'points-all-game-ou-over': { bookOverUnder: '6.5', bookOdds: '-110', fairOverUnder: '6.5', openBookOverUnder: '6', byBookmaker: { bookA: { odds: '-110', overUnder: '6.5', available: true }, bookB: { odds: '-115', overUnder: '7', available: false } } },
    'points-all-game-ou-under': { bookOverUnder: '6.5', bookOdds: '-110', fairOverUnder: '6.5', openBookOverUnder: '6', byBookmaker: { bookA: { odds: '-110', overUnder: '6.5', available: true } } },
  },
})
const TAKEN = new Date(NOW - 3 * H).toISOString()
const bookRowFor = (g, line, extra = {}) => ({ sport: 'nhl', event_id: `E${g.game_id}`, starts_at: new Date(g.start_ms).toISOString(), snap: 'list', taken_at: TAKEN, away: g.away, home: g.home, line, books: 4, game_date: g.game_date, ...extra })

await t('gameTotalRow: NHL and NBA only; a consensus nobody still offers, or a one-sided one, is no row', () => {
  const r = gameTotalRow(evOf('NHL'), 'list', TAKEN)
  assert.equal(r.sport, 'nhl'); assert.equal(r.line, 6.5); assert.equal(r.books, 1); assert.equal(r.over_odds, -110); assert.equal(r.open_line, 6)
  assert.equal(gameTotalRow(evOf('NBA'), 'lock', TAKEN).sport, 'nba')
  assert.equal(gameTotalRow(evOf('MLB'), 'list', TAKEN), null)      // runs are not home runs
  assert.equal(gameTotalRow(evOf('NFL'), 'list', TAKEN), null)      // points are not touchdowns
  const stale = evOf('NHL'); stale.odds['points-all-game-ou-over'].byBookmaker.bookA.available = false
  assert.equal(gameTotalRow(stale, 'list', TAKEN), null)
  const split = evOf('NHL'); split.odds['points-all-game-ou-under'].bookOverUnder = '7'
  assert.equal(gameTotalRow(split, 'list', TAKEN), null)
  const none = evOf('NHL'); delete none.odds['points-all-game-ou-under']
  assert.equal(gameTotalRow(none, 'list', TAKEN), null)
  assert.equal(gameTotalRow({ ...evOf('NHL'), odds: {} }, 'list', TAKEN), null)
})

await t('bookTotalsFor: SGO club shorts meet ours, the newest read before the lock and the start wins, a later or other-game read is ignored', () => {
  assert.equal(bookTeamKey('nhl', 'LA'), 'LAK'); assert.equal(bookTeamKey('nhl', 'NJ'), 'NJD'); assert.equal(bookTeamKey('nba', 'GSW'), 'GS'); assert.equal(bookTeamKey('nba', 'NYK'), 'NY')
  const g = { game_id: 'n1', away: 'LAK', home: 'NJD', start_ms: NOW + 2 * H, game_date: '2026-10-10' }
  const sgo = { away: 'LA', home: 'NJ' }
  const rows = [bookRowFor(g, 6, sgo), bookRowFor(g, 6.5, { ...sgo, snap: 'lock', taken_at: new Date(NOW - 1 * H).toISOString() }),
    bookRowFor(g, 9, { ...sgo, taken_at: new Date(NOW + 1 * H).toISOString() }),     // read after the lock moment
    bookRowFor(g, 8, { away: 'TB', home: 'NJ' })]                                      // another game
  assert.equal(bookTotalsFor('nhl', [g], rows, NOW).get('n1').line, 6.5)
  assert.equal(bookTotalsFor('nhl', [{ ...g, away: 'ZZZ' }], rows, NOW).size, 0)
  assert.equal(bookTotalsFor('nhl', [{ ...g, start_ms: g.start_ms + 20 * H }], rows, NOW).size, 0)   // another day's game of the same pair
  assert.equal(bookTotalsFor('nhl', [{ ...g, game_id: 'late' }], [bookRowFor(g, 6.5, { ...sgo, taken_at: new Date(g.start_ms).toISOString() })], NOW + 5 * H).size, 0)   // read at the start
})

await t('the lock with a book total: line = the book number, line_source book, projected_total beside it; selection is still the projection', () => {
  const field = FIELD.map((g) => ({ ...g, book: g.game_id === 'g5' ? { line: 6.5, taken_at: TAKEN, books: 5, event_id: 'EV5' } : g.game_id === 'g2' ? { line: 7.5, taken_at: TAKEN, books: 2, event_id: 'EV2' } : undefined }))
  const rows = lockRows({ sport: 'nhl', slate_key: 'k', games: field, now: NOW })
  assert.deepEqual(rows.filter((r) => r.called).map((r) => r.game_id).sort(), ['g2', 'g3', 'g5'])    // the same three as without a book
  const g5 = rows.find((r) => r.game_id === 'g5'); const g3 = rows.find((r) => r.game_id === 'g3')
  assert.equal(g5.line_source, 'book'); assert.equal(g5.line, 6.5); assert.equal(g5.book_line, 6.5); assert.equal(g5.projected_total, 8.8); assert.equal(g5.book_books, 5); assert.equal(g5.book_event_id, 'EV5')
  assert.ok(Date.parse(g5.book_taken_at) < Date.parse(g5.start_at), 'the book read came before the start')
  // no real total for g3: its own number, never a guess
  assert.equal(g3.line_source, 'projection'); assert.equal(g3.line, 7.9); assert.equal('book_line' in g3, false)
})

await t('MLB and NFL never take a book line, even if one is handed in; a bad or late book number is ignored', () => {
  assert.deepEqual(BOOK_LINE_SPORTS, ['nhl', 'nba'])
  const book = { line: 6.5, taken_at: TAKEN, books: 3, event_id: 'E' }
  for (const sport of ['mlb', 'nfl']) assert.equal(lineFor(sport, { projected: 7.1, start_ms: NOW + H, book }).line_source, 'projection')
  const g = { projected: 7.1, start_ms: NOW + H }
  assert.equal(lineFor('nba', { ...g, book: { ...book, line: 0 } }).line_source, 'projection')
  assert.equal(lineFor('nba', { ...g, book: { ...book, line: NaN } }).line_source, 'projection')
  assert.equal(lineFor('nba', { ...g, book: { ...book, taken_at: new Date(NOW + 2 * H).toISOString() } }).line_source, 'projection')   // read after the start
  assert.equal(lineFor('nba', { ...g, book }).line, 6.5)
})

await t('grading against a book line: over / under / push (a whole-number total pushes)', () => {
  const half = { line: 6.5, line_source: 'book' }
  assert.equal(gradeRow(half, 7).result, 'over'); assert.equal(gradeRow(half, 6).result, 'under'); assert.equal(gradeRow(half, 6).hit, false)
  assert.deepEqual(gradeRow({ line: 6, line_source: 'book' }, 6), { actual_total: 6, result: 'push', hit: null })
  assert.equal(gradeRow({ line: 6, line_source: 'book' }, 'void').result, 'void')
})

await t('the record keeps the two line sources apart: old projection rows are never pooled with book rows', () => {
  const rows = [
    { called: true, rank: 1, field_size: 9, line_source: 'book', result: 'over' }, { called: true, rank: 2, field_size: 9, line_source: 'book', result: 'under' },
    { called: true, rank: 3, field_size: 9, line_source: 'book', result: 'push' },
    { called: true, rank: 1, field_size: 9, line_source: 'projection', result: 'over' }, { called: true, rank: 2, field_size: 9, result: 'over' },   // a row from before the column
  ]
  const s = recordBySource(rows)
  assert.equal(s.book.called.n, 3); assert.equal(s.book.called.hits, 1); assert.equal(s.book.called.misses, 1); assert.equal(s.book.called.pushes, 1)
  assert.equal(s.projection.called.n, 2); assert.equal(s.projection.called.hits, 2)
})

await t('the store: a book total read before the lock is stored with the call; no rewrite after; no table or no match = projection', async () => {
  const names = [['LAK', 'NJD'], ['TBL', 'VGK'], ['SJS', 'WSH'], ['UTA', 'MTL'], ['BOS', 'NYR']]
  const games = names.map(([away, home], i) => G(`b${i + 1}`, 2 + i / 10, 7 + (i + 1) / 10, { away, home }))
  const slate = { ok: true, slate_key: '2026-10-10', day: '2026-10-10', games }
  // SGO's own shorts for 3 of the 5 games (LA@NJ, TB@VGK, SJ@WSH); the other two have no total
  const books = [bookRowFor(games[0], 6.5, { away: 'LA', home: 'NJ' }), bookRowFor(games[1], 6, { away: 'TB', home: 'VGK' }), bookRowFor(games[2], 5.5, { away: 'SJ', home: 'WSH' })]
  const db = fakeDb({ clock: () => NOW, books })
  assert.match(await lockSlate(db, 'nhl', slate, { now: NOW + 1 * H }), /^locked 5 \(3 called\) book 3$/)
  const by = Object.fromEntries(db.rows.map((r) => [r.game_id, r]))
  assert.equal(by.b1.line_source, 'book'); assert.equal(by.b1.line, 6.5); assert.equal(by.b1.projected_total, 7.1)
  assert.equal(by.b4.line_source, 'projection'); assert.equal(by.b4.line, by.b4.projected_total)
  for (const r of db.rows) assert.ok(Date.parse(r.locked_at) < Date.parse(r.start_at))
  // a second pass with a moved book number writes nothing
  const before = JSON.stringify(db.rows)
  books[0].line = 9
  assert.equal(await lockSlate(db, 'nhl', slate, { now: NOW + 1.2 * H }), 'already-locked')
  assert.equal(JSON.stringify(db.rows), before)
  // grading uses the stored book line, once
  await gradeRows(db, db.rows.map((r) => ({ ...r })), new Map([['b1', 7], ['b2', 6], ['b3', 5]]), NOW + 9 * H)
  assert.equal(by.b1.result, 'over'); assert.equal(by.b2.result, 'push'); assert.equal(by.b3.result, 'under')
  // no odds_game_totals rows at all: every call keeps the projection line
  const db2 = fakeDb({ clock: () => NOW })
  assert.match(await lockSlate(db2, 'nhl', slate, { now: NOW + 1 * H }), / book 0$/)
  assert.ok(db2.rows.every((r) => r.line_source === 'projection' && r.line === r.projected_total))
  // MLB never reads the book table
  const db3 = fakeDb({ clock: () => NOW, books })
  await lockSlate(db3, 'mlb', slate, { now: NOW + 1 * H })
  assert.ok(db3.rows.every((r) => r.line_source === 'projection'))
})

await t('the post shows both honestly: model and book on a book game, the model alone where there is no book total', () => {
  const field = FIELD.map((g) => ({ ...g, book: g.game_id === 'g5' ? { line: 6.5, taken_at: TAKEN, books: 5, event_id: 'E' } : undefined }))
  const text = totalsPostText({ sport: 'nhl', day: '2026-10-10', rows: lockRows({ sport: 'nhl', slate_key: 'k', games: field, now: NOW }) })
  assert.match(text, /1\. Ag5 @ Hg5 · model 8\.8, book 6\.5/)
  assert.match(text, /\d\. Ag3 @ Hg3 · 7\.9 G/)
  assert.match(text, /book total where listed/)
  assert.ok([...text].length + 4 <= 280)
  const all = lockRows({ sport: 'nba', slate_key: 'k', games: FIELD.map((g) => ({ ...g, book: { line: 6.5, taken_at: TAKEN, books: 2, event_id: 'E' } })), now: NOW })
  assert.match(totalsPostText({ sport: 'nba', day: '2026-10-10', rows: all }), /Graded vs the book total after the final\./)
})

await t('vs our number: a projection line says so (MLB, NFL, and an NHL / NBA game with no book total); "vs book" only when line_source is book', () => {
  assert.equal(lineWord({ line_source: 'projection' }), 'vs our number')
  assert.equal(lineWord({}), 'vs our number')
  assert.equal(lineWord({ line_source: 'book', book_line: 6.5 }), 'vs book')
  for (const sport of ['mlb', 'nfl']) {
    const rows = lockRows({ sport, slate_key: 'k', games: FIELD.map((g) => ({ ...g, book: { line: 6.5, taken_at: TAKEN, books: 2, event_id: 'E' } })), now: NOW })
    assert.ok(rows.every((r) => r.line_source === 'projection' && lineWord(r) === 'vs our number'), `${sport} never takes a book line`)
    assert.match(totalsPostText({ sport, day: '2026-10-10', rows }), /Graded vs our number after the final\./)
  }
  const bookless = lockRows({ sport: 'nhl', slate_key: 'k', games: FIELD, now: NOW })
  assert.ok(bookless.every((r) => lineWord(r) === 'vs our number'), 'an NHL game with no book total is graded vs our number')
  const comp = fs.readFileSync(new URL('../components/TopTotals.js', import.meta.url), 'utf8')
  assert.ok(/lineWord\(r\)/.test(comp) && /vs our number/.test(comp), 'the table labels each line from the row')
})

await t('the book-line migration: the table, the four columns, the book check, the frozen columns, no `set role`', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/202610091800_top_totals_book_line.sql', import.meta.url), 'utf8')
  const code = sql.replace(/--.*$/gm, '')
  assert.ok(/create table if not exists public\.odds_game_totals/.test(code) && /check \(taken_at < starts_at\)/.test(code))
  for (const c of ['book_line', 'book_taken_at', 'book_books', 'book_event_id']) assert.ok(code.includes(`add column if not exists ${c}`) && code.includes(`new.${c}`) && code.includes(`old.${c}`), c)
  assert.ok(/line_source <> 'book' or \(book_line is not null and line = book_line and sport in \('nhl','nba'\)\)/.test(code))
  assert.ok(!/set\s+role/i.test(code))
})

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
