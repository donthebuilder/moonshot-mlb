// BY THE NUMBERS, CHECKED (2026-10-21). lib/posts/byNumbers.js: the men off both boards (THE SLATE's rules), every find, the pick (hero, then
// one of each kind, no man twice), the post, the card words and the card itself, the timing and the poster on a fake database. TEST data only
// (every name says Test).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-by-numbers.mjs
import fs from 'node:fs'
const N = await import('../lib/posts/byNumbers.js')
const { xLen } = await import('../lib/posts/slate.js')
const { SWEARS, OVERCLAIM } = await import('../lib/facts/check.js')
const { kindInfo } = await import('../lib/dash/xSchedule.js')
const { tierOf } = await import('../lib/dash/xPolicy.js')
const { UNROUTED } = await import('../lib/dash/routingUnrouted.js')
const { routeOf } = await import('../lib/dash/routing.js')

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const DAY = '2026-10-21'
const T = Date.parse('2026-10-21T23:00:00Z')        // the night's first start
const NOW = T - 60 * 60e3                            // an hour before it
const iso = (ms) => new Date(ms).toISOString()

// ── the boards (TEST) ─────────────────────────────────────────────────────────────────────────────────────
const nr = (id, name, team, status, rank, pts, extra = {}) => ({ playerId: id, name, team, status, gameId: extra.gameId || 'g1', score: 70, nightRank: rank, nightOf: 300, legs: { ptsPg: pts }, injury: extra.injury || null })
const nbaBoard = {
  games: [
    { id: 'g1', start: iso(T), seasonType: 2, state: 'pre', away: { id: '26', abbrev: 'UTAH' }, home: { id: '29', abbrev: 'MEM' } },
    { id: 'g2', start: iso(T + 3 * 3600e3), seasonType: 2, state: 'pre', away: { id: '9', abbrev: 'GS' }, home: { id: '13', abbrev: 'LAL' } },
    { id: 'g3', start: iso(T - 4 * 3600e3), seasonType: 2, state: 'in', away: { id: '1', abbrev: 'ATL' }, home: { id: '19', abbrev: 'ORL' } },
  ],
  rows: [
    nr('a', 'Test Alpha', 'UTAH', 'called', 2, 26.7),
    nr('b', 'Test Bravo', 'MEM', 'board', 57, 13.6),
    nr('b2', 'Test Bravo Two', 'UTAH', 'board', 80, 9.1),                 // same club as Alpha, same number: never a duel
    nr('c', 'Test Charlie', 'GS', 'called', 10, 22.0, { gameId: 'g2' }),
    nr('d', 'Test Delta', 'LAL', 'called', 20, 19.5, { gameId: 'g2' }),
    nr('e', 'Test Echo', 'LAL', 'off', 200, 4.0, { gameId: 'g2' }),       // not on the board: in nothing
    nr('f', 'Test Foxtrot', 'GS', 'called', 5, 30.0, { gameId: 'g2', injury: 'Out' }),   // listed out
    nr('g', 'Test Golf', 'ATL', 'called', 1, 31.0, { gameId: 'g3' }),     // game started
    nr('j', 'Test Juliet', 'LAL', 'called', 40, 15.0, { gameId: 'g2' }),
    nr('k', 'Test Twin Name', 'GS', 'board', 90, 8.0, { gameId: 'g2' }),
  ],
}
const lampGame = (id, start, locked, rows, away = 'PHI', home = 'BUF') => ({ game: { id, startUtc: iso(start), state: 'pre', scheduleState: 'OK', away: { abbrev: away }, home: { abbrev: home } }, locked, lockedAt: locked ? iso(start - 90 * 60e3) : null, rows })
const hr = (id, name, team, status, rank, g, gp) => ({ playerId: id, name, team, status, preview: false, score: 60, context: { nightRank: rank, nightOf: 80 }, szn: { g, gp } })
const nhlGames = [
  lampGame(101, T + 30 * 60e3, true, [hr('h', 'Test Hotel', 'BUF', 'called', 1, 5, 9), hr('i', 'Test India', 'PHI', 'board', 30, 1, 9)]),
  lampGame(102, T + 2 * 3600e3, false, [hr('z', 'Test Zulu', 'OTT', 'called', 2, 4, 9)], 'FLA', 'OTT'),   // no lock written: a preview, never named
]
const rosters = new Map([
  ['nba:a', { number: 23, birthDate: '1997-10-30' }], ['nba:b', { number: 23, birthDate: '1999-01-01' }], ['nba:b2', { number: 23, birthDate: '1998-02-02' }],
  ['nba:c', { number: 11, birthDate: '1995-03-14' }], ['nba:d', { number: 7, birthDate: '2000-10-21' }], ['nba:e', { number: 7, birthDate: '2000-10-21' }],
  ['nba:f', { number: 11, birthDate: '2000-10-21' }], ['nba:g', { number: 11, birthDate: '2000-10-21' }], ['nba:j', { number: 9, birthDate: '1999-05-21' }],
  ['nba:k', { number: 4, birthDate: '2001-07-07' }],
  ['nhl:h', { number: 11, birthDate: '1996-10-30' }], ['nhl:i', { number: 19, birthDate: '1990-09-09' }], ['nhl:z', { number: 23, birthDate: '1997-10-30' }],
])
const twins = new Map([['TEST TWIN NAME', [{ sport: 'nfl', team: 'TST', club: 'Testers', number: 9, pos: 'WR' }]]])

