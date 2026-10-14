// HIS N-MAN'S RESULT POST (2026-10-13): when his N-man (card_calls product 'n_man', lane 'donovan') grades, ONE result post goes out on card_don_<sport>_n_man_<slot>_result
// through the same claim-before-send path as every X post (X + the sport's free channel), with the graded card, and never twice.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-card-don-result.mjs
// ALL DATA IS TEST DATA: players are "Test ...", every webhook / key is a TEST placeholder, fetch is replaced (nothing is sent), the card renderer is a stub, and
// homer_feed_posts is an in-memory fake that holds the (day, kind) key. No network, no database.
//   A  a graded miss: one post, HIT / MISS words per leg, a count, never "CASHED", the graded card attached, claim row (day, kind) records the X post
//   B  every leg hit: CASHED and a count; a void: "Void" and the count; no unit, price, link, hashtag or banned word anywhere
//   C  never twice: a second tick, a second instance, and an X refusal (the claim stays) post nothing more
//   D  one post per graded entry: two N-men the same day = two claims; an entry with no pregame post (cap, drop) or not graded yet posts nothing
//   E  never guessed: a row whose legs do not add up to its ticket word, or a leg with no word, says nothing and claims nothing
//   F  fit: six long names step down to the verdict alone (no names, no card); a card name with a banned word posts nothing
//   G  policy: tagged INFO, event, write-up tier, counted by the cap (not exempt), never repeat-guarded, sport read from the kind; the DB pattern already allows it (no SQL)
//   H  the kill switch (CARD_POSTS_PAUSE) and the wiring (tick, image, card words)
import './_no-injury-net.mjs'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const calls = []
let xRefuse = false
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  calls.push({ url: u, body: init.body, method: init.method })
  if (u.includes('api.x.com/2/media/upload')) return { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ data: { id: 'm-1' } }) }
  if (u.includes('api.x.com')) return xRefuse
    ? { ok: false, status: 403, statusText: 'Forbidden', headers: { get: () => null }, json: async () => ({ detail: 'refused' }), text: async () => 'refused' }
    : { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ data: { id: `t-${calls.length}` } }) }
  return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) }
}
const FREE = 'https://discord.com/api/webhooks/2001/TEST-TOKEN'
const XENV = { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a', X_SCHEDULE_OFF: 'on', X_GUARDS_OFF: 'repeat,naming,cap' }
const setEnv = (extra = {}) => {
  for (const k of Object.keys(process.env)) if (/^DISCORD_|^X_|POST_KINDS_ON|SLAB_CARD_OFF|DUAL_CARD_OFF|CARD_POSTS_PAUSE|SUPABASE/.test(k)) delete process.env[k]
  Object.assign(process.env, { DISCORD_HOMER_WEBHOOK: FREE, DISCORD_NHL_WEBHOOKS: FREE, ...extra })
}
const tweets = () => calls.filter((c) => c.url.endsWith('/2/tweets')).map((c) => JSON.parse(c.body))
const discords = () => calls.filter((c) => c.url.startsWith('https://discord.com'))

const POST = await import('../lib/card/post.js')
const TEXT = await import('../lib/card/text.js')
const { _resetTakenForTests: resetTaken } = await import('../lib/dash/postClaim.js')
const XS = await import('../lib/dash/xSchedule.js'); const XP = await import('../lib/dash/xPolicy.js')
const NOW = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const DAY = '2026-10-12'
const START = NOW - 6 * 3600e3      // the games are over

function postsDb({ seed = [] } = {}) {
  const rowsT = [...seed]
  const t = {
    select: () => ({ match: (m) => ({ maybeSingle: async () => ({ data: rowsT.find((r) => r.day === m.day && r.kind === m.kind) || null }) }), eq: () => t.select(), in: () => t.select(), order: () => t.select(), limit: async () => ({ data: [] }) }),
    upsert: (r) => ({ select: async () => {
      const out = []; for (const x of r) if (!rowsT.some((q) => q.day === x.day && q.kind === x.kind)) { rowsT.push({ ...x }); out.push({ day: x.day }) }
      return { data: out, error: null } } }),
    update: (patch) => ({ match: async (m) => { const q = rowsT.find((r) => r.day === m.day && r.kind === m.kind); if (q) Object.assign(q, patch); return { error: null } } }),
    delete: () => ({ match: async () => ({ error: null }) }), insert: async () => ({ error: null }),
  }
  return { rowsT, db: { from: () => t } }
}
const NAMES = ['Test Nine', 'Test Ten', 'Test Eleven', 'Test Twelve', 'Test Thirteen', 'Test Fourteen']
const leg = (id, name) => ({ player_id: id, name, team: 'TST', opp: 'OPP', game_id: '1', game_date: DAY, start_at: iso(START), status: 'called' })
const legsOf = (n, names = NAMES) => Array.from({ length: n }, (_, i) => leg(`N${i + 1}`, names[i]))
const graded = (legs, words, o = {}) => {
  const result = words.includes('void') ? 'void' : words.every((w) => w === 'hit') ? 'hit' : 'miss'
  return { id: 1, lane: 'donovan', product: 'n_man', slot: 1, legs, leg_count: legs.length, locks_at: iso(START - 3600e3), start_at: iso(START), note: 'Test note.', result, leg_results: legs.map((l, i) => ({ player_id: l.player_id, result: words[i] })), ...o }
}
const pregame = (slot = 1, payload = {}) => ({ day: DAY, kind: `card_don_nhl_n_man_${slot}`, payload: { product: 'n_man', ...payload } })
const asked = { image: [] }
const stubImage = async (a) => { asked.image.push(a.slot); return Buffer.from('PNG-graded') }
const fresh = () => { setEnv(XENV); calls.length = 0; xRefuse = false; resetTaken(); asked.image.length = 0 }
const BANNED = /https?:\/\/|#\w|\block(?:ed|s|ing)?\b|guarantee|\bwinners?\b|\bnuke|\bdue\b|\bowed?\b|bounce.?back|\bunits?\b|\$/i

// ── A. a graded miss ──
{
  fresh()
  const row = graded(legsOf(6), ['hit', 'hit', 'hit', 'hit', 'hit', 'miss'])
  const s = postsDb({ seed: [pregame()] })
  const r = await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [row], now: NOW, image: stubImage })
  check(/^posted/.test(r.n_man_1), `A: the graded entry posts (${JSON.stringify(r)})`)
  const tw = tweets()
  const t = tw[0]?.text || ''
  check(tw.length === 1 && t.includes("ADMIN'S 6-MAN") && t.includes('Missed, 5 of 6 legs hit.'), `A: one X post, the ticket and a count (${JSON.stringify(t)})`)
  check(/HIT Test Nine/.test(t) && /MISS Test Fourteen/.test(t) && (t.match(/^HIT /gm) || []).length === 5 && (t.match(/^MISS /gm) || []).length === 1, 'A: each leg wears HIT or MISS')
  check(!/CASHED/.test(t) && !BANNED.test(t) && !t.includes('Test note.'), 'A: a miss never says CASHED; no link, hashtag, banned word, unit, price or note')
  check(tw[0]?.media?.media_ids?.length === 1 && asked.image.join() === '1', 'A: the graded card (slot 1) rides the X post')
  check(discords().length >= 1, 'A: the sport\'s free channel gets it too')
  const claim = s.rowsT.find((x) => x.kind === 'card_don_nhl_n_man_1_result')
  check(claim && claim.day === DAY && claim.x_post_id && claim.payload.don_key === 'n_man_1' && claim.payload.result === 'miss' && claim.payload.picks.length === 6, 'A: one claim row (day, card_don_nhl_n_man_1_result) records the X post, the entry and the result')
  check(claim && claim.payload.x_tag === 'INFO', 'A: the claim row carries the INFO tag')
}

