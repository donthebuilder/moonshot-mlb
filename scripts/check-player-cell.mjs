#!/usr/bin/env node
// THE PLAYER NAME CELL (2026-10-13, PLAYER-ROWS): components/table/PlayerNameCell.js + lib/nameFit.js.
//
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-player-cell.mjs                    unit checks only
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-player-cell.mjs --base http://localhost:3100   + the live pages, in a browser
//
// PART 1, no browser. lib/nameFit.js on TEST names (labelled TEST: made up to hit each rule, never shown on the site) with a fake text
// measure (0.56em a character, 1.1x for capitals): a long hyphenated name, a suffix, one word, a 40-character name, a name that fits.
//   - a name never loses letters except as "initial + surname" / "surname", and then says it was shortened
//   - a one-line result fits the room; a two-line result wraps into two lines, every word inside the room
//   - the steps run in order: full, smaller, two lines, initial + surname, surname
//   - chips: the call word (prio 0) is never dropped; the opponent's text goes before the position; nothing wraps
//   - the opponent reads "@ UTA" / "vs BOS"; a bare code with no known side stays bare (never a guessed "vs")
// PART 2, with --base: for each live table that draws the cell, at 390 / 360 / 430 (phone) and 1280 (desktop):
//   - every body row is the SAME height (one value), 58 on a phone and 52 on a desktop (compactPhoneRow, the LAMP watchlist: 52 on a phone too)
//   - no name is clipped (its text box fits its lines), no chip line wraps or overflows, nothing sticks out of the name cell
//   - the face is decorative (alt=""), lazy, async, has width and height
//   - the name is a button, the cell is at least 44px tall, and at most MAX_FACES images are in the DOM per table
// Exit 1 on any failure.
import { fitName, planChips, oppFromGame, oppWords, surnameOf, initialSurname, wrapWords } from '../lib/nameFit.js'
import { MAC_CHROME, MAC_BRAVE, EXTRA_PATHS } from './_browser.mjs'

let fails = 0
const ok = (cond, msg) => { if (!cond) { fails += 1; console.log(`FAIL ${msg}`) } }
const meas = (t, px, weight = 600) => [...String(t)].reduce((s, ch) => s + px * (/[A-Z]/.test(ch) ? 0.62 : /[ .]/.test(ch) ? 0.3 : 0.54), 0) * (weight >= 700 ? 1.04 : 1)

// ── PART 1 ───────────────────────────────────────────────────────────────────
const ROOM = 109   // PC_GEOM.phone: 164 - 12 - 36 - 7
const TEST_NAMES = [
  'TEST Al Wu', 'TEST Short', 'Connor McDavid', 'Kenneth Walker III', 'Shai Gilgeous-Alexander', 'Christian McCaffrey',
  'TEST Bartholomew Montgomery-Featherstonehaugh Jr.', 'TEST Madonna', 'Jean-Gabriel Pageau', 'Nick Suzuki', 'Amon-Ra St. Brown',
]
const ORDER = ['full', 'small', 'two', 'initial', 'initial-two', 'surname']
for (const name of TEST_NAMES) {
  for (const sizes of [[12, 11], [13, 12]]) {
    const f = fitName(name, { room: ROOM, measure: meas, sizes })
    const small = sizes[sizes.length - 1]
    ok(ORDER.includes(f.mode), `${name}: unknown mode ${f.mode}`)
    ok(!/…|\.\.\./.test(f.text) || /^[A-Z]\. /.test(f.text) || /Jr\.$/.test(f.text), `${name}: ellipsis in ${f.text}`)
    ok(f.lines === 1 || f.lines === 2, `${name}: lines ${f.lines}`)
    if (f.mode === 'full' || f.mode === 'small') {
      ok(!f.shortened && f.text === name, `${name}: full mode must keep the whole name`)
      ok(meas(f.text, f.size) <= ROOM, `${name}: one-line result wider than the room`)
      if (f.mode === 'small') ok(meas(name, sizes[0]) > ROOM && f.size === small, `${name}: went small without need`)
    }
    if (f.mode === 'two') {
      const w = wrapWords(name, ROOM, small, meas)
      ok(w && w.length === 2 && f.lines === 2, `${name}: two-line mode must wrap into 2 lines`)
      ok(meas(name, small) > ROOM, `${name}: two lines although it fitted one`)
      ok(f.text === name && !f.shortened, `${name}: two-line mode keeps the whole name`)
    }
    if (f.mode === 'initial' || f.mode === 'initial-two' || f.mode === 'surname') {
      ok(f.shortened, `${name}: a shortened name says so`)
      ok(!wrapWords(name, ROOM, small, meas)?.length || wrapWords(name, ROOM, small, meas).length > 2, `${name}: shortened although two lines held the whole name`)
    }
    if (f.mode === 'initial') ok(f.text === initialSurname(name) && meas(f.text, small) <= ROOM, `${name}: initial mode`)
    if (f.mode === 'surname') ok(f.text === surnameOf(name), `${name}: surname mode`)
  }
}
ok(fitName('TEST Al Wu', { room: ROOM, measure: meas }).mode === 'full', 'a short name stays at the first size')
ok(fitName('Kenneth Walker III', { room: ROOM, measure: meas }).mode === 'two', 'Kenneth Walker III goes to two lines, whole')
ok(fitName('Shai Gilgeous-Alexander', { room: ROOM, measure: meas }).mode !== 'full', 'Gilgeous-Alexander steps down')
ok(fitName('', { room: ROOM, measure: meas }).text === '', 'an empty name is empty')
ok(surnameOf('Kenneth Walker III') === 'Walker III' && surnameOf('Madonna') === 'Madonna' && surnameOf('Odell Beckham Jr.') === 'Beckham Jr.', 'surnameOf')
ok(initialSurname('Kenneth Walker III') === 'K. Walker III', 'initialSurname')

