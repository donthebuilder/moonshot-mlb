// THE CARD PICTURES ON THE POSTS: the live CALLED alert's front card (and its fallback), the free Card post's straight #1 front, the members day image.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-card-posting.mjs
// ALL DATA IS TEST DATA: players are "Test ...", every webhook is a TEST placeholder, fetch is replaced (nothing is sent), the renderer is a stub.
//   A  the front card replaces the event card for a CALLED alert; any failure / a timeout / a non-CALLED card / the off switch falls back to the old card
//   B  the free Card post's picture is straight #1's FRONT only, and only when the post names him; never another leg, never a Two-Man
//   C  the members day image reaches the members webhook ONLY: not a free channel, not X, whatever a builder returns
//   D  a free post's card (built.png) reaches its channel as card.png and X as an uploaded media id; an upload that fails leaves the text post
//   E  the three alert routes keep their old card as the fallback and their claim / retry code is untouched
//   F-I (10-10 "wire it up"): the graded slab under the free result posts, the bot's Two-Man dual card on the members post only, Donovan's on his free
//      post after his lock, kill switches SLAB_CARD_OFF / DUAL_CARD_OFF, failures never change the text, claim / retry untouched
import { readFileSync, readdirSync } from 'node:fs'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const calls = []
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  calls.push({ url: u, body: init.body, method: init.method })
  if (u.includes('api.x.com/2/media/upload')) return { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ data: { id: 'm-1' } }) }
  if (u.includes('api.x.com')) return { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ data: { id: 't-1' } }) }
  return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) }
}
const U = (n) => `https://discord.com/api/webhooks/${n}/TEST-TOKEN`
const FREE = U('2001'); const MEMBERS = U('2002')
const setEnv = (extra = {}) => {
  for (const k of Object.keys(process.env)) if (/^DISCORD_|^X_|POST_KINDS_ON|ALERT_FRONT_CARD_OFF|SLAB_CARD_OFF|DUAL_CARD_OFF|SUPABASE/.test(k)) delete process.env[k]
  Object.assign(process.env, { DISCORD_HOMER_WEBHOOK: FREE, DISCORD_NHL_WEBHOOKS: FREE, DISCORD_MEMBERS_WEBHOOK: MEMBERS, ...extra })
}
const isMultipart = (c) => c.body instanceof FormData
const cardPart = (c) => (isMultipart(c) ? c.body.get('files[0]') : null)
const png = (tag) => Buffer.from(`PNG-${tag}`)

const { alertFrontCard, alertPicture, straightFrontCard, membersDayImage } = await import('../lib/cards/alertCard.js')
const { attachStraightFront, membersCardBuild } = await import('../lib/card/post.js')
const { postOnce } = await import('../lib/dash/longshotsPost.js')
const { postMembers } = await import('../lib/dash/membersPost.js')

// ── A. the live CALLED alert ──
setEnv()
const okRender = (status = 'called', bytes = png('front')) => { const f = async () => { f.n += 1; return { ok: true, png: bytes, model: { status } } }; f.n = 0; return f }
{
  const r = okRender()
  const got = await alertFrontCard({ sport: 'nhl', id: 'T1', render: r })
  check(got?.toString() === 'PNG-front', 'A: a CALLED alert gets the scorer\'s front card')
  await alertFrontCard({ sport: 'nhl', id: 'T1', render: r })
  check(r.n === 1, 'A: the Discord post and the X post of one alert share one render')
}
check(await alertFrontCard({ sport: 'nhl', id: 'T2', render: async () => { throw new Error('boom') } }) === null, 'A: a render that throws gives null (the event card is used)')
check(await alertFrontCard({ sport: 'nhl', id: 'T3', render: async () => ({ ok: false, status: 502, why: 'render failed' }) }) === null, 'A: a failed render gives null')
check(await alertFrontCard({ sport: 'nhl', id: 'T4', render: okRender('board') }) === null, 'A: a card that does not say CALLED is never put under a CALLED alert')
check(await alertFrontCard({ sport: 'nhl', id: 'T5', timeoutMs: 40, render: () => new Promise((res) => setTimeout(() => res({ ok: true, png: png('late'), model: { status: 'called' } }), 400)) }) === null, 'A: a render slower than the limit gives null')
setEnv({ ALERT_FRONT_CARD_OFF: 'on' })
check(await alertFrontCard({ sport: 'nhl', id: 'T6', render: okRender() }) === null, 'A: ALERT_FRONT_CARD_OFF=on keeps every alert on its old card')
setEnv()
{
  let used = 0
  const fb = async () => { used += 1; return png('event') }
  check((await alertPicture({ sport: 'nfl', id: 'T7', called: true, render: okRender(), fallback: fb })).toString() === 'PNG-front' && used === 0, 'A: front card ok -> the event card is not even drawn')
  check((await alertPicture({ sport: 'nfl', id: 'T8', called: true, render: async () => { throw new Error('x') }, fallback: fb })).toString() === 'PNG-event', 'A: render fails -> the existing event card')
  check((await alertPicture({ sport: 'nfl', id: 'T9', called: false, render: okRender(), fallback: fb })).toString() === 'PNG-event', 'A: not a CALLED alert -> the existing event card')
  check(await alertPicture({ sport: 'nfl', id: 'T10', called: true, render: async () => { throw new Error('x') }, fallback: async () => { throw new Error('y') } }) === null, 'A: both fail -> null, and the caller posts the text')
}

