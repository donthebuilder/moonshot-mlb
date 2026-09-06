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

import { createHmac, randomBytes } from 'node:crypto'

const enc = (s) => encodeURIComponent(String(s))
  .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

const clean = (v) => String(v == null ? '' : v).trim()

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
  if (xProblem() || !bytes) return null
  const url = 'https://api.x.com/2/media/upload'
  try {
    const form = new FormData()
    form.append('media', new Blob([bytes], { type: 'image/png' }), 'homer.png')
    form.append('media_category', 'tweet_image')
    form.append('media_type', 'image/png')
    const res = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url) }, body: form })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`[x] media upload refused: ${res.status} ${json?.detail || json?.title || res.statusText}`)
      return null
    }
    return json?.data?.id || json?.media_id_string || null
  } catch (err) {
    console.error('[x] media upload failed: ' + String(err?.message || err))
    return null
  }
}

/**
 * Post one tweet. Returns { ok, id } or { ok:false, status, error }.
 * `replyTo` threads it under an earlier post id; `mediaId` attaches an image
 * from uploadImageToX().
 */
export async function postToX(text, { replyTo = null, mediaId = null, quoteId = null } = {}) {
  const problem = xProblem()
  if (problem) return { ok: false, status: 0, error: problem }
  const url = 'https://api.x.com/2/tweets'
  const body = { text: String(text).slice(0, 280) }
  if (replyTo) body.reply = { in_reply_to_tweet_id: String(replyTo) }
  if (mediaId) body.media = { media_ids: [String(mediaId)] }
  // A called homer QUOTES the morning's pregame post. That thread is the
  // receipt: the name was public before first pitch, in X's own UI, and the
  // reader can tap through to check. Nothing about the text changes.
  if (quoteId) body.quote_tweet_id = String(quoteId)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: oauthHeader('POST', url),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, status: res.status, error: json?.detail || json?.title || res.statusText }
    }
    return { ok: true, id: json?.data?.id || null }
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
export async function postToDiscord(text, { imageUrl = null } = {}, webhook = process.env.DISCORD_HOMER_WEBHOOK) {
  const hooks = webhookList(webhook)
  if (!hooks.length) return { ok: false, status: 0, error: 'DISCORD_HOMER_WEBHOOK is not set' }
  const payload = { content: String(text).slice(0, 1900) }
  if (imageUrl) payload.embeds = [{ image: { url: imageUrl }, color: 0xf97316 }]
  const results = await Promise.all(hooks.map(async (hook) => {
    try {
      const res = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok && res.status !== 204) return { ok: false, status: res.status, error: res.statusText }
      return { ok: true }
    } catch (err) {
      return { ok: false, status: 0, error: String(err?.message || err) }
    }
  }))
  const ok = results.some((r) => r.ok)
  if (ok) return { ok: true }
  const failed = results.filter((r) => !r.ok)
  return { ok: false, status: failed[0]?.status || 0, error: failed.map((f) => f.error).join('; ') }
}
