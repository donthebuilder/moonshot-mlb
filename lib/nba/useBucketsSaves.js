'use client'
import { useEffect } from 'react'
import { useFollowing, unfollow } from '../dash/follow'
import { stampSave, unstampSave, savedNights, nightsFor } from '../watchNights'
import { easternDate } from '../data'
import { useBucketsScores } from './useBuckets'

// ⭐ BUCKETS' "SAVED THAT NIGHT" -- lib/nhl/useLampSaves.js's rule, on BUCKETS'
// scores: a night counts when a followed player's club plays that day; each
// followed player is remembered under the game's own date with its game id;
// unfollowing before tip takes him off the night. The star clears once a
// night he was starred for is over (LAMP's 10-01 rule). Mounted once, in
// BucketsDashboard; it rides the scores read the shell already makes.
export function useBucketsSaves() {
  const { rows } = useFollowing('nba')
  const { data } = useBucketsScores(null)
  useEffect(() => {
    const games = data?.games || []
    if (!games.length || !data?.date) return
    const followed = new Map(rows.map((r) => [String(r.id), r]))
    for (const g of games) {
      const clubs = new Set([g.home?.abbrev, g.away?.abbrev])
      followed.forEach((r, id) => { if (clubs.has(r.team)) stampSave({ sport: 'nba', id, date: data.date, pk: String(g.id), name: r.name || '', team: r.team || '' }) })
      const start = Date.parse(g.start || '')
      const night = savedNights('nba').find((n) => n.date === data.date)
      ;(night?.saves || []).forEach((s) => { if (!followed.has(String(s.id)) && String(s.pk) === String(g.id)) unstampSave({ sport: 'nba', id: s.id, date: data.date, startMs: start }) })
    }
  }, [rows, data])
  useEffect(() => {
    if (!rows.length) return
    const today = easternDate(Date.now())
    rows.forEach((r) => {
      const since = (Number(r.at) || 0) - 60000
      if (nightsFor('nba', r.id).some((n) => n.date < today && n.at >= since)) unfollow('nba', String(r.id))
    })
  }, [rows])
}
