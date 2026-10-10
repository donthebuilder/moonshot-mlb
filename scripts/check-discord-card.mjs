#!/usr/bin/env node
// THE DASH DISCORD CARD (lib/dash/discordCard.js), 2026-10-10.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-discord-card.mjs
//
// ALL DATA HERE IS TEST DATA (names, ids, scores are made up and labelled TEST). Every webhook is a TEST
// placeholder and global fetch is replaced: nothing is ever sent.
//
//  A  limits: title 256, description 4096, 25 fields, name 256, value 1024, footer 2048, total 6000; the clamp never cuts mid-word
//  B  the status word survives any clamp and comes only from lib/callStatus STATUS_WORD
//  C  no link anywhere: no embed url, no URL or markdown link in any string; the picture slot takes attachment:// only
//  D  the colour is the product's accent from lib/sportAccent (no typed hex in the module); the footer word is the BRAND registry's
//  E  the three alerts (NHL goal, NFL touchdown, MLB homer), the Card (members + result) and the receipts render the expected sections
//  F  postToDiscord with an embed: one embed, no content, no momentEmbed, the png still attaches (attachment://card.png), 429 retry + log intact
//  G  members card leak tests: no members webhook = zero calls; with one = exactly one call, to the members URL only; never X, never a free hook
import { readFileSync } from 'node:fs'

let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  -- ${extra}` : ''}`) }

const U = (n) => `https://discord.com/api/webhooks/${n}/TEST-TOKEN`
const PUBLIC_ENV = { DISCORD_HOMER_WEBHOOK: U('1001'), DISCORD_MLB_WEBHOOKS: U('1002'), DISCORD_NFL_WEBHOOKS: U('1003'), DISCORD_NHL_WEBHOOKS: U('1004'), DISCORD_RECEIPTS_WEBHOOK: U('1006') }
const ENV_KEYS = [...Object.keys(PUBLIC_ENV), 'DISCORD_MEMBERS_WEBHOOK', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']
const setEnv = (extra = {}) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, PUBLIC_ENV, extra) }

const calls = []
let nextStatus = []
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), body: init.body, headers: init.headers })
  const status = nextStatus.shift() ?? 204
  return { ok: status < 300, status, statusText: 'x', headers: { get: () => null }, json: async () => ({ retry_after: 0.01 }) }
}
const bodyOf = (c) => (typeof c.body === 'string' ? JSON.parse(c.body) : JSON.parse(c.body.get('payload_json')))

const { dayWords, siteBase, embedUrls, playerUrl, ledgerLink, LIMITS, buildCard, clampText, clampLines, fitEmbed, embedSize, embedHasLink, accentOf, footerOf, colorInt, noLinks } = await import('../lib/dash/discordCard.js')
const { STATUS_WORD } = await import('../lib/callStatus.js')
const { SPORT_ACCENT } = await import('../lib/sportAccent.js')
const { BRAND, playerHref, appHref } = await import('../lib/routes.js')
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.test'
// the ONLY two link slots a Discord card has: the title url and ONE ledger markdown line, both on the site host
const slotsOk = (e, { title = false, ledger = false } = {}) => {
  const urls = embedUrls(e)
  const md = [e.title, e.description, e.footer?.text, ...(e.fields || []).flatMap((f) => [f.name, f.value])].join('\n').match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) || []
  return urls.every((u) => u.startsWith(`${siteBase()}/`)) && (e.url ? title : true) && md.length === (ledger ? 1 : 0) && urls.length === (e.url ? 1 : 0) + md.length
}

// ── A. limits and the clamp ─────────────────────────────────────────────────
const long = (n, w = 'wordy') => Array.from({ length: n }, () => w).join(' ')
const big = buildCard({
  sport: 'nhl', title: `\u{1F6A8} ${long(100)}`, status: 'called', description: long(2000),
  sections: Array.from({ length: 30 }, (_, i) => ({ name: `SECTION ${i} ${long(80)}`, lines: Array.from({ length: 40 }, (_, j) => `line ${j} ${long(30)}`) })),
})
check('A1 title <= 256', [...big.title].length <= LIMITS.title)
check('A2 description <= 4096', [...big.description].length <= LIMITS.description)
check('A3 fields <= 5 by default (and never > 25)', big.fields.length <= 5 && big.fields.length <= LIMITS.fields)
check('A4 every field name <= 256 and value <= 1024', big.fields.every((f) => [...f.name].length <= LIMITS.name && [...f.value].length <= LIMITS.value))
check('A5 total <= 6000', embedSize(big) <= LIMITS.total, String(embedSize(big)))
check('A5b footer <= 2048', [...big.footer.text].length <= LIMITS.footer)
const many = fitEmbed({ title: 't', description: 'd', fields: Array.from({ length: 40 }, (_, i) => ({ name: `n${i}`, value: 'v'.repeat(1000) })), footer: { text: 'f' } })
check('A6 fitEmbed: 40 fat fields -> inside 6000 and 25', many.fields.length <= 25 && embedSize(many) <= LIMITS.total, `${many.fields.length} fields ${embedSize(many)}`)
const c1 = clampText('Kyle Connor scores a hat trick against Anaheim tonight', 30)
check('A7 clamp never cuts mid-word', c1.endsWith('…') && /^Kyle Connor scores a hat/.test(c1) && !/hat t/.test(c1), c1)
check('A8 clamp keeps a short text untouched', clampText('short', 30) === 'short')
check('A9 a single over-long word is the only raw cut and ends in an ellipsis', clampText('x'.repeat(50), 10).length === 10 && clampText('x'.repeat(50), 10).endsWith('…'))
check('A10 an emoji is never split', ![...clampText('\u{1F6A8}'.repeat(40), 11)].some((ch) => ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff))
const cl = clampLines(['one', 'two', 'three '.repeat(300)], 30)
check('A11 clampLines drops whole lines from the bottom first', cl.split('\n').every((l) => ['one', 'two'].includes(l) || l.endsWith('…')) && [...cl].length <= 30, JSON.stringify(cl))

