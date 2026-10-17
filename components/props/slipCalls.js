'use client'
// TONIGHT'S CALLED PICKS FOR THE SLIP (2026-10-17). PropCards calls this with the sport's own adapter and rows; it publishes, in the board's
// own order, every CALLED pick that has not started and has a priced market, each marked free or not (the boards' free four, the same
// rule useCallGate counts). The slip panel (components/Slip.js) reads it for 'Add tonight's called picks'. Nothing is re-derived: CALLED is
// the adapter's rolesOf (the sport's callStatus / scoreNight word), started is the game's own start, the free four is lib/members/gate.js.
import { useEffect, useMemo } from 'react'
import { freeCalledKeys, startedAt } from '../../lib/members/gate'
import { publishCalls } from '../../lib/slip/store'

const isCallRole = (k) => k !== 'WATCH' && k !== 'NONE'

export function useCalledForSlip({ a, rows, legFor }) {
  const sport = a.sportKey
  const cands = useMemo(() => {
    if (!sport) return []
    const now = Date.now()
    const lockKeyOf = (r) => (a.lockKey ? a.lockKey(r) : a.keyOf(r))
    const called = (rows || []).filter((r) => r && a.rolesOf(r).some(isCallRole))
    const startedOf = (r) => startedAt(a.startsAt(r), { now })
    const rankOf = (r) => -(Number(a.score(r, a.primaryOf(r))) || 0)
    const free = freeCalledKeys(called, { keyOf: lockKeyOf, startedOf, statusOf: () => 'called', rankOf })
    return called.filter((r) => !startedOf(r))
      .sort((x, y) => rankOf(x) - rankOf(y))
      .map((r) => {
        const k = a.rolesOf(r).find((m) => isCallRole(m) && a.priceNum(r, m) != null)
        return k ? { key: lockKeyOf(r), free: free.has(lockKeyOf(r)), leg: legFor(r, k, 'called') } : null
      }).filter(Boolean)
  // legFor is rebuilt every render; the rows and the adapter are what change the answer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, rows, sport])
  useEffect(() => { if (sport) publishCalls(sport, { cands, at: Date.now() }) }, [sport, cands])
}
