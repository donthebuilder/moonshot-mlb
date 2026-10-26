#!/usr/bin/env node
// THE CALLED LIST, CHECKED (batch member-requests 2A, 2026-10-25). lib/card/listRows.js on TEST rows (every name says Test), the route's gate
// by its source, and the wiring. No database, no network.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-called-list.mjs
import fs from 'node:fs'
import { listEntries, legStatus, listCounts, LIST_STATUS_WORD, PLAY_WORD } from '../lib/card/listRows.js'
import { publicCardRows } from '../lib/card/reveal.js'

let n = 0, bad = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.error(`FAIL ${m}`) } else console.log(`ok   ${m}`) }
const T0 = Date.parse('2026-10-25T17:00:00Z')
const leg = (o = {}) => ({ player_id: 'p1', name: 'Test Back One', team: 'KC', opp: 'BUF', game_id: 'g1', start_at: '2026-10-25T18:00:00Z', score: 80, market: 'anytime', why: 'Goal-line carries all week', price: { median: 180, best: 200 }, ...o })
const row = (o = {}) => ({ id: 1, sport: 'nfl', card_date: '2026-10-25', lane: 'bot', product: 'straight', slot: 1, legs: [leg()], leg_count: 1, start_at: '2026-10-25T18:00:00Z', result: null, leg_results: null, locked_at: '2026-10-25T16:55:00Z', ...o })

// status: waiting before the start, live after it, the stored word once graded
ok(legStatus(row(), 0, T0) === 'waiting', 'before the start: waiting')
ok(legStatus(row(), 0, T0 + 2 * 3600e3) === 'live', 'after the start, no result: live')
ok(legStatus(row({ result: 'hit' }), 0, T0) === 'hit' && legStatus(row({ result: 'miss' }), 0, T0) === 'miss', 'a straight takes its ticket result')
ok(legStatus(row({ result: 'void' }), 0, T0) === 'scratched' && legStatus(row({ result: 'push' }), 0, T0) === 'pushed', 'void = scratched (did not play), push = pushed')
const two = row({ id: 2, product: 'two_man', legs: [leg(), leg({ player_id: 'p2', name: 'Test Wideout Two', game_id: 'g2', score: 70 })], leg_count: 2, result: null, leg_results: [{ player_id: 'p1', result: 'hit' }, { player_id: 'p2', result: null }] })
ok(legStatus(two, 0, T0 + 3600e3 * 2) === 'hit' && legStatus(two, 1, T0 + 3600e3 * 2) === 'live', 'a Two-Man leg has its own status')

// entries: one per leg, the frozen price / market / angle, board order, the partner named
const rows = [row({ id: 3, slot: 2, legs: [leg({ player_id: 'p3', name: 'Test Back Three', score: 60, market: 'rush_yds', line: 99.5, price: { median: -110 } })] }), row(), two, row({ id: 9, sport: 'all', product: 'double', legs: [leg(), leg({ player_id: 'x' })], leg_count: 2 })]
const es = listEntries(rows, { now: T0 })
ok(es.length === 4, `a straight is one entry, a Two-Man two, the Double none (${es.length})`)
ok(es.map((e) => e.name).join('|') === 'Test Back One|Test Back One|Test Wideout Two|Test Back Three', `board order, best score first: ${es.map((e) => e.name).join('|')}`)
const first = es[0]
ok(first.price === 180 && first.marketWords === 'anytime touchdown' && first.angle === 'Goal-line carries all week' && first.word === 'WAITING', 'the lock-frozen price, market and angle ride the entry')
const ys = es.find((e) => e.name === 'Test Back Three')
ok(ys.marketWords === 'rushing yards over 99.5' && ys.price === -110, 'a volume pick says its line')
ok(es.find((e) => e.product === 'two_man' && e.name === 'Test Wideout Two').withName === 'Test Back One' && es.find((e) => e.product === 'straight').withName === null, 'a Two-Man leg names its partner; a straight has none')
ok(listEntries([row({ legs: [leg({ price: undefined, why: '  ' })] })], { now: T0 })[0].price === null && listEntries([row({ legs: [leg({ price: undefined, why: '  ' })] })], { now: T0 })[0].angle === null, 'no price / no angle stays null, never a made-up one')
ok(listCounts(es).waiting >= 1 && LIST_STATUS_WORD.void === undefined && LIST_STATUS_WORD.scratched === 'SCRATCHED' && PLAY_WORD.two_man === 'Two-Man', 'the words are in one place')