// ── B. the status word ──────────────────────────────────────────────────────
for (const st of ['called', 'board', 'off']) {
  const e = buildCard({ sport: 'nfl', title: 'T', status: st, description: long(3000) })
  check(`B1 ${st}: description leads with ${STATUS_WORD[st]} after a 3000-word clamp`, e.description.startsWith(STATUS_WORD[st]) && [...e.description].length <= LIMITS.description)
}
check('B2 no status given = no status word invented', !buildCard({ sport: 'nfl', title: 'T', description: 'x' }).description.match(/CALLED|ON THE BOARD/))
check('B3 an unknown status prints nothing', !/undefined|null/.test(buildCard({ sport: 'nfl', title: 'T', status: 'weird', description: 'x' }).description))

// ── C. no links ─────────────────────────────────────────────────────────────
const linky = buildCard({ sport: 'mlb', title: 'See https://evil.example/x now', description: 'a [site](https://dashnetwork.vercel.app/called) b <https://x.example> c https://y.example/z', sections: [{ name: 'N https://q.example', lines: ['[go](http://a.example)', 'plain dashnetwork.vercel.app/called text'] }] })
check('C1 no embed link anywhere after cleaning', !embedHasLink(linky), JSON.stringify(linky).slice(0, 200))
check('C2 the bare site text is left as text', linky.fields[0].value.includes('dashnetwork.vercel.app/called'))
check('C3 no url key on any built embed', !('url' in linky))
check('C4 markdown link keeps its words', noLinks('[the ledger](https://a.example/b)') === 'the ledger')
check('C5 image slot: attachment:// accepted', buildCard({ sport: 'nhl', title: 'T', image: 'attachment://card.png' }).image?.url === 'attachment://card.png')
check('C6 image slot: a web URL refused', !buildCard({ sport: 'nhl', title: 'T', image: 'https://x.example/a.png' }).image)
check('C7 embedHasLink catches a url key and a markdown link', embedHasLink({ title: 't', url: 'https://x.example' }) && embedHasLink({ title: '[a](b)' }))

