'use client'
// THE MEMBER GATE, CLIENT SIDE (2026-10-16, Donovan: no new page). One context, mounted once per client shell (app/app/page.js, app/m/page.js),
// that says whether the viewer is a member: 'member' | 'free' | 'unknown' (lib/members/gate.js memberStateOf, from the account state the sync layer
// already fetches: /api/dash/state returns who.member). Outside the shell there is no provider and the state is 'unknown', which draws every label
// exactly as before (fail OPEN: a member is never shown a lock; the real hiding is the front page's, on the server).
//
// useCallGate(...) is what a board calls: it returns null for everyone but a free viewer (so the table draws as it always did), else gateOf(row) ->
// { key, started, graded, free } for CallStatusBadge's `gate` prop. It decides nothing about CALLED itself: the status still comes from the sport's one
// rule (lib/callStatus, tdCallStatus, scoreNight); this only says which already-CALLED labels are drawn as the lock.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useDashAccount } from '../lib/dash/sync'
import { memberStateOf, freeCalledKeys, hiddenCalledCount, startedAt, cardGate, storyLockKey, maskCalledRows, gameCountVisible } from '../lib/members/gate'
import { membersUrl } from '../lib/members'
import { etToday } from '../lib/freshness'
import { isCalledRole } from '../lib/callStatus'
import { playerId as mlbPlayerId } from '../lib/player'

const Ctx = createContext('unknown')

// THE FREE FOUR, SHARED WITH THE CARDS. Every board that calls useCallGate publishes the free set it computed here (a tiny module store; a board
// unmounting takes its set back). A player card reads the union (useCardLock), so a man who is one of the table's free four is unlocked on his card
// too. Only a free viewer's boards compute a set at all. A card opened with no board mounted (a deep link) sees an empty set: lock-all -- unless the card runs its sport's board gate itself (LAMP's card does, 2026-10-23).
const published = new Map()
const listeners = new Set()
let freeUnion = new Set()
const publish = (id, set) => {
  if (set) published.set(id, set); else published.delete(id)
  const next = new Set([...published.values()].flatMap((s) => [...s]))
  // same members -> keep the SAME snapshot and tell nobody: a board that rebuilds an equal (even empty) set every render must not re-render
  // its readers (useSyncExternalStore), or the republish loops (React error #185)
  if (next.size === freeUnion.size && [...next].every((k) => freeUnion.has(k))) return
  freeUnion = next
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
    // how many CALLED, not-started picks this board draws as ON THE BOARD for this viewer: a count, never a name (HiddenCalledLine)
    fn.hidden = hiddenCalledCount(typeof rows === 'function' ? rows() : rows, { keyOf, startedOf, statusOf, free })
    return fn
  // the callbacks are the caller's inline functions of `rows`; the rows, the viewer and the slate day are what change the answer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, typeof rows === 'function' ? source : rows, slateDate])
  const id = useMemo(() => ++nextId, [])
  const freeSet = gateOf ? gateOf.free : null
  // publish by CONTENT, not identity: a caller whose rows are a fresh array each render rebuilds an equal Set every render, and re-publishing on each
  // (take back, then add) would notify every reader each time, so a reader that is also a board loops (React error #185)
  const freeSig = freeSet ? [...freeSet].sort().join('\u0001') : null
  const freeRef = useRef(freeSet)
  freeRef.current = freeSet
  useEffect(() => { publish(id, freeRef.current) }, [id, freeSig])
  useEffect(() => () => publish(id, null), [id])
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
  return useCallback((x) => cardGate({ status: x.status, time: x.time, graded: Boolean(x.graded), key: x.key, free, memberState, slateIsToday: !x.slateDate || x.slateDate === etToday() }), [free, memberState])
}

/**
 * THE GAME SURFACES (2026-10-17). useCallMask({ statusOf, keyOf, timeOf, gradedOf, slateDate, strip }) -> { mask(rows), lockedOf(row), countOk(rows) }.
 * mask() takes the call fields (`strip`) off every CALLED, not-started man a non-member may not read (the boards' free four stay), so a game's cards, chips,
 * headers and write-ups built from the masked rows cannot name him; for a member / unknown viewer it returns the rows untouched (same array). countOk(rows)
 * says whether a per-game COUNT of called picks may be drawn (every called man in it is readable). Boards keep the RAW rows: they compute the free four.
 */
