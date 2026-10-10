'use client'
import { useEffect, useMemo, useState } from 'react'
import { NFL_DATA_BASE, fetchNfl } from './dataSource'
import { needsPrev, blendMatchup } from './seasonRule'

// THE SEASON RULE ON THE PAGE (2026-10-10). Hands back the matchup payload with
// every defense on exactly one season (lib/nfl/seasonRule.js). A healthy payload
// (every defense at 3+ games this season, today's case) comes back as the same
// object and costs nothing; last season's file (nfl_matchup_prev.json, ~290 KB)
// is fetched ONLY when a defense is under the floor and a table exists to fall
// back on.
export default function useBlendedMatchup(matchup, slateSeason) {
  const want = useMemo(() => needsPrev(matchup, slateSeason), [matchup, slateSeason])
  const [prev, setPrev] = useState(null)
  useEffect(() => {
    if (!want) { setPrev(null); return undefined }
    let alive = true
    fetchNfl([`${NFL_DATA_BASE}/nfl_matchup_prev.json`], (j) => Boolean(j?.dvp?.season)).then((j) => { if (alive) setPrev(j) }).catch(() => { if (alive) setPrev(null) })
    return () => { alive = false }
  }, [want])
  // the slate's season rides on the payload (dvpSignal.whenOf reads it), so every "gives up ... " line can say this season / last season
  return useMemo(() => {
    const base = want && prev ? blendMatchup(matchup, prev, slateSeason) : matchup
    return base && Number(slateSeason) > 0 ? { ...base, slate_season: Number(slateSeason) } : base
  }, [matchup, prev, want, slateSeason])
}
