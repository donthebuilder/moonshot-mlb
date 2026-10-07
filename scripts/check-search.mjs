// THE ONE GLOBAL SEARCH, held to its routing (2026-10-07). node scripts/check-search.mjs
//
// 1. FIXTURES (always): lib/search/engine.js against TEST data -- labelled as such, never shown on the
//    site -- asserts, for every product in the registry, that a player, a club and a game each resolve to
//    the address the product itself uses (lib/routes.js playerHref / teamHref / gameHref), that this
//    product's results come first, and that the matching behaves (accents, club codes, every typed word).
// 2. LIVE (--base http://localhost:3234 --browser <chrome>, optional): drives the box in a real browser at
//    390x844 / 360x780 / 430x932 / 844x390: opens it from the header's button, types a name in each
//    product, taps the result, and asserts the address, the sport on screen, that Back returns, that the
//    results box scrolls inside itself and that the field is not under the on-screen keyboard (visual
//    viewport). Reads real names from the running site's own indexes; nothing is invented.
// BUCKETS is hidden until BUCKETS_PUBLIC=on (lib/routes.js BRAND.nba.hidden); this check's own process opens it so its routing is held too
process.env.NEXT_PUBLIC_BUCKETS_PUBLIC = 'on'
import './_esm-resolve.mjs'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const E = await import('../lib/search/engine.js')
const R = await import('../lib/routes.js')

let bad = 0
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) bad++ }

// ── TEST FIXTURES (not site data) ───────────────────────────────────────────
const TEST = {
  mlb: { players: [{ id: 600001, name: 'Test Hitter', team: 'NYY', pos: 'RF' }, { id: 600002, name: 'Tést Ünder', team: 'BOS', pos: 'P' }], games: [{ id: 700001, away: 'NYY', home: 'BOS', status: 'test' }], team: 'NYY', teamQ: 'yankees' },
  nfl: { players: [{ id: '00-0099001', name: 'Test Receiver', team: 'KC', pos: 'WR' }, { id: '00-0099002', name: 'Other Runner', team: 'SF', pos: 'RB' }], games: [{ id: 800001, away: 'KC', home: 'SF', status: 'test' }], team: 'KC', teamQ: 'chiefs' },
  nhl: { players: [{ id: 8990001, name: 'Test Skater', team: 'TOR', pos: 'C' }, { id: 8990002, name: 'Other Winger', team: 'BOS', pos: 'L' }], games: [{ id: 2026020001, away: 'TOR', home: 'BOS', status: 'test' }], team: 'TOR', teamQ: 'maple leafs' },
  nba: { players: [{ id: 9990001, name: 'Test Guard', team: 'BOS', pos: 'G' }, { id: 9990002, name: 'Other Wing', team: 'LAL', pos: 'F' }], games: [{ id: 401800001, away: 'BOS', home: 'LAL', status: 'test' }], team: 'BOS', teamQ: 'celtics' },
}
const indexes = Object.fromEntries(Object.entries(TEST).map(([s, t]) => [s, { players: t.players, games: t.games }]))
const ALL = R.ALL_SPORT_KEYS

ok(ALL.every((s) => TEST[s]), `a fixture for every registered product (${ALL.join(', ')})`)

for (const s of ALL) {
  const t = TEST[s]
  const p = E.searchPlayers(s, t.players[0].name.split(' ')[1].toLowerCase(), t.players)
  ok(p.length === 1 && p[0].href === E.hashOf(R.playerHref(s, t.players[0].id)), `${s}: a player result opens ${p[0]?.href}`)
  ok(p[0]?.href.startsWith(`#sport=${s}&`), `${s}: the player address names its own sport`)
  const c = E.searchTeams(s, t.teamQ)
  ok(c.length >= 1 && c[0].code === t.team && c[0].href === E.hashOf(R.teamHref(s, t.team)), `${s}: "${t.teamQ}" finds ${t.team} -> ${c[0]?.href}`)
  const byCode = E.searchTeams(s, t.team.toLowerCase())
  ok(byCode[0]?.code === t.team, `${s}: the club code ${t.team} finds the club first`)
  const g = E.searchGames(s, t.team, t.games)
  ok(g.length === 1 && g[0].href === R.gameHref(s, t.games[0].id), `${s}: a game result opens ${g[0]?.href}`)
  const roster = E.searchPlayers(s, t.team, t.players)
  ok(roster.some((x) => x.id === String(t.players.find((y) => y.team === t.team).id)), `${s}: a club code alone lists its players`)
}

