// BOARD RANK SNAPSHOTS: the shared memory behind the arrows (2026-10-10). Server only.
//
// One row = one ordering of one board on one game date (supabase/migrations/202610101900_board_rank_snapshots.sql).
// It is written once, the first time the board shows that ordering, and never rewritten; the newest KEEP orderings per
// board per day are kept and older ones deleted in the same write. It holds ranks and a time, nothing else: no score,
// no model number, no call, no status. Every function degrades to a quiet answer when the table is missing or the
// database is unreachable: { status: 'unreachable' }, never a throw, so the site shows no arrows (or its device memory)
// and no error until the table exists.
import { rankMapOf, signature, diffMoves, MAX_AGE_H } from '../rankMove'

const T = 'board_rank_snapshots'
export const KEEP = 6
const DAY = /^\d{4}-\d{2}-\d{2}$/
const recent = new Map()          // per server instance: 'sport|board|date|sig' -> last answer time, so a repeat read costs no query
const RECENT_MS = 30000

const toObj = (m) => Object.fromEntries(rankMapOf(m))
const miss = (error) => Boolean(error)

/**
 * Record `ranks` for (sport, board, date) when the table has not seen this ordering, and return the ordering BEFORE it.
 * @returns {Promise<{ status: 'ok' | 'unreachable' | 'skipped', recorded?: boolean, sig?: string, curAt?: number, prev?: { ranks: Object, at: number } | null }>}
 */
export async function recordAndPrev(db, { sport, board, date, ranks, record = true, now = Date.now(), maxAgeH = MAX_AGE_H }) {
  const m = rankMapOf(ranks)
  if (!db || !sport || !board || !DAY.test(String(date || '')) || m.size < 3) return { status: db ? 'skipped' : 'unreachable' }
  const sig = signature(m)
  const key = `${sport}|${board}|${date}|${sig}`
  const hit = recent.get(key)
  if (hit && now - hit.t < RECENT_MS) return { ...hit.answer, recorded: false }   // a repeat read within seconds: no query, no write
  try {
    const { data: rows, error } = await db.from(T).select('source_stamp, ranks, taken_at').eq('sport', sport).eq('board', board).eq('game_date', date).order('taken_at', { ascending: false }).limit(KEEP + 2)
    if (miss(error)) return { status: 'unreachable' }
    const list = rows || []
    let cur = list.find((r) => r.source_stamp === sig) || null
    let recorded = false
    if (!cur && record) {
      const row = { sport, board, game_date: date, source_stamp: sig, ranks: toObj(m), taken_at: new Date(now).toISOString() }
      const { error: e2 } = await db.from(T).upsert(row, { onConflict: 'sport,board,game_date,source_stamp', ignoreDuplicates: true })
      if (miss(e2)) return { status: 'unreachable' }
      recorded = true
      cur = row
      list.unshift(row)
      // keep the newest KEEP orderings of this board and day; the rest go in the same write
      const old = list.slice(KEEP).map((r) => r.source_stamp)
      if (old.length) await db.from(T).delete().eq('sport', sport).eq('board', board).eq('game_date', date).in('source_stamp', old)
    }
    if (!cur) return { status: 'ok', recorded: false, sig, curAt: null, prev: null }   // an ordering this table has never been shown (record off)
    const curAt = Date.parse(cur.taken_at)
    // the newest ordering that is not this one (A, then B, then A again: B is the one A replaced)
    const before = list.find((r) => r.source_stamp !== sig)
    const ref = list[0]?.source_stamp === sig ? curAt : now
    let prev = null
    if (before && ref - Date.parse(before.taken_at) <= maxAgeH * 3600 * 1000) prev = { ranks: before.ranks, at: Date.parse(before.taken_at) }
    const answer = { status: 'ok', recorded, sig, curAt, prev }
    recent.set(key, { t: now, answer })
    return answer
  } catch {
    return { status: 'unreachable' }
  }
}

/** Read-only: find the reader's own ordering among the stored ones and answer with the one before it. */
export async function readBySig(db, { sport, board, date, sig, now = Date.now(), maxAgeH = MAX_AGE_H }) {
  try {
    const { data: rows, error } = await db.from(T).select('source_stamp, ranks, taken_at').eq('sport', sport).eq('board', board).eq('game_date', date).order('taken_at', { ascending: false }).limit(KEEP + 2)
    if (miss(error) || !rows) return { status: 'unreachable' }
    const cur = rows.find((r) => r.source_stamp === sig)
    if (!cur) return { status: 'ok', recorded: false, sig, curAt: null, prev: null }
    const before = rows.find((r) => r.source_stamp !== sig)
    const curAt = Date.parse(cur.taken_at)
    const ref = rows[0].source_stamp === sig ? curAt : now
    const prev = before && ref - Date.parse(before.taken_at) <= maxAgeH * 3600 * 1000 ? { ranks: before.ranks, at: Date.parse(before.taken_at) } : null
    return { status: 'ok', recorded: false, sig, curAt, prev }
  } catch {
    return { status: 'unreachable' }
  }
}

/** What a client does with the answer: the moves, or null (draw nothing). `mine` is the client's own ordering. */
export function movesFromAnswer(answer, mine) {
  if (!answer || answer.status !== 'ok' || !answer.prev) return null
  if (answer.sig !== signature(mine)) return null     // the client is looking at a different ordering than the table holds
  const moves = diffMoves(mine, answer.prev.ranks)
  return moves ? { moves, prevAt: answer.prev.at } : null
}

export const _forTests = { recent }
