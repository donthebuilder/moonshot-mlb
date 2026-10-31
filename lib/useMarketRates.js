'use client'
// THE CALLED-PICK HIT RATE OF EACH MARKET, for the market chips (2026-10-29). One read of /api/market-rates per sport
// (the route says where each number comes from); `rateOf(key)` is the figure a chip prints ("71%"), or null while it loads,
// when a market has no calls yet, or under the public-number floor (the route sends no rate then, so a chip never shows one early).
import { useCallback } from 'react'
import { useLiveFetch } from './useLiveFetch'

export function useMarketRates(sport, { enabled = true } = {}) {
  const { data } = useLiveFetch(`/api/market-rates?sport=${sport}`, { enabled })
  const rates = data?.rates || null
  const rateOf = useCallback((key) => {
    const r = rates?.[key] ?? rates?.[String(key).toUpperCase()] ?? rates?.[String(key).toLowerCase()]
    return r && Number.isFinite(r.rate) ? Math.round(r.rate) : null
  }, [rates])
  const titleOf = useCallback((key) => {
    const r = rates?.[key] ?? rates?.[String(key).toUpperCase()] ?? rates?.[String(key).toLowerCase()]
    if (!r) return ''
    return Number.isFinite(r.rate) ? `Called picks here hit ${r.hits} of ${r.n} (${r.rate}%).` : r.n ? `${r.n} graded called ${r.n === 1 ? 'pick' : 'picks'} so far: too few for a rate.` : ''
  }, [rates])
  return { rates, rateOf, titleOf }
}
