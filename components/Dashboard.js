'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '../lib/theme'
import { fetchJSON, normalizeData, groupGames } from '../lib/data'
import { slatePaths, resultsPaths, pairBuilderPaths, pairSummaryPaths, backtestPaths, setSlateMode } from '../lib/dataSource'
import { nameOf, teamOf, oppOf, clean, playerId, obj } from '../lib/player'
import { Empty } from './ui'
import Header from './Header'
import MiniWire from './MiniWire'
import TabExplainer from './TabExplainer'
import Controls from './Controls'
import Slip from './Slip'
import PlayerModal from './PlayerModal'
import MobileCSS from './MobileCSS'
import StaleBanner from './StaleBanner'

import Home from './tabs/Home'
import Guide from './tabs/Guide'
import Games from './tabs/Games'
import AtThePlate from './tabs/AtThePlate'
import RankedBoard from './tabs/RankedBoard'
import PairHistory from './tabs/PairHistory'
import SprayBoard from './tabs/SprayBoard'
import PowerTab from './tabs/Power'
import Derby from './tabs/Derby'
import Backtest from './tabs/Backtest'
import PlayerBoard from './tabs/PlayerBoard'
import HitsHRR from './tabs/HitsHRR'
import Scoreboard from './tabs/Scoreboard'
import Pools from './tabs/Pools'
import Leaders from './tabs/Leaders'
import Results from './tabs/Results'
import Watchlist from './tabs/Watchlist'
import Pairs from './tabs/Pairs'
import Bot from './tabs/Bot'
import Pitchers from './tabs/Pitchers'
import QuickSearch from './QuickSearch'
import { SlateScaleProvider } from '../lib/statline'

const WATCH_KEY = 'mlb_watchlist_v1'

