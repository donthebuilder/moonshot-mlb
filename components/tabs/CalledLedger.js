'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Ledger from '../ledger/Ledger'
import {
  getCalledNight, loadCalledSeason, hrBaseRate,
  nightToRows, nightTotals, seasonHitterRows,
} from '../../lib/calledLedger'
import { easternToday } from '../../lib/data'

// 📒 THE CALLED LEDGER — MOONSHOT'S SIDE OF PATH TO VICTORY A10.
//
// "Full fledge, build it." (Donovan, 2026-09-13) — every night's CALLED
// homers, running totals, per-player history, browsable by date, persisted
// SERVER-SIDE rather than in one browser. See lib/calledLedger.js for
// exactly where every number here comes from (graded_results_YYYY-MM-DD.json
// on the bot's `data` branch — the same file Results / ResultsDepth / the
// Homer Ledger already read) and why this page's own cache is in-memory
// only: a fresh load always re-derives the truth from that branch, on any
// device, rather than trusting a value one phone happened to store weeks
// ago.
//
// This is the MLB half of the shared <Ledger/> component
// (components/ledger/Ledger.js) — Path to Victory B10a's Tuddy Ledger
// (components/nfl/tabs/TuddyLedger.js, shipped 2026-09-15) is the same
// component: NFL's own data, a measured ~20% TD base rate (see
// lib/tuddyLedger.js's tdBaseRate) instead of the league's HR/team-game,
// "TD" instead of "HR".
//
// "CALLED" (decided 2026-09-15, Donovan, following up on the open
// question this page originally flagged): wearing a TOP, HR, HIT, HRR or
// (since 2026-09-26) CONTACT badge — each is its own real call lane with its
// own hit-rate scoreboard elsewhere on the site (Path to Victory A1's PICKS
// lane, A9's Hits/HRR lanes). WATCH is explicitly "not a call" per A1; TOP15
// is a ranking band, not a designated pick. A hitter under either of those,
// or on the sheet with no badge at all, shows as ON BOARD, not CALLED. See
// lib/callStatus.js for the one place this is decided (2026-10-06: it was "on the sheet"
// here and the top third of the board on /called; both read lib/callStatus.js now, with the
// homer_feed statuses from /api/mlb/call-status -- lib/record/mlbStatus.js).

const dayStr = (d) => d.toISOString().slice(0, 10)
const shiftDate = (date, deltaDays) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return dayStr(d)
}

export default function CalledLedger({ slateDate = '', onPlayerClick = null }) {
  const today = slateDate || easternToday()
  const [date, setDate] = useState(today)
  const [night, setNight] = useState(null)
  const [nightLoading, setNightLoading] = useState(false)
  const [nightNote, setNightNote] = useState(null)

  const [view, setView] = useState('night')
  const [season, setSeason] = useState(null)          // seasonRecord() shape
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [seasonMessage, setSeasonMessage] = useState('')
  const [baseRate, setBaseRate] = useState(null)

  useEffect(() => { hrBaseRate().then(setBaseRate) }, [])

  const loadNight = useCallback(async (d) => {
    setNightLoading(true); setNightNote(null)
    try {
      const entry = await getCalledNight(d)
      if (!entry) {
        setNight(null)
        setNightNote(`LIVE DATA DELAYED — no board published for ${d}. It may be an off day, a gap in the archive, or too far back for what is still published.`)
      } else if (!entry.hasCapture) {
        setNight(null)
        setNightNote(`Full called / on board / not on board coverage isn't available for ${d} — that night predates this report format. Try a more recent night.`)
      } else {
        setNight({ ...entry, date: d })
      }
    } catch {
      setNight(null)
      setNightNote(`LIVE DATA DELAYED — couldn't reach ${d}'s board.`)
    } finally {
      setNightLoading(false)
    }
  }, [])

  useEffect(() => { loadNight(date) }, [date, loadNight])

  const loadSeason = useCallback(async (days) => {
    setSeasonLoading(true); setSeasonMessage('')
    try {
      const { season: s, coveredNights, publishedNights, requestedNights, postseason, otherNights } = await loadCalledSeason(today, days, {
        onProgress: ({ i, of, date: d }) => setSeasonMessage(`reading ${d} — ${i}/${of}`),
      })
      setSeason(s)
      if (!s) {
        setSeasonMessage('Nothing with full coverage published in that window yet.')
      } else {
        const olderFormat = publishedNights - coveredNights
        // Which season this is, said out loud (2026-09-27): the postseason and
        // the regular season are separate records, never one percentage.
        setSeasonMessage(
          `${postseason ? 'POSTSEASON · ' : ''}${coveredNights} of ${requestedNights} nights loaded`
          + (olderFormat > 0 ? ` (${olderFormat} used an older report format and were skipped)` : '')
          + (otherNights ? ` · ${otherNights} ${postseason ? 'regular-season' : 'postseason'} ${otherNights === 1 ? 'night' : 'nights'} kept out, counted on their own` : '')
          + '.',
        )
      }
    } catch {
      setSeasonMessage("Couldn't reach the archive.")
    } finally {
      setSeasonLoading(false)
    }
  }, [today])

  // Same "top itself up quietly" courtesy the existing Season Record gives —
  // one small pull the first time the season view opens, so it isn't empty
  // the first time anyone looks. Never on top of a running load.
  const toppedRef = useRef(false)
  useEffect(() => {
    if (view !== 'season' || toppedRef.current || seasonLoading || season) return
    toppedRef.current = true
    loadSeason(30)
  }, [view, seasonLoading, season, loadSeason])

  return (
    <Ledger
      eventLabel="HR"
      eventLabelLong="Home Run"
      multiSport="mlb"
      baseRate={baseRate}
      date={date}
      onPrevDate={() => setDate((d) => shiftDate(d, -1))}
      onNextDate={() => setDate((d) => shiftDate(d, 1))}
      onToday={() => setDate(today)}
      canGoNext={date < today}
      night={night ? { totals: nightTotals(night), rows: nightToRows(night), games: night.games } : null}
      noteSport="mlb"
      scorerWord="hitters"
      nightLoading={nightLoading}
      nightNote={nightNote}
      season={season ? {
        from: season.from,
        to: season.to,
        nightsCount: season.count,
        totalEvents: season.total,
        // home runs by status, from the same lib/callStatus.js words /called prints (one definition)
        called: season.called,
        board: season.board,
        off: season.off,
        perNight: season.perNight,
      } : null}
      hitterRows={season ? seasonHitterRows(season) : []}
      seasonLoading={seasonLoading}
      seasonMessage={seasonMessage}
      onLoadSeason={loadSeason}
      onPlayerClick={onPlayerClick}
      view={view}
      onViewChange={setView}
    />
  )
}