// ── B. the free Card post: straight #1's front, only when named ──
const leg = (id, name) => ({ player_id: id, name, team: 'TST', opp: 'OPP', game_id: '1', game_date: '2026-01-02', start_at: '2026-01-02T20:00:00Z' })
const rows = [
  { lane: 'bot', product: 'straight', slot: 1, legs: [leg('P1', 'Test One')] }, { lane: 'bot', product: 'straight', slot: 2, legs: [leg('P2', 'Test Two')] },
  { lane: 'bot', product: 'two_man', slot: 1, legs: [leg('P1', 'Test One'), leg('P3', 'Test Three')] }, { lane: 'donovan', product: 'two_man', slot: 1, legs: [leg('P4', 'Test Four'), leg('P5', 'Test Five')] },
]
{
  const asked = []
  const front = async ({ id }) => { asked.push(id); return png(`front-${id}`) }
  const b1 = await attachStraightFront({ text: 'x', named: ['P1', 'P4', 'P5'], payload: {} }, { sport: 'nhl', day: '2026-01-02', rows, front })
  check(b1.png?.toString() === 'PNG-front-P1' && asked.join() === 'P1', 'B: straight #1 is named -> his front card, and ONLY his was asked for (not #2, the Two-Man or Donovan\'s men)')
  asked.length = 0
  const b2 = await attachStraightFront({ text: 'x', named: ['P4', 'P5'], payload: {} }, { sport: 'nhl', day: '2026-01-02', rows, front })
  check(!b2.png && asked.length === 0, 'B: straight #1 is not named (only Donovan\'s Two-Man is) -> no picture, nothing rendered')
  const b3 = await attachStraightFront({ text: '', named: [], pending: [{}] }, { sport: 'nhl', day: '2026-01-02', rows, front })
  check(!b3.png && asked.length === 0, 'B: a held post (no text yet) gets no picture')
  const b4 = await attachStraightFront({ text: 'x', named: ['P1'], payload: {} }, { sport: 'nhl', day: '2026-01-02', rows, front: async () => null })
  check(!b4.png && b4.text === 'x', 'B: a failed render leaves the post as its text')
  check((await straightFrontCard({ sport: 'nhl', id: 'P1', render: async () => { throw new Error('x') } })) === null, 'B: straightFrontCard never throws')
}

