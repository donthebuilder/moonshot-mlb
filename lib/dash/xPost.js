// POSTING TO X, WITH NOTHING BUT node:crypto.
//
// One endpoint (POST /2/tweets), one auth scheme (OAuth 1.0a user context —
// the app posts AS the account, which is what a bot account is). Signing it by
// hand is forty lines; a client library is a dependency for the sake of forty
// lines, and this repo's rule is that a package earns its place.
//
// FOUR SECRETS, all from the X developer portal under the app's "Keys and
// tokens" tab, with the app's permissions set to READ AND WRITE BEFORE the
// access token is generated (a token minted under read-only stays read-only
// forever; regenerate it after flipping the permission):
//
//   X_API_KEY            "API Key"            (consumer key)
//   X_API_SECRET         "API Key Secret"     (consumer secret)
//   X_ACCESS_TOKEN       "Access Token"       for the bot account
//   X_ACCESS_SECRET      "Access Token Secret"
//
// THE QUOTA IS THE DESIGN CONSTRAINT. The free tier allows a few hundred
// posts a month at the app level (X has changed the number more than once;
// check the portal). A full MLB night is thirty to forty homers, so posting
// EVERY homer is roughly a thousand posts a month — Basic-tier volume. The
// route's X_POST_MODE switch exists for this: `flagged` posts only the homers
// the bot called (a quarter of the volume, and the ones that sell the site),
// `all` posts everything. Discord gets everything either way, free.
//
// Never throws to the caller. A refused post returns { ok:false, status,
// error } so the cron can log it and leave the row unposted for the next tick.

import { SPORT_ACCENT } from '../sportAccent'
import { logDiscordSend, channelKeyOf } from './discordSends'
import { createHmac, randomBytes } from 'node:crypto'
import { HARD_LIMIT } from './postLimit'
import { mirrorToThreads } from './threadsPost'
import { xLinkFor } from './threadsLink'
import { stripLinks } from './xPolicy'
import { blockedResult, noteXFailure, xErrorClass } from './xFail'
import { fitEmbed } from './discordCard'

const enc = (s) => encodeURIComponent(String(s))
  .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

const clean = (v) => String(v == null ? '' : v).trim()

// A hung call to X must never hold a tick open (Vercel's 60 s limit): give up after 20 s; a timeout reads as a transient error.
const X_FETCH_TIMEOUT_MS = 20000

export function xConfig() {
  return {
    key: clean(process.env.X_API_KEY),
    secret: clean(process.env.X_API_SECRET),
    token: clean(process.env.X_ACCESS_TOKEN),
    tokenSecret: clean(process.env.X_ACCESS_SECRET),
  }
}

export function xProblem() {
  const c = xConfig()
  if (!c.key) return 'X_API_KEY is not set'
  if (!c.secret) return 'X_API_SECRET is not set'
  if (!c.token) return 'X_ACCESS_TOKEN is not set'
  if (!c.tokenSecret) return 'X_ACCESS_SECRET is not set'
  return null
}

export const hasX = () => xProblem() === null

// X REFUSED IN A WAY THAT WILL REPEAT (2026-10-10 bug hunt, lib/dash/xFail.js). An account-level refusal
// (401, 402 credits depleted, a usage cap) opens the breaker: for the next minutes every call here answers
// { blocked:true } without a request, so a dead key or empty credits costs one probe per window, not one
// failing call (and one media upload) per row per minute. Said loudly once per opening, in the log and --
// when DISCORD_OPS_WEBHOOK is set -- in Donovan's own channel. Never the credentials; the status and X's title only.
async function noteRefusal(where, r) {
  const opened = noteXFailure(r)
  if (!opened) return
  console.error(`[x] BLOCKED ${Math.round((opened.until - opened.at) / 60e3)} min after ${where} ${opened.status} ${opened.why}: every X call is paused until then (credits/key/limit; check the X developer console)`)
  const ops = clean(process.env.DISCORD_OPS_WEBHOOK)
  if (ops) {
    await postToDiscord(`X is refusing posts (${where}: ${opened.status} ${opened.why}). Posting to X is paused here for ${Math.round((opened.until - opened.at) / 60e3)} minutes; Discord is unaffected. Check the X developer console (credits / limits / keys).`, {}, ops).catch(() => null)
  }
}

