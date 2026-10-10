// THE PLAYER CARDS (lib/cards): front, back, the MLB percentile pool, the price slot, the status words, the foil. TEST data only:
// every name says "Test", no number here is a real line. Needs JSX, so run it through the card loader:
//   node --import ./scripts/proto-cards/_loader.mjs scripts/check-player-cards.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { frontDesign } from '../lib/cards/playerCard.js'
import { backDesign, blurbOf } from '../lib/cards/playerBack.js'
import { renderFront } from '../lib/cards/playerCard.js'
import { renderBack } from '../lib/cards/playerBack.js'
import { LINT, lintType, sizeOf } from '../lib/cards/cardKit.js'
import { priceWords, pctInPool, statusOf, callLineOf } from '../lib/cards/model.js'
import { buildPool, poolPct, poolWords, MIN_POOL } from '../lib/cards/mlbPool.js'
import { statsOf as mlbStats } from '../lib/cards/adapters/mlb.js'
import { statsOf as nflStats, backFromLog } from '../lib/cards/adapters/nfl.js'
import { hasCards, cardSports } from '../lib/cards/registry.js'
import { STATUS_WORD } from '../lib/callStatus.js'
import { BRAND } from '../lib/routes.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// ── the tree walker: every string, every style value (function components are called, as the type lint does) ──
function walk(node, out = { text: [], styles: [] }) {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.text.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out }
  const { type, props = {} } = node
  if (typeof type === 'function') return walk(type(props), out)
  if (props.style) out.styles.push(JSON.stringify(props.style))
  if (props.src) out.text.push(`[img]`)
  walk(props.children, out)
  return out
}
const FOIL = 'linear-gradient(100deg'
const hasFoil = (el) => walk(el).styles.some((s) => s.includes(FOIL))
const texts = (el) => walk(el).text.join(' | ')

const TEAM = { team: 'TST', opp: 'OPP', home: true }
const base = (o = {}) => ({
  sport: 'nhl', brand: { sport: 'nhl', name: BRAND.nhl.name, league: BRAND.nhl.league }, status: 'called', statusWord: STATUS_WORD.called,
  name: 'Test Skater', ...TEAM, teamName: 'Test Club', club: 'Test Club', pos: 'C', number: 7, role: 'TOP',
  face: '', logo: '', logoPlate: false, tone: null, score: 91, scoreWord: 'LAMP SCORE',
  stats: [{ label: 'SHOTS / GP', value: '3.1', pct: 95 }, { label: 'GOALS / GP', value: '0.41', pct: 88 }, { label: 'ICE TIME', value: '20:10', pct: 60 }, { label: 'THIS SEASON', value: '3-4-7', sub: 'G-A-P in 6 GP' }],
  statNote: "percentile among tonight's skaters", poolWord: "tonight's skaters", rankLine: ['#3 OF 500 TONIGHT'], callLine: 'TOP · ANYTIME GOAL',
  why: null, price: null, day: '2026-01-02', dayWord: 'Jan 2', playerId: '1', ...o,
})
const stat = (i) => ({ label: `STAT ${i}`, value: String(i + 0.5), unit: i % 2 ? '/G' : undefined, pct: i * 14 })
const backData = (o = {}) => ({
  bio: [['HT / WT', "6'0\" · 190 lb"], ['SHOOTS', 'L'], ['BORN', 'Jan 2, 2000 · Testville'], ['DRAFTED', '2018 · Rd 1 · #5 TST']],
  cols: [['YEAR', 1.25, 'season'], ['TEAM', 1.9, 'tm'], ['GP', 1, 'gp'], ['G', 1, 'g']],
  rows: Array.from({ length: 8 }, (_, i) => ({ season: `${19 + i}-${20 + i}`, tm: 'Test Club', gp: '80', g: '30' })),
  title: 'CAREER STATS', career: { season: 'NHL TOTALS', tm: '', gp: '640', g: '240' }, playoffs: { season: 'PLAYOFFS', tm: '', gp: '20', g: '9' }, note: 'note', ...o,
})

