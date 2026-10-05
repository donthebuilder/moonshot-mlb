'use client'
// Moved out of components/nfl/tabs/StatPortal.js (2026-10-04, R9): that page was
// no longer rendered anywhere; this hook is the one piece the players directory
// (components/nfl/tabs/NflPlayers.js) still uses.
import { useEffect, useMemo, useState } from 'react'
import { fetchNfl, nflRosterPaths } from './dataSource'

// EVERY ROSTER (2026-09-24, Donovan: "I should be able to search every
// active player"). The week file is the ~560 men the model rated. Everyone
// else on a 53-man, IR or practice squad comes from nfl_roster.json
// (bots/nfl/nfl_roster.py) and joins the directory with no scores -- the
// card opens on his name, team, status and whatever game log nfl_logs.json
// has for him, and says plainly that he was not rated this week.
const ROSTER_STATUS = { ACT: 'active, not in this week\u2019s pool', RES: 'IR / reserve', DEV: 'practice squad', PUP: 'PUP', SUS: 'suspended' }
export function useRosterExtras(players) {
  const [roster, setRoster] = useState(null)
  useEffect(() => {
    let alive = true
    fetchNfl(nflRosterPaths()).then((d) => { if (alive && Array.isArray(d?.players)) setRoster(d.players) }).catch(() => {})
    return () => { alive = false }
  }, [])
  // ONE ARRAY PER (roster, players), not one per render (2026-10-04, running list:
  // "the Players search list goes blank"): a fresh array every render changed the
  // directory's rows identity each time, re-running PlayerBoardFrame's [rows]
  // effects (hash read, history listeners) on every render.
  return useMemo(() => {
    if (!roster) return []
    const have = new Set(players.map((p) => String(p.player_id)))
    return roster
      .filter((r) => r.gsis_id && !have.has(String(r.gsis_id)))
      .map((r) => ({
        player_id: r.gsis_id, name: r.name, team: r.team, position: r.position,
        roster_only: true, roster_status: ROSTER_STATUS[r.status] || r.status_word || r.status || '',
        headshot: r.headshot || null, jersey: r.jersey ?? null,
        scores: {}, stats: {}, components: {},
      }))
  }, [roster, players])
}