/** The OAuth 1.0a Authorization header for one request. Body is NOT signed for JSON bodies. */
export function oauthHeader(method, url, cfg = xConfig(), extra = {}) {
  const params = {
    oauth_consumer_key: cfg.key,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: cfg.token,
    oauth_version: '1.0',
    ...extra,
  }
  const base = [
    method.toUpperCase(),
    enc(url),
    enc(Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join('&')),
  ].join('&')
  const signingKey = `${enc(cfg.secret)}&${enc(cfg.tokenSecret)}`
  const signature = createHmac('sha1', signingKey).update(base).digest('base64')
  const all = { ...params, oauth_signature: signature }
  return 'OAuth ' + Object.keys(all).sort().map((k) => `${enc(k)}="${enc(all[k])}"`).join(', ')
}

/**
 * Upload one image (PNG bytes) and return its media id, or null.
 *
 * v2 media upload (the v1.1 endpoint was retired in 2025). Multipart body;
 * OAuth 1.0a signs only the oauth_* params for multipart, which is what
 * oauthHeader() does when given no extras. A refused upload is not an error
 * for the caller — the post goes out as text, which is the thing that
 * matters; the picture is the garnish.
 */
export async function uploadImageToX(bytes) {
  if (xProblem() || !bytes || blockedResult()) return null
  const url = 'https://api.x.com/2/media/upload'
  try {
    const form = new FormData()
    form.append('media', new Blob([bytes], { type: 'image/png' }), 'homer.png')
    form.append('media_category', 'tweet_image')
    form.append('media_type', 'image/png')
    const res = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url) }, body: form, signal: AbortSignal.timeout(X_FETCH_TIMEOUT_MS) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`[x] media upload refused: ${res.status} ${json?.detail || json?.title || res.statusText}`)
      await noteRefusal('media upload', { ok: false, status: res.status, error: json?.detail || json?.title || res.statusText, title: json?.title })
      return null
    }
    return json?.data?.id || json?.media_id_string || null
  } catch (err) {
    console.error('[x] media upload failed: ' + String(err?.message || err))
    return null
  }
}

// THE LAST LINE OF DEFENCE AGAINST A CHOPPED TWEET (2026-09-07).
//
// This used to be a bare `String(text).slice(0, 280)`: a hard chop, mid-word,
// mid-emoji, with nothing logged. Every list-shaped builder budgets itself to
// 270 and is safe, but five do not budget at all -- longshotText,
// numerologyText, weeklyText, monthlyText and the recap text built inline in
// the homers tick route -- and postText only length-checks its hooks, not its
// core. All of them measure short in practice, which is exactly why a silent
// chop would have been found by a reader before it was found by us.
//
// So: trim on a boundary, worst to best -- a whole line, then a whole word,
// then (only if one word runs past 280 by itself) the raw cut, taken with
// Array.from so a surrogate pair is never split into a replacement character.
// And say so in the log, loudly, every time. The post still goes out; what
// changes is that it goes out readable and we hear about it.
// 2026-09-18 (Donovan: "add more to the tweet... the storylines and stuff can
// be a really big tweet or two"). X Premium allows long posts; whether THIS
// app's API tier will accept one is a separate question and the only honest
// way to find out is to send one. So the limit is now a config value, and
// postToX RETRIES AT 280 when a long attempt is refused -- the long post is
// the try, the short post is the guarantee. A tier that can't do it loses
// nothing but a log line, same shape as the native-poll note below.
// HARD_LIMIT lives in postLimit.js so the BUILDERS and the SENDER can never
// disagree about how long a post is allowed to be.
const LIMIT = Math.max(HARD_LIMIT, Number(process.env.X_TEXT_LIMIT) || HARD_LIMIT)
export const textLimit = () => LIMIT