// ── 1. render never throws, at any metric count, with anything missing ──
const pngSize = (b) => ({ sig: b.subarray(1, 4).toString() === 'PNG', w: b.readUInt32BE(16), h: b.readUInt32BE(20) })
const variants = {
  'full': base(),
  'no face / logo (fallback)': base({ face: '', logo: '' }),
  'no price': base({ price: null }),
  'long name': base({ name: 'Test Verylongfirstname Anotherverylongsurname-Hyphenated' }),
  'no score': base({ score: null }),
  'no stats': base({ stats: [] }),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`${n} metric tile(s)`, base({ stats: Array.from({ length: n }, (_, i) => stat(i + 1)) })])),
  'board status': base({ status: 'board', statusWord: STATUS_WORD.board, callLine: 'ANYTIME GOAL' }),
  'off status': base({ status: 'off', statusWord: STATUS_WORD.off, callLine: '' }),
  'price with books': base({ price: { best: '+110', books: 4 } }),
}
for (const [name, m] of Object.entries(variants)) {
  try {
    const f = await renderFront(m)
    const s = pngSize(f)
    check(s.sig && s.w === 1080 && s.h === 1350, `front renders 1080x1350: ${name}`)
  } catch (e) { check(false, `front renders: ${name} (${e.message})`) }
}
const backs = {
  'full back': [base(), backData()],
  'no seasons': [base(), backData({ rows: [], career: null, playoffs: null })],
  'one season, no playoffs': [base(), backData({ rows: [{ season: '2025', tm: 'TST', gp: '17', g: '3' }], playoffs: null })],
  'no bio, no face': [base({ face: '', logo: '' }), backData({ bio: [] })],
  'one-word name': [base({ name: 'Test' }), backData()],
}
for (const [name, [m, b]] of Object.entries(backs)) {
  try { const r = pngSize(await renderBack(m, b)); check(r.sig && r.w === 1080 && r.h === 1350, `back renders: ${name}`) } catch (e) { check(false, `back renders: ${name} (${e.message})`) }
}
// any 4:5 size is the same card; a Discord-preview width stays above the 10px floor (22px at 1080 -> 10.6px at 520)
const small = pngSize(await renderFront(base(), { width: 520 }))
check(small.w === 520 && small.h === 650, 'front renders at a 520px preview width (520x650)')
check(Math.round((22 * 520) / 1080) >= 10, `type floor holds at the 520px preview (22px at 1080 -> ${((22 * 520) / 1080).toFixed(1)}px, floor 10px)`)
check(sizeOf(100).w === 270 && sizeOf(5000).w === 1080, 'sizeOf clamps the width to 270..1080')

// ── 2. the type floor ──
const lintAll = [...Object.values(variants).flatMap((m) => lintType(frontDesign(m, null))), ...Object.values(backs).flatMap(([m, b]) => lintType(backDesign(m, b, null)))]
check(lintAll.length === 0 && LINT.length === 0, `no text under 22px at 1080 wide (${lintAll.length + LINT.length} offenders)`)
if (lintAll.length) console.log(lintAll.slice(0, 5))

// ── 3. FOIL ONLY FOR CALLED, status words only from STATUS_WORD ──
check(hasFoil(frontDesign(variants.full, null)), 'CALLED front has the foil strip')
check(!hasFoil(frontDesign(variants['board status'], null)), 'ON THE BOARD front has no foil')
check(!hasFoil(frontDesign(variants['off status'], null)), 'NOT ON THE BOARD front has no foil')
check(statusOf('anything else') === 'off' && statusOf('called') === 'called' && statusOf('board') === 'board', 'statusOf never promotes an unknown word to CALLED')
for (const s of ['called', 'board', 'off']) {
  const m = base({ status: s, statusWord: STATUS_WORD[s], callLine: callLineOf({ status: s, role: 'TOP', market: 'anytime goal' }) })
  const t = texts(frontDesign(m, null))
  check(t.includes(STATUS_WORD[s]), `front prints the STATUS_WORD for ${s}`)
  if (s !== 'called') check(!/\bCALLED\b/.test(t.replace(STATUS_WORD.off, '')) || s === 'off' && !/\bCALLED\b/.test(t), `a ${s} front never says CALLED`)
}
check(callLineOf({ status: 'off', role: 'TOP', market: 'm' }) === '' && callLineOf({ status: 'board', role: 'TOP', market: 'anytime goal' }) === 'ANYTIME GOAL', 'the call line: market only for ON THE BOARD, none for NOT ON THE BOARD')