// ── B. every leg hit / a void ──
{
  fresh()
  const win = graded(legsOf(3), ['hit', 'hit', 'hit'])
  const s = postsDb({ seed: [pregame()] })
  await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [win], now: NOW, image: stubImage })
  const t = tweets()[0]?.text || ''
  check(t.includes("ADMIN'S 3-MAN: CASHED, all 3 legs hit.") && (t.match(/^HIT /gm) || []).length === 3 && !/MISS|VOID/.test(t) && !BANNED.test(t), `B: all legs hit = CASHED and a count only (${JSON.stringify(t)})`)
  fresh()
  const vd = graded(legsOf(4), ['hit', 'void', 'hit', 'miss'])
  const s2 = postsDb({ seed: [pregame()] })
  await POST.postDonovanResults(s2.db, { sport: 'nhl', day: DAY, rows: [vd], now: NOW, image: stubImage })
  const v = tweets()[0]?.text || ''
  check(/Void, a player did not play \(2 of 4 legs hit\)\./.test(v) && /^VOID Test Ten/m.test(v) && !/CASHED/.test(v) && !BANNED.test(v), `B: a void ticket says Void with the count, never CASHED (${JSON.stringify(v)})`)
  const fx = TEXT.nManResultFacts(vd)
  check(fx && fx.ticket === 'void' && fx.hits === 2, 'B: the facts follow lib/card/core.js productResult (any void = void)')
}

