'use client'
import { useEffect, useMemo, useState } from 'react'
import { C } from '../lib/theme'
import { fetchJSON, normalizeData, groupGames } from '../lib/data'
import { slatePaths, resultsPaths, pairBuilderPaths, pairSummaryPaths, backtestPaths, setSlateMode } from '../lib/dataSource'
import { nameOf, teamOf, oppOf, clean, playerId, obj } from '../lib/player'
import { Empty } from './ui'
import Header from './Header'
import Controls from './Controls'
import Slip from './Slip'
import PlayerModal from './PlayerModal'
import MobileCSS from './MobileCSS'

import Guide from './tabs/Guide'
import Games from './tabs/Games'
import RankedBoard from './tabs/RankedBoard'
import PairHistory from './tabs/PairHistory'
import DueBoard from './tabs/DueBoard'
import LongestBoard from './tabs/LongestBoard'
import Backtest from './tabs/Backtest'
import PlayerBoard from './tabs/PlayerBoard'
import HitsHRR from './tabs/HitsHRR'
import SprayChart from './SprayChart'
import Scoreboard from './tabs/Scoreboard'
import Pools from './tabs/Pools'
import Leaders from './tabs/Leaders'
import Results from './tabs/Results'
import Watchlist from './tabs/Watchlist'
import Pairs from './tabs/Pairs'
import Bot from './tabs/Bot'
import Pitchers from './tabs/Pitchers'

const WATCH_KEY = 'mlb_watchlist_v1'