// ── 4. THE PRICE SLOT: only with a stored price AND its book count ──
check(priceWords({ best: 110, books: 4 })?.best === '+110' && priceWords({ best: 110, books: 4 }).books === 4, "priceWords: +110 with 4 books")
check(priceWords({ best: 110 }) === null && priceWords({ best: 110, books: 0 }) === null && priceWords(null) === null && priceWords({ books: 3 }) === null, 'priceWords: no price, or no book count, is null')
check(!texts(frontDesign(base({ price: null }), null)).includes('best'), 'no stored price: the price slot draws nothing')
check(!texts(frontDesign(base({ price: { best: '+110' } }), null)).includes('best'), 'a price without a book count draws nothing')
check(texts(frontDesign(base({ price: { best: '+110', books: 4 } }), null)).includes('best · 4 books'), "a stored price draws '+110 best · 4 books'")
check(texts(frontDesign(base({ price: { best: '+110', books: 1 } }), null)).includes('1 book') && !texts(frontDesign(base({ price: { best: '+110', books: 1 } }), null)).includes('1 books'), 'one book is singular')

// ── 5. MLB percentiles rank against a POOL, not tonight's board ──
const pool = buildPool([{ date: '2026-09-01', rows: Array.from({ length: 60 }, (_, i) => ({ player_id: 1000 + i, hr_per_pa: 0.01 + i * 0.001, season_iso: 0.1 + i * 0.002, recent_barrel_rate: 0.05 + i * 0.002, recent_hard_hit_rate: 0.3 + i * 0.005, season_max_ev: 100 + i * 0.2 })) }, { date: '2026-09-02', rows: [{ player_id: 1000, hr_per_pa: 0.5 }] }])
check(pool.n === 60 && pool.since === '2026-09-01' && pool.until === '2026-09-02', 'buildPool: distinct hitters, first and last day from the files read')
check(pool.hitters.find((h) => h.id === '1000').hr_per_pa === 0.5, 'buildPool: a hitter\'s NEWEST row wins')
const row = { player_id: 1, hr_per_pa: 0.05, season_iso: 0.2, recent_barrel_rate: 0.1, recent_hard_hit_rate: 0.4, season_max_ev: 105, season_hr: 20, season_pa: 400 }
const stats = mlbStats(row, pool)
const hrpa = stats.find((s) => s.label === 'HR / PA')
const expected = pctInPool(pool.hitters.map((h) => h.hr_per_pa), 0.05)
check(Math.abs(hrpa.pct - expected) < 1e-9 && hrpa.pct > 60 && hrpa.pct < 90, `MLB HR/PA percentile is his rank in the pool (${hrpa.pct?.toFixed(1)}), not a board rank`)
check(poolPct(pool, 'hr_per_pa', 0.05, 1000) !== poolPct(pool, 'hr_per_pa', 0.05, 'nobody'), 'the pool leaves out his own old row')
const thin = buildPool([{ date: '2026-09-01', rows: Array.from({ length: MIN_POOL - 1 }, (_, i) => ({ player_id: i, hr_per_pa: 0.01 * i })) }])
check(mlbStats(row, thin).every((s) => s.pct == null || s.label === 'X') && mlbStats(row, thin).find((s) => s.label === 'HR / PA').pct === null, `a pool under ${MIN_POOL} hitters draws no bar`)
check(poolWords(pool).startsWith('60 hitters on the bot') && poolWords(thin) === '', 'the pool is named in words (n and dates); a thin pool says nothing')
check(!stats.some((s) => s.pct != null && s.label === 'SEASON HR'), 'SEASON HR is a count: no bar')

// ── 6. THE NFL BACK shows only the seasons held, and says so ──
const games = [...Array.from({ length: 17 }, () => ({ s: 2025, tm: 'TST', g_car: 10, g_ruyd: 50, g_td: 1 })), ...Array.from({ length: 4 }, () => ({ s: 2026, tm: 'TST', g_car: 10, g_ruyd: 40, g_td: 1 }))]
const nb = backFromLog({ pos: 'RB', team: 'TST', number: 1 }, games, null)
check(nb.rows.length === 2 && nb.seasonsShown.join() === '2025,2026' && nb.playoffs === null, 'NFL back: exactly the seasons held (2025, 2026), no playoffs row')
check(/Only 2025 to 2026 are on file/.test(nb.note) && nb.career.g === '21' && nb.career.td === '21', 'NFL back says which seasons are on file; TOTAL is their sum')
check(backFromLog({ pos: 'RB', team: 'TST' }, [], null).rows.length === 0 && /No game log/.test(backFromLog({ pos: 'RB', team: 'TST' }, [], null).note), 'NFL back with no log: no rows, says so')
check(nflStats({ stats: { RZ: 6.8, xTD: 1.34 }, components: { TD: { f_rz_opp: 100, f_xtd: 99 } }, season_td: 7 }).length === 3, 'NFL tiles: only the fields the week file holds')
check(blurbOf(base()).line.includes('Ranks shots 95th') && blurbOf(base()).line.includes("tonight's skaters"), 'the blurb is the front\'s own percentile words')