export function fitToLimit(raw, limit = LIMIT) {
  const text = String(raw == null ? '' : raw)
  if (Array.from(text).length <= limit) return text
  const lines = text.split('\n')
  while (lines.length > 1) {
    lines.pop()
    const joined = lines.join('\n')
    if (Array.from(joined).length <= limit) return joined
  }
  const words = lines[0].split(' ')
  while (words.length > 1) {
    words.pop()
    const joined = words.join(' ')
    if (Array.from(joined).length <= limit) return joined
  }
  return Array.from(text).slice(0, limit).join('')
}

// ── READING (2026-09-22) ───────────────────────────────────────────────────
// The @MLBHR reply pass needs to READ someone else's timeline, which is the
// first GET this file has done. Same OAuth 1.0a signature, one difference that
// matters: for a GET the query parameters ARE part of the signature base, so
// they are passed into oauthHeader() as extras rather than only onto the URL.
// Get that wrong and every request comes back 401 with nothing to say why.
//
// Never throws. Returns { ok, status, json, rate } -- `rate` carries X's own
// remaining/limit headers so a tick can log how close it is rather than
// discovering the ceiling by hitting it.
export async function getFromX(path, query = {}) {
  const problem = xProblem()
  if (problem) return { ok: false, status: 0, error: problem }
  const held = blockedResult()
  if (held) return held
  const url = `https://api.x.com${path}`
  const qs = new URLSearchParams(query).toString()
  try {
    const res = await fetch(qs ? `${url}?${qs}` : url, {
      headers: { Authorization: oauthHeader('GET', url, xConfig(), query) },
      signal: AbortSignal.timeout(X_FETCH_TIMEOUT_MS),
    })
    const json = await res.json().catch(() => ({}))
    const rate = {
      remaining: res.headers.get('x-rate-limit-remaining'),
      limit: res.headers.get('x-rate-limit-limit'),
    }
    if (!res.ok) {
      console.error(`[x] GET ${path} ${res.status}: ${json?.detail || json?.title || res.statusText}`)
      const refused = { ok: false, status: res.status, error: json?.detail || json?.title || res.statusText, title: json?.title, json, rate }
      await noteRefusal(`GET ${path}`, refused)
      return refused
    }
    return { ok: true, status: res.status, json, rate }
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err) }
  }
}

/**
 * Post one tweet. Returns { ok, id } or { ok:false, status, error }.
 * `replyTo` threads it under an earlier post id; `mediaId` attaches an image
 * from uploadImageToX().
 */