export function useCallMask({ statusOf, keyOf, timeOf, gradedOf = null, slateDate = null, strip = [] }) {
  const lockOf = useLockOf()
  const lockedOf = useCallback((r) => lockOf({ status: statusOf(r), key: keyOf(r), time: timeOf(r), graded: gradedOf ? gradedOf(r) : false, slateDate }).locked,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lockOf, slateDate])
  const mask = useCallback((rows) => maskCalledRows(rows, { lockedOf, strip }), [lockedOf]) // eslint-disable-line react-hooks/exhaustive-deps
  const countOk = useCallback((rows) => gameCountVisible((rows || []).filter((r) => statusOf(r) === 'called'), { lockedOf }), [lockedOf]) // eslint-disable-line react-hooks/exhaustive-deps
  return { mask, lockedOf, countOk }
}

/**
 * MOONSHOT's rows, for every LIST that prints the bot's designation (🤖, "MOONSHOT pick", a role chip, a pick count) without being a board: mask(players) takes
 * game_pick_role / best_bet_type / beginner_label off each CALLED, not-started man a non-member may not read (the same key the boards use). Members and unknown
 * viewers get the very same array. NOT for a board: a board computes the free four from the RAW rows and carries the gate itself (useCallGate).
 */
export function useMlbMask(slateDate = null) {
  const { mask } = useCallMask({
    statusOf: (p) => (isCalledRole(p?.game_pick_role) ? 'called' : 'board'), keyOf: (p) => `${mlbPlayerId(p)}|${p?.game_pk ?? ''}`, timeOf: (p) => p?.game_time,
    slateDate, strip: ['game_pick_role', 'best_bet_type', 'beginner_label'],
  })
  return mask
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
  const gateOf = useCallGate({
    rows: () => (stories || []).filter((s) => s.board?.status === 'called'), source: stories, slateDate: date,
    statusOf: (s) => s.board?.status, keyOf: (s) => storyLockKey(sport, s.player_id, s.game_id), timeOf: (s) => gameOf.get(String(s.game_id))?.start ?? null,
    gradedOf: (s) => gameOf.get(String(s.game_id))?.state === 'final', rankOf: (s) => s.board?.rank,
  })
  lockIn.hidden = gateOf ? gateOf.hidden : 0
  return lockIn
}

/** On a player CARD, for EVERY non-member and whoever the player is (Donovan 2026-10-16), so the line itself never says who is called. */
export function CardLockLine({ C, NUM_FONT, style }) {
  return <JoinLine C={C} NUM_FONT={NUM_FONT} style={style} text={'Members see tonight\u2019s called picks and why.'} dataPm="lock" />
}

/** The one quiet line under a board, list or table, for a non-member only, only when at least one CALLED pick is drawn as ON THE BOARD: a count, no names. */
export function HiddenCalledLine({ n, C, NUM_FONT, style }) {
  if (!(n > 0)) return null
  return <JoinLine C={C} NUM_FONT={NUM_FONT} style={style} text={`${n} more called pick${n === 1 ? '' : 's'} tonight ${n === 1 ? 'is' : 'are'} for members.`} dataPm="hidden-called" />
}

function JoinLine({ C, NUM_FONT, style, text, dataPm }) {
  return (
    // Join rides the end of the sentence (2026-10-21 dead-space pass): it wrapped onto a 44px line of its own, so the line was
    // 61px tall. Its tap box is still 44px tall (the padding), pulled back by the negative margin so it adds no height.
    <div data-pm={dataPm} style={{ fontFamily: NUM_FONT, fontSize: 12, lineHeight: 1.45, color: C.text2, padding: '4px 0', ...style }}>
      <span>{text}</span>{' '}
      <a href={membersUrl()} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        style={{ display: 'inline-block', padding: '14px 8px', margin: '-14px -8px -14px 0', fontWeight: 900, letterSpacing: '.04em', color: C.text, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
        Join
      </a>
    </div>
  )
}
