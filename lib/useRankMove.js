'use client'
// useRankMove: the arrows beside a board's ranks (lib/rankMove.js says what they are and are not).
//
//   const mv = useRankMove({ sport: 'mlb', board: 'hr', date: slateDate, ranks: rankMap, rows: players, idOf: mlbId })
//   mv.of(id)      -> { kind: 'up' | 'down' | 'new', n } | null     (null = draw nothing)
//   mv.cell(id)    -> { move, prevAt, source } | null               (what a table row / card carries as `rankMove`)
//   mv.prevAt      -> ms time of the update the arrow compares against, or null
//   mv.any         -> true when at least one arrow is showing (the caption's cue)
//
// `ranks` is the board's DEFAULT ordering over the whole slate (id -> rank), the same one the # column
// prints before any sort or filter. This hook reads it and never writes back, so an arrow can never
// change an order. The device keeps the last two distinct orderings per board and game date in
// localStorage (a few KB), written once the ordering has held still for a moment and never rewritten.
// Where storage is blocked, a module-level Map keeps it for the session. Nothing leaves the device.
import { useEffect, useMemo, useRef, useState } from 'react'
import { advance, movesFor, botPrevOf, diffMoves, signature, rankMapOf, MAX_AGE_H } from './rankMove'
import { rankMoveSpec, sportKey } from './routes'

const KEY = (sport, board) => `dash_rankmove_v1:${sportKey(sport)}:${board}`
const mem = new Map()
const SETTLE_MS = 1500   // a half-loaded board is not an update: wait for the ordering to hold still

function read(key) {
  try { const raw = window.localStorage.getItem(key); if (raw) return JSON.parse(raw) } catch { /* private window / blocked */ }
  return mem.get(key) || null
}
function write(key, store) {
  mem.set(key, store)
  try { window.localStorage.setItem(key, JSON.stringify(store)) } catch { /* quota / blocked: the session copy stands */ }
}
// a board left from three days ago is not coming back: drop its store (once per session)
let pruned = false
function prune(now = Date.now()) {
  if (pruned) return
  pruned = true
  try {
    const dead = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i)
      if (!k || !k.startsWith('dash_rankmove_v1:')) continue
      try { const s = JSON.parse(window.localStorage.getItem(k)); if (!s?.cur || now - s.cur.at > 3 * 86400000) dead.push(k) } catch { dead.push(k) }
    }
    dead.forEach((k) => window.localStorage.removeItem(k))
  } catch { /* ignore */ }
}

const EMPTY = { of: () => null, cell: () => null, prevAt: null, any: false, source: null }
// what a table row / card carries: the move plus the words' inputs (components/RankMove.js reads exactly this)
const shape = (moves, prevAt, source) => ({
  of: (id) => moves.get(String(id)) || null,
  cell: (id) => { const mv = moves.get(String(id)); return mv ? { move: mv, prevAt, source } : null },
  prevAt, any: moves.size > 0, source,
})

export function useRankMove({ sport, board, date, ranks, at = null, rows = null, idOf = null, enabled = true }) {
  const [held, setHeld] = useState({ key: null, store: null })
  const key = KEY(sport, board)
  const store = held.key === key ? held.store : null   // never another board's memory, not even for a frame
  // the caller may hand a fresh Map every render; everything below keys on the ordering's fingerprint, not the object
  const m = rankMapOf(ranks)
  const sig = signature(m)
  const mRef = useRef(m)
  mRef.current = m
  const atRef = useRef(at)
  atRef.current = at

  // load what this device remembers for this board
  useEffect(() => {
    if (!enabled || !date) { setHeld({ key, store: null }); return }
    prune()
    setHeld({ key, store: read(key) })
  }, [key, date, enabled])

  // absorb the current ordering once it has held still
  useEffect(() => {
    if (!enabled || !date || m.size < 3) return undefined
    const t = setTimeout(() => {
      const cur = read(key)
      const next = advance(cur, { date, ranks: mRef.current, at: atRef.current })
      if (next && next !== cur) write(key, next)
      const keep = next || cur
      setHeld((old) => (old.key === key && old.store && keep && old.store.cur?.sig === keep.cur?.sig && old.store.prev?.sig === keep.prev?.sig && old.store.date === keep.date ? old : { key, store: keep }))
    }, SETTLE_MS)
    return () => clearTimeout(t)
  }, [key, date, sig, enabled])   // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (!enabled || !date || m.size < 3) return EMPTY
    // 1. the bot's own previous ranks, when it publishes them (nothing today: see RANK-MOVE-SPEC.md)
    const spec = rankMoveSpec(sport)
    const bot = spec && rows && idOf ? botPrevOf(rows, spec, { board, date, idOf, curAt: at || Date.now() }) : null
    if (bot) {
      const moves = diffMoves(m, bot.ranks)
      if (moves) return shape(moves, bot.prevAt, 'bot')
    }
    // 2. this device's memory
    const r = movesFor(store, { date, ranks: m, atNow: at, maxAgeH: MAX_AGE_H })
    if (!r) return EMPTY
    return shape(r.moves, r.prevAt, 'device')
  }, [enabled, date, sig, store, sport, board, rows, idOf, at])   // eslint-disable-line react-hooks/exhaustive-deps
}

export default useRankMove