// 1. the men
const nba = N.nbaMen({ board: nbaBoard, rosters, now: NOW })
const nhl = N.nhlMen({ games: nhlGames, rosters, now: NOW })
const ids = (l) => l.map((m) => m.id).sort().join(',')
ok(ids(nba) === 'a,b,b2,c,d,j,k', `BUCKETS: on the board, game ahead, not listed out (${ids(nba)})`)
ok(ids(nhl) === 'h,i', `LAMP: only a game whose lock is written (${ids(nhl)})`)
const alpha = nba.find((m) => m.id === 'a')
ok(alpha.number === 23 && alpha.birthDate === '1997-10-30' && alpha.stat === '26.7 points a game' && alpha.short === '26.7 PTS/G' && alpha.gameWords === 'UTAH @ MEMPHIS', `a man carries his roster and his read (${JSON.stringify(alpha).slice(0, 200)})`)
ok(nhl.find((m) => m.id === 'h').stat === '5 goals in 9 games' && nhl.find((m) => m.id === 'h').rank === 1 && nhl.find((m) => m.id === 'h').of === 80, 'a LAMP man: his season line and his night place')
const men = [...nba, ...nhl]

// 2. the finds
const finds = N.findNumbers(men, { day: DAY, twins })
const has = (type, pred) => finds.some((f) => f.type === type && pred(f))
const names = (f) => f.men.map((m) => m.id).join('&')
ok(has('birthday', (f) => names(f) === 'd'), 'birthday: a CALLED man playing on his birthday')
ok(!finds.some((f) => f.men.some((m) => ['e', 'f', 'g', 'z'].includes(m.id))), 'nobody off the board, listed out, started or unlocked is in anything')
ok(has('duel', (f) => names(f) === 'a&b'), 'duel: #23 vs #23 in one game, the CALLED man first')
ok(!has('duel', (f) => f.men.some((m) => m.id === 'b2') && f.men.some((m) => m.id === 'a')), 'never a duel inside one club')
ok(!has('duel', (f) => f.men.every((m) => m.status !== 'called')), 'a duel has a CALLED man')
ok(has('twins', (f) => names(f) === 'h&a' || names(f) === 'a&h'), 'twins: two CALLED men, two sports, born Oct 30')
ok(has('numbers', (f) => ['c&h', 'h&c'].includes(names(f))), 'numbers: two CALLED men, two games, both #11')
ok(has('date', (f) => names(f) === 'j'), 'date: a CALLED man born on the 21st (another month)')
ok(!has('date', (f) => names(f) === 'd'), 'a birthday is the birthday find, not the date find')
ok(has('name', (f) => names(f) === 'k' && f.other.club === 'Testers'), 'name: a man on the board with a twin in another league')
ok(N.findNumbers(men, { day: DAY, twins: new Map() }).every((f) => f.type !== 'name'), 'no twin list: no name find')

// 3. the pick
const pick = N.pickNumbers(finds)
const used = [pick.hero, ...pick.rows].flatMap((f) => f.men.map((m) => m.id))
ok(pick.hero.type === 'duel' && names(pick.hero) === 'a&b', 'the hero is the duel')
ok(new Set(used).size === used.length, `no man twice (${used.join(',')})`)
ok(pick.rows.length === 3 && pick.rows.map((f) => f.type).join(',') === 'birthday,name,numbers', `one of each kind, best kind first (${pick.rows.map((f) => f.type).join(',')})`)
ok(N.pickNumbers(finds.filter((f) => f.type === 'duel' || f.type === 'twins' || f.type === 'numbers')).hero.type === 'duel', 'duel beats twins for the hero')
ok(N.pickNumbers(finds.filter((f) => f.type !== 'duel')).hero.type === 'twins', 'no duel: twins lead')
ok(N.pickNumbers(finds.filter((f) => f.type === 'duel')) === null, 'a hero alone is not a post')
ok(N.pickNumbers(finds.filter((f) => ['birthday', 'date', 'name'].includes(f.type))) === null, 'no pair: no post')