// ── D. colour and footer from the registry ──────────────────────────────────
for (const s of ['mlb', 'nfl', 'nhl', 'nba']) {
  const e = buildCard({ sport: s, title: 'T' })
  check(`D1 ${s}: colour = SPORT_ACCENT as an integer`, e.color === parseInt(String(SPORT_ACCENT[s]).replace('#', ''), 16) && e.color === accentOf(s))
  check(`D2 ${s}: footer = "${BRAND[s].name} · DASH Network"`, e.footer.text === `${BRAND[s].name} · DASH Network`)
}
check('D3 a cross-sport card wears the house footer and MOONSHOT colour', buildCard({ sport: null, title: 'T' }).footer.text === 'DASH Network' && buildCard({ title: 'T' }).color === accentOf('mlb'))
check('D4 colorInt rejects a non-hex', colorInt('red') === undefined && colorInt('#ff0000') === 0xff0000)
const src = readFileSync(new URL('../lib/dash/discordCard.js', import.meta.url), 'utf8')
check('D5 no typed hex colour in the module', !/#[0-9a-fA-F]{6}\b|0x[0-9a-fA-F]{6}\b/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'#rrggbb'/g, '')))
check('D6 timestamp = the event time, omitted when unknown', buildCard({ sport: 'nhl', title: 'T', at: '2026-10-10T03:41:00Z' }).timestamp === '2026-10-10T03:41:00.000Z' && !('timestamp' in buildCard({ sport: 'nhl', title: 'T' })))
check('D7 footerOf uses the registry', footerOf('nhl') === 'LAMP · DASH Network')

// ── E. the roll-out kinds, in the approved copy (TEST rows) ─────────────────
const sec = (e) => (e.fields || []).map((f) => f.name)
const noFields = (e) => !('fields' in e)
const NEVER = /probab|chance|\d\s*%|\block(?:ed|s|ing)?\b|guarantee|\bwinners?\b|\bwon\b/i
const allEmbeds = []
const keep = (e) => { allEmbeds.push(e); return e }
const goalFeed = await import('../lib/nhl/goalFeed.js')
const goalRow = { game_id: 1, player_id: 11, goal_n: 1, day: '2099-01-01', period: 2, period_type: 'REG', time_in_period: '12:34', strength: 'pp', empty_net: false, team: 'TST', opp: 'EXA', name: 'Test Skater', season_goals: 5, assists: [{ id: 2, name: 'Test Helper' }, { id: 3, name: 'D. DeMelo' }], score_after: 'TST 2 · EXA 1', status: 'called', rank_in_game: 1, lamp_score: 61, confirmed_at: '2099-01-01T01:00:00Z', first_seen_at: '2099-01-01T00:58:00Z' }
const g = keep(goalFeed.goalEmbed(goalRow, [goalRow], { multiLine: 'His 2nd multi-goal game this season.' }))
check('E1 NHL goal: title (club unmapped = abbreviation form)', g.title === '\u{1F6A8} Test Skater scores · TST vs EXA', g.title)
const gw = keep(goalFeed.goalEmbed({ ...goalRow, team: 'WPG', opp: 'ANA', score_after: 'ANA 3 · WPG 1' }, [goalRow]))
check('E1b NHL goal: a mapped club is named, the opponent stays out of the title', gw.title === '\u{1F6A8} Test Skater scores for Winnipeg Jets', gw.title)
check('E2 NHL goal: one description block, no fields', noFields(g))
check('E3 NHL goal: line 1 = bold CALLED, the top-call phrase, "ranking score" (never "LAMP score")', g.description.split('\n')[0] === `**CALLED** before puck drop. TST's top call on the LAMP board (ranking score 61).` && !/LAMP score/.test(g.description), g.description.split('\n')[0])
check('E4 NHL goal: line 2 = period, clock, strength, then the score AWAY, HOME', g.description.split('\n')[1] === '2nd period, 12:34, PP goal. TST 2, EXA 1.', g.description.split('\n')[1])
check('E5 NHL goal: line 3 = assists by last name, only when stored; the multi-goal line follows', g.description.split('\n')[2] === 'Assists: Helper, DeMelo.' && g.description.split('\n')[3] === 'His 2nd multi-goal game this season.')
check('E5b NHL goal: no assists stored = no assists line', !goalFeed.goalEmbed({ ...goalRow, assists: [] }, [goalRow]).description.includes('Assists'))
check('E5c NHL goal: ON THE BOARD never says the top-call phrase', (() => { const b = goalFeed.goalEmbed({ ...goalRow, status: 'board' }, [goalRow]); return b.description.startsWith('**ON THE BOARD**, not a called pick.') && !/top call/.test(b.description) })())
check('E6 NHL goal: footer LAMP, the timestamp is the confirmation time, only the title link', g.footer.text === 'LAMP · DASH Network' && g.timestamp === '2099-01-01T01:00:00.000Z' && slotsOk(g, { title: true }))
check('E6b NHL goal: the X text is unchanged (still CALLED IT and LAMP score)', goalFeed.postText(goalRow, [goalRow]).startsWith('\u{1F916} CALLED IT') && /LAMP score 61/.test(goalFeed.postText(goalRow, [goalRow])))

const td = await import('../lib/nfl/tdFeed.js')
const ev = { day: '2099-01-02', gameId: 'g', tdN: 1, team: 'TB', opponent: 'DAL', quarter: 3, clock: '4:12', text: 'x', parsed: { kind: 'pass', yards: 14, passer: 'Test Passer' }, kindWord: null, scorerName: 'Test Receiver', gsisId: '00-TEST', position: 'WR', seasonToDate: { td: 4, games: 5 }, onBot: { market: 'TD', rank: 88, grade: 'A' }, tdBoard: { rank: 3, of: 200 }, defense: { role: 'WR1', opp: 'DAL', tag: 'TARGET', rank: 3, season: 2025, current_season: 2026 } }
const t = keep(td.tdEmbed(ev, { extra: ['TEST reached line'] }))
check('E7 NFL TD: title names the club (registry), no fields', t.title === '\u{1F6A8} Test Receiver scores for Tampa Bay Buccaneers' && noFields(t), t.title)
check('E8 NFL TD: bold CALLED for an anytime touchdown, then the play and the quarter/clock', t.description.split('\n')[0] === '**CALLED** for an anytime touchdown. 14 yd from Test Passer, Q3 4:12.', t.description.split('\n')[0])
check('E9 NFL TD: defense line in the verified direction (rank 1 = most allowed), the season line', t.description.split('\n')[1] === 'DAL gave up the 3rd-most touchdowns in the league to WR1s last season.' && t.description.split('\n')[2] === '4 TD in 5 games this season.' && t.description.split('\n')[3] === 'TEST reached line', t.description)
check('E10 NFL TD: the unverified board/game-call rank is NOT printed', !/#88|88|on the TUDDY board|game call|TD pick/.test(t.description + t.title), t.description)
check('E9b NFL TD defense tense: last season = "gave up ... last season"; older = "in {year}"; current season or unreadable = present tense, no tense word', (() => {
  const L = (d) => td.tdEmbed({ ...ev, defense: { role: 'WR1', opp: 'DAL', tag: 'TARGET', rank: 3, ...d } }).description.split('\n')[1]
  return L({ season: 2024, current_season: 2026 }) === 'DAL gave up the 3rd-most touchdowns in the league to WR1s in 2024.'
    && L({ season: 2026, current_season: 2026 }) === 'DAL gives up the 3rd-most touchdowns in the league to WR1s.'
    && L({ season: undefined, current_season: undefined }) === 'DAL gives up the 3rd-most touchdowns in the league to WR1s.'
    && L({ season: 2025, current_season: undefined }) === 'DAL gives up the 3rd-most touchdowns in the league to WR1s.'
})())
check('E9c NFL TD AVOID wording likewise: "was one of the toughest ... last season"', td.tdEmbed({ ...ev, defense: { role: 'WR1', opp: 'DAL', tag: 'AVOID', rank: 30, season: 2025, current_season: 2026 } }).description.includes('DAL was one of the toughest touchdown matchups in the league for WR1s last season.'))
const dd = (d, extra = {}) => td.tdEmbed({ ...ev, defense: d, ...extra }).description
check('E11 NFL TD: AVOID at rank >= 22 = "one of the toughest", never "softest"; AVOID/EVEN in the middle and no tag print nothing', /one of the toughest/.test(dd({ role: 'WR1', opp: 'DAL', tag: 'AVOID', rank: 30 })) && !/softest/.test(dd({ role: 'WR1', opp: 'DAL', tag: 'AVOID', rank: 30 })) && !/gives up|toughest/.test(dd({ role: 'WR1', opp: 'DAL', tag: 'EVEN', rank: 17 })) && !/gives up|toughest/.test(dd(null)))
check('E12 NFL TD: ordinals are right (1st, 2nd, 11th, 12th)', [1, 2, 11, 12].map((r) => dd({ role: 'RB1', opp: 'DAL', tag: 'TARGET', rank: r }).match(/the (\S+)-most/)[1]).join() === '1st,2nd,11th,12th')
check('E13 NFL TD: season with no game count = "entering today"', /\n4 TD entering today\./.test(td.tdEmbed({ ...ev, seasonToDate: { td: 4, games: null } }).description))
check('E14 NFL TD: a game call that is not a TD call does not claim a touchdown market', !/anytime touchdown/.test(td.tdEmbed({ ...ev, onBot: { market: 'GAME', role: 'TOP', rank: 5 } }).description) && /anytime touchdown/.test(td.tdEmbed({ ...ev, onBot: { market: 'GAME', role: 'TD', rank: 5 } }).description))
const t2 = keep(td.tdEmbed({ ...ev, onBot: null, tdBoard: { rank: 3, of: 200 } }))
check('E15 NFL TD on the board: bold ON THE BOARD, not a called pick', t2.description.startsWith('**ON THE BOARD**, not a called pick. 14 yd from Test Passer, Q3 4:12.') && t2.footer.text === 'TUDDY · DASH Network', t2.description.split('\n')[0])
const t3 = td.tdEmbed({ ...ev, onBot: null, tdBoard: null, defense: null, seasonToDate: null })
check('E15b NFL TD off the board: NOT ON THE BOARD first', t3.description.startsWith('**NOT ON THE BOARD**.'))

const hf = await import('../lib/dash/homerFeed.js')
const hev = { name: 'Test Slugger', team: 'TST', opponent: 'EXA', home: true, inning: 'bot 7th', role: 'TOP', board_rank: 2, hr_n: 2, odds_over: 320, odds_book: 'TESTBOOK', stats: { season_hr: 30, season_iso: 0.25 } }
const h = keep(hf.homerEmbed(hev, { extra: ['TEST called at 5:10 PM ET'] }))
check('E16 MLB homer: title, (#2 tonight) kept, no fields', h.title === '\u{1F6A8} Test Slugger goes deep · TST vs EXA (#2 tonight)' && noFields(h), h.title)
check('E17 MLB homer: CALLED before first pitch, rank on tonight\'s board, role and price (no book name)', h.description.split('\n')[0] === "**CALLED** before first pitch: #2 on tonight's MOONSHOT board, TOP pick (1+ home run) · +320." && !JSON.stringify(h).includes('TESTBOOK'), h.description.split('\n')[0])
check('E18 MLB homer: half-inning words, AWAY at HOME, then the stats line with ISO explained', h.description.split('\n')[1] === 'Bottom of the 7th, EXA at TST.' && h.description.split('\n')[2] === '30 HR this season, .250 ISO (isolated power: extra bases per at-bat).' && h.description.split('\n')[3] === 'TEST called at 5:10 PM ET', h.description)
const h2 = keep(hf.homerEmbed({ ...hev, team: 'LAD', opponent: 'ATL', home: false, role: 'WATCH', board_rank: 8, hr_n: 1, inning: 'top 9th' }, {}))
check('E19 MLB homer on the board: mapped club named; bold ON THE BOARD, not a called pick: #8; Top of the 9th, away team first', h2.title === '⚾ Test Slugger goes deep for Los Angeles Dodgers' && h2.description.split('\n')[0] === "**ON THE BOARD**, not a called pick: #8 on tonight's MOONSHOT board." && h2.description.split('\n')[1] === 'Top of the 9th, LAD at ATL.' && h2.footer.text === 'MOONSHOT · DASH Network', h2.description)
check('E19b MLB homer with no inning stored prints just the matchup', hf.homerEmbed({ ...hev, inning: null }, {}).description.split('\n')[1] === 'EXA at TST.')

const ct = await import('../lib/card/text.js')
const NHLWHY = 'shots 100th · goals 100th · ice time 94th percentile tonight'
const leg = (id, name, extra = {}) => ({ player_id: id, name, team: 'TST', opp: 'EXA', status: 'called', why: `TEST why ${name}`, start_at: '2099-01-01T20:00:00Z', ...extra })
const rows = [
  { lane: 'bot', product: 'straight', slot: 1, stake: 1, legs: [leg('1', 'Test One', { why: NHLWHY })] },
  { lane: 'bot', product: 'straight', slot: 2, stake: 1, legs: [leg('2', 'Test Two', { status: 'board' })] },
  { lane: 'bot', product: 'straight', slot: 3, stake: 1, legs: [leg('3', 'Test Three')] },
  { lane: 'bot', product: 'two_man', slot: 1, stake: 0.5, legs: [leg('1', 'Test One'), leg('4', 'Test Four')] },
]
const prices = new Map([['1', { best: 250, median: 230, books: 4, at: '2099-01-01T22:42:00Z' }], ['3', { best: 120, median: 120, books: 1 }], ['4', { best: 200, median: 190, books: 3 }]])
const mc = keep(ct.membersCardEmbed({ sport: 'nhl', day: '2099-01-01', rows, prices }))
check('E20 members Card: title has no "members", date words', mc.title === `\u{1F3AF} The Card · NHL · ${dayWords('2099-01-01')}` && !/members/i.test(mc.title), mc.title)
check('E21 members Card: description = market, unit, the "set before the first game" line', mc.description === 'anytime goal, 1 unit each. Picks are set before the first game.', mc.description)
check('E22 members Card: fields are "n. Player" and the Two-Man (no STRAIGHT, no THE RULE)', JSON.stringify(sec(mc)) === JSON.stringify(['1. Test One', '2. Test Two', '3. Test Three', 'Two-Man (0.5 unit)']), sec(mc).join())
const f1 = mc.fields[0].value.split('\n')
check('E23 members Card: pick line 1 = club vs opp and the bold status word', f1[0] === 'TST vs EXA · **CALLED**' && mc.fields[1].value.split('\n')[0] === 'TST vs EXA · **ON THE BOARD**', f1[0])
check('E24 members Card: price line (best, median, books, the stored snapshot time)', /^\+250 best, \+230 median across 4 books \(priced \d{1,2}:\d{2} [AP]M ET\)$/.test(f1[1]), f1[1])
check('E25 members Card: one book / no price wording', mc.fields[2].value.split('\n')[1] === '+120 at one book' && mc.fields[1].value.split('\n')[1] === 'no price on file yet', mc.fields[2].value.split('\n')[1])
check('E26 members Card: NHL why names the comparison set; anything else prints as stored', f1[2] === "Among tonight's skaters: shots 100th, goals 100th, ice time 94th percentile" && mc.fields[1].value.split('\n')[2] === 'TEST why Test Two', f1[2])
const tm = mc.fields[3].value.split('\n')
check('E27 members Card: Two-Man = pair, different games, multiplied-price line with the caveat; the rule is ONE italic line, then the ledger link', tm[0] === 'Test One + Test Four, different games' && /your book's parlay price will differ/.test(tm[1]) && tm[2] === "*Top 3 by LAMP ranking score, one per game. Both Two-Man legs must land; a player who does not play voids it.*" && tm[3] === `[Full rules in the ledger](https://site.test${appHref('nhl', 'ledger')})`, tm.join(' | '))
check('E28 members Card: football keeps ON THE BOARD eligibility in the rule', /TUDDY ranking score \(CALLED or ON THE BOARD\)/.test(ct.membersCardEmbed({ sport: 'nfl', day: '2099-01-01', rows, prices }).fields.at(-1).value))
check('E29 members Card: footer LAMP, status word from STATUS_WORD, links = ledger only', mc.footer.text === 'LAMP · DASH Network' && mc.fields[0].value.includes(`**${STATUS_WORD.called}**`) && slotsOk(mc, { ledger: true }) && !mc.url)
const graded = rows.map((r, i) => ({ ...r, result: i === 1 ? 'miss' : 'hit' }))
const re = keep(ct.resultEmbed({ sport: 'nhl', day: '2099-01-01', rows: graded }))
check('E30 result Card: Straights / Two-Man, hits and misses alike, results title, the ledger line', JSON.stringify(sec(re)) === JSON.stringify(['Straights', 'Two-Man']) && re.fields[0].value.includes('✓ Test One') && re.fields[0].value.includes('✗ Test Two') && re.title.endsWith('results') && re.fields[1].value.includes('[Full record in the ledger.]'), sec(re).join())
check('E31 result Card: not graded = no card', ct.resultEmbed({ sport: 'nhl', day: '2099-01-01', rows }) === null)
check('E32 the X/members/result TEXTS are unchanged in shape', ct.membersCardText({ sport: 'nhl', day: '2099-01-01', rows, prices }).text.startsWith('\u{1F3AF} THE CARD · NHL members') && ct.resultText({ sport: 'nhl', day: '2099-01-01', rows: graded }).text.includes('results'))

const rc = await import('../lib/posts/receipt.js')
const gr = [
  { sport: 'mlb', id: '1', name: 'Test Slugger', market: 'home run', outcome: 'cashed' },
  { sport: 'nfl', id: '2', name: 'Test Receiver', market: 'anytime touchdown', outcome: 'cashed' },
  { sport: 'nhl', id: '3', name: 'Test Skater', market: 'goal scorer', outcome: 'missed' },
  { sport: 'nhl', id: '4', name: 'Test Bench', market: 'goal scorer', outcome: 'void' },
]
const rcpt = keep(rc.receiptEmbed({ day: '2099-01-01', graded: gr }))
check('E33 receipt: title and the {SPORT} · {k} for {n} description (void outside the count)', rcpt.title === `\u{1F9FE} Receipt · ${dayWords('2099-01-01')}` && rcpt.description === 'MLB · NFL · NHL · 2 for 3 · 1 did not play', `${rcpt.title} | ${rcpt.description}`)
check('E34 receipt: a field per product, rows are "mark Player, market: outcome", misses and voids in view', JSON.stringify(sec(rcpt)) === JSON.stringify(['MOONSHOT · MLB', 'TUDDY · NFL', 'LAMP · NHL']) && rcpt.fields[0].value.startsWith('✓ Test Slugger, home run: cashed') && rcpt.fields[2].value.includes('✗ Test Skater, goal scorer: missed') && rcpt.fields[2].value.includes('– Test Bench, goal scorer: did not play (void)'), rcpt.fields[2].value)
check('E35 receipt: one ledger line "Full record in the ledger.", house footer, no CALLED word celebrating', slotsOk(rcpt, { ledger: true }) && rcpt.fields.at(-1).value.includes('[Full record in the ledger.]') && rcpt.footer.text === 'DASH Network')
const per = keep(rc.periodEmbed({ kind: rc.WEEKLY, from: '2099-01-05', to: '2099-01-11', totals: { total: { cashed: 3, missed: 2, void: 0 }, bySport: { mlb: { cashed: 3, missed: 2, void: 0 } }, nights: 4 } }))
check('E36 weekly receipt: same voice (Week of Jan 5; 3 for 5; nights)', per.title === '\u{1F9FE} Receipt · Week of Jan 5' && per.description === '3 for 5 · 4 nights' && per.fields[0].value.startsWith('3 for 5 · home run'), `${per.title} | ${per.description}`)
check('E37 a period with no cash = no card', rc.periodEmbed({ kind: rc.WEEKLY, from: '2099-01-05', to: '2099-01-11', totals: { total: { cashed: 0, missed: 2, void: 0 }, bySport: {}, nights: 1 } }) === null)
check('E38 assembleReceipt with nobody named stays "none"', rc.assembleReceipt({ day: '2099-01-01', rows: [], results: {}, games: {} }).state === 'none')
const mo = rc.periodEmbed({ kind: rc.MONTHLY, from: '2099-10-01', to: '2099-10-31', totals: { total: { cashed: 3, missed: 2, void: 0 }, bySport: { mlb: { cashed: 3, missed: 2, void: 0 } }, nights: 20 } })
check('E39 monthly receipt title = the month', mo.title === '\u{1F9FE} Receipt · October')
// the whole family: Discord limits, and no probability / lock / guaranteed / winners wording anywhere
for (const e of [...allEmbeds, mo, mc, gw]) { if (!allEmbeds.includes(e)) allEmbeds.push(e) }
check('E40 every card is inside Discord\'s limits', allEmbeds.every((e) => embedSize(e) <= LIMITS.total && [...e.title].length <= LIMITS.title && [...(e.description || '')].length <= LIMITS.description && (e.fields || []).every((f) => [...f.value].length <= LIMITS.value && [...f.name].length <= LIMITS.name)))
check('E41 no card prints a probability, "lock", "guaranteed" or "winners"', allEmbeds.every((e) => !NEVER.test(JSON.stringify(e))), allEmbeds.map((e) => (NEVER.exec(JSON.stringify(e)) || [])[0]).filter(Boolean).join())
check('E42 the status word leads every alert description', [g, t, t2, t3, h, h2].every((e) => /^\*\*(CALLED|ON THE BOARD|NOT ON THE BOARD)\*\*/.test(e.description)))
check('E43 inlineStatus survives a huge description (word first, inside 4096)', (() => { const e = buildCard({ sport: 'nfl', title: 'T', status: 'called', inlineStatus: true, description: ` ${long(3000)}` }); return e.description.startsWith('**CALLED** ') && [...e.description].length <= LIMITS.description })())

// ── F. postToDiscord with an embed ──────────────────────────────────────────
setEnv({})
const { postToDiscord } = await import('../lib/dash/xPost.js')
calls.length = 0
const r1 = await postToDiscord('plain fallback text', { embed: g, png: Buffer.from('PNG'), kind: 'nhlgoal', sportKey: 'nhl' }, U('2001'))
const b1 = bodyOf(calls[0])
check('F1 embed sent as the one embed, no content, png attached as attachment://card.png', r1.ok && b1.embeds.length === 1 && !('content' in b1) && b1.embeds[0].image.url === 'attachment://card.png' && calls[0].body instanceof FormData && b1.embeds[0].title === g.title)
calls.length = 0
await postToDiscord('plain', { embed: h, imageUrl: 'https://img.example/c.png' }, U('2002'))
check('F2 imageUrl still rides under the embed', bodyOf(calls[0]).embeds[0].image.url === 'https://img.example/c.png')
calls.length = 0
await postToDiscord('plain', { embed: { ...g, url: undefined } }, U('2003'))
check('F3 an embed without a picture sends as JSON with no image', !bodyOf(calls[0]).embeds[0].image && typeof calls[0].body === 'string')
calls.length = 0
await postToDiscord('TEST \u{1F916} CALLED IT\nrest', { sport: 'nhl', link: '/x' }, U('2004'))
const b4 = bodyOf(calls[0])
check('F4 a caller that passes no embed is unchanged (momentEmbed: title from the first line, linked)', b4.embeds[0].title.includes('CALLED IT') && b4.embeds[0].url.includes('/x'))
calls.length = 0
nextStatus = [429, 204]
const r5 = await postToDiscord('plain', { embed: g }, U('2005'))
check('F5 the 429 retry still works with an embed', r5.ok && calls.length === 2)
const huge = { title: 'x'.repeat(900), description: 'y'.repeat(9000), fields: Array.from({ length: 40 }, () => ({ name: 'n', value: 'v'.repeat(2000) })), footer: { text: 'f' } }
calls.length = 0
await postToDiscord('plain', { embed: huge }, U('2006'))
const e6 = bodyOf(calls[0]).embeds[0]
check('F6 an over-limit embed handed to postToDiscord is fitted before it is sent', embedSize(e6) <= LIMITS.total && e6.fields.length <= 25 && [...e6.title].length <= 256)

// ── H. the two Discord link slots (title url + one ledger line), site host only ──
check('H1 NHL goal title links to the scorer on LAMP (playerHref on the site host)', g.url === `https://site.test${playerHref('nhl', 11)}`, g.url)
check('H2 NFL TD and MLB homer titles link to their player pages', t.url === `https://site.test${playerHref('nfl', '00-TEST')}` && !h.url, `${t.url} | ${h.url}`)
const hl = hf.homerEmbed({ ...hev, player_id: 571970 }, {})
check('H3 MLB homer with an id links to MOONSHOT player page', hl.url === `https://site.test${playerHref('mlb', 571970)}`)
check('H4 no id = no link (never invented)', playerUrl('nhl', null) === undefined && playerUrl('nhl', '') === undefined && !goalFeed.goalEmbed({ ...goalRow, player_id: null }, [goalRow]).url)
check('H5 a third-party or relative title url is refused', !buildCard({ sport: 'nhl', title: 'T', url: 'https://evil.example/x' }).url && !buildCard({ sport: 'nhl', title: 'T', url: '/x' }).url)
const lines = (e) => e.fields.map((f) => f.value).join('\n')
const ledgerFor = (sp, text) => `[${text}](https://site.test${appHref(sp, 'ledger')})`
check('H6 members Card: exactly one ledger line, a markdown link to that sport\'s Ledger tab, on the site host', lines(mc).split(ledgerFor('nhl', 'Full rules in the ledger')).length === 2 && slotsOk(mc, { ledger: true }) && !mc.url)
check('H7 free result Card: one ledger line to its sport', lines(re).split(ledgerFor('nhl', 'Full record in the ledger.')).length === 2 && slotsOk(re, { ledger: true }))
check('H8 receipts (night and weekly): one ledger line each, site host only', lines(rcpt).split(ledgerFor('mlb', 'Full record in the ledger.')).length === 2 && lines(per).split(ledgerFor('mlb', 'Full record in the ledger.')).length === 2 && slotsOk(rcpt, { ledger: true }) && slotsOk(per, { ledger: true }))
check('H9 the ledger URL differs per sport and comes from the registry', ledgerLink('nfl').url === `https://site.test${appHref('nfl', 'ledger')}` && ledgerLink('nfl').url !== ledgerLink('nhl').url)
const mcN = ct.membersCardEmbed({ sport: 'nfl', day: '2099-01-01', rows, prices })
check('H10 an NFL members card links to the NFL ledger', lines(mcN).includes(ledgerFor('nfl', 'Full rules in the ledger')))
check('H11 free-channel cards (alerts, result, receipts, periods) carry no members-only deep link', [g, t, h, re, rcpt, per].every((e) => !/members/i.test(embedUrls(e).join(' '))))
check('H12 a link typed into a section, description or title is still stripped', slotsOk(buildCard({ sport: 'mlb', title: 'a https://x.example', description: '[b](https://y.example)', sections: [{ name: 'n', lines: ['https://z.example'] }] })))
// X keeps no links: the X text of every kind is link-free
const xTexts = [goalFeed.postText(goalRow, [goalRow]), td.tdPostText(ev, {}), hf.postText(hev, {}), ct.xCardText({ sport: 'nhl', day: '2099-01-01', straight: rows[0].legs[0], donovan: null }).text, ct.resultText({ sport: 'nhl', day: '2099-01-01', rows: graded }).text, rc.renderReceipt({ day: '2099-01-01', graded: gr }).text, rc.renderPeriod({ kind: rc.WEEKLY, from: '2099-01-05', to: '2099-01-11', totals: { total: { cashed: 3, missed: 2, void: 0 }, bySport: { mlb: { cashed: 3, missed: 2, void: 0 } }, nights: 4 } })]
check('H13 NO X text carries a link (all 7 kinds)', xTexts.every((x) => x && !/https?:\/\/|\]\(|dashnetwork\.vercel/i.test(x)), String(xTexts.findIndex((x) => !x || /https?:\/\//.test(x))))
// the link slots are Discord-only: postToX never sees an embed, and stripLinks still guards X
const { stripLinks } = await import('../lib/dash/xPolicy.js')
check('H14 X still strips any link a text carries', !/https?:\/\//.test(stripLinks('see https://site.test/x now')))
const xp = readFileSync(new URL('../lib/dash/xPost.js', import.meta.url), 'utf8')
check('H15 postToX takes no embed option', !/export async function postToX\([^)]*embed/.test(xp))

// ── G. leak tests ───────────────────────────────────────────────────────────
const { postMembers, membersWebhook } = await import('../lib/dash/membersPost.js')
function fakeDb() {
  const table = {
    select: () => ({ match: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    upsert: (r) => ({ select: async () => ({ data: r.map((x) => ({ day: x.day })), error: null }) }),
    update: () => ({ match: async () => ({ error: null }) }),
    delete: () => ({ match: async () => ({ error: null }) }),
  }
  return { from: () => table }
}
let day = 0
const build = async () => ({ text: 'TEST MEMBERS CARD (test data)', payload: {}, embed: mc })
for (const [label, v] of [['unset', undefined], ['blank', '   '], ['a comma', ',']]) {
  setEnv(v === undefined ? {} : { DISCORD_MEMBERS_WEBHOOK: v }); calls.length = 0; day += 1
  const out = await postMembers(fakeDb(), { day: `2099-02-${String(day).padStart(2, '0')}`, kind: 'card_members_nhl', build, envGate: false })
  check(`G1 members card, members webhook ${label}: zero calls (${out})`, calls.length === 0)
}
setEnv({ DISCORD_MEMBERS_WEBHOOK: U('9001') }); calls.length = 0; day += 1
const out2 = await postMembers(fakeDb(), { day: `2099-02-${String(day).padStart(2, '0')}`, kind: 'card_members_nhl', build, envGate: false })
const urls = calls.map((c) => c.url)
check(`G2 members card with a members webhook: exactly one call, to it, as the embed (${out2})`, calls.length === 1 && urls[0] === U('9001') && bodyOf(calls[0]).embeds?.[0]?.title === mc.title)
check('G3 no free hook was touched', urls.every((u) => !Object.values(PUBLIC_ENV).includes(u)))
setEnv({ DISCORD_MEMBERS_WEBHOOK: PUBLIC_ENV.DISCORD_NHL_WEBHOOKS }); calls.length = 0; day += 1
const out3 = await postMembers(fakeDb(), { day: `2099-02-${String(day).padStart(2, '0')}`, kind: 'card_members_nhl', build, envGate: false })
check(`G4 a members URL that is also a free hook is refused: zero calls (${out3})`, calls.length === 0 && membersWebhook() === '')
// source-level: the members embed is built in lib/card/text.js and sent only by lib/card/post.js postCardMembers -> postMembers
const post = readFileSync(new URL('../lib/card/post.js', import.meta.url), 'utf8')
const mcBlock = post.slice(post.indexOf('export async function postCardMembers'), post.indexOf('/** The free result post'))
check('G5 postCardMembers sends only through postMembers (no postOnce/postToDiscord/postToX)', /postMembers\(/.test(mcBlock) && !/postOnce\(|postToDiscord\(|postToX\(/.test(mcBlock))
const { readdirSync, statSync } = await import('node:fs')
const walk = (d, acc = []) => { for (const f of readdirSync(d)) { if (['node_modules', '.next', 'ARCHIVE', '.git', '.claude', '.claude-notes'].includes(f)) continue; const p = `${d}/${f}`; const s = statSync(p); if (s.isDirectory()) walk(p, acc); else if (/\.(js|mjs)$/.test(f)) acc.push(p) } return acc }
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const users = walk(`${root}/lib`).concat(walk(`${root}/app`)).filter((p) => /membersCardEmbed/.test(readFileSync(p, 'utf8'))).map((p) => p.slice(root.length + 1))
check('G6 membersCardEmbed is referenced only by lib/card/text.js and lib/card/post.js', users.every((p) => ['lib/card/text.js', 'lib/card/post.js'].includes(p)) && users.length === 2, users.join())
check('G7 the members embed carries no webhook URL and no token', !/discord\.com|TEST-TOKEN/.test(JSON.stringify(mc)))

console.log(fail ? `\n${fail} FAILED` : '\nall passed')
process.exit(fail ? 1 : 0)
