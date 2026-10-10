// THE LIVE CALLED ALERT'S PICTURE (server only; no JSX at the top). A CALLED goal / touchdown / homer used to carry the event's own picture
// card (goalCard / tdCard / homerCard). It now carries the scorer's FRONT CARD (lib/cards/playerCard.js: the same card the site's flip sheet
// shows) when it can be drawn, and the event card otherwise. This module only answers "the front card's PNG bytes, or null":
//   - null (so the caller keeps the event card) when the render fails, takes longer than the time limit, the sport/player has no card,
//     the card's status is not CALLED (the card must say what the alert says), or ALERT_FRONT_CARD_OFF=on
//   - never throws, never writes anything, never touches a claim: the posting code that calls it is unchanged around it
//   - one render per scorer per few minutes (the Discord post and the X post of the same alert share it)
// loaded lazily: this module is imported by the posting code and its checks, which run without a JSX loader
const playerCardImage = async (o) => (await import('./cardImage')).playerCardImage(o)

export const alertFrontCardOff = () => /^(on|1|true)$/i.test(String(process.env.ALERT_FRONT_CARD_OFF || '').trim())
const TTL_OK = 4 * 60e3
const TTL_FAIL = 60e3
const _memo = new Map()

/** Front-card PNG bytes for a CALLED alert, or null. `date` = the game's own date when the tick has it. */
export async function alertFrontCard({ sport, id, date = null, db = null, timeoutMs = 12000, now = Date.now(), render = playerCardImage }) {
  if (alertFrontCardOff() || id == null || id === '') return null
  const key = `${sport}|${id}|${date || ''}`
  const hit = _memo.get(key)
  if (hit && now - hit.at < hit.ttl) return hit.png
  let timer
  const work = (async () => {
    try {
      let r = date ? await render({ sport, id: String(id), side: 'front', date, db, now }) : null
      if (!r?.ok) r = await render({ sport, id: String(id), side: 'front', db, now })
      if (!r?.ok || !r.png?.length) return null
      if (r.model?.status !== 'called') return null
      return r.png
    } catch (e) { console.error(`[alert card] ${sport}/${id}: ${e?.message || e}`); return null }
  })()
  const png = await Promise.race([work, new Promise((res) => { timer = setTimeout(() => res(null), timeoutMs) })])
  clearTimeout(timer)
  if (_memo.size > 40) _memo.clear()
  _memo.set(key, { at: now, png, ttl: png ? TTL_OK : TTL_FAIL })
  return png
}

/** The picture a CALLED alert posts: the front card when it draws, else whatever `fallback` makes (the event's own card). Never throws. */
export async function alertPicture({ sport, id, date = null, db = null, called = true, fallback, render }) {
  if (called) {
    const front = await alertFrontCard({ sport, id, date, db, ...(render ? { render } : {}) })
    if (front) return front
  }
  try { return fallback ? await fallback() : null } catch { return null }
}

/**
 * The FRONT card of one straight for the free Card post (X and the free channel): the straight's own card, any status (a football straight can be
 * ON THE BOARD). Null on any failure or a timeout, and the post goes out as text. Only ever called for straight #1 (lib/card/post.js).
 */
export async function straightFrontCard({ sport, id, date = null, db = null, timeoutMs = 12000, now = Date.now(), render = playerCardImage }) {
  if (alertFrontCardOff() || id == null || id === '') return null
  let timer
  const work = (async () => {
    try { const r = await render({ sport, id: String(id), side: 'front', date, db, now }); return r?.ok && r.png?.length ? r.png : null } catch (e) { console.error(`[card post] ${sport}/${id}: ${e?.message || e}`); return null }
  })()
  const png = await Promise.race([work, new Promise((res) => { timer = setTimeout(() => res(null), timeoutMs) })])
  clearTimeout(timer)
  return png
}

/** The members-only day lineup image (the whole Card), drawn in-process; null on any failure. It is handed to postMembers only. */
export async function membersDayImage({ sport, date, db = null, timeoutMs = 15000, now = Date.now() }) {
  if (alertFrontCardOff()) return null
  let timer
  const work = (async () => {
    try {
      const { dayCardImage } = await import('./cardImage')
      const r = await dayCardImage({ sport, date, scope: 'full', db, now })
      return r?.ok && r.png?.length ? r.png : null
    } catch (e) { console.error(`[card members] ${sport}/${date}: ${e?.message || e}`); return null }
  })()
  const png = await Promise.race([work, new Promise((res) => { timer = setTimeout(() => res(null), timeoutMs) })])
  clearTimeout(timer)
  return png
}