// every typed word has to land; accents fold
ok(E.searchPlayers('mlb', 'tes under', TEST.mlb.players).length === 1, 'mlb: "tes under" finds Tést Ünder (accents fold, each word lands)')
ok(E.searchPlayers('mlb', 'test zzz', TEST.mlb.players).length === 0, 'mlb: a word that is not in the name finds nobody')
ok(E.searchPlayers('mlb', 'x', TEST.mlb.players).length === 0 && E.searchAll({ q: 'x', sport: 'mlb', indexes }).length === 0, 'one letter searches nothing')

// the current product first, the others after, in registry order
for (const s of ALL) {
  const g = E.searchAll({ q: 'test', sport: s, indexes, visible: ALL })
  ok(g[0].sport === s && g[0].here && g.length === ALL.length && g.slice(1).every((x) => !x.here), `${s}: this product's results come first, then the others`)
  ok(g.slice(1).map((x) => x.sport).join() === ALL.filter((k) => k !== s).join(), `${s}: the others follow in registry order`)
}
// a hidden product (BUCKETS before it opens) is not searched: only the visible list is
const pub = R.SPORT_KEYS
ok(E.searchAll({ q: 'test', sport: 'mlb', indexes, visible: pub }).every((x) => pub.includes(x.sport)), 'only the products this visitor may see are searched')
// no index loaded yet: clubs still answer, nothing else is invented
const bare = E.searchAll({ q: 'yankees', sport: 'mlb', indexes: {}, visible: ALL })
ok(bare[0].teams[0]?.code === 'NYY' && bare[0].players.length === 0 && bare[0].games.length === 0, 'before an index loads, clubs answer and nothing else is made up')
// every address the box can emit is one the registry resolves
for (const s of ALL) {
  const hrefs = [...E.searchTeams(s, TEST[s].team), ...E.searchPlayers(s, TEST[s].players[0].name, TEST[s].players), ...E.searchGames(s, TEST[s].team, TEST[s].games)].map((r) => r.href)
  for (const h of hrefs) {
    const params = new URLSearchParams(h.replace(/^#/, ''))
    const tab = params.get('tab')
    ok(params.get('sport') === s && (tab ? R.resolveTab(s, tab).status === 'ok' : params.has('p')), `${s}: ${h} -- the sport and its tab are the product's own`)
  }
}

// ── LIVE (optional) ─────────────────────────────────────────────────────────
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base')
if (BASE) {
  const req = createRequire(`${process.cwd()}/package.json`)
  const { chromium } = req('playwright-core')
  const exe = [arg('--browser'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'].filter(Boolean).find((p) => existsSync(p))
  if (!exe) { console.log('FAIL no Chrome/Brave for --base (pass --browser)'); process.exit(1) }
  const browser = await chromium.launch({ executablePath: exe, headless: true })
  const VPS = [['390', 390, 844, true], ['360', 360, 780, true], ['430', 430, 932, true], ['land', 844, 390, true], ['1280', 1280, 900, false]]
  // what to search in each product: a name from its own index, read from the running site
  const base = BASE.replace(/\/$/, '')
  const j = async (u) => { try { const r = await fetch(base + u); return r.ok ? r.json() : null } catch { return null } }
  const lamp = (await j('/api/lamp/players'))?.players?.find((p) => p.id && p.name)
  const names = { nhl: lamp && { q: lamp.name, id: String(lamp.id), want: `player=${lamp.id}` } }
  for (const [name, w, h, touch] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    for (const s of R.SPORT_KEYS) {
      await page.goto(`${base}/app#sport=${s}&tab=home`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.hdr-search', { timeout: 20000 }).catch(() => {})
      const btn = await page.$('.hdr-search')
      ok(Boolean(btn), `${name} ${s}: the header has the search button`)
      if (!btn) continue
      const box = await btn.boundingBox()
      ok(box && box.width >= 44 && box.height >= 44, `${name} ${s}: the button is at least 44x44 (${box?.width}x${box?.height})`)
      await btn.click()
      await page.waitForSelector('.qs-in', { timeout: 5000 })
      await page.waitForTimeout(250)
      const focused = await page.evaluate(() => document.activeElement?.classList?.contains('qs-in'))
      ok(focused, `${name} ${s}: the field has focus`)
      // a club answers at once, no index needed
      const probe = { mlb: 'yankees', nfl: 'chiefs', nhl: 'maple leafs', nba: 'celtics' }[s]
      await page.fill('.qs-in', probe)
      await page.waitForSelector('[data-qs^="team:"]', { timeout: 8000 })
      const tbox = await page.$eval('.qs-list', (el) => { const r = el.getBoundingClientRect(); return { bottom: r.bottom, vh: window.visualViewport.height, sh: el.scrollHeight, ch: el.clientHeight, over: getComputedStyle(el).overflowY } })
      ok(tbox.bottom <= tbox.vh + 1, `${name} ${s}: the results box ends inside the visible screen (${Math.round(tbox.bottom)} <= ${Math.round(tbox.vh)})`)
      const row = await page.$(`[data-qs^="team:${s}:"]`)
      ok(Boolean(row), `${name} ${s}: its own club is a result`)
      const before = page.url()
      await row.click()
      await page.waitForTimeout(600)
      const after = new URLSearchParams(new URL(page.url()).hash.replace(/^#/, ''))
      ok(after.get('sport') === s && after.get('tab') === 'team' && /^[A-Z]{2,4}$/.test(after.get('team') || ''), `${name} ${s}: the club opens its page (${page.url().split('#')[1]})`)
      const dlg = await page.$('.qs-panel')
      ok(!dlg, `${name} ${s}: the box closed after the tap`)
      await page.goBack()
      await page.waitForTimeout(1200)
      // a shell may write Home without its tab (#sport=mlb); that is the same page
      const canon = (u) => { const h = new URLSearchParams((u.split('#')[1] || '')); if (!h.get('tab')) h.set('tab', 'home'); return h.toString() }
      ok(canon(page.url()) === canon(before), `${name} ${s}: Back returns to where it was`)
      // Escape closes
      await page.click('.hdr-search'); await page.waitForSelector('.qs-in'); await page.keyboard.press('Escape'); await page.waitForTimeout(200)
      ok(!(await page.$('.qs-panel')), `${name} ${s}: Escape closes the box`)
    }
    // a person in another product, from MOONSHOT: LAMP's first roster name
    if (names.nhl) {
      await page.goto(`${base}/app#sport=mlb&tab=home`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.hdr-search'); await page.click('.hdr-search'); await page.waitForSelector('.qs-in')
      await page.fill('.qs-in', names.nhl.q)
      await page.waitForSelector(`[data-qs="player:nhl:${names.nhl.id}"]`, { timeout: 15000 }).catch(() => {})
      const r = await page.$(`[data-qs="player:nhl:${names.nhl.id}"]`)
      ok(Boolean(r), `${name} mlb: another product's player is a result (${names.nhl.q})`)
      if (r) {
        await r.click(); await page.waitForTimeout(1200)
        const h = page.url().split('#')[1] || ''
        ok(h.includes('sport=nhl') && h.includes(names.nhl.want), `${name} mlb -> nhl: his page opens (${h})`)
        await page.goBack(); await page.waitForTimeout(800)
        ok((page.url().split('#')[1] || '').includes('sport=mlb'), `${name} nhl -> back: MOONSHOT again`)
      }
    }
    ok(errs.length === 0, `${name}: no page errors${errs.length ? ` (${errs[0]})` : ''}`)
    await ctx.close()
  }
  await browser.close()
}

console.log(bad ? `${bad} problem(s)` : 'OK search: every result kind routes to its product\'s own address, current product first')
process.exit(bad ? 1 : 0)