// chips
const C = (key, w, prio) => ({ key, w, prio })
let kept = planChips([C('pos', 18, 1), C('club', 14, 2), C('opp', 40, 3), C('call', 42, 0)], 113)
ok(kept.has('call') && kept.has('pos'), 'the call and the position survive a tight line')
ok(!kept.has('opp'), 'the opponent text goes first')
kept = planChips([C('pos', 18, 1), C('club', 14, 2), C('opp', 30, 3)], 113)
ok(kept.size === 3, 'everything stays when it fits')
kept = planChips([C('call', 200, 0), C('pos', 18, 1)], 50)
ok(kept.has('call') && !kept.has('pos'), 'the call is never dropped, even over the room')
kept = planChips([C('pos', 18, 1), C('club', 14, 2), C('opp', 40, 3), C('call', 42, 0), C('inj', 28, 1), C('star', 10, 4)], 113)
ok(kept.has('call') && kept.has('inj'), 'call and injury outrank the opponent and the star')
const widthOf = (set, list) => list.filter((c) => set.has(c.key)).reduce((s, c) => s + c.w, 0) + (set.size - 1) * 5
{
  const list = [C('pos', 18, 1), C('club', 14, 2), C('opp', 40, 3), C('call', 42, 0), C('inj', 28, 1), C('star', 10, 4)]
  const k = planChips(list, 113)
  ok(widthOf(k, list) <= 113, 'the planned chip line fits the room')
}

// opponent
ok(JSON.stringify(oppFromGame('EDM@LAK', 'LAK')) === '{"opp":"EDM","away":false}', 'EDM@LAK seen from LAK: EDM, he is home')
ok(JSON.stringify(oppFromGame('EDM@LAK', 'EDM')) === '{"opp":"LAK","away":true}', 'EDM@LAK seen from EDM: LAK, he is away')
ok(oppFromGame('EDM@LAK', 'TOR') === null && oppFromGame('', 'TOR') === null && oppFromGame('TOR', 'TOR') === null, 'a club on neither side / not a game is null')
ok(oppWords('@UTA') === '@ UTA' && oppWords('@ UTA') === '@ UTA', '"@UTA" reads "@ UTA"')
ok(oppWords('BOS', true) === 'vs BOS' && oppWords('BOS', false) === '@ BOS', 'a bare code with a known side')
ok(oppWords('BOS') === 'BOS' && oppWords('BOS', undefined) === 'BOS' && oppWords('BOS', null) === 'BOS', 'a bare code with no known side is never guessed')
ok(oppWords('—') === '' && oppWords('') === '' && oppWords(null) === '', 'nothing to say')

if (fails) { console.log(`\n${fails} unit failure${fails === 1 ? '' : 's'}`); process.exit(1) }
console.log(`unit: ok (${TEST_NAMES.length} TEST names x 2 size sets, chips, opponent)`)

