// THE SUNDAY SHEET (Sunday's series, claude/CALLED-IT-PLAYBOOK-2026-10-20.txt: "the NFL touchdown list (657 views on Week 6)" -- the numbered
// TUDDY watchlist). Donovan, 2026-10-20: "yep" to the list card. Built FROM what TUDDY already has: the rankings share card (lib/cards/shareData.js
// nflRanked + lib/cards/shareCards.js rankedDesign, the 📸 picture of the Touchdowns tab), kept to the games that kick off that Sunday and have
// not started (nflRanked's `date`), retitled THE SUNDAY SHEET. The board's own order: CALLED first (the calls are the top of the board), then
// ON THE BOARD. The words: lib/callStatus STATUS_WORD; the score is TUDDY's own 0-100 touchdown score (a rank, never a chance).
//
//   WHEN   Sunday (Phoenix) from SHEET_FROM_PHX, once (homer_feed_posts kind sunday_sheet), naming only men whose game has not started.
//          A Sunday with no game still to come posts nothing.
//   WHERE  X and the free feed channel, the card as the picture (a render that fails leaves the post as text). Undo: SUNDAY_SHEET_OFF=on.
import { STATUS_WORD } from '../callStatus'
import { HARD_LIMIT, postLimit, TAIL_MARGIN } from '../dash/postLimit'
import { xLen } from './slate'
import { admit, logPosted } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { mayRetryPost } from '../dash/xFail'

export const SHEET_KIND = 'sunday_sheet'
export const SHEET_FROM_PHX = 7 * 60 + 30       // 7:30 AM Phoenix (10:30 AM ET): the inactives are out at 11:30 ET; the sheet is the board
export const sheetOff = () => /^(on|1|true)$/i.test(String(process.env.SUNDAY_SHEET_OFF || '').trim())
export const sheetDue = (clock) => Boolean(clock && clock.dow === 0 && clock.min >= SHEET_FROM_PHX)

/** The model's names in order: [{ rank, name, team, where, status, score }] (the lead, then the rows). Pure. */
export const sheetRows = (m) => [m?.lead, ...(m?.rows || [])].filter(Boolean).map((r) => ({ id: r.id, rank: r.rank, name: r.name, team: r.team, where: r.where || '', status: r.status, score: r.score }))

/**
 * THE POST, from the card's own model (the same names, the same order): head, hook, the CALLED block, the ON THE BOARD block, "+N more",
 * the ask. The long post first; at 280 the blocks lose their matchups, then rows from the bottom. '' with fewer than three names. Pure.
 */
export function sheetText({ model, week, limit = HARD_LIMIT }) {
  const rows = sheetRows(model)
  if (rows.length < 3) return ''
  const head = `\u{1F3C8} THE SUNDAY SHEET · WEEK ${week}`
  const hook = "Our touchdown board for today's games, in order \u{1F447}"
  const ask = "Who's scoring first, network?"
  const line = (r, full) => `${r.rank}. ${r.name}${full && r.where ? ` (${r.team} ${r.where})` : r.team ? ` (${r.team})` : ''}${Number.isFinite(Number(r.score)) ? ` · ${Math.round(Number(r.score))}` : ''}`
  const build = (list, full, withHook, more) => {
    const called = list.filter((r) => r.status === 'called')
    const board = list.filter((r) => r.status !== 'called')
    const blocks = [[head], ...(withHook ? [[hook]] : [])]
    if (called.length) blocks.push([STATUS_WORD.called, ...called.map((r) => line(r, full))])
    if (board.length) blocks.push([STATUS_WORD.board, ...board.map((r) => line(r, full))])
    if (more > 0) blocks.push([`+${more} more ranked`])      // "ranked", not "on the board": the rest include men NOT ON THE BOARD
    blocks.push([ask])
    return blocks.map((b) => b.join('\n')).join('\n\n')
  }
  const extra = Number(model?.more) || 0
  for (let n = rows.length; n >= 3; n -= 1) for (const full of [true, false]) for (const withHook of [true, false]) {
    const t = build(rows.slice(0, n), full, withHook, extra + rows.length - n)
    if (xLen(t) <= limit) return t
  }
  return ''
}