export default function Dashboard() {
  const [mode, setMode] = useState('today')
  const [tab, setTabRaw] = useState('games')
  const setTab = (next) => {
    if (next !== 'pairs') setFocusPlayerId(null)
    setTabRaw(next)
  }
  const [data, setData] = useState(null)
  const [results, setResults] = useState(null)
  const [pairSummary, setPairSummary] = useState(null)
  const [pairBuilder, setPairBuilder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [team, setTeam] = useState('')
  const [slip, setSlip] = useState([])
  const [watch, setWatch] = useState([])
  const [modalPlayer, setModalPlayer] = useState(null)
  const [focusPlayerId, setFocusPlayerId] = useState(null)

  useEffect(() => {
    try {
      setWatch(JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'))
    } catch { /* ignore */ }
  }, [])

  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [backtest, setBacktest] = useState(null)

  useEffect(() => {
    let alive = true
    // Only show the loading spinner on the FIRST load and on a manual,
    // user-clicked refresh -- not on every silent background poll tick,
    // which would otherwise flash the "Loading slate data…" empty state
    // every 30-90 seconds and make the page feel like it's constantly
    // reloading instead of quietly staying fresh.
    if (refreshKey === 0) setLoading(true)
    // Data is fetched from the Streamlit repo's `data` branch, not from this
    // app's own /public -- moonshot ships no data of its own.
    setSlateMode(mode)
    const paths = slatePaths(mode)
    // fetchJSON already cache-busts with a ?t=Date.now() query param (see
    // lib/data.js), so re-running this effect always hits the network for
    // fresh data rather than a stale browser/CDN cache.
    Promise.allSettled([
      fetchJSON(paths).then((j) => { if (alive) setData(j) }),
      fetchJSON(resultsPaths()).then((j) => { if (alive) setResults(j) }),
      fetchJSON(pairBuilderPaths()).then((j) => { if (alive) setPairBuilder(j) }),
      fetchJSON(pairSummaryPaths()).then((j) => { if (alive) setPairSummary(j) }),
      fetchJSON(backtestPaths()).then((j) => { if (alive) setBacktest(j) }),
    ]).then(() => {
      if (alive) { setLoading(false); setRefreshing(false) }
    })
    return () => { alive = false }
  }, [mode, refreshKey])

  // Auto-poll: re-fetch on a timer so new bot output shows up without
  // anyone clicking refresh. Polls faster while any game is actually live
  // (checked via results.live_mode, the same flag live_results_tracker.py
  // already writes) and slower otherwise, so it's responsive during games
  // without hammering the JSON files all day when nothing is happening.
  useEffect(() => {
    const isLive = results?.live_mode === true
    const intervalMs = isLive ? 45_000 : 5 * 60_000 // 45s live, 5min idle
    const id = setInterval(() => {
      setRefreshKey((k) => k + 1) // refreshKey > 0 here, so no loading spinner
    }, intervalMs)
    return () => clearInterval(id)
  }, [results?.live_mode])

  // Re-fetches everything above by bumping refreshKey, which the effect
  // depends on. Doesn't touch local UI state (active tab, search, slip,
  // watchlist) -- only the underlying slate/results/pair data refreshes.
  const handleRefresh = () => {
    setRefreshing(true)
    setRefreshKey((k) => k + 1)
  }

  const normalized = useMemo(() => normalizeData(data || {}), [data])
  const allPlayers = normalized.players

  const players = useMemo(() => {
    return allPlayers.filter((p) => {
      const q = query.toLowerCase().trim()
      const qok = !q || [nameOf(p), teamOf(p), oppOf(p), clean(p?.pitcher_name, '')].join(' ').toLowerCase().includes(q)
      const tok = !team || teamOf(p) === team
      return qok && tok
    })
  }, [allPlayers, query, team])

  // Header needs the same grouping the Games tab uses, so the two can't
  // disagree about the game count or which game is best.
  const headerGames = useMemo(() => groupGames(allPlayers), [allPlayers])

  const watchIds = useMemo(() => new Set(watch.map(playerId)), [watch])

  const addSlip = (p, bet) => setSlip((s) => [...s, { p, bet }])

  // Bot picks jump straight to the Pairs tab, focused on the clicked player,
  // instead of opening PlayerModal -- per request, the click itself should
  // navigate rather than pop up the modal.
  const handleBotPlayerClick = (p) => {
    setFocusPlayerId(playerId(p))
    setTab('pairs')
  }

  const clearFocus = () => setFocusPlayerId(null)

  const toggleWatch = (p) => setWatch((prev) => {
    const id = playerId(p)
    const next = prev.some((x) => playerId(x) === id) ? prev.filter((x) => playerId(x) !== id) : [...prev, p]
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const dateLabel = clean(obj(data).date || obj(data).slate_date || obj(data).label, mode === 'today' ? 'Today' : 'Tomorrow')
  // These render from their own payloads, so an empty slate must not blank them.
  const tabsWithoutPlayers = ['pairs', 'bot', 'results', 'guide', 'watch', 'pairhist']
  const showEmpty = !loading && !players.length && !tabsWithoutPlayers.includes(tab)

  return (
    <>
      <MobileCSS />
      <Header tab={tab} setTab={setTab} dateLabel={dateLabel} mode={mode} setMode={setMode} results={results} players={allPlayers} games={headerGames} onRefresh={handleRefresh} refreshing={refreshing} />
      <main className="dashboard-main" style={{ maxWidth: 1300, margin: '0 auto', padding: '0 14px 28px' }}>
        <Controls query={query} setQuery={setQuery} team={team} setTeam={setTeam} players={allPlayers} />

        {loading ? (
          <Empty text="Loading slate data…" />
        ) : showEmpty ? (
          <Empty text="No players found. The slate may not be built yet — check back after the next scheduled run." />
        ) : (
          <>
            {tab === 'games'       && <Games players={players} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'board'       && <RankedBoard players={players} type="hr"  onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'longest'     && <LongestBoard players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'due'         && <DueBoard players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'pairhist'    && <PairHistory summary={pairSummary} players={allPlayers} onPlayerClick={setModalPlayer} />}
            {tab === 'player'      && <PlayerBoard players={players} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} />}
            {tab === 'hitshrr'     && <HitsHRR     players={players}             onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'scoreboard'  && <Scoreboard players={players} results={results} onPlayerClick={setModalPlayer} />}
            {tab === 'pools'       && <Pools players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'leaders'     && <Leaders players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'pairs'      && <Pairs players={allPlayers} pairBuilder={pairBuilder} pairHistorySummary={pairSummary} results={results} focusPlayerId={focusPlayerId} onClearFocus={clearFocus} onPlayerClick={setModalPlayer} />}
            {tab === 'bot'        && <Bot players={allPlayers} onPlayerClick={handleBotPlayerClick} />}
            {tab === 'pitchers'   && <Pitchers players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'results'     && <Results results={results} backtest={backtest} onPlayerClick={setModalPlayer} />}
            {tab === 'watch'       && <Watchlist items={watch} players={allPlayers} onWatch={toggleWatch} onAdd={addSlip} onPlayerClick={setModalPlayer} />}
            {tab === 'spray'       && <SprayChart players={allPlayers} />}
            {tab === 'guide'       && <Guide />}
          </>
        )}
      </main>
      <Slip slip={slip} setSlip={setSlip} />
      <PlayerModal player={modalPlayer} onClose={() => setModalPlayer(null)} />
    </>
  )
}