// ── 7. registry-driven, no sport ternary, no hex literal, no link, no printed probability ──
check(hasCards('nhl') && hasCards('mlb') && hasCards('nfl') && !hasCards('nba') && !hasCards('bogus'), 'registry: nhl, mlb, nfl have cards; nba (BUCKETS) and unknown sports do not')
check(cardSports().join() === 'nhl,nfl,mlb', 'registry lists the Card sports once')
const dir = new URL('../lib/cards/', import.meta.url).pathname
const files = [...readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => `${dir}${f}`), ...readdirSync(`${dir}adapters`).map((f) => `${dir}adapters/${f}`)]
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').replace(/\s\/\/ .*$/gm, '')
  const rel = f.slice(dir.length)
  if (!/^(kit|cards)\.js$/.test(rel)) {
    check(!/sport\s*===?\s*['"]|\?\s*['"](nhl|mlb|nfl)['"]/.test(code), `${rel}: no sport ternary`)
    check(!/#[0-9a-fA-F]{3,8}\b/.test(code), `${rel}: no hex literal`)
    check(!/https?:\/\//.test(code.replace(/statsapi\.mlb\.com/g, '')) || /adapters\/mlb|cardKit/.test(rel), `${rel}: no URL text drawn on a card`)
    check(!/goalGameProbability|probabilit/i.test(code), `${rel}: no model probability`)
  }
}
const allText = Object.values(variants).map((m) => texts(frontDesign(m, null))).join(' ')
check(!/https?:|www\.|\.com|#\w+tag|QR/i.test(allText), 'no link, no QR, no hashtag drawn on a front')


// ── 8. the routes: nba (BUCKETS) and unknown sports are 404 whatever the switch says; bad input is 400; no render, no network ──
{
  const { GET: imageGet } = await import('../app/api/card/image/route.js')
  const { GET: dayGet } = await import('../app/api/card/day/route.js')
  const req = (path) => new Request(`http://localhost${path}`)
  const st = async (h, path) => (await h(req(path))).status
  check(await st(imageGet, '/api/card/image?sport=nba&id=1&side=front') === 404, 'route /api/card/image: sport=nba is 404')
  check(await st(imageGet, '/api/card/image?sport=nba&id=1&side=back') === 404, 'route /api/card/image: nba back is 404')
  check(await st(imageGet, '/api/card/image?sport=bogus&id=1') === 404 && await st(imageGet, '/api/card/image?id=1') === 404, 'route /api/card/image: an unknown or missing sport is 404')
  process.env.NEXT_PUBLIC_BUCKETS_PUBLIC = 'on'; process.env.BUCKETS_PUBLIC = 'on'
  check(await st(imageGet, '/api/card/image?sport=nba&id=1') === 404, 'route /api/card/image: nba stays 404 even with BUCKETS_PUBLIC=on (no public NBA card is built)')
  delete process.env.NEXT_PUBLIC_BUCKETS_PUBLIC; delete process.env.BUCKETS_PUBLIC
  check(await st(imageGet, '/api/card/image?sport=nhl&id=abc!&side=front') === 400, 'route /api/card/image: a malformed id is 400')
  check(await st(imageGet, '/api/card/image?sport=nhl&id=8478402&date=nope') === 400, 'route /api/card/image: a malformed date is 400')
  check(await st(dayGet, '/api/card/day?sport=nba') === 404 && await st(dayGet, '/api/card/day?sport=bogus') === 404, 'route /api/card/day: nba and unknown sports are 404')
  const body = await (await imageGet(req('/api/card/image?sport=nba&id=1'))).json()
  check(JSON.stringify(body).length < 200 && !/key|secret|token|supabase/i.test(JSON.stringify(body)), 'route: an error body is a short reason, no secrets')
}

// ── 9. the day lineup: free scope shows straight #1 only; full shows the Card; a missing leg face / price still draws ──
{
  const { dayDesign } = await import('../lib/cards/dayCard.js')
  const { renderDay } = await import('../lib/cards/dayCard.js')
  const leg = (n, o = {}) => ({ sport: 'nhl', brand: { sport: 'nhl', name: BRAND.nhl.name }, playerId: `P${n}`, name: `Test Skater ${n}`, team: 'TST', opp: 'OPP', home: null, pos: 'C', status: 'called', why: 'shots 99th . goals 98th percentile tonight', face: '', logo: '', logoPlate: false, tone: null, ...o })
  const price = { best: '+110', books: 4 }
  const full = { sport: 'nhl', scope: 'full', league: 'NHL', brandName: 'LAMP', market: 'anytime goal', dayWord: 'Jan 2', straights: [1, 2, 3].map((n) => ({ slot: n, stake: 1, m: leg(n), price: n === 1 ? price : null })), two: { stake: 0.5, legs: [{ m: leg(1), price }, { m: leg(2), price: null }], price: null }, donovan: null }
  const free = { ...full, scope: 'free', straights: full.straights.slice(0, 1), two: null }
  const tf = texts(dayDesign(full, null)); const tr = texts(dayDesign(free, null))
  check(/STRAIGHT 3/.test(tf) && /TWO-MAN/.test(tf) && /STRAIGHT 1/.test(tr) && !/STRAIGHT 2|TWO-MAN/.test(tr), 'day card: the free scope names straight #1 only; the full scope shows the whole Card')
  check(/\+110 \| best · 4 books/.test(tf) && !/about/.test(tf), 'day card: a leg with a stored price shows it; no combined price unless both legs have one')
  const two = { ...full, two: { ...full.two, legs: [{ m: leg(1), price }, { m: leg(2), price }], price: '+341' } }
  check(/about \+341 best, the two prices multiplied/.test(texts(dayDesign(two, null))), 'day card: both legs priced -> the combined price line')
  const sparse = { ...full, straights: [full.straights[0]], two: null }
  check(/No further call in a different game/.test(texts(dayDesign(sparse, null))) && /No pair from two different games/.test(texts(dayDesign(sparse, null))), 'day card: an empty slot says so in words (the Card never pads)')
  for (const [name, d] of Object.entries({ full, free, two, sparse })) {
    try { const r = pngSize(await renderDay(d)); check(r.sig && r.w === 1080 && r.h === 1350, `day card renders 1080x1350: ${name}`) } catch (e) { check(false, `day card renders: ${name} (${e.message})`) }
  }
  check([full, free, two, sparse].flatMap((d) => lintType(dayDesign(d, null))).length === 0, 'day card: no text under 22px at 1080 wide')
}

// ── 10. THE TWO-MAN DUAL CARD ──
{
  const { dualDesign, renderDual, clampWords } = await import('../lib/cards/dualCard.js')
  const { serialOf, loadDualModel } = await import('../lib/cards/dualData.js')
  const { dualCardImage } = await import('../lib/cards/cardImage.js')
  const leg = (n, o = {}) => ({ sport: 'nhl', brand: { sport: 'nhl', name: BRAND.nhl.name }, playerId: `P${n}`, name: `Test Skater ${n}`, team: 'TST', opp: 'OPP', home: null, pos: 'C', number: n, status: 'called', why: 'shots 99th · goals 98th · ice time 90th percentile tonight', face: '', logo: '', logoPlate: false, tone: null, ...o })
  const dual = (o = {}) => ({ sport: 'nhl', brandName: 'LAMP', market: 'anytime goal', dayWord: 'Jan 2', lane: 'bot', label: 'TWO-MAN', rule: '0.5 unit · both legs must land', legs: [{ m: leg(1), price: { best: '+110', books: 4 } }, { m: leg(2), price: { best: '+130', books: 3 } }], price: '+341', serial: { n: 14, of: 31, caption: 'TWO-MAN NO.' }, ...o })
  const t = texts(dualDesign(dual(), null, ''))
  check(/TWO-MAN/.test(t) && /0\.5 unit · both legs must land/.test(t) && /Test Skater 1/.test(t) && /Test Skater 2/.test(t) && /CALLED/.test(t), 'dual card: the slot label, the rule, both names and the status words')
  check(/about \+341 best, the two prices multiplied/.test(t), 'dual card: both legs priced -> the combined price line')
  check(!/about/.test(texts(dualDesign(dual({ price: null }), null, ''))), 'dual card: a missing combined price (a leg unpriced) draws nothing')
  check(/14 of 31/.test(t) && !/ of /.test(texts(dualDesign(dual({ serial: null }), null, ''))) , 'dual card: the serial is the real "14 of 31"; with none it is left off')
  check(/DONOVAN'S TWO-MAN/.test(texts(dualDesign(dual({ lane: 'donovan', label: "DONOVAN'S TWO-MAN", serial: { n: 3, of: 5, caption: "DONOVAN'S TWO-MAN NO." } }), null, ''))), "dual card: Donovan's lane wears its own label on the same layout")
  check(/ON THE BOARD/.test(texts(dualDesign(dual({ legs: [{ m: leg(1, { status: 'board' }), price: null }, { m: leg(2), price: null }] }), null, ''))) && !/\bOFF\b/.test(t), 'dual card: status words only from STATUS_WORD (a board leg says ON THE BOARD)')
  check(clampWords('a b c', 100) === 'a b c' && clampWords('word '.repeat(60), 40).endsWith('…') && clampWords('word '.repeat(60), 40).length <= 40, 'dual card: a long why line is cut on a word with an ellipsis')
  for (const [name, d] of Object.entries({ full: dual(), 'no faces / logos / prices / why': dual({ price: null, serial: null, legs: [{ m: leg(1, { why: null }), price: null }, { m: leg(2, { why: null }), price: null }] }), 'long names': dual({ legs: [{ m: leg(1, { name: 'Test Verylongfirstname Anotherverylongsurname-Hyphenated' }), price: null }, { m: leg(2, { name: 'Test Name' }), price: null }] }), donovan: dual({ label: "DONOVAN'S TWO-MAN", lane: 'donovan' }) })) {
    try { const r = pngSize(await renderDual(d)); check(r.sig && r.w === 1080 && r.h === 1350, `dual card renders 1080x1350: ${name}`) } catch (e) { check(false, `dual card renders: ${name} (${e.message})`) }
  }
  check(lintType(dualDesign(dual(), null, '')).length === 0, 'dual card: no text under 22px at 1080 wide')
  const rowsOf = [['2026-01-01', 'bot', '2026-01-01T00:00:00Z'], ['2026-01-02', 'bot', '2026-01-02T00:00:00Z'], ['2026-01-03', 'bot', '2026-01-03T00:00:00Z'], ['2026-01-02', 'donovan', '2026-01-02T00:00:00Z'], ['2026-01-04', 'donovan', '2026-02-01T00:00:00Z']].map(([card_date, lane, locks_at]) => ({ card_date, lane, locks_at }))
  const now = Date.parse('2026-01-10T00:00:00Z')
  check(JSON.stringify(serialOf(rowsOf, { lane: 'bot', cardDate: '2026-01-02', now })) === '{"n":2,"of":3}', 'serial: the 2nd of the 3 bot Two-Men locked so far (from the rows, never invented)')
  check(JSON.stringify(serialOf(rowsOf, { lane: 'donovan', cardDate: '2026-01-02', now })) === '{"n":1,"of":1}', "serial: Donovan's lane counts only his Two-Men whose lock has passed")
  check(serialOf(rowsOf, { lane: 'bot', cardDate: '2026-02-09', now }) === null && serialOf([], { lane: 'bot', cardDate: '2026-01-02', now }) === null, 'serial: a card that is not in the record, or no rows, gives no serial (omitted)')
  // the public/members rule: a fake table, no network
  const table = (rows) => { const b = { eq: () => b, order: () => b, limit: () => b, then: (res) => res({ data: rows, error: null }) }; return { select: () => b } }
  const row = (o) => ({ id: 1, sport: 'nhl', card_date: '2026-01-02', lane: 'bot', product: 'two_man', slot: 1, model_version: 'card-v1', locks_at: '2026-01-02T00:00:00Z', start_at: '2026-01-02T20:00:00Z', result: null, stake: 0.5, legs: [{ player_id: 'P1', name: 'Test Skater 1' }, { player_id: 'P2', name: 'Test Skater 2' }], ...o })
  const fakeDb = (rows) => ({ from: () => table(rows) })
  const early = await loadDualModel({ sport: 'nhl', date: '2026-01-02', lane: 'bot', db: fakeDb([row()]), now: Date.parse('2026-01-02T15:00:00Z'), publicOnly: true })
  check(!early.ok && early.status === 404 && /not public yet/.test(early.why), "dual route policy: the bot's Two-Man before its games is 404 (members content)")
  const none = await dualCardImage({ sport: 'nhl', date: '2026-01-02', lane: 'donovan', db: fakeDb([row()]), now: Date.parse('2026-01-02T15:00:00Z') })
  check(!none.ok && none.status === 404, "dual route policy: no Donovan's Two-Man entered -> 404")
  check((await dualCardImage({ sport: 'nba', date: '2026-01-02', db: fakeDb([]) })).status === 404, 'dual: nba is 404')
  const { GET: dualGet } = await import('../app/api/card/dual/route.js')
  check((await dualGet(new Request('http://x/api/card/dual?sport=nba'))).status === 404 && (await dualGet(new Request('http://x/api/card/dual?sport=bogus'))).status === 404, 'route /api/card/dual: nba and unknown sports are 404')
}

// ── 11. THE GRADED SLAB RESULT CARD ──
{
  const { slabDesign, renderSlab } = await import('../lib/cards/slabCard.js')
  const { legOutcome, productOutcome, outcomeWord, OUTCOME } = await import('../lib/cards/outcome.js')
  const { slabCardImage } = await import('../lib/cards/cardImage.js')
  const m = (n, o = {}) => ({ sport: 'nhl', brand: { sport: 'nhl', name: BRAND.nhl.name }, playerId: `P${n}`, name: `Test Skater ${n}`, team: 'TST', opp: 'OPP', home: null, face: '', logo: '', logoPlate: false, tone: null, ...o })
  const slab = (legs, o = {}) => ({ sport: 'nhl', brandName: 'LAMP', kicker: 'THE CARD · NHL', product: 'TWO-MAN', market: 'anytime goal', dayWord: 'Jan 2', result: 'missed', legs: legs.map((outcome, i) => ({ m: m(i + 1), outcome, market: 'anytime goal' })), record: { k: 6, n: 14, label: 'Two-Men landed both legs' }, note: 'Graded from the box score.', ...o })
  check(OUTCOME.cashed === 'CASHED' && OUTCOME.missed === 'MISSED' && OUTCOME.void === 'VOID' && OUTCOME.dnp === 'DID NOT PLAY', 'outcome words: CASHED / MISSED / VOID / DID NOT PLAY')
  check(legOutcome('hit') === 'cashed' && legOutcome('miss') === 'missed' && legOutcome('void') === 'dnp' && legOutcome(null) === null && legOutcome('pending') === null, 'a leg: hit / miss / void map to CASHED / MISSED / DID NOT PLAY; an ungraded leg has no outcome (never guessed)')
  check(productOutcome('hit') === 'cashed' && productOutcome('miss') === 'missed' && productOutcome('void') === 'void' && productOutcome(null) === null && outcomeWord('nope') === '', 'a product: a Two-Man with a void leg is VOID; nothing graded is nothing')
  const hit = slab(['cashed', 'cashed'], { result: 'cashed' })
  const miss = slab(['missed', 'missed'], { result: 'missed' })
  const mixed = slab(['cashed', 'dnp'], { result: 'void' })
  const th = texts(slabDesign(hit, null, '')); const tm = texts(slabDesign(miss, null, '')); const tx = texts(slabDesign(mixed, null, ''))
  check(/CASHED/.test(th) && /MISSED/.test(tm) && /VOID/.test(tx) && /DID NOT PLAY/.test(tx), 'slab: the label carries the real outcome words, per leg and for the product')
  check(/6 of 14/.test(th) && /Two-Men landed both legs/.test(th) && /Jan 2/.test(th) && /anytime goal/.test(th) && /TWO-MAN/.test(th), 'slab: the label carries the lane record "K of N", the date, the product and the market')
  check(!/\b(GEM|MINT|PRISTINE|CENTERING|CORNERS|EDGES|SURFACE|GRADE)\b/i.test(th + tm) && !/\b\d\.5\b|\b10\b/.test(th + tm.replace('Jan 2', '')), 'slab: NO numeric grade or sub-grades (no 9.5 / 10 / centering / corners)')
  // a MISS has the same dignity: the same layout and type as a hit; only the words and the small mark differ
  const shape = (d) => walk(d).styles.map((x) => { const o = JSON.parse(x); return `${o.fontSize || ''}|${o.fontWeight || ''}|${o.width || ''}|${o.height || ''}|${o.fontFamily || ''}` }).join(',')
  check(shape(slabDesign(hit, null, '')) === shape(slabDesign(miss, null, '')), 'slab: a miss is drawn with exactly the layout, sizes and weights of a hit (no celebratory styling)')
  const colors = (d) => walk(d).styles.join(' ')
  check(!/#?(ff0000|00ff00|red|green)\b/i.test(colors(slabDesign(miss, null, ''))), 'slab: no red / green on a miss')
  const rows = (n, outcome = 'missed') => slab(Array.from({ length: n }, (_, i) => (i % 3 ? outcome : 'cashed')), { sport: null, brandName: 'DASH Network', kicker: 'THE RECEIPT', product: 'NIGHT RECEIPT', result: null })
  const r12 = texts(slabDesign(rows(12), null, ''))
  check(/\+4 more in the ledger/.test(r12) && !/\+\d+ more/.test(texts(slabDesign(rows(5), null, ''))), 'slab: a long receipt shows 8 rows and says how many more are in the ledger')
  for (const [name, d] of Object.entries({ 'straight, cashed': slab(['cashed'], { product: 'STRAIGHT 1', result: 'cashed' }), 'straight, missed': slab(['missed'], { product: 'STRAIGHT 1', result: 'missed' }), 'two-man, missed': miss, 'two-man, void': mixed, 'receipt of 5': rows(5), 'receipt of 12': rows(12), 'no record': slab(['cashed'], { record: null }), 'donovan': slab(['cashed', 'missed'], { product: "DONOVAN'S TWO-MAN", result: 'missed' }) })) {
    try { const r = pngSize(await renderSlab(d)); check(r.sig && r.w === 1080 && r.h === 1350, `slab renders 1080x1350: ${name}`) } catch (e) { check(false, `slab renders: ${name} (${e.message})`) }
  }
  check([hit, miss, mixed, rows(12)].flatMap((d) => lintType(slabDesign(d, null, ''))).length === 0, 'slab: no text under 22px at 1080 wide')
  const table = (rows) => { const b = { eq: () => b, order: () => b, limit: () => b, is: () => b, match: () => b, maybeSingle: async () => ({ data: null, error: null }), then: (res) => res({ data: rows, error: null }) }; return { select: () => b } }
  const open = { id: 1, sport: 'nhl', card_date: '2026-01-02', lane: 'bot', product: 'straight', slot: 1, model_version: 'card-v1', locks_at: '2026-01-02T00:00:00Z', start_at: '2026-01-02T20:00:00Z', result: null, legs: [{ player_id: 'P1', name: 'Test Skater 1' }] }
  const notYet = await slabCardImage({ kind: 'card', sport: 'nhl', date: '2026-01-02', lane: 'bot', product: 'straight', slot: 1, db: { from: () => table([open]) }, now: Date.parse('2026-01-03T00:00:00Z') })
  check(!notYet.ok && notYet.status === 404 && /not graded/.test(notYet.why), 'slab: a row that is not graded yet is a 404 (a result card for a result that does not exist is never drawn)')
  const noReceipt = await slabCardImage({ kind: 'receipt', day: '2026-01-02', db: { from: () => table([]) } })
  check(!noReceipt.ok && noReceipt.status === 404, 'slab: a night with no stored receipt is a 404')
  const { GET: slabGet } = await import('../app/api/card/slab/route.js')
  const sg = async (q) => (await slabGet(new Request(`http://x/api/card/slab${q}`))).status
  check(await sg('?kind=card&sport=nba&date=2026-01-02') === 404 && await sg('?kind=card&sport=bogus&date=2026-01-02') === 404, 'route /api/card/slab: nba and unknown sports are 404')
  check(await sg('?kind=card&sport=nhl') === 400 && await sg('?kind=receipt&day=nope') === 400, 'route /api/card/slab: a missing or malformed date is 400')
}

console.log(failed ? `\n${failed} FAILED` : '\nOK: player cards')
process.exit(failed ? 1 : 0)