// ── C. never twice ──
{
  fresh()
  const row = graded(legsOf(3), ['hit', 'miss', 'hit'])
  const s = postsDb({ seed: [pregame()] })
  await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [row], now: NOW, image: stubImage })
  const r2 = await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [row], now: NOW + 600e3, image: stubImage })
  check(r2.n_man_1 === 'already-posted' && tweets().length === 1, `C: the next tick posts nothing more (${r2.n_man_1})`)
  resetTaken()      // a second instance: no memory of the first, only the table
  const r3 = await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [row], now: NOW + 1200e3, image: stubImage })
  check(r3.n_man_1 === 'already-posted' && tweets().length === 1, 'C: a second instance reads the claim row and posts nothing')
  fresh(); xRefuse = true
  const s2 = postsDb({ seed: [pregame()] })
  await POST.postDonovanResults(s2.db, { sport: 'nhl', day: DAY, rows: [row], now: NOW, image: stubImage })
  xRefuse = false
  const n1 = tweets().length
  const r4 = await POST.postDonovanResults(s2.db, { sport: 'nhl', day: DAY, rows: [row], now: NOW + 600e3, image: stubImage })
  check(r4.n_man_1 === 'already-posted' && tweets().length === n1 && s2.rowsT.some((x) => x.kind === 'card_don_nhl_n_man_1_result'), 'C: an X refusal keeps the claim: no loop, no second try')
}

// ── D. one post per graded entry; nothing for an unannounced or ungraded one ──
{
  fresh()
  const a = graded(legsOf(3), ['hit', 'hit', 'hit'], { id: 1, slot: 1 })
  const b = graded(legsOf(3, ['Test Solo', 'Test Twin One', 'Test Twin Two']).map((l, i) => ({ ...l, player_id: `M${i}` })), ['hit', 'miss', 'hit'], { id: 2, slot: 2 })
  const s = postsDb({ seed: [pregame(1), pregame(2)] })
  const r = await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [a, b], now: NOW, image: stubImage })
  check(/^posted/.test(r.n_man_1) && /^posted/.test(r.n_man_2) && tweets().length === 2 && asked.image.sort().join() === '1,2', `D: two graded N-men the same day = two posts, each with its own slot's card (${JSON.stringify(r)})`)
  check(s.rowsT.filter((x) => /_result$/.test(x.kind)).map((x) => x.kind).sort().join() === 'card_don_nhl_n_man_1_result,card_don_nhl_n_man_2_result', 'D: each its own claim')
  check(tweets().some((x) => x.text.includes('Test Nine') && !x.text.includes('Test Solo')) && tweets().some((x) => x.text.includes('Test Solo') && !x.text.includes('Test Nine')), 'D: each post names only its own entry')
  fresh()
  const s2 = postsDb({ seed: [] })
  const r2 = await POST.postDonovanResults(s2.db, { sport: 'nhl', day: DAY, rows: [a], now: NOW, image: stubImage })
  check(r2.n_man_1 === 'no-pregame-post' && calls.length === 0 && s2.rowsT.length === 0, `D: an entry that never had a pregame post (over the cap) has no result post (${r2.n_man_1})`)
  const s3 = postsDb({ seed: [{ day: DAY, kind: 'card_don_nhl_n_man_1', payload: { dropped: 'a name was not cleared' } }] })
  const r3 = await POST.postDonovanResults(s3.db, { sport: 'nhl', day: DAY, rows: [a], now: NOW, image: stubImage })
  check(r3.n_man_1 === 'no-pregame-post' && calls.length === 0, 'D: a DROPPED pregame post (never announced) has no result post')
  const s4 = postsDb({ seed: [pregame()] })
  const r4 = await POST.postDonovanResults(s4.db, { sport: 'nhl', day: DAY, rows: [{ ...a, result: null, leg_results: null }], now: NOW, image: stubImage })
  check(r4.n_man_1 === 'not-graded-yet' && calls.length === 0, 'D: an entry not graded yet posts nothing')
  const s5 = postsDb({ seed: [{ day: DAY, kind: 'card_don_nhl', payload: { product: 'n_man', don_key: 'n_man_1' } }] })
  const r5 = await POST.postDonovanResults(s5.db, { sport: 'nhl', day: DAY, rows: [a], now: NOW, image: stubImage })
  check(/^posted/.test(r5.n_man_1), 'D: a pregame post made under the OLD one-a-day kind (before the multi SQL) counts as announced')
  fresh()
  const two = { ...a, product: 'two_man', legs: a.legs.slice(0, 2), leg_results: a.leg_results.slice(0, 2) }
  const s6 = postsDb({ seed: [{ day: DAY, kind: 'card_don_nhl_two_man', payload: {} }] })
  const r6 = await POST.postDonovanResults(s6.db, { sport: 'nhl', day: DAY, rows: [two, { ...a, lane: 'donovan_late' }, { ...a, lane: 'bot' }], now: NOW, image: stubImage })
  check(Object.keys(r6).length === 0 && calls.length === 0, 'D: only his verified N-man: not the Two-Man, not a LATE row, not the bot\'s')
}

