'use client'
// THE MEMBER GATE, CLIENT SIDE (2026-10-16, Donovan: no new page). One context, mounted once per client shell (app/app/page.js, app/m/page.js),
// that says whether the viewer is a member: 'member' | 'free' | 'unknown' (lib/members/gate.js memberStateOf, from the account state the sync layer
// already fetches: /api/dash/state returns who.member). Outside the shell there is no provider and the state is 'unknown', which draws every label
// exactly as before (fail OPEN: a member is never shown a lock; the real hiding is the front page's, on the server).
//
// useCallGate(...) is what a board calls: it returns null for everyone but a free viewer (so the table draws as it always did), else gateOf(row) ->
// { key, started, graded, free } for CallStatusBadge's `gate` prop. It decides nothing about CALLED itself: the status still comes from the sport's one
// rule (lib/callStatus, tdCallStatus, scoreNight); this only says which already-CALLED labels are drawn as the lock.
import { createContext, useContext, useMemo } from 'react'
import { useDashAccount } from '../lib/dash/sync'
import { memberStateOf, freeCalledKeys, startedAt } from '../lib/members/gate'
import { etToday } from '../lib/freshness'

const Ctx = createContext('unknown')

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
  return useMemo(() => {
    if (state !== 'free') return null
    const slateIsToday = !slateDate || slateDate === etToday()
    const now = Date.now()
    const startedOf = (r) => startedAt(timeOf(r), { now, slateIsToday })
    const free = freeCalledKeys(typeof rows === 'function' ? rows() : rows, { keyOf, startedOf, statusOf, rankOf })
    return (r) => ({ key: keyOf(r), started: startedOf(r), graded: gradedOf ? Boolean(gradedOf(r)) : false, free })
  // the callbacks are the caller's inline functions of `rows`; the rows, the viewer and the slate day are what change the answer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, source !== undefined ? source : rows, slateDate])
}
