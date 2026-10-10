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

const { LIMITS, buildCard, clampText, clampLines, fitEmbed, embedSize, embedHasLink, accentOf, footerOf, colorInt, noLinks } = await import('../lib/dash/discordCard.js')
const { STATUS_WORD } = await import('../lib/callStatus.js')
const { SPORT_ACCENT } = await import('../lib/sportAccent.js')
const { BRAND } = await import('../lib/routes.js')

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

// ── E. the roll-out kinds (TEST rows) ───────────────────────────────────────
const sec = (e) => (e.fields || []).map((f) => f.name)
const goalFeed = await import('../lib/nhl/goalFeed.js')
const goalRow = { game_id: 1, player_id: 11, goal_n: 1, day: '2099-01-01', period: 2, period_type: 'REG', time_in_period: '12:34', strength: 'pp', empty_net: false, team: 'TST', opp: 'EXA', name: 'Test Skater', season_goals: 5, assists: [{ id: 2, name: 'Test Helper' }], score_after: 'TST 2 · EXA 1', status: 'called', rank_in_game: 1, lamp_score: 61, confirmed_at: '2099-01-01T01:00:00Z', first_seen_at: '2099-01-01T00:58:00Z' }
const g = goalFeed.goalEmbed(goalRow, [goalRow], { multiLine: 'His 2nd multi-goal game this season.' })
check('E1 NHL goal: title, CALLED lead, goal-scorer market', g.title.startsWith('\u{1F6A8} TEST SKATER SCORES') && g.title.includes('TST vs EXA') && g.description === `${STATUS_WORD.called} · goal scorer`, g.title)
check('E2 NHL goal: sections THE CALL / THE GOAL / THE RECORD', JSON.stringify(sec(g)) === JSON.stringify(['THE CALL', 'THE GOAL', 'THE RECORD']), sec(g).join())
check('E3 NHL goal: assists, score, LAMP score present; footer LAMP; no link', g.fields[1].value.includes('Assists: Test Helper') && g.fields[1].value.includes('TST 2') && g.fields[0].value.includes('LAMP score 61') && g.footer.text === 'LAMP · DASH Network' && !embedHasLink(g))
check('E3b NHL goal: timestamp is the confirmation time', g.timestamp === '2099-01-01T01:00:00.000Z')
check('E3c NHL goal: the X text is unchanged (still CALLED IT, no embed words)', goalFeed.postText(goalRow, [goalRow]).startsWith('\u{1F916} CALLED IT') && !/THE CALL/.test(goalFeed.postText(goalRow, [goalRow])))

const td = await import('../lib/nfl/tdFeed.js')
const ev = { day: '2099-01-02', gameId: 'g', tdN: 1, team: 'TST', opponent: 'EXA', quarter: 3, clock: '4:12', text: 'x', parsed: { kind: 'pass', yards: 14, passer: 'Test Passer' }, kindWord: null, scorerName: 'Test Receiver', gsisId: '00-TEST', position: 'WR', seasonToDate: { td: 4, games: 5 }, onBot: { market: 'TD', rank: 3, grade: 'A' }, tdBoard: { rank: 3, of: 200 }, defense: { role: 'WR', opp: 'EXA', tag: 'TARGET', rank: 28 } }
const t = td.tdEmbed(ev, { extra: ['TEST reached line'] })
check('E4 NFL TD: CALLED, anytime touchdown, sections', t.description === `${STATUS_WORD.called} · anytime touchdown` && JSON.stringify(sec(t)) === JSON.stringify(['THE CALL', 'THE TOUCHDOWN', 'WHY', 'THE RECORD']), sec(t).join())
check('E5 NFL TD: footer TUDDY, play line, defense line', t.footer.text === 'TUDDY · DASH Network' && t.fields[1].value.includes('14 yd from Test Passer') && t.fields[2].value.includes('TARGET'))
const t2 = td.tdEmbed({ ...ev, onBot: null, tdBoard: null, defense: null, seasonToDate: null })
check('E6 NFL TD off the board: NOT ON THE BOARD, still a title and a section', t2.description.startsWith(STATUS_WORD.off) && t2.fields.length >= 2)

const hf = await import('../lib/dash/homerFeed.js')
const hev = { name: 'Test Slugger', team: 'TST', opponent: 'EXA', home: true, inning: 'bot 7th', role: 'TOP', board_rank: 2, hr_n: 2, odds_over: 320, odds_book: 'TESTBOOK', stats: { season_hr: 30, season_iso: 0.25 } }
const h = hf.homerEmbed(hev, { extra: ['TEST called at 5:10 PM ET'] })
check('E7 MLB homer: CALLED, home run, sections', h.description === `${STATUS_WORD.called} · home run` && JSON.stringify(sec(h)) === JSON.stringify(['THE CALL', 'THE HOMER', 'THE RECORD']), sec(h).join())
check('E8 MLB homer: footer MOONSHOT, rank, price, (#2 tonight), no book name', h.footer.text === 'MOONSHOT · DASH Network' && h.fields[0].value.includes('#2 on the MOONSHOT board') && h.fields[0].value.includes('+320') && h.title.includes('(#2 tonight)') && !JSON.stringify(h).includes('TESTBOOK'))
const h2 = hf.homerEmbed({ ...hev, role: '', board_rank: null, stats: { season_hr: 10, season_iso: 0.1 } }, {})
check('E9 MLB homer not called: no CALLED word', !h2.description.startsWith(STATUS_WORD.called))

