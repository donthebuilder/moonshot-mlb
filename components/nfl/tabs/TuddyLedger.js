'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Ledger from '../../ledger/Ledger'
import {
  getTuddyWeekLedger, loadTuddySeason, tdBaseRate,
  weekRows, weekTotals, seasonHitterRows,
} from '../../../lib/tuddyLedger'
import { labelOf, weekKey } from '../../../lib/nfl/resultsArchive'
import { C as NFL_C } from '../../../lib/nfl/theme'

// 📒 THE TUDDY LEDGER — NFL'S SIDE OF PATH TO VICTORY B10a.
//
// "FULLY CLONE MLB TO NFL. We have our basis with MLB." (Donovan,
// 2026-09-13, Track B10) — this is that clone for A10's Called Ledger
// specifically: every week's CALLED touchdowns, running totals, per-player
// history, browsable week by week, through the exact same
// components/ledger/Ledger.js MOONSHOT's own Called Ledger
// (components/tabs/CalledLedger.js) renders through — same component, same
// three-way call, "week" instead of "night", "TD" instead of "HR". See
// lib/tuddyLedger.js's own header for exactly where every number here comes
// from (nfl_results_<season>_w{NN}.json, the one real per-week archive file
// TUDDY already publishes) and the one honest gap it discloses rather than
// papers over: NOT ON BOARD (a touchdown the model never tracked at all)
// can only be computed for whichever week nfl_fantasy_stats.json still
// covers — almost always the most recent one. Every other week's CALLED and
// ON BOARD counts are still complete; this component says so rather than
// silently showing a NOT ON BOARD count of zero for a week that was never
// actually checked.
//
// "CALLED" here (lib/tuddyLedger.js's weekToRows): one of that week's five
// TD rungs (payload.card.TD.rungs) who actually scored. ON BOARD: the TD
// market had a real line on him (payload.lines[id].TD) and he scored, but
// he wasn't one of the five. Both are read straight off the model's own
// published grade for that week — never recomputed here.

export default function TuddyLedger({ data, results, onPlayerClick = null }) {
  const season = Number(data?.season || results?.season) || null
  const mode = results?.mode || 'week'
  const currentWeek = Number(results?.week) || 0
  // Only regular-season weeks get a nfl_results_<season>_w{NN}.json archive
  // file (lib/nfl/resultsArchive.js's own tagOf) — preseason has nothing for
  // this page to read yet, so it says so rather than guessing a week.
  const maxWeek = mode === 'week' ? Math.max(currentWeek, 1) : 0

  const [week, setWeek] = useState(currentWeek || 1)
  const [wk, setWk] = useState(null)
  const [wkLoading, setWkLoading] = useState(false)
  const [wkNote, setWkNote] = useState(null)

  const [view, setView] = useState('night') // Ledger's own internal key, not shown — periodWord drives the label
  const [seasonData, setSeasonData] = useState(null)
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [seasonMessage, setSeasonMessage] = useState('')

  const baseRate = tdBaseRate()

  useEffect(() => { if (mode === 'week' && currentWeek) setWeek(currentWeek) }, [mode, currentWeek])

  const loadWeek = useCallback(async (w) => {
    if (!season || !maxWeek) {
      setWk(null)
      setWkNote('Waiting for the regular season to start — the Ledger tracks real touchdowns week by week, not preseason.')
      return
    }
    setWkLoading(true); setWkNote(null)
    try {
      const entry = await getTuddyWeekLedger(season, w)
      if (!entry) {
        setWk(null)
        setWkNote(`LIVE DATA DELAYED — Week ${w} hasn't been graded and published yet.`)
      } else {
        setWk(entry)
        setWkNote(entry.offAvailable ? null
          : `NOT ON BOARD isn't available for Week ${w} — the live box score file only still covers the most recent week. Called and on-board counts here are complete either way.`)
      }
    } catch {
      setWk(null)
      setWkNote(`LIVE DATA DELAYED — couldn't reach Week ${w}'s board.`)
    } finally {
      setWkLoading(false)
    }
  }, [season, maxWeek])

  useEffect(() => { loadWeek(week) }, [week, loadWeek])

  const loadSeason = useCallback(async (n) => {
    if (!season || !maxWeek) return
    setSeasonLoading(true); setSeasonMessage('')
    try {
      const through = Math.min(n, maxWeek)
      const s = await loadTuddySeason(season, through, {
        onProgress: ({ i, of }) => setSeasonMessage(`reading week ${i}/${of}`),
      })
      setSeasonData(s)
      if (!s) {
        setSeasonMessage('Nothing graded and published yet this season.')
      } else {
        const offMissing = s.weeksCount - s.offWeeksCovered
        setSeasonMessage(
          `${s.weeksCount} of ${through} weeks loaded`
          + (offMissing > 0 ? ` (NOT ON BOARD unavailable for ${offMissing} of them)` : '')
          + '.',
        )
      }
    } catch {
      setSeasonMessage("Couldn't reach the archive.")
    } finally {
      setSeasonLoading(false)
    }
  }, [season, maxWeek])

  // Same one-time top-up courtesy CalledLedger gives the season view.
  const toppedRef = useRef(false)
  useEffect(() => {
    if (view !== 'season' || toppedRef.current || seasonLoading || seasonData || !maxWeek) return
    toppedRef.current = true
    loadSeason(maxWeek)
  }, [view, seasonLoading, seasonData, maxWeek, loadSeason])

  return (
    <Ledger
      eventLabel="TD"
      eventLabelLong="Touchdown"
      // Ledger.js's own accent defaults to MLB's orange (it imports lib/theme.js,
      // not lib/nfl/theme.js) -- TD is jade on every other NFL page
      // (Accountability.js's MARKET_COLOR), so this is the one prop that has
      // to travel explicitly or the page reads as MOONSHOT's, not TUDDY's.
      accent={NFL_C.green}
      baseRate={baseRate}
      periodWord="week"
      periodWordPlural="weeks"
      todayLabel="This week"
      formatPeriod={labelOf}
      seasonLoadOptions={[
        { n: 4, label: 'Load 4 weeks' },
        { n: 9, label: 'Load 9 weeks' },
        { n: 18, label: 'Load full season' },
      ]}
      date={season && maxWeek ? weekKey(season, 'week', week) : null}
      onPrevDate={() => setWeek((w) => Math.max(1, w - 1))}
      onNextDate={() => setWeek((w) => Math.min(maxWeek, w + 1))}
      onToday={() => setWeek(currentWeek || 1)}
      canGoNext={week < maxWeek}
      night={wk ? { totals: weekTotals(wk), rows: weekRows(wk) } : null}
      nightLoading={wkLoading}
      nightNote={wkNote}
      season={seasonData ? {
        from: seasonData.from,
        to: seasonData.to,
        nightsCount: seasonData.weeksCount,
        totalEvents: seasonData.totalEvents,
        called: seasonData.called,
        board: seasonData.board,
        off: seasonData.off,
        perNight: seasonData.perWeek,
      } : null}
      hitterRows={seasonData ? seasonHitterRows(seasonData) : []}
      seasonLoading={seasonLoading}
      seasonMessage={seasonMessage}
      onLoadSeason={loadSeason}
      onPlayerClick={onPlayerClick}
      view={view}
      onViewChange={setView}
    />
  )
}
