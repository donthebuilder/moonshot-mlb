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

console.log(failed ? `\n${failed} FAILED` : '\nOK: player cards')
process.exit(failed ? 1 : 0)