const ct = await import('../lib/card/text.js')
const leg = (id, name, extra = {}) => ({ player_id: id, name, team: 'TST', opp: 'EXA', status: 'called', why: `TEST why ${name}`, start_at: '2099-01-01T20:00:00Z', ...extra })
const rows = [
  { lane: 'bot', product: 'straight', slot: 1, stake: 1, legs: [leg('1', 'Test One')] },
  { lane: 'bot', product: 'straight', slot: 2, stake: 1, legs: [leg('2', 'Test Two', { status: 'board' })] },
  { lane: 'bot', product: 'straight', slot: 3, stake: 1, legs: [leg('3', 'Test Three')] },
  { lane: 'bot', product: 'two_man', slot: 1, stake: 0.5, legs: [leg('1', 'Test One'), leg('4', 'Test Four')] },
]
const prices = new Map([['1', { best: 250, median: 230, books: 4 }]])
const mc = ct.membersCardEmbed({ sport: 'nhl', day: '2099-01-01', rows, prices })
check('E10 members Card: STRAIGHT 1..3, TWO-MAN, THE RULE', JSON.stringify(sec(mc)) === JSON.stringify(['STRAIGHT 1', 'STRAIGHT 2', 'STRAIGHT 3', 'TWO-MAN', 'THE RULE']), sec(mc).join())
check('E11 members Card: status words from STATUS_WORD, stake, stored price, why, LAMP footer', mc.fields[0].value.includes(STATUS_WORD.called) && mc.fields[1].value.includes(STATUS_WORD.board) && mc.fields[0].value.includes('1 unit') && mc.fields[0].value.includes('+250 best') && mc.fields[0].value.includes('TEST why Test One') && mc.footer.text === 'LAMP · DASH Network')
check('E12 members Card: no link, no "winners", no printed probability', !embedHasLink(mc) && !/winners?\b/i.test(JSON.stringify(mc)) && !/\d\s*%/.test(JSON.stringify(mc)))
const graded = rows.map((r, i) => ({ ...r, result: i === 1 ? 'miss' : 'hit' }))
const re = ct.resultEmbed({ sport: 'nhl', day: '2099-01-01', rows: graded })
check('E13 result Card: THE STRAIGHTS / THE TWO-MAN / THE RECORD, hits and misses alike', JSON.stringify(sec(re)) === JSON.stringify(['THE STRAIGHTS', 'THE TWO-MAN', 'THE RECORD']) && re.fields[0].value.includes('✓ Test One') && re.fields[0].value.includes('✗ Test Two'), sec(re).join())
check('E14 result Card: not graded = no card', ct.resultEmbed({ sport: 'nhl', day: '2099-01-01', rows }) === null)
check('E15 the X/members/result TEXTS are unchanged in shape', ct.membersCardText({ sport: 'nhl', day: '2099-01-01', rows, prices }).text.startsWith('\u{1F3AF} THE CARD · NHL members') && ct.resultText({ sport: 'nhl', day: '2099-01-01', rows: graded }).text.includes('results'))

const rc = await import('../lib/posts/receipt.js')
const gr = [
  { sport: 'mlb', id: '1', name: 'Test Slugger', market: 'home run', outcome: 'cashed' },
  { sport: 'nfl', id: '2', name: 'Test Receiver', market: 'anytime touchdown', outcome: 'cashed' },
  { sport: 'nhl', id: '3', name: 'Test Skater', market: 'goal scorer', outcome: 'missed' },
  { sport: 'nhl', id: '4', name: 'Test Bench', market: 'goal scorer', outcome: 'void' },
]
const rcpt = rc.receiptEmbed({ day: '2099-01-01', graded: gr })
check('E16 receipt: a section per product + THE RECORD, CALLED lead', JSON.stringify(sec(rcpt)) === JSON.stringify(['MOONSHOT · MLB', 'TUDDY · NFL', 'LAMP · NHL', 'THE RECORD']) && rcpt.description === `${STATUS_WORD.called} · 2 of 3 cashed · 1 did not play`, `${sec(rcpt).join()} | ${rcpt.description}`)
check('E17 receipt: the miss and the void stay in view; ledger pointer is words, no link', rcpt.fields[2].value.includes('missed') && rcpt.fields[2].value.includes('void') && !embedHasLink(rcpt) && rcpt.footer.text === 'DASH Network')
const per = rc.periodEmbed({ kind: rc.WEEKLY, from: '2099-01-05', to: '2099-01-11', totals: { total: { cashed: 3, missed: 2, void: 0 }, bySport: { mlb: { cashed: 3, missed: 2, void: 0 } }, nights: 4 } })
check('E18 weekly receipt: title WEEK OF, MOONSHOT section', per.title.includes('WEEK OF JAN 5') && sec(per).includes('MOONSHOT · MLB'))
check('E19 a period with no cash = no card', rc.periodEmbed({ kind: rc.WEEKLY, from: '2099-01-05', to: '2099-01-11', totals: { total: { cashed: 0, missed: 2, void: 0 }, bySport: {}, nights: 1 } }) === null)
const a = rc.assembleReceipt({ day: '2099-01-01', rows: [], results: {}, games: {} })
check('E20 assembleReceipt with nobody named stays "none"', a.state === 'none')

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