// 4. the post
const text = N.numbersText(pick)
ok(text && xLen(text) <= 280, `fits a post (${xLen(text)})`)
ok(text.startsWith("\u{1F522} Tonight's calls, by the numbers") && text.endsWith('Which call cashes, network?'), 'the head and the ask')
ok((text.match(/\p{Extended_Pictographic}/gu) || []).length === 1, 'one emoji')
ok(text.includes('Test Alpha #23 vs Test Bravo #23, same floor. We called Test Alpha: #2 of 300 tonight.'), `the duel line (${text.split('\n')[2]})`)
ok(!SWEARS.test(text) && !OVERCLAIM.test(text), 'no swearing, no overclaim')
ok(!/ESPN/i.test(text), 'no source name in the post')
const line = (type) => N.numbersLine(finds.find((f) => f.type === type))
ok(line('birthday') === 'Test Delta plays on his birthday tonight. CALLED, #20 of 300.', line('birthday'))
ok(line('date') === "Test Juliet was born on the 21st. Tonight's the 21st. CALLED, #40 of 300.", line('date'))
ok(line('name') === "Test Twin Name: on the board tonight, #90 of 300. There's another Test Twin Name in the NFL, Testers, #9.", line('name'))
ok(/both wear #11, and we called both tonight\.$/.test(line('numbers')), line('numbers'))
ok(/both CALLED tonight, both born Oct 30\.$/.test(line('twins')), line('twins'))

// 5. the card's words and the card
const w = N.numbersCardWords(pick, { day: DAY })
ok(w.head === 'SAME NUMBER. SAME FLOOR.' && w.sub === 'UTAH @ MEMPHIS · TONIGHT' && w.asOf === 'OCT 21', `the hero words (${w.head} / ${w.sub})`)
ok(w.rows[0].badge.big === 'OCT 21' && w.rows[1].badge.big === 'NFL' && w.rows[2].badge.big === '#11', `the badges (${w.rows.map((r) => r.badge.big).join(', ')})`)
ok(w.rows.every((r) => r.kicker.length <= 34 && r.men.every((m) => m.line && !/UTAH|MEM|GS|LAL/.test(m.line))), 'short kickers; each man has his read line (no club code: the logo says it)')
ok(w.rows[2].title === 'CHARLIE & HOTEL' || w.rows[2].title === 'HOTEL & CHARLIE', `two men: last names (${w.rows[2].title})`)
const look = { face: async () => '', logo: async () => ({ src: '', plate: false }) }
const png = await N.numbersPicture({ pick, day: DAY, ...look })
ok(png && png.length > 1000, 'the card renders (TEST data, monograms)')
ok(await N.numbersPicture({ pick, day: DAY, draw: async () => { throw new Error('boom') }, ...look }) === null, 'a render that throws: no picture, no throw')

// 6. the timing
ok(N.numbersTiming({ nhlGames, nbaBoard, now: T - 3 * 3600e3 }).reason === 'too early' && N.numbersTiming({ nhlGames, nbaBoard, now: T - 3 * 3600e3 }).next === T - N.LEAD_MS, 'too early: it sleeps until 75 minutes before the first game')
const unlockedFirst = [lampGame(201, T - 10 * 60e3 + 60 * 60e3, false, [])]
ok(N.numbersTiming({ nhlGames: unlockedFirst, nbaBoard, now: NOW }).reason === 'waiting for LAMP to lock', 'LAMP\'s first game not locked: it waits')
ok(N.numbersTiming({ nhlGames: [lampGame(202, NOW + 20 * 60e3, false, [])], nbaBoard, now: NOW }).go, '30 minutes before an unlocked puck drop: it goes without it')
ok(N.numbersTiming({ nhlGames, nbaBoard, now: NOW }).go, 'an hour before, everything locked: go')
ok(N.numbersTiming({ nhlGames: [], nbaBoard: { games: [] }, now: NOW }).reason === 'no games still ahead', 'no games: nothing')

// 7. the poster on a fake database (no X keys here)
const store = []
const db = { from: () => {
  const st = {}
  const api = {
    select: () => api, match: (m) => { Object.assign(st, m); return api },
    maybeSingle: async () => ({ data: store.find((x) => x.day === st.day && x.kind === st.kind) || null, error: null }),
    upsert: (rows) => { const fresh = rows.filter((x) => !store.some((y) => y.day === x.day && y.kind === x.kind)); store.push(...fresh.map((x) => ({ ...x }))); const p = Promise.resolve({ data: fresh, error: null }); p.select = async () => ({ data: fresh, error: null }); return p },
    update: (patch) => ({ match: async (m) => { const row = store.find((x) => x.day === m.day && x.kind === m.kind); if (row) Object.assign(row, patch); return { error: null } } }),
    delete: () => ({ match: async (m) => { const i = store.findIndex((x) => x.day === m.day && x.kind === m.kind); if (i >= 0) store.splice(i, 1); return { error: null } } }),
  }
  return api
} }
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'X_BEARER_TOKEN']) delete process.env[k]
const stubs = { draw: async () => Buffer.from('PNG'), ...look, read: async () => ({ nhlGames, nbaBoard }), rosters: async () => rosters }
N._resetNumbersForTests()
const early = await N.postNumbersOnce(db, { day: DAY, now: T - 3 * 3600e3, ...stubs })
ok(early === 'held: too early', `too early (${early})`)
ok(await N.postNumbersOnce(db, { day: DAY, now: T - 3 * 3600e3 + 60e3, ...stubs }) === 'waiting', 'the next minute it does not read the boards again')
const r1 = await N.postNumbersOnce(db, { day: DAY, now: NOW, ...stubs, rosters: async () => new Map() })
ok(r1 === 'load-failed: no roster read' && !store.length, `no roster: tried again, nothing claimed (${r1})`)
N._resetNumbersForTests()
const r2 = await N.postNumbersOnce(db, { day: DAY, now: NOW, ...stubs })
ok(/^posted/.test(r2), `posts (${r2})`)
const row = store.find((x) => x.kind === 'by_numbers')
ok(row?.payload?.finds?.length === 4 && row.payload.picture === true && row.payload.finds[0].men[0].number === 23, 'the row records the four finds and the picture')
ok(await N.postNumbersOnce(db, { day: DAY, now: NOW + 60e3, ...stubs }) === 'already-posted', 'once a day')
const quiet = { ...stubs, read: async () => ({ nhlGames: [], nbaBoard: { ...nbaBoard, rows: nbaBoard.rows.filter((r) => r.playerId === 'e') } }) }
const r3 = await N.postNumbersOnce(db, { day: '2026-10-22', now: NOW + 24 * 3600e3 - 24 * 3600e3, ...quiet })
ok(r3 === 'none' && store.find((x) => x.day === '2026-10-22')?.payload?.none === true, `nothing lines up: no post, the night closed (${r3})`)
process.env.BY_NUMBERS_OFF = 'on'
ok(await N.postNumbersOnce(db, { day: '2026-10-23', now: NOW, ...stubs }) === 'off', 'BY_NUMBERS_OFF=on stops it')
delete process.env.BY_NUMBERS_OFF

