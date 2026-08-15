'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '../lib/theme'
import { fetchJSON, normalizeData, groupGames, slateLooksReal, slateDateFromRows } from '../lib/data'
import { slatePaths, resultsPaths, pairBuilderPaths, pairSummaryPaths, backtestPaths, oddsPaths, gradedResultsUrl, setSlateMode } from '../lib/dataSource'
import { nameOf, teamOf, oppOf, clean, playerId, obj } from '../lib/player'
import { fetchLiveSlate } from '../lib/liveSlate'
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
import MyPicks from './tabs/MyPicks'
import TruePrice from './tabs/TruePrice'
import Guide from './tabs/Guide'
import Games from './tabs/Games'
import Boxes from './tabs/Boxes'
import Runs from './tabs/Runs'
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
import OddsBoard from './tabs/OddsBoard'
import Pitchers from './tabs/Pitchers'
import QuickSearch from './QuickSearch'
import { SlateScaleProvider } from '../lib/statline'

const WATCH_KEY = 'mlb_watchlist_v1'

// Tabs that read no slate data and must render even when tonight's card
// hasn't been built. See the gate below.
const SLATE_FREE = new Set(['trueprice', 'boxes'])

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
  const [datedResults, setDatedResults] = useState(null)
  const [odds, setOdds] = useState(null)
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
      // The slate is the one payload with a validity test: a 200 carrying six
      // rows from a game two weeks ago must not beat the real slate sitting
      // behind it in the fallback list. See lib/data.js.
      fetchJSON(paths, slateLooksReal).then((j) => { if (alive) setData(j) }),
      fetchJSON(resultsPaths()).then((j) => { if (alive) setResults(j) }),
      // No validator: no odds file is the normal state until a key is set.
      fetchJSON(oddsPaths()).then((j) => { if (alive) setOdds(j) }),
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
    // KEEP THE SPORT KEY. This effect rebuilds the hash from scratch, so it
    // used to delete #sport= on mount — which broke every NFL deep link before
    // SportRoot ever got to read it. Anything else in the hash is this
    // dashboard's own business; sport is not.
    try {
      const prev = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      const sp = prev.get('sport')
      if (sp) h.set('sport', sp)
    } catch { /* ignore */ }
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

  // ⭐ LAST NIGHT'S WATCHLIST DOESN'T SURVIVE THE NIGHT (2026-08-11, Donovan:
  // "the watchlist doesn't clear over at night, it shows the people you had on
  // there last night").
  //
  // WATCH_KEY stores whole player OBJECTS, and playerId is the COMPOSITE
  // `${player_id}-${game_pk}` (lib/player.js:72) — man PLUS game. So a name
  // starred last night is stored against last night's game_pk, and that breaks
  // twice over:
  //
  //   1. it renders, carrying last night's opponent, starter and line — which
  //      is the symptom Donovan saw, a finished game presented as tonight's;
  //   2. worse and silently, its key can never match tonight's row for the
  //      same hitter, so re-starring him looks like a no-op and the ★ never
  //      appears where it should.
  //
  // Pruned against the SLATE rather than against a clock: an entry survives
  // only while its game is still on the published board. That needs no date
  // stamp, so it also fixes entries already saved by older builds, and it
  // rolls over correctly at midnight without caring what the local date did —
  // the same reason liveSlate now spans yesterday..today.
  //
  // GUARDED on a non-empty slate. players is [] on first paint and on any
  // failed fetch, and pruning against an empty board would silently erase the
  // whole watchlist — a destructive, unrecoverable answer to a network blip.
  // DELAYED KEEPS ITS STAR, POSTPONED LOSES IT (2026-08-11, Donovan:
  // "delayed is good, postponed of not going to play remove").
  //
  // The two look identical to the slate — a postponed game stays on the
  // published board all night, because the board was built before the rain —
  // so "is his game still listed" cannot tell them apart. It has to come off
  // the league's own status, which liveSlate already separates: `delayed` is
  // a game that WILL be played (its picks are still live and the star is still
  // worth having), `postponed`/`suspended` are not finishing tonight.
  //
  // fetchLiveSlate is the module-level cached snapshot MiniWire already polls,
  // so this joins that cache rather than adding a request.
  useEffect(() => {
    if (!allPlayers?.length || !watch.length) return
    let alive = true
    fetchLiveSlate().then((snap) => {
      if (!alive) return
      const onSlate = new Set(allPlayers.map((p) => clean(p?.game_pk, '')).filter(Boolean))
      if (!onSlate.size) return
      // Only games the league says are wiped for tonight. A snapshot that
      // failed to load leaves this empty, which degrades to "prune by slate
      // only" rather than to a wrongly-emptied list.
      const dead = new Set((snap?.games || [])
        .filter((g) => g.postponed || g.suspended)
        .map((g) => String(g.pk)))
      const kept = watch.filter((p) => {
        const pk = clean(p?.game_pk, '')
        return onSlate.has(pk) && !dead.has(String(pk))
      })
      if (kept.length === watch.length) return
      setWatch(kept)
      try { localStorage.setItem(WATCH_KEY, JSON.stringify(kept)) } catch { /* ignore */ }
    }).catch(() => { /* a failed snapshot must never clear the list */ })
    return () => { alive = false }
  }, [allPlayers, watch])

  const watchIds = useMemo(() => new Set(watch.map(playerId)), [watch])

  const addSlip = (p, bet) => setSlip((s) => [...s, { p, bet }])

  // Jump to Pairs focused on a player. This USED TO BE what every click on
  // the Bot tab did, including on the Picks board — 2026-08-11, Donovan:
  // "when i click on a player in there it take me to pairs". On a picks page
  // the click means "tell me about this hitter", and every other tab on the
  // site answers that by opening the card. Being the one exception made it
  // read as a misfire rather than a shortcut. Kept as its own handler so the
  // Pairs jump stays available where it IS the point.
  const goToPairsFor = (p) => {
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
  // A payload with no `date` at all is exactly what a broken publish looks
  // like, and the staleness check was reading only that field — so the one
  // failure it exists to catch would have slipped past it silently. Falling
  // back to the newest game_time means the banner can still tell you which
  // night you're actually looking at.
  const slateDate = clean(obj(data).date || obj(data).slate_date, '') || slateDateFromRows(data)
  const slateIsReal = !data || slateLooksReal(data)
  // FALLBACK TO THE DATED FILE WHEN results_live.json GOES STALE.
  //
  // 2026-08-15: the branch was serving results_live.json dated 2026-07-26
  // while graded_results_2026-08-14.json sat next to it, current. The grader's
  // FINAL step publishes the dated file and is healthy; its LIVE step writes
  // results_live.json and had stopped refreshing it. Everything keyed on
  // `resultsForSlate` — Home's pulse, Pools, Pairs, the watch ledger, My Picks
  // — date-gates against that stale file and correctly resolves to null, so
  // the whole site quietly showed no results at all while a perfectly good
  // graded file was one URL away.
  //
  // The site can't fix the publish, but it does not have to depend on it. When
  // the live file's date doesn't match the slate, fetch the slate's own dated
  // file. Identical shape (see gradedResultsUrl's comment), so it drops in.
  const liveMatchesSlate =
    !slateDate || !clean(results?.date, '') || results.date === slateDate
  const resultsForSlate = liveMatchesSlate
    ? results
    : (clean(datedResults?.date, '') === slateDate ? datedResults : null)
  // EVERY CONSUMER TAKES THE GATED COPY. The one exception is the Results tab,
  // whose day picker owns its own dates. This used to be three exceptions:
  // Header rendered "HR capture 78% · 14/18 — how many of tonight's home runs
  // were on the sheet" straight off the raw file, so on a stale-publish day the
  // sticky bar announced a two-week-old capture rate on every tab while the
  // rest of the site correctly showed nothing. Scoreboard's Gone Yard did the
  // same and then ranked those homers against TONIGHT's board. Watchlist wrote
  // the stale night into a persistent local ledger under today's date.
  //
  // Keyed on what we've ALREADY asked for, not on what came back. Gating on
  // datedResults.date instead would refetch forever the moment the branch
  // serves a file whose own date doesn't match the name it's published under
  // — which is exactly the class of failure this fallback exists because of.
  const datedAsked = useRef(null)
  useEffect(() => {
    // Only when the live file is actually stale — a healthy branch never pays
    // for this request.
    if (!slateDate || liveMatchesSlate) {
      datedAsked.current = null
      setDatedResults(null)
      return
    }
    const want = `${slateDate}#${refreshKey}`
    if (datedAsked.current === want) return
    datedAsked.current = want
    let alive = true
    fetch(gradedResultsUrl(slateDate), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setDatedResults(j || null) })
      .catch(() => { if (alive) setDatedResults(null) })
    return () => { alive = false }
  }, [slateDate, liveMatchesSlate, refreshKey])

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
      <Header tab={tab} setTab={setTab} dateLabel={dateLabel} mode={mode} setMode={setMode} results={resultsForSlate} players={allPlayers} games={headerGames} onRefresh={handleRefresh} refreshing={refreshing} />
      <main className="dashboard-main" style={{ maxWidth: 1300, margin: '0 auto', padding: '0 14px 28px' }}>
        {/* The Live Wire's heartbeat on every tab BUT the Scoreboard (which
            has the full panel) — live info dies when it needs visiting. */}
        {/* Loudest thing on the page when it fires, and silent otherwise:
            "you are looking at a slate that already happened". */}
        <StaleBanner slateDate={slateDate} mode={mode} loading={loading} truncated={!slateIsReal} games={groupGames(allPlayers).length} />
        <MiniWire players={players} watchIds={watchIds} tab={tab} mode={mode} onGo={() => setTab('scoreboard')} onPlayerClick={setModalPlayer} />
        {/* One beginner paragraph per tab — auto-opens on first visit,
            collapses to a pill forever after. The answer to "looks nice
            but I don't know what I'm looking at." */}
        <TabExplainer tab={tab} />
        <Controls query={query} setQuery={setQuery} team={team} setTeam={setTeam} players={allPlayers} />

        {/* SLATE-FREE TABS (2026-08-15). Every tab used to sit behind the
            slate: no slate, no page. True Price doesn't read the slate at
            all — it's a season of settled prices — so gating it meant the
            one surface that still has something to say on a dark day, an
            off-season morning, or during a slate outage was the one showing
            "Loading slate data…". Anything else that genuinely doesn't
            depend on tonight's card belongs in this set too. */}
        {loading && !SLATE_FREE.has(tab) ? (
          <Empty text="Loading slate data…" />
        ) : showEmpty && !SLATE_FREE.has(tab) ? (
          <Empty text="No players found. The slate may not be built yet — check back after the next scheduled run." />
        ) : (
          <div key={tab} className="tab-fade">
            {/* resultsForSlate, NOT results (2026-08-09 audit). Home's pulse line
                counts "balls already left a yard tonight" straight out of the
                results payload, and results_live.json holds the LAST graded
                slate until a new one starts — it was serving July 26 today.
                Ungated, the front page would announce a fortnight-old homer
                count as tonight's. Every other consumer already uses the
                date-gated copy. */}
            {tab === 'home'        && <Home players={allPlayers} results={resultsForSlate} backtest={backtest} mode={mode} slateDate={slateDate} dateLabel={dateLabel} onNavigate={setTab} onPlayerClick={setModalPlayer} />}
            {tab === 'derby'       && <Derby players={players} results={resultsForSlate} slateDate={slateDate} onPlayerClick={setModalPlayer} />}
            {tab === 'games'       && <Games players={players} allPlayers={allPlayers} slateDate={slateDate} pairHistorySummary={pairSummary} results={resultsForSlate} odds={odds} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'runs'        && <Runs players={allPlayers} onPlayerClick={setModalPlayer} />}
            {tab === 'boxes'       && <Boxes players={allPlayers} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'atplate'     && <AtThePlate players={allPlayers} watchIds={watchIds} mode={mode} slateMode={mode} onPlayerClick={setModalPlayer} />}
            {tab === 'board'       && <HitsHRR players={players} allPlayers={allPlayers} odds={odds} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} slateDate={slateDate} />}
            {/* Power = Longest + Due merged; 'due' kept as alias route. */}
            {tab === 'longest'     && <PowerTab players={players} slateDate={slateDate} results={resultsForSlate} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} />}
            {tab === 'due'         && <PowerTab players={players} slateDate={slateDate} results={resultsForSlate} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} initial="due" />}
            {tab === 'pairhist'    && <PairHistory summary={pairSummary} players={allPlayers} onPlayerClick={setModalPlayer} />}
            {tab === 'player'      && <PlayerBoard players={players} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} odds={odds} />}
            {/* 'hitshrr' merged into 'board' — route kept as alias for old links */}
            {tab === 'hitshrr'     && <HitsHRR players={players} allPlayers={allPlayers} onAdd={addSlip} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} slateDate={slateDate} />}
            {tab === 'scoreboard'  && <Scoreboard players={players} mode={mode} slateDate={slateDate} results={resultsForSlate} backtest={backtest} odds={odds} onWatch={toggleWatch} watchIds={watchIds} onPlayerClick={setModalPlayer} onNavigate={setTab} />}
            {tab === 'pools'       && <Pools players={players} results={resultsForSlate} pairBuilder={pairBuilder} pairHistorySummary={pairSummary} onPlayerClick={setModalPlayer} />}
            {tab === 'leaders'     && <Leaders players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'pairs'      && <Pairs players={allPlayers} pairBuilder={pairBuilder} pairHistorySummary={pairSummary} results={resultsForSlate} focusPlayerId={focusPlayerId} onClearFocus={clearFocus} onPlayerClick={setModalPlayer} />}
            {tab === 'bot'        && <Bot players={allPlayers} onPlayerClick={setModalPlayer} onGoPairs={goToPairsFor} odds={odds} />}
            {tab === 'odds'       && <OddsBoard players={players} odds={odds} onPlayerClick={setModalPlayer} />}
            {tab === 'mypicks'    && <MyPicks players={allPlayers} results={resultsForSlate} odds={odds} slateDate={slateDate} onPlayerClick={setModalPlayer} />}
            {tab === 'trueprice'  && <TruePrice onPlayerClick={setModalPlayer} />}
            {tab === 'pitchers'   && <Pitchers players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'results'     && <Results results={results} backtest={backtest} players={players} onPlayerClick={setModalPlayer} />}
            {tab === 'watch'       && <Watchlist items={watchLive} players={allPlayers} pairSummary={pairSummary} results={resultsForSlate} slateDate={slateDate} mode={mode} onWatch={toggleWatch} onAdd={addSlip} onPlayerClick={setModalPlayer} />}
            {tab === 'spray'       && <SprayBoard players={players} slateMode={mode} onPlayerClick={setModalPlayer} />}
            {tab === 'guide'       && <Guide onNavigate={setTab} />}
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
        odds={odds}
      />
    </SlateScaleProvider>
  )
}