export async function postToX(text, { replyTo = null, mediaId = null, mediaIds = null, quoteId = null, poll = null, kind = null, link: linkCtx = {}, _retry = false } = {}) {
  const problem = xProblem()
  if (problem) return { ok: false, status: 0, error: problem }
  const held = blockedResult()   // X refused with an account-level error moments ago: no request, the caller's own rule decides
  if (held) return held
  const url = 'https://api.x.com/2/tweets'
  let raw = stripLinks(text)   // no links on X (lib/dash/xPolicy), whatever wrote the text
  // THE X FUNNEL LINK (2026-09-21), same seam as the Threads mirror below.
  // Only a top-level post (no replyTo -- a reply already chains under
  // something with its own destination; no poll -- a poll has no spare
  // line for it) in one of the anchor kinds gets one, and it goes INLINE
  // rather than as a separate reply: X prices per call, so folding the
  // link into the one call already happening is cheaper than a second
  // call that would ALSO land on the higher $0.200 rate. If the combined
  // text runs long, fitToLimit() below trims from the LAST line first, so
  // on a rare over-budget post the link is what quietly drops -- never
  // the post's own words.
  // `plain` is the post without X's link: what the Threads mirror gets (it
  // adds its own), and what the long-post retry starts from (so the link is
  // added once, not twice). Both used to take the linked text (09-26 fix).
  const plain = raw
  if (!replyTo && !poll) {
    const link = xLinkFor(kind, linkCtx)
    if (link) raw = `${raw}\n\n${link}`
  }
  const fitted = fitToLimit(raw, _retry ? HARD_LIMIT : LIMIT) // the retry is the hard 280
  if (fitted !== raw) {
    console.error(`[x] post trimmed to fit: ${Array.from(raw).length} chars -> ${Array.from(fitted).length}. Head: ${raw.split('\n')[0]}`)
  }
  const body = { text: fitted }
  if (replyTo) body.reply = { in_reply_to_tweet_id: String(replyTo) }
  // several images (a game write-up carries both players' cards, 2026-10-04); X takes up to 4
  const media = [...(mediaIds || []), ...(mediaId ? [mediaId] : [])].filter(Boolean).map(String).slice(0, 4)
  if (media.length) body.media = { media_ids: media }
  // A called homer QUOTES the morning's pregame post. That thread is the
  // receipt: the name was public before first pitch, in X's own UI, and the
  // reader can tap through to check. Nothing about the text changes.
  if (quoteId) body.quote_tweet_id = String(quoteId)
  // NATIVE POLL (2026-09-13, "Bot vs the People"). X's rules: 2-4 options,
  // 1-25 chars each, duration 5-10080 minutes. Untested against a real X app
  // access tier from here -- older free-tier apps could not create polls via
  // the API at all. A refusal comes back exactly like any other refused
  // post (ok:false, status, error) rather than throwing, so a tier that
  // can't do this just logs it and leaves the slot unclaimed for a human to
  // notice, same as every other refusal in this file.
  if (poll && Array.isArray(poll.options) && poll.options.length >= 2) {
    body.poll = {
      options: poll.options.slice(0, 4).map((o) => String(o).slice(0, 25)),
      duration_minutes: Number.isFinite(Number(poll.durationMinutes)) ? Number(poll.durationMinutes) : 1440,
    }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: oauthHeader('POST', url),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(X_FETCH_TIMEOUT_MS),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      // THE LONG-POST FALLBACK (2026-09-18). When the limit has been raised
      // above 280 and X refuses the post, try once more at the hard 280. The
      // long version is the attempt; the short version is the guarantee. This
      // is what makes raising X_TEXT_LIMIT free to try: an app tier that
      // cannot post long loses a log line, not the day's slot.
      // Only on a 4xx -- a 5xx or a rate limit is not a length problem and a
      // second identical-ish request would just burn another call.
      const lengthy = Array.from(fitted).length > HARD_LIMIT
      const clientError = res.status >= 400 && res.status < 500 && res.status !== 429
      const refusal = { ok: false, status: res.status, error: json?.detail || json?.title || res.statusText, title: json?.title }
      // an account-level refusal (credits, key) would refuse the 280 retry too: do not spend a second call on it
      if (lengthy && clientError && !_retry && xErrorClass(refusal) !== 'account') {
        console.error(`[x] long post refused (${res.status} ${json?.detail || json?.title || ''}) at ${Array.from(fitted).length} chars — retrying at ${HARD_LIMIT}`)
        return postToX(plain, { replyTo, mediaId, mediaIds, quoteId, poll, kind, link: linkCtx, _retry: true })
      }
      await noteRefusal('post', refusal)
      return refusal
    }
    if (Array.from(fitted).length > HARD_LIMIT) {
      console.log(`[x] long post accepted at ${Array.from(fitted).length} chars — this account's tier allows it`)
    }
    const id = json?.data?.id || null
    // THE THREADS MIRROR (2026-09-20). Every post in the product comes
    // through here, so this is the one seam where a second network can be
    // added without touching twenty call sites. Inert unless THREADS_MIRROR
    // is on AND the credentials exist, and AWAITED on purpose: fire-and-
    // forget in a serverless function is a promise the runtime may kill when
    // the response returns, which is exactly the untraceable silence the
    // homer replies spent two nights being. A Threads failure is logged and
    // dropped -- it can never change what already happened on X, which is
    // why this sits AFTER the success is established and its result is not
    // consulted. The post text is unchanged: Threads' own limit is 500, and
    // the mirror refits only a Premium long post that exceeds it.
    if (id) {
      await mirrorToThreads(fitToLimit(plain), { replyTo, poll, xId: id, kind, link: linkCtx })
        .catch((err) => console.error(`[threads] mirror threw: ${String(err?.message || err)}`))
    }
    return { ok: true, id, chars: Array.from(fitted).length }
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err) }
  }
}