/** The card's model retitled for the Sunday Sheet. Pure. */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const sheetModel = (m, week, day = '') => ({ ...m, kicker: 'THE SUNDAY SHEET · ANYTIME TD', right: `WEEK ${week}`, note: "TUDDY's touchdown score · today's games, before kickoff",
  dayWord: /^\d{4}-\d{2}-\d{2}$/.test(day) ? `Sunday, ${MON[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}` : m.dayWord })

const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res(null), ms) })]).finally(() => clearTimeout(t)) }
const _wait = new Map()
const RETRY_MS = 10 * 60e3
export const _resetSheetForTests = () => _wait.clear()

/**
 * One try at a Sunday's sheet. `load` = async () => loadShareModel('ranked', 'nfl', { date: day }) (the card's own loader), `draw` = the card
 * renderer (lib/cards/shareCards.js renderShare), both lazy by default. @returns {Promise<string>} what happened, for the tick's log
 */
export async function postSheetOnce(db, { day, clock, hooks = '', now = Date.now(), load = null, draw = null } = {}) {
  if (sheetOff()) return 'off'
  if (!sheetDue(clock)) return 'not-due'
  if (knownTaken(day, SHEET_KIND)) return 'already-posted'
  if (now - (_wait.get(day) || 0) < RETRY_MS) return 'waiting'
  const done = await db.from('homer_feed_posts').select('day').match({ day, kind: SHEET_KIND }).maybeSingle()
  if (done?.data) { markTaken(day, SHEET_KIND); return 'already-posted' }
  let r
  try { r = load ? await load() : await (await import('../cards/shareData')).loadShareModel('ranked', 'nfl', { date: day }, now) } catch (e) { r = { ok: false, why: e?.message || String(e) } }
  if (!r?.ok) { _wait.set(day, now); return `none: ${r?.why || 'no board'}` }
  const week = String(r.model?.dayWord || '').replace(/^Week\s*/i, '') || '?'
  const text = sheetText({ model: r.model, week, limit: postLimit() + TAIL_MARGIN })
  if (!text) { _wait.set(day, now); recordPost({ day, kind: SHEET_KIND, sport: 'nfl', state: 'DROPPED', reason: 'fewer than three names' }); return 'none: fewer than three names' }
  // the picture BEFORE the claim; a render that fails or is slow leaves the post as text
  let png = null
  try { png = await withTimeout((async () => (draw || (await import('../cards/shareCards')).renderShare)('ranked', sheetModel(r.model, week, day)))(), 25000) } catch (e) { console.error(`[sheet] picture failed: ${e?.message || e}`) }
  const claim = await db.from('homer_feed_posts').upsert([{ day, kind: SHEET_KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (claim.error) { _wait.set(day, now); console.error(`[sheet] claim failed: ${claim.error.message}`); return 'claim-failed' }
  markTaken(day, SHEET_KIND)
  if (!claim.data?.length) return 'already-posted'
  const rows = sheetRows(r.model)
  const ids = rows.map((x) => String(x.id ?? '')).filter(Boolean)
  const patch = { payload: { week, names: rows.map((x) => ({ rank: x.rank, name: x.name, status: x.status })), picture: Boolean(png) } }
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: SHEET_KIND })
    if (del?.error) { console.error(`[sheet] could not release the claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(day, SHEET_KIND)
    _wait.set(day, now)
    return true
  }
  if (hasX()) {
    const g = await admit(db, { day, kind: SHEET_KIND, ids, repeat: false, sport: 'nfl' })
    if (g.state === 'go') {
      const mediaIds = png ? [await uploadImageToX(png)].filter(Boolean) : []
      const x = await postToX(text, { kind: SHEET_KIND, ...(mediaIds.length ? { mediaIds } : {}) })
      if (x.ok && x.id) { patch.x_post_id = x.id; logPosted({ day, kind: SHEET_KIND, ids, tweetId: x.id, text }) }
      else {
        console.error(`[sheet] refused: ${x.status} ${x.error}`)
        if (mayRetryPost(x, `${SHEET_KIND}|${day}`) && await release(`x ${x.status}`)) return `retry: x ${x.status}`
      }
    } else if (await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = await postToDiscord(text, { kind: SHEET_KIND, sportKey: 'nfl', ...(png ? { png } : {}) }, hooks)
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: SHEET_KIND })
  if (saved?.error) console.error(`[sheet] posted but the row did not record it: ${saved.error.message}`)
  return patch.x_post_id ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}