export default function Dashboard() {
  const [mode, setMode] = useState('today')
  // Home is the front door now (2026-08-08) — deep links below still land
  // wherever their hash says.
  const [tab, setTabRaw] = useState('home')
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

  // DEEP LINKS (2026-08-08, wishlist #3). #tab=power&p=660271 is now a real
  // address: tab restores immediately, the player modal opens as soon as the
  // slate row exists. The hash writes back on tab change and modal
  // open/close, so any view you're looking at is copy-paste shareable —
  // which is how a Discord pick post becomes a link to its receipt.
  const hashAppliedRef = useRef(false)
  useEffect(() => {
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    const t = h.get('tab')
    if (t) setTabRaw(t)
  }, [])

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
  //
  // HIDDEN TABS DON'T POLL (2026-08-09 scan). This is the heaviest timer on
  // the site — each tick refetches FIVE payloads (slate, results, pair
  // builder, pair summary, backtest) — and it was the only one with no
  // `document.hidden` guard. Every other poller here has one. On a phone left
  // on this tab in the background that is five requests every 45 seconds,
  // forever, for a screen nobody is looking at: pure battery and data.
  //
  // Skipping while hidden creates a second problem, so it's handled in the
  // same effect: come back after twenty minutes away and you'd be staring at
  // twenty-minute-old scores until the next tick. A visibilitychange listener
  // refreshes immediately on return, so the tab is fresher than before rather
  // than staler — you get the update when you actually look.
  useEffect(() => {
    const isLive = results?.live_mode === true
    const intervalMs = isLive ? 45_000 : 5 * 60_000 // 45s live, 5min idle
    const bump = () => setRefreshKey((k) => k + 1)   // >0, so no loading spinner
    const id = setInterval(() => { if (!document.hidden) bump() }, intervalMs)
    const onVis = () => { if (!document.hidden) bump() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
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

  // 🔄 LIVE WATCHLIST (2026-08-08, Donovan: "when I save someone at 1pm and
  // they're projected it stays that way"). toggleWatch stores a SNAPSHOT of
  // the row at star-time — so a 1pm save wore "projected" all night even
  // after lineups posted. This re-resolves every saved id to tonight's
  // CURRENT slate row on each data refresh; the stored snapshot is only the
  // fallback for a player who's since left the slate. Confirmations, spots,
  // scores and the graded chips all move through the day now.
  const watchLive = useMemo(() => {
    const byId = new Map(allPlayers.map((p) => [String(playerId(p)), p]))
    return watch.map((s) => byId.get(String(playerId(s))) || s)
  }, [watch, allPlayers])

  // (deep-link effects live below allPlayers — deps arrays evaluate at
  // render time and a hoisted reference would hit the temporal dead zone)
  useEffect(() => {
    if (hashAppliedRef.current) return
    const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    const pid2 = h.get('p')
    if (!pid2 || !allPlayers.length) return
    const found = allPlayers.find((x) => String(x?.player_id ?? x?.id) === pid2)
    if (found) { setModalPlayer(found); hashAppliedRef.current = true }
  }, [allPlayers])
  useEffect(() => {
    const h = new URLSearchParams()
    if (tab !== 'home') h.set('tab', tab)
    const pid2 = modalPlayer ? String(modalPlayer?.player_id ?? modalPlayer?.id ?? '') : ''
    if (pid2) h.set('p', pid2)
    const next = h.toString()
    try { history.replaceState(null, '', next ? `#${next}` : window.location.pathname + window.location.search) } catch {}
  }, [tab, modalPlayer])


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
  // STALE-RESULTS GATE (2026-08-07, Donovan's catch). From midnight until the
  // grader's first run (~9am Phoenix), results_live.json on the branch is
  // still LAST NIGHT's file — and "Live pools" / "Live HR Pairs" rendered it
  // under today's header as if it were tonight. Pools and Pairs only get the
  // results object when its date matches the slate being viewed; the Results
  // tab keeps the ungated object because its day picker owns its own dates.
  const slateDate = clean(obj(data).date || obj(data).slate_date, '')
  const resultsForSlate =
    (!slateDate || !clean(results?.date, '') || results.date === slateDate) ? results : null
  // These render from their own payloads, so an empty slate must not blank them.
  const tabsWithoutPlayers = ['home', 'pairs', 'bot', 'results', 'guide', 'watch', 'pairhist']
  const showEmpty = !loading && !players.length && !tabsWithoutPlayers.includes(tab)

  return (
    // Slate-relative stat colour, computed ONCE for the whole slate and read
    // through context by every card. A board with 300 rows would otherwise
    // re-rank the slate 300 times; more importantly, every surface shares one
    // set of cutoffs, so the same barrel rate can't be green on the HR board
    // and grey in the player's card. See lib/statline.js.
    <SlateScaleProvider players={allPlayers}>
      <MobileCSS />
      {/* The ember signature — same bar the night-receipts card wears. */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 400,
        background: 'linear-gradient(90deg, #f97316, #FCD34D 50%, #f97316)' }} />
      <Header tab={tab} setTab={setTab} dateLabel={dateLabel} mode={mode} setMode={setMode} results={results} players={allPlayers} games={headerGames} onRefresh={handleRefresh} refreshing={refreshing} />
      <main className="dashboard-main" style={{ maxWidth: 1300, margin: '0 auto', padding: '0 14px 28px' }}>
        {/* The Live Wire's heartbeat on every tab BUT the Scoreboard (which
            has the full panel) — live info dies when it needs visiting. */}
        {/* Loudest thing on the page when it fires, and silent otherwise:
            "you are looking at a slate that already happened". */}
        <StaleBanner slateDate={slateDate} mode={mode} loading={loading} />
        <MiniWire players={players} watchIds={watchIds} tab={tab} mode={mode} onGo={() => setTab('scoreboard')} onPlayerClick={setModalPlayer} />
        {/* One beginner paragraph per tab — auto-opens on first visit,
            collapses to a pill forever after. The answer to "looks nice
            but I don't know what I'm looking at." */}
        <TabExplainer tab={tab} />
        <Controls query={query} setQuery={setQuery} team={team} setTeam={setTeam} players={allPlayers} />

        {loading ? (
          <Empty text="Loading slate data…" />
        ) : showEmpty ? (
          <Empty text="No players found. The slate may not be built yet — check back after the next scheduled run." />
        ) : (
          <div key={tab} className="tab-fade">
            {tab === 'home'        && <Home players={allPlayers} results={results} backtest={backtest} mode={mode} slateDate={slateDate} dateLabel={dateLabel} onNavigate={setTab} onPlayerClick={setModalPlayer} />}
            {tab === 'derby'       && <Derby players={players} results={resultsForSlate} slateDate={slateDate} onPlayerClick={setModalPlayer} />}
            {tab === 'games'       && <Games players={players} slateDate={slateDate} pairHistorySummary={pairSummary} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'atplate'     && <AtThePlate players={allPlayers} watchIds={watchIds} mode={mode} slateMode={mode} onPlayerClick={setModalPlayer} />}
            {tab === 'board'       && <HitsHRR players={players} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {/* Power = Longest + Due merged; 'due' kept as alias route. */}
            {tab === 'longest'     && <PowerTab players={players} slateDate={slateDate} results={resultsForSlate} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'due'         && <PowerTab players={players} slateDate={slateDate} results={resultsForSlate} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} initial="due" />}
            {tab === 'pairhist'    && <PairHistory summary={pairSummary} players={allPlayers} onPlayerClick={setModalPlayer} />}
            {tab === 'player'      && <PlayerBoard players={players} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} />}
            {/* 'hitshrr' merged into 'board' — route kept as alias for old links */}
            {tab === 'hitshrr'     && <HitsHRR players={players} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'scoreboard'  && <Scoreboard players={players} mode={mode} slateDate={slateDate} results={results} backtest={backtest} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} onNavigate={setTab} />}
            {tab === 'pools'       && <Pools players={players} results={resultsForSlate} pairBuilder={pairBuilder} pairHistorySummary={pairSummary} onPlayerClick={setModalPlayer} />}
            {tab === 'leaders'     && <Leaders players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'pairs'      && <Pairs players={allPlayers} pairBuilder={pairBuilder} pairHistorySummary={pairSummary} results={resultsForSlate} focusPlayerId={focusPlayerId} onClearFocus={clearFocus} onPlayerClick={setModalPlayer} />}
            {tab === 'bot'        && <Bot players={allPlayers} onPlayerClick={handleBotPlayerClick} />}
            {tab === 'pitchers'   && <Pitchers players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'results'     && <Results results={results} backtest={backtest} players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'watch'       && <Watchlist items={watchLive} players={allPlayers} pairSummary={pairSummary} results={results} slateDate={slateDate} mode={mode} onWatch={toggleWatch} onAdd={addSlip} onPlayerClick={setModalPlayer} />}
            {tab === 'spray'       && <SprayBoard players={players} slateMode={mode} onPlayerClick={setModalPlayer} />}
            {tab === 'guide'       && <Guide />}
          </div>
        )}
        {/* THE DISCLAIMER (2026-08-08, Donovan: "make sure we know it's all
            not financial advice, just stats") — every tab, every visit. */}
        <div style={{
          fontSize: 9, color: C.text3, textAlign: 'center', lineHeight: 1.6,
          padding: '18px 12px 10px', borderTop: `1px solid ${C.border}`, marginTop: 18,
        }}>
          MOONSHOT is stats and analysis for entertainment — measured data, graded in public.
          It is <b style={{ color: C.text2 }}>not financial, betting, or investment advice</b>, and
          nothing here is a recommendation to wager. If you bet, that&apos;s your decision and your
          responsibility — play responsibly.
        </div>
      </main>
      {/* ⌘K / "/" from anywhere → jump to any player's modal. */}
      <QuickSearch players={allPlayers} onPick={setModalPlayer} />
      <Slip slip={slip} setSlip={setSlip} />
      {/* slateMode is passed EXPLICITLY, not left to the module-level default
          in dataSource.js. That default is set by an effect, so flipping
          Today↔Tomorrow with a card open changed the global without changing
          any component's effect deps — the detail fetches never re-ran and you
          kept looking at the other slate's spray chart, splits and arsenal.
          Threaded as a prop it's in the deps array, so a mode flip refetches. */}
      <PlayerModal
        player={modalPlayer}
        slateMode={mode}
        onClose={() => setModalPlayer(null)}
        onAdd={addSlip}
        onWatch={toggleWatch}
        watched={modalPlayer ? watchIds.has(playerId(modalPlayer)) : false}
        // ‹ › inside the modal walk THE LIST ON SCREEN, in its order — the
        // filtered/searched slate, not the raw payload — so the arrows follow
        // whatever you were actually reading. The search inside the modal
        // reaches the same list.
        peers={players}
        onNavigate={setModalPlayer}
      />
    </SlateScaleProvider>
  )
}