// DISCORD_HOMER_WEBHOOK, like every other webhook env var in this repo
// (see lib/dash/discordAlerts.js's own `list()`), accepts a comma- or
// newline-separated list of URLs, not just one.
const webhookList = (raw) => String(raw || '')
  .split(/[,\n]/)
  .map((s) => clean(s))
  .filter(Boolean)

// A webhook URL is https://discord.com/api/webhooks/{id}/{token} -- the
// {token} half is a bare credential (whoever has it can post to that
// channel with no other auth), so nothing here ever logs or returns the
// full URL. The {id} half identifies which server/channel broke without
// exposing anything, which is what SILENT-FAILURE DIAGNOSTIC (below) needs.
const hookId = (url) => {
  const m = String(url || '').match(/webhooks\/(\d+)/)
  return m ? m[1] : 'unknown'
}

// SILENT-FAILURE DIAGNOSTIC (2026-09-08). \`ok\` below is true if ANY webhook
// in the list succeeded, by design (see the FANS OUT note) -- but that means
// a caller checking only \`.ok\` (every caller here does) cannot tell a "both
// webhooks fine" tick from a "server A's webhook has been dead for a week,
// server B is still getting everything" tick. Found live the same day the
// tick's own statErrors diagnostic shipped: Donovan reported one of his two
// Discord servers stopped getting these posts while the other kept getting
// them, and nothing anywhere had ever logged which webhook was failing or
// why. Every per-hook failure is recorded here (id, http status, error) and
// drained once per tick via discordFailuresSnapshot(), so
// app/api/dash/homers/tick/route.js can put it in the JSON response next to
// statErrors -- visible without needing Vercel log access.

/**
 * One Discord message, to one webhook or several. Free, no quota worth
 * designing around. `imageUrl` rides as an embed so the card shows under
 * the text.
 *
 * FANS OUT (2026-09-06). Donovan tried putting two webhook URLs, comma-
 * separated, into DISCORD_HOMER_WEBHOOK to reach two servers -- exactly what
 * discordAlerts.js's own webhook vars already support -- and only one
 * server got anything. This function was `fetch`ing the whole raw env
 * value as if it were a single URL, so a two-webhook string silently became
 * one broken request. It now splits the same way discordAlerts.js does and
 * posts to every webhook in the list. `ok` is true if at least one went
 * through, so a caller only checking `.ok` (every caller here does) keeps
 * working exactly as before when there is just the one webhook.
 */
/** Removes one of our posts from X (the fact engine's DELETE on /admin). */
export async function deleteFromX(id) {
  const problem = xProblem()
  if (problem) return { ok: false, status: 0, error: problem }
  if (!/^\d+$/.test(String(id || ''))) return { ok: false, status: 0, error: 'not a post id' }
  const url = `https://api.x.com/2/tweets/${id}`
  try {
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: oauthHeader('DELETE', url) }, signal: AbortSignal.timeout(X_FETCH_TIMEOUT_MS) })
    const json = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, status: res.status, error: json?.detail || json?.title || res.statusText }
    return { ok: Boolean(json?.data?.deleted), status: res.status }
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err) }
  }
}