// the Card's own who-sees-what rule is what the route applies: before a grade only the lead straight + long shot reach the public
const card = [row({ id: 1, slot: 1, legs: [leg({ board_pct: 90 })] }), row({ id: 2, slot: 2, legs: [leg({ player_id: 'p4', name: 'Test Two', board_pct: 70 })] }), two]
const pub = publicCardRows(card)
ok(pub.rows.length === 1 && pub.held.straights === 1 && pub.held.two_man === 1 && !pub.revealed, 'public view before any grade: the lead straight, the rest only COUNTED')
const graded = card.map((r, i) => (i === 0 ? { ...r, result: 'hit' } : r))
ok(publicCardRows(graded).rows.length === 3 && publicCardRows(graded).revealed, 'once a row is graded, the whole card is record')

// the route and the wiring
const route = fs.readFileSync('app/api/card/list/route.js', 'utf8')
ok(/viewerIsMember\(\)/.test(route) && /audience: member \? 'members' : 'public'/.test(route), 'the route asks the SERVER who is looking and picks the audience itself')
ok(/Cache-Control': 'private, no-store'/.test(route) && !/s-maxage/.test(route), 'never cached by the CDN (per viewer)')
ok(!/entries[^\n]*held[^\n]*name/.test(route) && /held = \(card\.held\?\.straights \|\| 0\) \+ \(card\.held\?\.two_man \|\| 0\)/.test(route), 'held plays are a COUNT, never a name')
const dash = fs.readFileSync('components/nfl/NflDashboard.js', 'utf8'), home = fs.readFileSync('components/nfl/tabs/Home.js', 'utf8'), games = fs.readFileSync('components/nfl/tabs/Games.js', 'utf8')
ok(/tab === 'calledlist' && <CalledList sport="nfl"/.test(dash) && /onOpenCalledList=\{\(\) => setTab\('calledlist'\)\}/.test(dash), 'NFL: the tab renders and the Slate gets its opener')
ok(/<CalledList sport="nfl"[^>]*preview=\{3\}/.test(home) && /setTab\('calledlist'\)/.test(home), 'NFL Home: a three-row strip with the link to the full list')
ok(/Called list<\/button>/.test(games) && /onOpenCalledList/.test(games), 'NFL Slate: a Called list chip in the header')
const lamp = fs.readFileSync('components/lamp/LampDashboard.js', 'utf8'), lampHome = fs.readFileSync('components/lamp/tabs/Home.js', 'utf8'), lampSlate = fs.readFileSync('components/lamp/LampSlate.js', 'utf8')
ok(/tab === 'calledlist' && <CalledList sport="nhl"/.test(lamp) && /onOpenCalledList=\{\(\) => setTab\('calledlist'\)\}/.test(lamp) && /<CalledList sport="nhl"[^>]*preview=\{3\}/.test(lampHome) && /Called list<\/button>/.test(lampSlate), 'LAMP: the tab, the Slate chip and the Home strip')
const mlb = fs.readFileSync('components/Dashboard.js', 'utf8'), mlbHome = fs.readFileSync('components/tabs/Home.js', 'utf8'), mlbGames = fs.readFileSync('components/tabs/Games.js', 'utf8')
ok(/tab === 'calledlist'  && <CalledList sport="mlb"/.test(mlb) && /onOpenCalledList=\{\(\) => setTab\('calledlist'\)\}/.test(mlb) && /<CalledList sport="mlb"[^>]*preview=\{3\}/.test(mlbHome) && /Called list<\/button>/.test(mlbGames), 'MOONSHOT: the tab, the Slate chip and the Home strip')
const routes = fs.readFileSync('lib/routes.js', 'utf8'), nhlRoutes = fs.readFileSync('lib/nhl/routes.js', 'utf8')
ok((routes.match(/calledlist:/g) || []).length >= 2 && /calledlist: \{ label: 'Called list'/.test(nhlRoutes), 'the tab is in every product registry that has a Card (nba has none: hasCards false)')
const nba = fs.readFileSync('components/buckets/BucketsDashboard.js', 'utf8'), nbaHome = fs.readFileSync('components/buckets/tabs/Home.js', 'utf8'), nbaSlate = fs.readFileSync('components/buckets/tabs/Slate.js', 'utf8')
ok(/tab === 'calledlist' && <CalledList sport="nba"/.test(nba) && /<CalledList sport="nba"[^>]*preview=\{3\}/.test(nbaHome) && /Called list<\/button>/.test(nbaSlate) && /calledlist: \{ label: 'Called list'/.test(fs.readFileSync('lib/nba/routes.js', 'utf8')), 'BUCKETS: the tab, the Slate chip and the Home strip (it joined the Card 10-20)')
ok(/hiddenCardGate\(sport\)/.test(route) && /gate\.no/.test(route), 'a hidden sport (BUCKETS before its switch) gets the same 404 a sport with no card gets')
console.log(bad ? `${bad}/${n} FAILED` : `check-called-list: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
