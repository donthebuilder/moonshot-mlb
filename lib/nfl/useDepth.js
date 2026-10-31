'use client'
// The depth charts of one game's two clubs (/api/nfl/depth), and a `nextUpOf(entry)` for the Out list: "who steps up" from ESPN's own chart.
import { useCallback } from 'react'
import { useLiveFetch } from '../useLiveFetch'
import { nextUp } from './depthChart'
import { canonTeam } from '../injuries/teams'

export function useNflDepth(clubs) {
  const teams = (clubs || []).filter(Boolean).join(',')
  const { data } = useLiveFetch(teams ? `/api/nfl/depth?teams=${teams}` : null)
  return useCallback((entry) => {
    const chart = data?.depth?.[canonTeam('nfl', entry?.team)]
    return chart ? nextUp(chart, entry.name) : null
  }, [data])
}