// A MOMENT AS A CARD (2026-10-04, Donovan: "Discord posts: links, colours,
// time"). Called with { sport, link }, a post's first line becomes the embed
// title -- linked to that player on DASH -- in the product's colour, the rest
// its description, the product's name and the time in the footer, the picture
// (when there is one) inside the same card. Called without them, a post is
// exactly what it was. No site link ever went out before: homers/tick's TAIL
// is empty on purpose for X; Discord has no such penalty.
const BRAND_OF = { mlb: 'MOONSHOT', nfl: 'TUDDY', nhl: 'LAMP', nba: 'BUCKETS' }
// each product's accent from its own theme (lib/sportAccent), as Discord's integer colour
const colorOf = (sport) => { const h = String(SPORT_ACCENT[sport] || SPORT_ACCENT.mlb || '').replace('#', ''); return /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : undefined }
const siteBase = () => String(process.env.NEXT_PUBLIC_SITE_URL || 'https://dashnetwork.vercel.app').replace(/\/+$/, '')
function momentEmbed(text, sport, link) {
  const brand = BRAND_OF[sport] || 'DASH'
  const color = colorOf(sport)
  const lines = String(text).split('\n')
  const idx = lines.findIndex((l) => l.trim())
  // A header line ('🤖 CALLED IT…') says nothing on its own: the title carries
  // it AND the event under it, so the card reads in one line.
  const header = idx >= 0 && /^🤖/.test(lines[idx].trim())
  const idx2 = header ? lines.findIndex((l, i) => i > idx && l.trim()) : -1
  const first = idx < 0 ? '' : header && idx2 > 0 ? `${lines[idx].trim()} · ${lines[idx2].trim()}` : lines[idx]
  const restFrom = header && idx2 > 0 ? idx2 + 1 : idx + 1
  const rest = lines.slice(restFrom).join('\n').replace(/^\n+/, '').trim()
  return {
    title: first.replace(/\*\*/g, '').slice(0, 256),
    ...(link ? { url: /^https?:/.test(link) ? link : `${siteBase()}${link.startsWith('/') ? '' : '/'}${link}` } : {}),
    ...(rest ? { description: rest.slice(0, 4000) } : {}),
    color,
    footer: { text: `${brand} · DASH Network` },
    timestamp: new Date().toISOString(),
  }
}