// ── E. never guessed ──
{
  fresh()
  const legs = legsOf(3)
  const lies = { ...graded(legs, ['hit', 'miss', 'hit']), result: 'hit' }       // the ticket says hit, a leg says miss
  const gap = { ...graded(legs, ['hit', 'hit', 'hit']), leg_results: [{ player_id: 'N1', result: 'hit' }, { player_id: 'N2', result: 'hit' }] }
  const odd = { ...graded(legs, ['hit', 'hit', 'hit']), leg_results: legs.map((l) => ({ player_id: l.player_id, result: 'push' })) }
  const s = postsDb({ seed: [pregame()] })
  for (const [name, row] of [['legs disagree with the ticket', lies], ['a leg has no word', gap], ['a leg word that is no hit/miss/void', odd]]) {
    const r = await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [row], now: NOW, image: stubImage })
    check(!/^posted/.test(r.n_man_1) && tweets().length === 0 && !s.rowsT.some((x) => /_result$/.test(x.kind)), `E: ${name}: nothing said, nothing claimed (${r.n_man_1})`)
  }
}

// ── F. fit and banned words ──
{
  const long = ['Christopher Maximilian Testington-Smythe', 'Bartholomew Alexander Fakenamington', 'Wolfgang Amadeus Placeholderson', 'Ignatius Thaddeus Samplestein', 'Maximilian Leopold Mockingbird', 'Alexander Constantine Teststone']
  const row = graded(legsOf(6, long), ['hit', 'miss', 'hit', 'hit', 'miss', 'hit'])
  const t = TEXT.nManResultText({ sport: 'nhl', day: DAY, row })
  check(t.text && [...t.text].length + 4 <= 280 && !BANNED.test(t.text), `F: six long names still fit 280 (${[...t.text].length} glyphs, ${t.named.length} named)`)
  const mid = ['Testy McTestface Jr', 'Sample Playerson III', 'Fakename Fakenamer', 'Mock Mockerson', 'Dummy Placeholder', 'Stubby Stubbington']
  const midRow = graded(legsOf(6, mid), ['hit', 'miss', 'hit', 'hit', 'miss', 'hit'])
  const flat = TEXT.nManResultText({ sport: 'nhl', day: DAY, row: midRow })
  check(flat.named.length === 6 && [...flat.text].length + 4 <= 280, 'F: six ordinary-length names are all named and fit 280')
  const tiny = TEXT.nManResultText({ sport: 'nhl', day: DAY, row: graded(legsOf(6, long), ['hit', 'miss', 'hit', 'hit', 'miss', 'hit']), hardLimit: 110 })
  check(tiny.text && tiny.named.length === 0 && /Missed, 4 of 6 legs hit\./.test(tiny.text) && !/Testington/.test(tiny.text), 'F: with no room for names the post is the verdict alone, no names named')
  fresh()
  const s = postsDb({ seed: [pregame()] })
  const r = await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [graded(legsOf(6, long), ['hit', 'miss', 'hit', 'hit', 'miss', 'hit'], { legs: undefined })], now: NOW, image: stubImage }).catch(() => null)
  check(r === null || !/^posted/.test(r.n_man_1 || ''), 'F: a row with no legs posts nothing')
  const noCard = TEXT.nManResultText({ sport: 'nhl', day: DAY, row: graded(legsOf(6, long), ['hit', 'miss', 'hit', 'hit', 'miss', 'hit']), hardLimit: 110 })
  const b = await POST.attachNManResultCard({ text: noCard.text, named: noCard.named }, { sport: 'nhl', day: DAY, row: graded(legsOf(6, long), ['hit', 'miss', 'hit', 'hit', 'miss', 'hit']), image: stubImage })
  check(!b.png, 'F: the card is not attached when the text does not name every man on it')
  for (const name of ['Due For A Win', 'Bounce-Back Six', 'Locked In', 'Guaranteed Six', 'Owed One']) {
    const card = graded(legsOf(3), ['hit', 'miss', 'hit']); card.legs[0].card_name = name
    check(TEXT.nManResultText({ sport: 'nhl', day: DAY, row: card }).text === '', `F: a card named "${name}" posts nothing (a banned word never reaches X)`)
  }
  const named = graded(legsOf(3), ['hit', 'hit', 'hit']); named.legs[0].card_name = 'Friday Three'
  check(TEXT.nManResultText({ sport: 'nhl', day: DAY, row: named }).text.includes('FRIDAY THREE') || TEXT.nManResultText({ sport: 'nhl', day: DAY, row: named }).text.includes('Friday Three'), 'F: the name he gave the card is the title')
  const emb = TEXT.nManResultEmbed({ sport: 'nhl', day: DAY, row: { ...graded(legsOf(3), ['hit', 'miss', 'hit']), result: 'void' } })
  check(emb === null, 'F: an embed for a row that cannot be said is null (the ticket word must follow from the leg words)')
  const emb2 = TEXT.nManResultEmbed({ sport: 'nhl', day: DAY, row: graded(legsOf(3), ['hit', 'miss', 'hit']) })
  check(emb2 && /MISS · Test Ten/.test(JSON.stringify(emb2)), 'F: the Discord embed carries the same leg words')
}

