// THE CARD PICTURES ON THE POSTS: the live CALLED alert's front card (and its fallback), the free Card post's straight #1 front, the members day image.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-card-posting.mjs
// ALL DATA IS TEST DATA: players are "Test ...", every webhook is a TEST placeholder, fetch is replaced (nothing is sent), the renderer is a stub.
//   A  the front card replaces the event card for a CALLED alert; any failure / a timeout / a non-CALLED card / the off switch falls back to the old card
//   B  the free Card post's picture is straight #1's FRONT only, and only when the post names him; never another leg, never a Two-Man
//   C  the members day image reaches the members webhook ONLY: not a free channel, not X, whatever a builder returns
//   D  a free post's card (built.png) reaches its channel as card.png and X as an uploaded media id; an upload that fails leaves the text post
//   E  the three alert routes keep their old card as the fallback and their claim / retry code is untouched
import { readFileSync } from 'node:fs'

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
  for (const k of Object.keys(process.env)) if (/^DISCORD_|^X_|POST_KINDS_ON|ALERT_FRONT_CARD_OFF|SUPABASE/.test(k)) delete process.env[k]
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

console.log(failed ? `\n${failed} FAILED` : '\nOK: card pictures on the posts')
process.exit(failed ? 1 : 0)