// ── C. the members day image reaches the members webhook only ──
const fakeDb = () => {
  const store = []
  const table = {
    select: () => ({ match: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    upsert: (r) => { store.push(...r); return { select: async () => ({ data: r.map((x) => ({ day: x.day })), error: null }) } },
    update: () => ({ match: async () => ({ error: null }) }), delete: () => ({ match: async () => ({ error: null }) }),
  }
  return { from: () => table }
}
{
  const bot = rows.filter((r) => r.lane === 'bot')
  const mb = await membersCardBuild({ sport: 'nhl', day: '2026-01-02', bot, prices: new Map(), image: async () => png('members-day') })
  check(mb?.membersImage?.toString() === 'PNG-members-day' && !mb.png, 'C: the members build carries the day lineup as membersImage (never as the public png)')
  const none = await membersCardBuild({ sport: 'nhl', day: '2026-01-02', bot, prices: new Map(), image: async () => null })
  check(none && !none.membersImage && none.text, 'C: no render -> the members post is its text alone')
  setEnv(); calls.length = 0
  await postMembers(fakeDb(), { day: '2026-01-02', kind: 'card_members_nhl', envGate: false, build: async () => ({ text: 'members card', membersImage: png('members-day') }) })
  check(calls.length === 1 && calls[0].url === MEMBERS && cardPart(calls[0]) && !calls.some((c) => c.url.includes('api.x.com')), 'C: members post -> one request, to the members webhook, with the image attached, none to X')
  const payload = JSON.parse(calls[0].body.get('payload_json'))
  check(/attachment:\/\/card\.png/.test(JSON.stringify(payload.embeds || [])) || payload.embeds?.some((e) => e.image?.url === 'attachment://card.png'), 'C: the image sits under the embed as attachment://card.png')
  // a FREE post (not membersOnly) whose builder returns a membersImage must NOT send it anywhere
  setEnv({ X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a' }); calls.length = 0
  await postOnce(fakeDb(), { day: '2026-02-01', kind: 'card_result_nhl', envGate: false, webhooks: FREE, toX: false, build: async () => ({ text: 'free post', membersImage: png('members-day') }) })
  check(calls.length === 1 && calls[0].url === FREE && !isMultipart(calls[0]) && !calls.some((c) => c.url.includes('api.x.com')), 'C: a free-channel post that is handed a members image sends it NOWHERE (plain JSON, no file)')
  calls.length = 0
  await postOnce(fakeDb(), { day: '2026-02-02', kind: 'card_members_nhl', envGate: false, webhooks: MEMBERS, toX: false, build: async () => ({ text: 'not marked members', membersImage: png('members-day') }) })
  check(calls.length === 1 && !isMultipart(calls[0]), 'C: only postMembers (membersOnly) may send a members image, a hand-built "members" call may not')
}

// ── D. a free post's card goes to its channel and to X; an upload that fails leaves the text ──
{
  setEnv({ DISCORD_NHL_WEBHOOKS: FREE }); calls.length = 0
  await postOnce(fakeDb(), { day: '2026-02-03', kind: 'card_result_nhl', envGate: false, webhooks: FREE, toX: false, build: async () => ({ text: 'free post with a card', png: png('straight-front') }) })
  check(calls.length === 1 && calls[0].url === FREE && cardPart(calls[0]) && !calls.some((c) => c.url.includes('api.x.com')), 'D: a free post\'s card is attached to its channel post as card.png')
  setEnv(); calls.length = 0
  await postOnce(fakeDb(), { day: '2026-02-04', kind: 'card_result_nhl', envGate: false, webhooks: FREE, toX: false, build: async () => ({ text: 'text only' }) })
  check(calls.length === 1 && !isMultipart(calls[0]), 'D: no picture -> the channel post is the JSON post it always was')
}

// D2. the X side: the card is uploaded and attached; a refused upload leaves the text post
{
  const richDb = () => { const t = { select: () => ({ match: () => ({ maybeSingle: async () => ({ data: null }) }), eq: () => t.select(), limit: async () => ({ data: [] }) }), upsert: (r) => ({ select: async () => ({ data: r.map((x) => ({ day: x.day })), error: null }) }), update: () => ({ match: async () => ({ error: null }) }), delete: () => ({ match: async () => ({ error: null }) }), insert: async () => ({ error: null }) }; return { from: () => t } }
  const X = { DISCORD_HOMER_WEBHOOK: FREE, X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a', X_SCHEDULE_OFF: 'on', X_GUARDS_OFF: 'repeat,naming,cap' }
  setEnv(X); calls.length = 0
  const r1 = await postOnce(richDb(), { day: '2026-03-01', kind: 'card_nhl', sport: 'nhl', envGate: false, build: async () => ({ text: 'test post', png: png('straight-front'), payload: {} }) })
  const tweet = calls.find((c) => c.url.endsWith('/2/tweets'))
  check(/^posted/.test(r1) && calls.some((c) => c.url.includes('media/upload')) && tweet && JSON.parse(tweet.body).media?.media_ids?.[0] === 'm-1', 'D: the free X post uploads the card and attaches its media id')
  setEnv(X); calls.length = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => (String(url).includes('media/upload') ? { ok: false, status: 400, statusText: 'Bad', headers: { get: () => null }, json: async () => ({ title: 'nope' }) } : realFetch(url, init))
  const r2 = await postOnce(richDb(), { day: '2026-03-02', kind: 'card_nhl', sport: 'nhl', envGate: false, build: async () => ({ text: 'test post two', png: png('straight-front'), payload: {} }) })
  globalThis.fetch = realFetch
  const tweet2 = calls.find((c) => c.url.endsWith('/2/tweets'))
  check(/^posted/.test(r2) && tweet2 && !JSON.parse(tweet2.body).media && JSON.parse(tweet2.body).text === 'test post two', 'D: an upload X refuses does not block the text post (text unchanged)')
}

// ── E. the three alert routes: old card stays as the fallback, claim / retry code untouched ──
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const hr = src('app/api/dash/homers/tick/route.js'); const td = src('app/api/dash/nfl/tick/route.js'); const gl = src('app/api/lamp/goals/tick/route.js')
check(/alertPicture\(\{ sport: 'mlb'[^}]*fallback: \(\) => bytesOf\(\(\) => homerCard\(ev/.test(hr) && /alertFrontCard\(\{ sport: 'mlb'/.test(hr) && /imageUrl: cardUrl\(row\)/.test(hr), 'E: homer alert: front card first, homerCard / cardUrl still the fallback')
check(/alertPicture\(\{ sport: 'nfl'[^}]*fallback: \(\) => bytesOf\(\(\) => tdCard\(ev/.test(td), 'E: touchdown alert: front card first, tdCard still the fallback')
check(/alertFrontCard\(\{ sport: 'nhl'/.test(gl) && /await goalCard\(row/.test(gl), 'E: goal alert: front card first, goalCard still the fallback')
check(/\.update\(\{ x_post_id: 'posting' \}\)/.test(hr) && /\.update\(\{ x_post_id: 'posting' \}\)/.test(td) && /settleAlert/.test(hr), 'E: the claim sentinel and settleAlert are still in the alert code')

// ═══ THE TWO NEW CARD TYPES ON THE POSTS (10-10, "wire it up") ═══════════════════════════════════════════════════════════════
//   F  the graded SLAB under the free result posts (card_result_<sport>, card_ls_result_<sport>, card_double_result): real outcome, never a grade,
//      a miss asks exactly like a hit, only men the text names, X media + Discord file, failures never change the text
//   G  the bot's Two-Man DUAL card rides ONLY the members post (membersExtraPngs), never X, never a free channel
//   H  DONOVAN'S dual card rides the free post only after his lock, only when both his men are named; never the bot's
//   I  kill switches, 12 s limit, claim / retry untouched, source guards (the receipt's own cases live in scripts/check-receipt.mjs section 12)
const PI = await import('../lib/cards/postImages.js')
const { _resetTakenForTests: resetTaken } = await import('../lib/dash/postClaim.js')
const POST = await import('../lib/card/post.js')
const richDb = () => { const t = { select: () => ({ match: () => ({ maybeSingle: async () => ({ data: null }) }), eq: () => t.select(), in: () => t.select(), order: () => t.select(), limit: async () => ({ data: [] }) }), upsert: (r) => ({ select: async () => ({ data: r.map((x) => ({ day: x.day })), error: null }) }), update: () => ({ match: async () => ({ error: null }) }), delete: () => ({ match: async () => ({ error: null }) }), insert: async () => ({ error: null }) }; return { from: () => t } }
const XENV = { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a', X_SCHEDULE_OFF: 'on', X_GUARDS_OFF: 'repeat,naming,cap' }
const tweetOf = () => { const c = calls.find((x) => x.url.endsWith('/2/tweets')); return c ? JSON.parse(c.body) : null }
const filesOf = (c) => (isMultipart(c) ? [...c.body.keys()].filter((k) => k.startsWith('files[')).map((k) => c.body.get(k)) : [])
const payloadOf = (c) => JSON.parse(c.body.get('payload_json'))
const mkRow = (o) => ({ sport: 'nhl', card_date: '2026-01-02', lane: 'bot', product: 'straight', slot: 1, result: 'hit', stake: 1, leg_results: [], start_at: '2026-01-02T20:00:00Z', locks_at: '2026-01-02T18:00:00Z', ...o })
const gradedRows = (lead = 'hit') => [
  mkRow({ slot: 1, result: lead, legs: [leg('P1', 'Test One')] }), mkRow({ slot: 2, result: 'miss', legs: [leg('P2', 'Test Two')] }),
  mkRow({ product: 'two_man', result: 'hit', legs: [leg('P1', 'Test One'), leg('P3', 'Test Three')] }),
]
const askedSlab = []
const slabStub = (bytes = 'SLAB') => async (o) => { askedSlab.push(o); return Buffer.from(`PNG-${bytes}`) }

// ── F. the slab under the free result posts ──
{
  setEnv(XENV); calls.length = 0; askedSlab.length = 0
  const r1 = await POST.postCardResult(richDb(), { sport: 'nhl', day: '2026-01-02', rows: gradedRows('hit'), slab: slabStub() })
  check(/^posted/.test(r1) && askedSlab.length === 1, 'F: a graded card result asks for ONE slab')
  const q = askedSlab[0]
  check(q.sport === 'nhl' && q.date === '2026-01-02' && q.lane === 'bot' && q.product === 'straight' && q.slot === 1 && !!q.db, 'F: the slab asked for is the LEAD straight (bot, straight, slot 1) of that card date: the same params the route /api/card/slab takes')
  const disc = calls.find((c) => c.url === FREE)
  check(disc && filesOf(disc).length === 1 && payloadOf(disc).embeds?.[0]?.image?.url === 'attachment://card.png', 'F: the Discord result post carries the slab as card.png under its embed')
  check(calls.some((c) => c.url.includes('media/upload')) && tweetOf()?.media?.media_ids?.[0] === 'm-1', 'F: the X result post uploads the slab and attaches its media id')
  check(tweetOf()?.text.includes('Test One') && !/\bgrade\b|\b\d\.\d\b/i.test(tweetOf().text), 'F: the text names the lead (so the picture names no one the text does not) and carries no grade')
  // a miss asks in exactly the same shape as a hit
  setEnv(XENV); calls.length = 0; askedSlab.length = 0
  await POST.postCardResult(richDb(), { sport: 'nhl', day: '2026-01-03', rows: gradedRows('miss').map((r) => ({ ...r, card_date: '2026-01-03' })), slab: slabStub() })
  check(Object.keys(askedSlab[0]).sort().join() === Object.keys(q).sort().join() && askedSlab[0].product === q.product && askedSlab[0].slot === q.slot, 'F: a MISS asks for its slab exactly like a hit (same params, no special case)')
}
{
  // not every graded row is named in the text (level 2 names no one): no picture then; the slab function is not even called
  askedSlab.length = 0
  const lead = mkRow({ legs: [leg('P1', 'Test One')] })
  check(await POST.slabFor(lead, [], { slab: slabStub() }) === null && askedSlab.length === 0, 'F: a result text that does not name the lead gets no slab (nothing is asked for)')
  check(await POST.slabFor(mkRow({ result: null, legs: [leg('P1', 'Test One')] }), ['P1'], { slab: slabStub() }) === null && askedSlab.length === 0, 'F: a row that is not graded gets no slab')
  check(await POST.slabFor(mkRow({ product: 'two_man', legs: [leg('P1', 'a'), leg('P3', 'b')] }), ['P1'], { slab: slabStub() }) === null && askedSlab.length === 0, 'F: a card with a man the text does not name is not drawn')
  check(await POST.slabFor(lead, ['P1'], { slab: async () => { throw new Error('x') } }) === null, 'F: a slab function that throws is null (the post is its text)')
}
{
  // the Long Shot's result and the Double's result
  setEnv({ ...XENV, DISCORD_NHL_WEBHOOKS: FREE }); calls.length = 0; askedSlab.length = 0
  const ls = mkRow({ product: 'long_shot', result: 'miss', legs: [leg('P9', 'Test Nine')] })
  const NOW = Date.parse('2026-01-04T15:00:00Z')
  const r = await POST.postLongShotResult(richDb(), { sport: 'nhl', day: '2026-01-02', row: ls, rec: { graded: 4, hits: 1, voids: 0, pushes: 0 }, now: NOW, slab: slabStub('ls') })
  check(/^posted/.test(r) && askedSlab[0]?.product === 'long_shot' && askedSlab[0].lane === 'bot' && askedSlab[0].sport === 'nhl', 'F: the Long Shot result asks for the long_shot slab of its sport and date')
  const t = tweetOf()
  check(t?.text.includes('Test Nine') && t.media?.media_ids?.length === 1 && !/units|ROI|\bunit\b/i.test(t.text), 'F: the Long Shot result post: names its man, carries the slab on X, no units / ROI in the text')
  setEnv({ ...XENV, DISCORD_HOMER_WEBHOOK: FREE }); calls.length = 0; askedSlab.length = 0
  const dbl = mkRow({ sport: 'all', product: 'double', result: 'miss', leg_results: [{ result: 'hit' }, { result: 'miss' }], legs: [{ ...leg('P1', 'Test One'), sport: 'nhl' }, { ...leg('P7', 'Test Seven'), sport: 'mlb' }] })
  const r2 = await POST.postDoubleResult(richDb(), { day: '2026-01-02', row: dbl, slab: slabStub('dbl') })
  check(/^posted/.test(r2) && askedSlab[0]?.sport === 'all' && askedSlab[0].product === 'double' && askedSlab[0].date === '2026-01-02', 'F: the Double result asks for the double slab (sport all, both legs named by the text)')
  check(calls.some((c) => c.url === FREE && filesOf(c).length === 1) && tweetOf()?.media?.media_ids?.length === 1, 'F: the Double result carries the slab on Discord and X')
}
{
  // failures never change the text post
  const base = async (slab, uploadOk = true) => {
    setEnv(XENV); calls.length = 0; resetTaken()
    const real = globalThis.fetch
    if (!uploadOk) globalThis.fetch = async (url, init) => (String(url).includes('media/upload') ? { ok: false, status: 400, statusText: 'Bad', headers: { get: () => null }, json: async () => ({ title: 'nope' }) } : real(url, init))
    const r = await POST.postCardResult(richDb(), { sport: 'nhl', day: '2026-02-10', rows: gradedRows('hit').map((x) => ({ ...x, card_date: '2026-02-10' })), slab })
    globalThis.fetch = real
    return { r, tweet: tweetOf(), disc: calls.find((c) => c.url === FREE) }
  }
  const ok0 = await base(slabStub())
  for (const [name, slab] of [['null', async () => null], ['throws', async () => { throw new Error('boom') }]]) {
    PI._resetPostImages()
    const b = await base(slab)
    check(/^posted/.test(b.r) && b.tweet?.text === ok0.tweet?.text && !b.tweet?.media && b.disc && !isMultipart(b.disc), `F: a slab that is ${name} -> the result post is the same text, no media, a plain Discord post`)
  }
  const up = await base(slabStub(), false)
  check(/^posted/.test(up.r) && up.tweet?.text === ok0.tweet?.text && !up.tweet?.media && up.disc && filesOf(up.disc).length === 1, 'F: an X upload refusal leaves the tweet as text (the Discord post keeps its slab)')
  // the real slabForRow: 12 s limit (here 30 ms), kill switch, the not-graded 404 gives null
  PI._resetPostImages(); setEnv()
  const slow = await PI.slabForRow({ sport: 'nhl', date: '2026-04-01', db: {}, timeoutMs: 30, render: () => new Promise((res) => setTimeout(() => res({ ok: true, png: Buffer.from('late') }), 300)) })
  check(slow === null, 'F: a slab render slower than the limit gives null')
  check(await PI.slabForRow({ sport: 'nhl', date: '2026-04-02', db: {}, render: async () => ({ ok: false, status: 404, why: 'not graded yet' }) }) === null, 'F: a 404 (not graded) is null, never an image')
  let asked2 = 0
  setEnv({ SLAB_CARD_OFF: 'on' }); PI._resetPostImages()
  const off = await PI.slabForRow({ sport: 'nhl', date: '2026-04-03', db: {}, render: async () => { asked2 += 1; return { ok: true, png: Buffer.from('x') } } })
  check(off === null && asked2 === 0, 'F: SLAB_CARD_OFF=on -> null, and nothing is rendered')
  setEnv()
}

// ── G. the bot's Two-Man dual card: the members post only ──
{
  const bot = rows.filter((r) => r.lane === 'bot')
  const dualStub = async () => png('dual-bot')
  const asked3 = []
  const mb = await POST.membersCardBuild({ sport: 'nhl', day: '2026-01-02', bot, prices: new Map(), image: async () => png('members-day'), dual: async (o) => { asked3.push(o); return png('dual-bot') } })
  check(mb?.membersExtraPngs?.length === 1 && mb.membersExtraPngs[0].toString() === 'PNG-dual-bot' && mb.membersImage?.toString() === 'PNG-members-day' && !mb.png && !mb.extraPngs, 'G: the members build carries the day lineup (membersImage) and the bot\'s Two-Man dual card (membersExtraPngs), and NOTHING in the public png / extraPngs')
  check(asked3.length === 1 && asked3[0].sport === 'nhl' && asked3[0].date === '2026-01-02', 'G: the dual card is asked for by sport and card date')
  const noTwo = await POST.membersCardBuild({ sport: 'nhl', day: '2026-01-02', bot: bot.filter((r) => r.product !== 'two_man'), prices: new Map(), image: async () => png('d'), dual: async () => { throw new Error('must not be asked') } })
  check(noTwo && !noTwo.membersExtraPngs, 'G: no Two-Man on the card -> no dual card is asked for')
  for (const [name, d] of [['null', async () => null], ['throws', async () => { throw new Error('boom') }]]) {
    const b = await POST.membersCardBuild({ sport: 'nhl', day: '2026-01-02', bot, prices: new Map(), image: async () => png('d'), dual: d })
    check(b?.text === mb.text && !b.membersExtraPngs && b.membersImage, `G: a dual card that is ${name} -> the members post is its text + lineup, unchanged`)
  }
  setEnv({ DUAL_CARD_OFF: 'on' }); PI._resetPostImages()
  let drew = 0
  check(await PI.membersDualImage({ sport: 'nhl', date: '2026-01-02', db: {}, render: async () => { drew += 1; return { ok: true, png: Buffer.from('x') } } }) === null && drew === 0, 'G: DUAL_CARD_OFF=on -> the members dual card is null and not rendered')
  setEnv()
  // the real members helper draws the BOT lane with publicOnly:false (members content), and a render timeout is null
  const seen = []
  await PI.membersDualImage({ sport: 'nhl', date: '2026-01-02', db: {}, render: async (o) => { seen.push(o); return { ok: true, png: Buffer.from('x') } } })
  check(seen[0]?.lane === 'bot' && seen[0].publicOnly === false, 'G: membersDualImage renders the bot lane in-process (publicOnly:false: the route policy is untouched)')
  check(await PI.membersDualImage({ sport: 'nhl', date: '2026-01-03', db: {}, timeoutMs: 30, render: () => new Promise((res) => setTimeout(() => res({ ok: true, png: Buffer.from('late') }), 300)) }) === null, 'G: a dual render slower than the limit is null')
  // end to end through postCardMembers: members webhook only, two files, two embeds, none to X or the free channel
  setEnv(XENV); calls.length = 0
  const rM = await POST.postCardMembers(fakeDb(), { sport: 'nhl', day: '2026-05-01', rows: rows.map((r) => ({ ...r, start_at: '2099-01-01T00:00:00Z' })), now: Date.parse('2026-05-01T12:00:00Z'), image: async () => png('members-day'), dual: dualStub })
  const mc = calls.filter((c) => c.url === MEMBERS)
  check(/^posted/.test(rM) && mc.length === 1 && filesOf(mc[0]).length === 2 && payloadOf(mc[0]).embeds.length === 2 && payloadOf(mc[0]).embeds[1].image.url === 'attachment://extra-1.png', 'G: the members Card post -> ONE request to the members webhook with the day lineup AND the Two-Man dual card under it')
  check(calls.length === 1 && !calls.some((c) => c.url === FREE || c.url.includes('api.x.com')), 'G: nothing about it goes to X or a free channel')
  // leak: a FREE post (channel or X) handed membersExtraPngs / membersImage sends neither
  setEnv(XENV); calls.length = 0
  await postOnce(richDb(), { day: '2026-05-02', kind: 'card_nhl', sport: 'nhl', envGate: false, build: async () => ({ text: 'free text', payload: {}, membersImage: png('m'), membersExtraPngs: [png('dual-bot')] }) })
  check(calls.length >= 1 && calls.every((c) => !isMultipart(c) && !c.url.includes('media/upload')) && !tweetOf()?.media, 'G: a free X + channel post that is handed the bot dual card sends it NOWHERE (no file, no upload, no media)')
  setEnv(XENV); calls.length = 0
  await postOnce(fakeDb(), { day: '2026-05-03', kind: 'card_members_nhl', envGate: false, webhooks: MEMBERS, toX: false, build: async () => ({ text: 'not postMembers', membersExtraPngs: [png('dual-bot')] }) })
  check(calls.length === 1 && !isMultipart(calls[0]), 'G: a hand-built "members" call (not postMembers) cannot send it either')
}

// ── H. Donovan's dual card on the free post ──
{
  const don = { lane: 'donovan', product: 'two_man', slot: 1, legs: [leg('P4', 'Test Four'), leg('P5', 'Test Five')], locks_at: '2026-01-02T18:00:00Z', note: 'my note' }
  const R = rows.map((r) => (r.lane === 'donovan' ? don : r))
  const AFTER = Date.parse('2026-01-02T18:30:00Z'); const BEFORE = Date.parse('2026-01-02T17:00:00Z')
  const asked4 = []
  const dual = async (o) => { asked4.push(o); return png('dual-donovan') }
  const b0 = { text: "x\nInside Line Two-Man: Test Four + Test Five", named: ['P1', 'P4', 'P5'], payload: {}, png: png('front') }
  const a1 = await POST.attachDonovanDual(b0, { sport: 'nhl', day: '2026-01-02', rows: R, now: AFTER, dual })
  check(a1.extraPngs?.length === 1 && a1.png.toString() === 'PNG-front' && a1.text === b0.text && asked4[0].sport === 'nhl' && asked4[0].date === '2026-01-02', 'H: after his lock, naming both his men -> his dual card rides under the straight front; the text is untouched')
  asked4.length = 0
  const a2 = await POST.attachDonovanDual(b0, { sport: 'nhl', day: '2026-01-02', rows: R, now: BEFORE, dual })
  check(a2 === b0 && asked4.length === 0, 'H: BEFORE his lock the dual card is not even asked for')
  const a3 = await POST.attachDonovanDual({ ...b0, named: ['P1', 'P4'] }, { sport: 'nhl', day: '2026-01-02', rows: R, now: AFTER, dual })
  check(!a3.extraPngs && asked4.length === 0, 'H: only one of his men named (the other left out by the naming rules) -> no dual card')
  const a4 = await POST.attachDonovanDual(b0, { sport: 'nhl', day: '2026-01-02', rows: rows.filter((r) => r.lane === 'bot'), now: AFTER, dual })
  check(a4 === b0 && asked4.length === 0, 'H: no Donovan row (only the bot\'s Two-Man) -> nothing is attached: the bot\'s Two-Man is never put on a free post')
  check((await POST.attachDonovanDual({ text: '', named: [], pending: [{}] }, { sport: 'nhl', day: '2026-01-02', rows: R, now: AFTER, dual })).extraPngs === undefined && asked4.length === 0, 'H: a held post (no text) gets no picture')
  for (const [name, d] of [['null', async () => null], ['throws', async () => { throw new Error('boom') }]]) {
    const a = await POST.attachDonovanDual(b0, { sport: 'nhl', day: '2026-01-02', rows: R, now: AFTER, dual: d })
    check(a === b0 || (a.text === b0.text && !a.extraPngs), `H: a dual card that is ${name} leaves the post as it was`)
  }
  // the helper draws DONOVAN's lane with publicOnly:true
  const seen = []
  await PI.donovanDualImage({ sport: 'nhl', date: '2026-01-09', db: {}, render: async (o) => { seen.push(o); return { ok: true, png: Buffer.from('x') } } })
  check(seen[0]?.lane === 'donovan' && seen[0].publicOnly === true, 'H: donovanDualImage asks for lane donovan with publicOnly:true (the bot lane would 404 before drawing)')
  setEnv({ DUAL_CARD_OFF: 'on' }); PI._resetPostImages()
  check(await PI.donovanDualImage({ sport: 'nhl', date: '2026-01-10', db: {}, render: async () => ({ ok: true, png: Buffer.from('x') }) }) === null, 'H: DUAL_CARD_OFF=on -> Donovan\'s dual card is null too')
  // end to end: the free X + Discord post carries the front card AND his dual card (two files, two media ids); without a front, his dual card is the picture
  setEnv(XENV); calls.length = 0
  const rb = await postOnce(richDb(), { day: '2026-06-01', kind: 'card_nhl', sport: 'nhl', envGate: false, build: async () => POST.attachDonovanDual({ ...b0, text: 'test post with two cards' }, { sport: 'nhl', day: '2026-01-02', rows: R, now: AFTER, dual }) })
  const dc = calls.find((c) => c.url === FREE)
  check(/^posted/.test(rb) && dc && filesOf(dc).length === 2 && payloadOf(dc).embeds.length === 2 && calls.filter((c) => c.url.includes('media/upload')).length === 2 && tweetOf()?.media?.media_ids?.length === 2, 'H: the free Card post: Discord gets both pictures, X uploads both and attaches two media ids')
  setEnv(XENV); calls.length = 0
  await postOnce(richDb(), { day: '2026-06-02', kind: 'card_nhl', sport: 'nhl', envGate: false, build: async () => POST.attachDonovanDual({ text: 'only his two-man', named: ['P4', 'P5'], payload: {} }, { sport: 'nhl', day: '2026-01-02', rows: R, now: AFTER, dual }) })
  const dc2 = calls.find((c) => c.url === FREE)
  check(dc2 && filesOf(dc2).length === 1 && tweetOf()?.media?.media_ids?.length === 1, 'H: with no straight front the dual card is the one picture')
}

// ── I. claim / retry untouched, source guards ──
{
  // a channel that hiccups with a picture attached still releases the claim for a retry exactly as a text post does
  setEnv({ DISCORD_NHL_WEBHOOKS: FREE }); calls.length = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => (String(url) === FREE ? { ok: false, status: 503, statusText: 'x', headers: { get: () => null }, json: async () => ({}) } : realFetch(url))
  const deleted = []
  const db = richDb(); const from = db.from
  db.from = (n) => { const t = from(n); return { ...t, delete: () => ({ match: async (m) => { deleted.push(m); return { error: null } } }) } }
  const r = await postOnce(db, { day: '2026-07-01', kind: 'card_result_nhl', sport: 'nhl', envGate: false, build: async () => ({ text: 'result', png: png('slab'), payload: {} }) })
  globalThis.fetch = realFetch
  check(/^retry: discord 503/.test(r) && deleted.length === 1, 'I: a 503 on a post with a slab attached still releases the claim for the next tick (retry logic unchanged)')
  const lp = src('lib/dash/longshotsPost.js')
  check(/mayRetry\(`once\|\$\{k\}`\)/.test(lp) && /discordHiccup/.test(lp) && /\.upsert\(\[\{ day, kind, payload: \{\} \}\], \{ onConflict: 'day,kind', ignoreDuplicates: true \}\)/.test(lp), 'I: postOnce\'s claim / retry code is intact')
  const pi = src('lib/cards/postImages.js'); const post = src('lib/card/post.js')
  check(/SLAB_CARD_OFF/.test(pi) && /DUAL_CARD_OFF/.test(pi), 'I: both kill switches exist (SLAB_CARD_OFF, DUAL_CARD_OFF)')
  check(!/lane: 'bot'/.test(pi.slice(pi.indexOf('export async function donovanDualImage'))), 'I: the free-post dual helper never asks for the bot lane')
  const att = post.slice(post.indexOf('export async function attachDonovanDual'), post.indexOf('export async function membersCardBuild'))
  check(!/lane === 'bot'|membersDualImage/.test(att.replace(/\/\*\*[\s\S]*?\*\//g, '')), 'I: attachDonovanDual cannot reach the bot\'s Two-Man')
  const users = ['lib', 'app'].flatMap((d) => (function walk(p) { return readdirSync(p, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${p}/${e.name}`) : /\.(js|mjs)$/.test(e.name) ? [`${p}/${e.name}`] : [])) })(new URL(`../${d}`, import.meta.url).pathname)).filter((f) => /membersDualImage/.test(readFileSync(f, 'utf8'))).map((f) => f.split('/').slice(-2).join('/'))
  check(users.sort().join() === 'card/post.js,cards/postImages.js', `I: the bot's Two-Man dual helper is referenced only by the members post builder (${users.join(' ')})`)
  const route = src('app/api/card/dual/route.js')
  check(/publicOnly: true/.test(route), 'I: /api/card/dual still renders with publicOnly:true (the bot Two-Man stays 404 until the Card is public record)')
  const dayPost = post.slice(post.indexOf('export async function postDay'), post.indexOf('export async function postToday'))
  check(!/Dual|dual/.test(dayPost), 'I: THE DAY post (card_members_day*) carries no dual card')
}

console.log(failed ? `\n${failed} FAILED` : '\nOK: card pictures on the posts')
process.exit(failed ? 1 : 0)