// 8. the SQL and the wiring
const sql = fs.readFileSync(new URL('../supabase/migrations/202610211100_by_numbers_kind.sql', import.meta.url), 'utf8')
ok(sql.includes("''by_numbers''") && /\) not valid'/.test(sql), 'the kind migration allows by_numbers, NOT VALID')
const route = fs.readFileSync(new URL('../app/api/dash/homers/tick/route.js', import.meta.url), 'utf8')
ok(/out\.by_numbers = await postNumbersOnce\(db, \{ day: clock\.day, hooks: FEED_WEBHOOKS\(\) \}\)/.test(route), 'tried from the receipt step')
ok(kindInfo('by_numbers')?.tag === 'FUN' && tierOf('by_numbers') === 'fact', `tagged FUN, the fact tier (${JSON.stringify(kindInfo('by_numbers'))} ${tierOf('by_numbers')})`)
ok(Object.keys(UNROUTED).includes('by_numbers') || Boolean(routeOf('by_numbers')), 'routing knows it')
const card = fs.readFileSync(new URL('../lib/cards/byNumbersCard.js', import.meta.url), 'utf8')
ok(!/ESPN/.test(card.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')), 'the card never prints a source name')

console.log(bad ? `${bad}/${n} FAILED` : `check-by-numbers: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
