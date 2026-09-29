'use client'
import { useEffect } from 'react'
import { useFollowing } from '../dash/follow'
import { stampSave, unstampSave, savedNights } from '../watchNights'
import { useLampBoardOnce } from './useLamp'

// ⭐ LAMP'S "SAVED THAT NIGHT" (2026-09-29, lib/watchNights.js).
//
// LAMP has no star list of its own: the skaters you keep are the ones you
// follow (the Follow button on his file). So a night counts when a followed
// skater's club plays: every game on tonight's board is checked against the
// follow list, and each followed skater is remembered under that game's own
// date with its game id (the key his game log uses). Unfollowing before puck
// drop takes him back off that night. Mounted once, in LampDashboard; it rides
// the board fetch the page already makes.
export function useLampSaves() {
  const { rows } = useFollowing('nhl')
  const { data: board } = useLampBoardOnce()
  useEffect(() => {
    const games = board?.games || []
    if (!games.length) return
    const followed = new Map(rows.map((r) => [String(r.id), r]))
    games.forEach(({ game }) => {
      const date = game?.date
      if (!date || !game?.id) return
      const clubs = new Set([game.home?.abbrev, game.away?.abbrev])
      followed.forEach((r, id) => {
        if (!clubs.has(r.team)) return
        stampSave({ sport: 'nhl', id, date, pk: String(game.id), name: r.name || '', team: r.team || '' })
      })
      // Unfollowed before this game's puck drop: off the night.
      const start = Date.parse(game.startUtc || '')
      const night = savedNights('nhl').find((n) => n.date === date)
      ;(night?.saves || []).forEach((s) => {
        if (!followed.has(String(s.id)) && String(s.pk) === String(game.id)) {
          unstampSave({ sport: 'nhl', id: s.id, date, startMs: start })
        }
      })
    })
  }, [rows, board])
}