// ── G. policy ──
{
  for (const sp of ['mlb', 'nfl', 'nhl']) for (const n of [1, 2, 3]) {
    const k = `card_don_${sp}_n_man_${n}_result`
    check(XS.tagOf(k) === 'INFO' && XS.kindInfo(k).mode === 'event' && Object.prototype.hasOwnProperty.call(XS.KIND_TAGS, k), `G: ${k} is in KIND_TAGS, INFO, event-driven`)
    check(XP.tierOf(k) === 'writeup' && !XP.isCapExempt(k) && XP.isRepeatExempt(k) && XP.isDonovanKind(k) && XP.sportOfKind(k) === sp, `G: ${k} is write-up tier, counted by the cap, never repeat-guarded, sport ${sp}`)
    check(/^card_don_(mlb|nfl|nhl)_[a-z0-9_]+$/.test(k), `G: ${k} already matches the homer_feed_posts_kind_check alternative (no new SQL)`)
  }
  check(!XP.capAllows('card_don_nhl_n_man_1_result', 18) && XP.capAllows('card_don_nhl_n_man_1_result', 5) && XP.capAllows('homer', 25), 'G: the cap counts it (stops 2 short of the 20) while a CALLED alert is exempt')
  check(!XP.EXEMPT_KINDS.some((k) => /^card_don_/.test(k)), 'G: no card_don kind is in the exempt list')
  check(POST.CARD_KIND.donResult('nhl', 'n_man_2') === 'card_don_nhl_n_man_2_result', 'G: the kind builder')
  const mig = src('supabase/migrations/202610121700_card_don_multi.sql')
  check(mig.includes("^card_don_(mlb|nfl|nhl)_[a-z0-9_]+$"), 'G: the shipped kind migration\'s pattern is the one the result kinds match (so no migration file is added)')
}

// ── H. the pause and the wiring ──
{
  fresh(); setEnv({ ...XENV, CARD_POSTS_PAUSE: 'on' })
  const s = postsDb({ seed: [pregame()] })
  const r = await POST.postDonovanResults(s.db, { sport: 'nhl', day: DAY, rows: [graded(legsOf(3), ['hit', 'hit', 'hit'])], now: NOW, image: stubImage })
  check(r.n_man_1 === 'paused' && calls.length === 0 && s.rowsT.length === 1, 'H: CARD_POSTS_PAUSE=on stops it, nothing claimed or sent')
  const tick = src('lib/card/tick.js'); const pi = src('lib/cards/postImages.js'); const ci = src('lib/cards/cardImage.js'); const nc = src('lib/cards/nManCard.js'); const oc = src('lib/cards/outcome.js')
  check(/postDonovanResults\(db, \{ sport, day, rows, now \}\)/.test(tick) && /_donResultDone/.test(tick), 'H: the tick posts the results for a graded entry and settles them')
  check(/requireGraded/.test(ci) && /requireGraded: true/.test(pi) && /nman-result-np\|/.test(pi) && /hidePrice: true/.test(pi), 'H: the result image refuses the pregame card (requireGraded) and has its own cache key')
  check(/legOutcomeWord\(out\)/.test(nc) && /outcomeWord\(graded\.result\)/.test(nc) && /cashed: 'HIT', missed: 'MISS', dnp: 'VOID'/.test(oc), 'H: the N-man card says HIT / MISS / VOID on the legs and keeps CASHED / MISSED / VOID for the ticket')
}

console.log(failed ? `\n${failed} FAILED` : '\nOK: his N-man result post')
process.exit(failed ? 1 : 0)