// ── PART 2: the live pages ───────────────────────────────────────────────────
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base')
if (!BASE) { console.log('no --base: unit checks only'); process.exit(0) }
const { createRequire } = await import('node:module')
const { existsSync } = await import('node:fs')
const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const BROWSERS = [arg('--browser'), MAC_CHROME, MAC_BRAVE, ...EXTRA_PATHS, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
const executablePath = BROWSERS.find((p) => existsSync(p))
const PAGES = (arg('--pages') || '/app#sport=mlb&tab=fullboard,/app#sport=nhl&tab=fullboard,/app#sport=nfl&tab=research,/app#sport=nba&tab=fullboard,/app#sport=nhl&tab=watchlist,/app#sport=nfl&tab=watchlist').split(',')
const VPS = [[390, 844, 58], [360, 780, 58], [430, 932, 58], [1280, 900, 52]]
const MAX_FACES = 260
const browser = await chromium.launch({ executablePath })
let pageFails = 0
const bad = (m) => { pageFails += 1; console.log(`FAIL ${m}`) }
for (const path of PAGES) {
  for (const [w, h, rowH] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: w < 700 })
    const page = await ctx.newPage()
    // a watchlist page needs someone on it: real players from the live board, seeded the way the site stores a follow
    const lamp = await fetch(`${BASE}/api/lamp/board`).then((r) => r.json()).catch(() => null)
    const picks = (lamp?.games || []).flatMap((g) => g.rows || []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8)
    const follow = Object.fromEntries(picks.map((r) => ['nhl:' + r.playerId, { sport: 'nhl', id: String(r.playerId), name: r.name, team: r.team, position: r.pos || '', at: Date.now() }]))
    const wk = await fetch('https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current/nfl_week.json').then((r) => r.json()).catch(() => null)
    const pins = (wk?.players || []).filter((p) => p.position !== 'DEF').sort((a, b) => (b.scores?.TD ?? 0) - (a.scores?.TD ?? 0)).slice(0, 8).map((p) => ({ player_id: p.player_id, name: p.name, team: p.team, opp: p.opp, position: p.position, espn_id: p.espn_id, pinned_at: Date.now(), pinned_score: p.scores?.TD ?? null }))
    await page.addInitScript(([f, n]) => { try { localStorage.setItem('dash_follow_v1', JSON.stringify(f)); localStorage.setItem('tuddy_watchlist_v1', JSON.stringify({ pins: n })) } catch {} }, [follow, pins])
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {})
    await page.waitForSelector('.dtv2-pc tbody tr', { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const res = await page.evaluate(({ rowH }) => {
      const out = []
      document.querySelectorAll('.dtv2-pc').forEach((root, ti) => {
        const rows = [...root.querySelectorAll('tbody tr')]
        const heights = [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))]
        const problems = []
        if (heights.length !== 1) problems.push(`row heights differ: ${heights.join(',')}`)
        else if (heights[0] !== (root.classList.contains('dtv2-pc52') ? Math.min(rowH, 52) : rowH)) problems.push(`row height ${heights[0]}, want ${root.classList.contains('dtv2-pc52') ? Math.min(rowH, 52) : rowH}`)
        let clipped = 0, wrapped = 0, outside = 0, small = 0, notBtn = 0
        const imgs = root.querySelectorAll('.pc-face img')
        rows.forEach((tr) => {
          const cell = tr.querySelector('td.pcell'); if (!cell) return
          const nm = cell.querySelector('.pc-nm')
          if (nm && nm.scrollHeight > nm.clientHeight + 1) clipped += 1
          const ch = cell.querySelector('.pc-chips')
          if (ch) { const tops = [...ch.children].map((c) => Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2)); const edge = ch.getBoundingClientRect().right; const last = ch.lastElementChild ? ch.lastElementChild.getBoundingClientRect().right : 0; if (last > edge + 1 || Math.max(...tops) - Math.min(...tops) > 3) wrapped += 1 }
          const cb = cell.getBoundingClientRect()
          cell.querySelectorAll('.pc-face, .pc-name, .pc-chips, .pc-chip').forEach((el) => { const b = el.getBoundingClientRect(); if (b.width && (b.right > cb.right + 1 || b.bottom > cb.bottom + 1 || b.top < cb.top - 1)) outside += 1 })
          if (cb.height < 44) small += 1
          if (!cell.querySelector('.pc-name button')) notBtn += 1
        })
        if (clipped) problems.push(`${clipped} clipped names`)
        if (wrapped) problems.push(`${wrapped} chip lines wrap or overflow`)
        if (outside) problems.push(`${outside} pieces stick out of the cell`)
        if (small) problems.push(`${small} cells under 44px`)
        if (notBtn) problems.push(`${notBtn} names are not a button`)
        let img = 0
        imgs.forEach((i) => { if (i.getAttribute('alt') !== '' || i.getAttribute('loading') !== 'lazy' || i.getAttribute('decoding') !== 'async' || !i.getAttribute('width') || !i.getAttribute('height')) img += 1 })
        if (img) problems.push(`${img} face images missing alt="" / lazy / async / size`)
        out.push({ ti, rows: rows.length, imgs: imgs.length, problems })
      })
      return out
    }, { rowH })
    const tables = res.filter((t) => t.rows)
    if (!tables.length) bad(`${path} @${w}: no player-cell table found`)
    for (const t of tables) {
      for (const p of t.problems) bad(`${path} @${w} table ${t.ti}: ${p}`)
      if (t.imgs > MAX_FACES) bad(`${path} @${w} table ${t.ti}: ${t.imgs} face images`)
    }
    if (!tables.some((t) => t.problems.length)) console.log(`ok ${path} @${w}: ${tables.map((t) => `${t.rows} rows`).join(', ')}`)
    await ctx.close()
  }
}
await browser.close()
if (pageFails) { console.log(`\n${pageFails} page failure${pageFails === 1 ? '' : 's'}`); process.exit(1) }
console.log('check-player-cell: all green')