export async function postToDiscord(text, { imageUrl = null, png = null, extraPngs = [], sport = null, link = null, kind = null, sportKey = null, channel = null, embed = null } = {}, webhook = process.env.DISCORD_HOMER_WEBHOOK) {
  const hooks = webhookList(webhook)
  if (!hooks.length) return { ok: false, status: 0, error: 'DISCORD_HOMER_WEBHOOK is not set' }
  const payload = { content: String(text).slice(0, 1900) }
  // TWO WAYS TO PUT A PICTURE ON A DISCORD POST (2026-09-07).
  //
  // `imageUrl` embeds one Discord fetches for itself. That only works for the
  // three kinds with a route behind them -- /api/dash/homers/card knows homer,
  // recap and pregame and nothing else -- so the ten stat-shaped posts went out
  // as bare text while the PNG they had just rendered for X was discarded.
  //
  // `png` uploads the bytes instead, which needs no route and no stored payload.
  // Multipart: payload_json plus files[0], and the embed points at
  // attachment://card.png so the image renders in the post rather than hanging
  // off the bottom as a download.
  // A BUILT CARD (2026-10-10, lib/dash/discordCard.js buildCard): sent as the one embed, as built -- no momentEmbed from the text, no
  // content, no link. The picture rides under it exactly as on the moment path (imageUrl, else the uploaded card.png).
  if (embed && typeof embed === 'object') {
    const card = fitEmbed(embed)
    if (imageUrl) card.image = { url: imageUrl }
    else if (png) card.image = { url: 'attachment://card.png' }
    delete payload.content
    payload.embeds = [card]
  } else if (sport) {
    const card = momentEmbed(text, sport, link)
    if (imageUrl) card.image = { url: imageUrl }
    else if (png) card.image = { url: 'attachment://card.png' }
    delete payload.content
    payload.embeds = [card]
  } else if (imageUrl) payload.embeds = [{ image: { url: imageUrl }, color: 0xf4581f }]
  else if (png) payload.embeds = [{ image: { url: 'attachment://card.png' }, color: 0xf4581f }]
  // MORE PICTURES UNDER THE POST (2026-10-10, the Two-Man dual card): each extra is its own image-only embed under the first, uploaded as
  // files[1..]. Only with a main png (the extras ride the same multipart upload); a post with no extras is exactly what it was.
  const extras = png && !imageUrl && payload.embeds ? (extraPngs || []).filter((b) => b && b.length).slice(0, 3) : []
  for (let i = 0; i < extras.length; i += 1) payload.embeds.push({ image: { url: `attachment://extra-${i + 1}.png` }, ...(payload.embeds[0]?.color != null ? { color: payload.embeds[0].color } : {}) })
  // TIMEOUT + ONE 429 RETRY (2026-10-04, ops audit). A hung webhook used to
  // hold the tick until Vercel's maxDuration killed it (and any post claimed
  // but not yet sent with it); a 429 was a plain failure. Now each request
  // gives up after 8 s, and a 429 waits Discord's own retry_after (capped at
  // 5 s) and tries once more. A request that timed out is NOT retried --
  // Discord may have posted it, and a second try could post it twice.
  const send = (hook) => {
    const signal = AbortSignal.timeout(8000)
    if (png && !imageUrl) {
      const form = new FormData()
      form.append('payload_json', JSON.stringify(payload))
      form.append('files[0]', new Blob([png], { type: 'image/png' }), 'card.png')
      extras.forEach((b, i) => form.append(`files[${i + 1}]`, new Blob([b], { type: 'image/png' }), `extra-${i + 1}.png`))
      return fetch(hook, { method: 'POST', body: form, signal })
    }
    return fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
  }
  // one best-effort log row per hook attempt: key name + index + status, never the URL
  const logSend = (hook, i, r) => logDiscordSend({
    kind, sport: sportKey || sport, channelKey: channel || channelKeyOf(hook), hookIndex: i,
    ok: r.ok, status: r.status ?? (r.ok ? 204 : 0), error: r.ok ? null : r.error,
  }).catch(() => false)
  const results = await Promise.all(hooks.map(async (hook, i) => {
    const id = hookId(hook)
    const r = await (async () => {
    try {
      let res = await send(hook)
      if (res.status === 429) {
        const body = await res.json().catch(() => null)
        const wait = Math.min(5000, Math.max(250, Math.round(Number(body?.retry_after ?? res.headers.get('retry-after') ?? 1) * 1000)))
        await new Promise((r) => setTimeout(r, wait))
        res = await send(hook)
      }
      if (!res.ok && res.status !== 204) return { ok: false, id, status: res.status, error: res.statusText }
      return { ok: true, id, status: res.status }
    } catch (err) {
      return { ok: false, id, status: 0, error: String(err?.message || err) }
    }
    })()
    await logSend(hook, i, r)
    return r
  }))
  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    failed.forEach((f) => {
      console.error(`[discord] webhook ${f.id} failed: ${f.status || 0} ${f.error || ''}`)
      _discordFailures.push({ hookId: f.id, status: f.status || 0, error: f.error || '' })
    })
  }
  const ok = results.some((r) => r.ok)
  if (ok) return { ok: true, failed }
  return { ok: false, status: failed[0]?.status || 0, error: failed.map((f) => f.error).join('; '), failed }
}

let _discordFailures = []
/**
 * Drains and returns every per-webhook failure recorded since the last
 * call -- one snapshot per tick invocation. Module state, so this only
 * reflects postToDiscord() calls made earlier in the SAME request; a fresh
 * serverless instance starts empty, which is fine since it is read at the
 * end of the same tick that populated it.
 */
export function discordFailuresSnapshot() {
  const out = _discordFailures
  _discordFailures = []
  return out
}
