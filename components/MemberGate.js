'use client'
// THE MEMBER GATE, CLIENT SIDE (2026-10-16, Donovan: no new page). One context, mounted once per client shell (app/app/page.js, app/m/page.js),
// that says whether the viewer is a member: 'member' | 'free' | 'unknown' (lib/members/gate.js memberStateOf, from the account state the sync layer
// already fetches: /api/dash/state returns who.member). Outside the shell there is no provider and the state is 'unknown', which draws every label
// exactly as before (fail OPEN: a member is never shown a lock; the real hiding is the front page's, on the server).
//
// useCallGate(...) is what a board calls: it returns null for everyone but a free viewer (so the table draws as it always did), else gateOf(row) ->
// { key, started, graded, free } for CallStatusBadge's `gate` prop. It decides nothing about CALLED itself: the status still comes from the sport's one
// rule (lib/callStatus, tdCallStatus, scoreNight); this only says which already-CALLED labels are drawn as the lock.
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useDashAccount } from '../lib/dash/sync'
import { memberStateOf, freeCalledKeys, startedAt, cardGate, storyLockKey } from '../lib/members/gate'
import { membersUrl } from '../lib/members'
import { etToday } from '../lib/freshness'

const Ctx = createContext('unknown')

// THE FREE FOUR, SHARED WITH THE CARDS. Every board that calls useCallGate publishes the free set it computed here (a tiny module store; a board
// unmounting takes its set back). A player card reads the union (useCardLock), so a man who is one of the table's free four is unlocked on his card
// too. Only a free viewer's boards compute a set at all. A card opened with no board mounted (a deep link) sees an empty set: lock-all.
const published = new Map()
const listeners = new Set()
let freeUnion = new Set()
const publish = (id, set) => {
  if (set) published.set(id, set); else published.delete(id)
  freeUnion = new Set([...published.values()].flatMap((s) => [...s]))
  listeners.forEach((l) => l())
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
const useFreeKeys = () => useSyncExternalStore(subscribe, () => freeUnion, () => freeUnion)
let nextId = 0

export function MemberGateProvider({ children }) {
  const account = useDashAccount()
  return <Ctx.Provider value={memberStateOf(account)}>{children}</Ctx.Provider>
}

export const useMemberState = () => useContext(Ctx)

/**
 * @param {object} p
 * @param {Array|(()=>Array)} p.rows  ONE sport's whole board, in the board's own order (not the filtered view, so a filter cannot reveal more).
 *        A function is only called for a free viewer (a board that must build the full row list passes one; `source` is then what it depends on)
 * @param {any}    [p.source]  what `rows` depends on, when it is a function
 * @param {(row)=>string}  p.statusOf  the caller's own status ('called' | 'board' | 'off' | null)
 * @param {(row)=>any}     p.timeOf    the row's own game time (ISO or ms); none: not started only if the slate is today
 * @param {(row)=>string}  p.keyOf     one stable key per pick (player + game)
 * @param {(row)=>number}  [p.rankOf]  the board's place, to order the free taste
 * @param {(row)=>boolean} [p.gradedOf] the row already carries a result
 * @param {string} [p.slateDate]  the slate's own date (YYYY-MM-DD); a past slate is never locked
 */
export function useCallGate({ rows, source, statusOf, timeOf, keyOf, rankOf = null, gradedOf = null, slateDate = null }) {
  const state = useMemberState()
  const gateOf = useMemo(() => {
    if (state !== 'free') return null
    const slateIsToday = !slateDate || slateDate === etToday()
    const now = Date.now()
    const startedOf = (r) => startedAt(timeOf(r), { now, slateIsToday })
    const free = freeCalledKeys(typeof rows === 'function' ? rows() : rows, { keyOf, startedOf, statusOf, rankOf })
    const fn = (r) => ({ key: keyOf(r), started: startedOf(r), graded: gradedOf ? Boolean(gradedOf(r)) : false, free })
    fn.free = free
    return fn
  // the callbacks are the caller's inline functions of `rows`; the rows, the viewer and the slate day are what change the answer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, source !== undefined ? source : rows, slateDate])
  const id = useMemo(() => ++nextId, [])
  const freeSet = gateOf ? gateOf.free : null
  useEffect(() => { publish(id, freeSet); return () => publish(id, null) }, [id, freeSet])
  return gateOf
}

/**
 * THE PLAYER CARD LOCK (Donovan 2026-10-16): { locked, gate } for one card. `status` is the sport's own word for him tonight, `key` the SAME key the
 * sport's board uses for his row (MLB `${playerId}|${game_pk}`, NFL `String(player_id)`, NHL `${game id}|${playerId}`), `time` his game's own start.
 * locked is true only for a confirmed non-member, on a CALLED, not-started, not-graded pick who is not in the boards' free four. Else false (fail open).
 */
export function useCardLock({ status, key, time, graded = false, slateDate = null }) {
  const memberState = useMemberState()
  const free = useFreeKeys()
  return cardGate({ status, time, graded, key, free, memberState, slateIsToday: !slateDate || slateDate === etToday() })
}

/**
 * THE SAME RULE FOR A LIST (2026-10-16): a function ({ status, key, time, graded, slateDate }) -> { locked, gate }, for a list that prints a run of names and
 * cannot call a hook per name. It reads the viewer and the boards' free four exactly as useCardLock does.
 */
export function useLockOf() {
  const memberState = useMemberState()
  const free = useFreeKeys()
  return (x) => cardGate({ status: x.status, time: x.time, graded: Boolean(x.graded), key: x.key, free, memberState, slateIsToday: !x.slateDate || x.slateDate === etToday() })
}

/**
 * STORYLINES (2026-10-16): lockIn(story) -> { key, time, graded, slateDate } for CallStatusBadge's lockIn, from the story's game. The free taste is counted over the
 * stories' CALLED men (one per man, best board place first) and published like any board's, so the page agrees with the tables.
 */
export function useStoryLock({ sport, stories, games, date = null }) {
  const gameOf = useMemo(() => new Map((games || []).map((g) => [String(g.game_id), g])), [games])
  const lockIn = (s) => {
    const g = gameOf.get(String(s.game_id))
    return { key: storyLockKey(sport, s.player_id, s.game_id), time: g?.start ?? null, graded: g?.state === 'final', slateDate: date }
  }
  useCallGate({
    rows: () => (stories || []).filter((s) => s.board?.status === 'called'), source: stories, slateDate: date,
    statusOf: (s) => s.board?.status, keyOf: (s) => storyLockKey(sport, s.player_id, s.game_id), timeOf: (s) => gameOf.get(String(s.game_id))?.start ?? null,
    gradedOf: (s) => gameOf.get(String(s.game_id))?.state === 'final', rankOf: (s) => s.board?.rank,
  })
  return lockIn
}

/** The one line and the join button that stand in for tonight's call and why on a locked card (display only; the join link is membersUrl()). */
export function CardLockLine({ C, NUM_FONT, style }) {
  return (
    <div data-pm="lock" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 10px', fontFamily: NUM_FONT, fontSize: 12, lineHeight: 1.45, color: C.text2, ...style }}>
      <span>Members see tonight&rsquo;s call and why</span>
      <a href={membersUrl()} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', minWidth: 44, minHeight: 44, padding: '0 8px', fontWeight: 900, letterSpacing: '.04em', color: C.text, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        <span style={{ border: `1px solid ${C.border2}`, borderRadius: 4, padding: '1px 6px' }}>{'\u{1F512}'} Join</span>
      </a>
    </div>
  )
}
