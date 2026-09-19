'use client'
import { useCallback, useEffect, useState } from 'react'
import { NFL_DATA_BASE } from './dataSource'

// THE DvP SEASON TOGGLE (2026-09-18).
//
// stats_season_for() in nfl_features.py serves LAST season's defence-vs-position
// until three weeks of the new one are played, then flips on its own around
// week 4. That is the right default -- a week-1 DvP table does not exist -- but
// it leaves the reader no way to ask the other question: "what has this defence
// actually done THIS season" in week 2, or "what did it do last year" in week
// 12. This hook is that other question.
//
// LAZY ON PURPOSE. Measured on the live payload: `dvp` is 242 KB of a 771 KB
// nfl_matchup.json. Publishing a second copy inside it would push every visitor
// past a megabyte to serve a toggle most of them never touch (#26). The bot
// writes it to nfl_matchup_prev.json instead, and this fetches that file the
// first time someone flips the switch -- once per page load, then cached here.
//
// THE TOGGLE ONLY EXISTS WHEN THE FILE DOES. nfl_bot publishes `alt_season` as
// null when nfl_dvp.build() had nothing for that season (asking for 2026 in
// week 1), so a missing table is a missing switch, never a switch that leads to
// an empty table (#24).
//
// WHAT THIS IS NOT: the coverage, route and pressure tables have no second
// side to toggle to and will not have one this season. They come from nflverse
// participation, which publishes ONCE A YEAR after the postseason -- see
// nfl_charting.py and components/nfl/SourceSeason.js. Only DvP is built from
// play-by-play, which is why only DvP gets a switch.
export default function useDvpSeason(matchup) {
  const current = Number(matchup?.season) || null
  const alt = Number(matchup?.alt_season) || null
  const [season, setSeason] = useState(null)   // null = whichever the bot chose
  const [prev, setPrev] = useState(null)
  const [state, setState] = useState('idle')   // idle | loading | ready | error

  // A new payload (a week rollover, or the This week / Next week switch) can
  // carry a different pair of seasons, so a cached prev table from the old one
  // must not survive it.
  useEffect(() => { setPrev(null); setSeason(null); setState('idle') }, [current, alt])

  const pick = useCallback(async (yr) => {
    if (!yr || yr === current) { setSeason(null); return }
    setSeason(yr)
    if (prev || state === 'loading') return
    setState('loading')
    try {
      const r = await fetch(`${NFL_DATA_BASE}/nfl_matchup_prev.json?t=${Date.now()}`,
                            { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!j?.dvp) throw new Error('no dvp in payload')
      setPrev(j)
      setState('ready')
    } catch (e) {
      // #25: the switch says what went wrong, and the table it was showing
      // stays put rather than emptying out.
      setState('error')
      if (typeof console !== 'undefined') console.warn('[dvp-prev]', e)
    }
  }, [current, prev, state])

  const showing = season && season !== current ? season : current
  // The payload DvpTable should read. Only the dvp block and its labels change;
  // everything else on the page is still this run's.
  const view = showing !== current && prev
    ? { ...matchup, season: prev.season, dvp: prev.dvp,
        dvp_roles: prev.dvp_roles || matchup?.dvp_roles,
        dvp_stats: prev.dvp_stats || matchup?.dvp_stats,
        dvp_labels: prev.dvp_labels || matchup?.dvp_labels }
    : matchup

  return { view, current, alt, showing, pick, state, hasToggle: Boolean(alt && current) }
}
