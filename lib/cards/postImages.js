// THE PICTURES ON THE CARD POSTS (server only; no JSX here, the drawing loads lazily through lib/cards/cardImage.js). Two card types ride
// the posts that already go out; each is attached with the SAME safe pattern as the straight front card (lib/cards/alertCard.js):
//   - the picture is only ever "bytes or null": a render that fails or throws, a 12 s time limit, a card with no row / no price / no result
//     on file, or the kill switch all give null, and the post goes out as the text it always was. Nothing here throws or writes anything.
//   - the posting code (claim, retry, xFail, settleAlert) is not touched: a caller only adds the bytes to what it already sends.
// KILL SWITCHES (Vercel env): SLAB_CARD_OFF=on stops every graded slab; DUAL_CARD_OFF=on stops every Two-Man dual card.
//
// THE SLAB (graded result): the real outcome words, never a grade. Its params are the SAME shape for a hit and a miss (lib/cards/slabData.js).
// THE DUAL CARD (the Two-Man): the bot's Two-Man is MEMBERS content until the Card is public record, so it is drawn here only for the members
// post (membersDualImage, publicOnly:false, bytes handed to postMembers only); the free posts may only ever ask for DONOVAN'S lane
// (donovanDualImage, publicOnly:true: the bot lane answers 404 before anything is drawn).
const on = (k) => /^(on|1|true)$/i.test(String(process.env[k] || '').trim())
export const slabCardOff = () => on('SLAB_CARD_OFF')
export const dualCardOff = () => on('DUAL_CARD_OFF')

export const IMAGE_TIMEOUT_MS = 12000
const TTL_OK = 4 * 60e3
const TTL_FAIL = 60e3
const _memo = new Map()

const slabRender = async (o) => (await import('./cardImage')).slabCardImage(o)
const dualRender = async (o) => (await import('./cardImage')).dualCardImage(o)

/** Run `work()` (resolves { ok, png }) against a time limit; bytes or null. Never throws. `key` shares one render between the Discord and the X post. */
async function bytesOf(key, work, { timeoutMs = IMAGE_TIMEOUT_MS, now = Date.now(), label = 'card' } = {}) {
  const hit = key ? _memo.get(key) : null
  if (hit && now - hit.at < hit.ttl) return hit.png
  let timer
  const run = (async () => {
    try { const r = await work(); return r?.ok && r.png?.length ? r.png : null } catch (e) { console.error(`[card image] ${label}: ${e?.message || e}`); return null }
  })()
  const png = await Promise.race([run, new Promise((res) => { timer = setTimeout(() => res(null), timeoutMs) })])
  clearTimeout(timer)
  if (key) {
    if (_memo.size > 40) _memo.clear()
    _memo.set(key, { at: now, png, ttl: png ? TTL_OK : TTL_FAIL })
  }
  return png
}
export const _resetPostImages = () => _memo.clear()

/**
 * The slab of ONE graded Card row: { sport, date, lane, product: straight|two_man|long_shot|double, slot }. The route /api/card/slab takes
 * exactly these params, so a hit and a miss ask the same way. Null when the row is not graded (the data layer answers 404), on any failure, or off.
 */
export async function slabForRow({ sport, date, lane = 'bot', product = 'straight', slot = 1, db = null, timeoutMs, now = Date.now(), render = slabRender }) {
  if (slabCardOff() || !db) return null
  return bytesOf(`slab|${sport}|${date}|${lane}|${product}|${slot}`, () => render({ kind: 'card', sport, date, lane, product, slot, db, now }), { timeoutMs, now, label: `slab ${sport}/${date}/${product}` })
}

/**
 * The slab of a night's receipt. `graded` = the receipt's graded calls [{ sport, id, name, market, outcome: cashed|missed|void }]; `only` = a Set of
 * `${sport}:${id}` the post TEXT names (null = every graded call, which is what the Discord embed names). The record on the slab is the NIGHT's
 * (it counts every graded call, like the post's own record line); the faces are only the named calls.
 */
export async function receiptSlab({ day, graded = [], only = null, db = null, timeoutMs, now = Date.now(), render = slabRender }) {
  if (slabCardOff() || !db || !graded.length) return null
  const results = graded.map((g) => ({ sport: g.sport, player_id: String(g.id), name: g.name, market: g.market, outcome: g.outcome }))
  const keys = only ? [...only].sort().join(',') : '*'
  return bytesOf(`receipt|${day}|${keys}|${results.map((r) => `${r.player_id}${r.outcome}`).join('')}`, () => render({ kind: 'receipt', day, results, only: only ? [...only] : null, db, now }), { timeoutMs, now, label: `receipt slab ${day}` })
}

/** The two pictures of a receipt: { discord, x }. Discord's embed names every graded call, X's text only the rows it shows (one render when they are the same). */
export async function receiptImages({ day, graded, shown, db, slab = receiptSlab }) {
  try {
    if (!graded?.length) return { discord: null, x: null }
    const discord = await slab({ day, graded, only: null, db })
    const same = !shown || shown.length >= graded.length
    const x = same ? discord : await slab({ day, graded, only: new Set(shown), db })
    return { discord: discord || null, x: x || null }
  } catch (e) { console.error(`[receipt image] ${e?.message || e}`); return { discord: null, x: null } }
}

/** The members-only dual card of the BOT's Two-Man (drawn in-process, handed to postMembers only). Null on any failure. */
export async function membersDualImage({ sport, date, db = null, timeoutMs = 15000, now = Date.now(), render = dualRender }) {
  if (dualCardOff() || !db) return null
  return bytesOf(null, () => render({ sport, date, lane: 'bot', db, now, publicOnly: false }), { timeoutMs, now, label: `dual members ${sport}/${date}` })
}

/** DONOVAN'S dual card for the free post (his lock has passed). publicOnly:true: even a wrong lane could never draw the bot's Two-Man early. */
export async function donovanDualImage({ sport, date, db = null, timeoutMs, now = Date.now(), render = dualRender }) {
  if (dualCardOff() || !db) return null
  return bytesOf(`dual|${sport}|${date}|donovan`, () => render({ sport, date, lane: 'donovan', db, now, publicOnly: true }), { timeoutMs, now, label: `dual donovan ${sport}/${date}` })
}
