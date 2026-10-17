'use client'
// THE MEMBER GATE ON THE BUCKETS BOARD (2026-10-17, follow-up to the card's lock in PR 72). BUCKETS publishes NO free four: for a confirmed non-member every
// not-started, not-graded CALLED pick is drawn as a plain ON THE BOARD row (status 'board', no role, `_callHidden` set so a sentence can say something true).
// Graded results and started games stay public; a member or unknown viewer gets the very same object back (fail open). The decision is the gate's
// (components/MemberGate.js useLockOf -> lib/members/gate cardGate); this only applies it to a board read, once, so the table, cards, ALL MARKETS and the
// ticker cannot disagree. The real hiding is server-side on the front page.
import { useMemo } from 'react'
import { useBucketsBoard } from '../../lib/nba/useBuckets'
import { useLockOf } from '../MemberGate'

/** @returns a board read (data, error, loading ...) whose rows have the locked calls taken off. */
export function useGatedBoard(date, market = 'pts') {
  const res = useBucketsBoard(date, market)
  const data = useMaskedBoard(res.data)
  return useMemo(() => (data === res.data ? res : { ...res, data }), [res, data])
}

export function useMaskedBoard(data) {
  const lockOf = useLockOf()
  return useMemo(() => {
    if (!data || !Array.isArray(data.rows)) return data
    const games = new Map((data.games || []).map((g) => [g.id, g]))
    let changed = false
    const rows = data.rows.map((r) => {
      if (r?.status !== 'called') return r
      const g = games.get(r.gameId)
      const { locked } = lockOf({ status: r.status, key: `${r.gameId}|${r.playerId}`, time: g?.start || null, graded: g?.state === 'final' })
      if (!locked) return r
      changed = true
      return { ...r, status: 'board', role: null, _callHidden: true }
    })
    return changed ? { ...data, rows } : data
  }, [data, lockOf])
}
