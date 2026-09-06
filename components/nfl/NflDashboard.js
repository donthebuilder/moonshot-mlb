'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveTab, pageTitle, NFL_TABS as NFL_TAB_KEYS } from '../../lib/routes'
import TabNotFound from '../TabNotFound'
import { C } from '../../lib/nfl/theme'
import { fetchNfl, nflSlatePaths, nflReportPaths, nflMetaPaths, nflMatchupPaths, nflLogPaths, nflPicksPaths, nflResultsPaths, nflOddsPaths, nflOddsStatusPaths, nflSlateLooksReal, nflMatchupLooksReal, nflPicksLooksReal, nflOddsLooksReal } from '../../lib/nfl/dataSource'
import { initialHashParams, setSport } from '../../lib/sport'
import { useNflLive } from '../../lib/nfl/useNflLive'
import { withLive } from '../../lib/nfl/liveMerge'
import NflHeader from './NflHeader'
import NflPlayerModal from './NflPlayerModal'
import MobileCSS from '../MobileCSS'
import MobileTabBarNfl from './MobileTabBarNfl'
import NflWire from './NflWire'
import TabExplainer from '../TabExplainer'
import { NFL_TEXTS } from './tabExplainerTexts'

import Home from './tabs/Home'
import StatPortal from './tabs/StatPortal'
import Watchlist from './tabs/Watchlist'
import Games from './tabs/Games'
import Boards from './tabs/Boards'
import Research from './tabs/Research'
import Matchups from './tabs/Matchups'
import Picks from './tabs/Picks'
import Report from './tabs/Report'
import Accountability from './tabs/Accountability'
import Pairs from './tabs/Pairs'
import Guide from './tabs/Guide'
import Live from './tabs/Live'
import Streaks from './tabs/Streaks'
import { liveOdds } from '../../lib/oddsFreshness'

// The key set now lives in lib/routes.js alongside MOONSHOT's, with the
// aliases that make each product answer to the other's words -- #tab=results
// and #tab=board and #tab=reportcard all used to land silently on Home here.
const NFL_TABS = new Set(NFL_TAB_KEYS)

// The NFL shell. Thin on purpose — state and routing only, same as the MLB
// Dashboard. Everything with an opinion lives in a tab file.
//
// Polls slower than the MLB side by design: baseball reprices every half
// inning, football gives you one slate a week and three score changes an hour.
// 45s while anything is live, 10 minutes otherwise.

// See the note on the same prop in components/Dashboard.js.
// eslint-disable-next-line no-unused-vars
export default function NflDashboard({ palettePass = 0 }) {
  const [tab, setTabRaw] = useState('home')
  const [data, setData] = useState(null)
  const [report, setReport] = useState(null)
  const [meta, setMeta] = useState(null)
  const [matchup, setMatchup] = useState(null)
  const [logs, setLogs] = useState(null)
  const [picks, setPicks] = useState(null)
  const [nflResults, setNflResults] = useState(null)
  // ODDS (2026-08-24). Fetched once here and passed down as props, same
  // pattern as every other data source on this page — NOT each tab doing its
  // own live self-fetch the way MLB's components/OddsStatus.js's
  // useOddsStatus() hook does, since that hook is hardcoded to MLB's fetch
  // helpers. Reusing OddsStatus's default export (a pure `status` ->
  // banner component) works fine without that hook; see
  // components/nfl/tabs/Boards.js and Picks.js.
  // Same freshness gate as MLB (lib/oddsFreshness.js): quotes older than
  // the stale window read as no quotes at all. NFL has no dedicated odds
  // tab needing the raw payload, so the gate is total here.
  const [oddsRaw, setOddsRaw] = useState(null)
  const odds = liveOdds(oddsRaw)
  const [oddsStatus, setOddsStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)      // { player, market }
  const [refreshKey, setRefreshKey] = useState(0)

  const [missingTab, setMissingTab] = useState('')
  const setTab = (next) => {
    if (!NFL_TABS.has(next)) return
    setMissingTab('')
    setTabRaw(next)
    try {
      const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      hash.set('sport', 'nfl')
      hash.set('tab', next)
      if (next !== 'players') hash.delete('player')
      window.history.replaceState(null, '', `#${hash.toString()}`)
    } catch { /* ignore URL failures; the tab still works */ }
  }

  // Deep links: #sport=nfl&tab=boards is a real address, same contract the
  // MLB side honours.
  const hashDone = useRef(false)
  useEffect(() => {
    if (hashDone.current) return
    hashDone.current = true
    // Prefer the live hash when switching sports without a reload, then fall
    // back to the module-load snapshot for a direct NFL deep link.
    let t = null
    try {
      const live = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      if (live.get('sport') === 'nfl') t = live.get('tab')
    } catch { /* ignore */ }
    if (!NFL_TABS.has(t)) t = initialHashParams().get('tab')
    const r = resolveTab('nfl', t)
    // An unknown tab is NOT quietly rewritten to Home any more. Somebody who
    // shared "here are the receipts" as #sport=nfl&tab=results was sending
    // people to the wrong page with no error at all -- that is finding 15.
    if (r.status === 'missing') setMissingTab(r.asked)
    else setTab(r.tab)
  }, [])

  // Keep manually edited hashes and browser-driven hash changes in sync with
  // the visible NFL panel. replaceState navigation above deliberately does
  // not add a history entry for every tab click.
  useEffect(() => {
    const readHash = () => {
      try {
        const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
        const sp = hash.get('sport')
        // A hash that names the other product is a sport switch, not noise:
        // the MLB shell has honoured this since its apply() grew setSport,
        // and a notification tapped from the football side can carry an
        // MLB url. lib/sport.js has no hashchange listener of its own.
        if (sp && sp !== 'nfl') { setSport(sp); return }
        if (sp !== 'nfl') return
        const r = resolveTab('nfl', hash.get('tab'))
        // Finding 16: this used to bail on anything not in the key set, so a
        // hash change to an unrecognised tab left the PREVIOUS panel rendered
        // while the address bar claimed otherwise. Every case answers now.
        if (r.status === 'missing') { setMissingTab(r.asked); return }
        setMissingTab('')
        if (r.status !== 'default') setTabRaw(r.tab)
      } catch { /* ignore malformed hashes */ }
    }
    window.addEventListener('hashchange', readHash)
    // public/sw.js posts the tapped notification's URL here after focusing
    // this tab. Only the MLB shell listened until 2026-09-05, so a TUDDY push
    // (pushRules.js sends people to #sport=nfl&tab=watchlist) tapped while
    // the football board was open focused the tab and went nowhere. Same
    // contract as components/Dashboard.js: write the hash, let readHash route.
    const fromWorker = (ev) => {
      const d = ev?.data
      if (!d || d.type !== 'dash-open' || typeof d.url !== 'string') return
      const i = d.url.indexOf('#')
      if (i < 0) return
      const next = d.url.slice(i)
      if (window.location.hash === next) readHash()
      else window.location.hash = next
    }
    navigator.serviceWorker?.addEventListener?.('message', fromWorker)
    return () => {
      window.removeEventListener('hashchange', readHash)
      navigator.serviceWorker?.removeEventListener?.('message', fromWorker)
    }
  }, [])

  useEffect(() => {
    let alive = true
    if (refreshKey === 0) setLoading(true)
    Promise.allSettled([
      fetchNfl(nflSlatePaths(), nflSlateLooksReal).then((j) => { if (alive) setData(j) }),
      fetchNfl(nflReportPaths()).then((j) => { if (alive) setReport(j) }),
      fetchNfl(nflMetaPaths()).then((j) => { if (alive) setMeta(j) }),
      fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).then((j) => { if (alive) setMatchup(j) }),
      fetchNfl(nflLogPaths()).then((j) => { if (alive) setLogs(j) }),
      fetchNfl(nflPicksPaths(), nflPicksLooksReal).then((j) => { if (alive) setPicks(j) }),
      // No validator: an absent results file is the normal state before
      // kickoff, and there is no committed snapshot to lose a race against.
      fetchNfl(nflResultsPaths()).then((j) => { if (alive) setNflResults(j) }),
      fetchNfl(nflOddsPaths(), nflOddsLooksReal).then((j) => { if (alive) setOddsRaw(j) }),
      // No validator, same reasoning as nflResultsPaths above: no_key/empty
      // is a normal, well-labelled status state, not a bad payload to reject.
      fetchNfl(nflOddsStatusPaths()).then((j) => { if (alive) setOddsStatus(j) }),
    ]).then(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refreshKey])

  // The bot payload only changes when the bot runs, so this poll is for the
  // bot's OUTPUT (a re-published card, graded results). The score on the
  // card comes from the league feed below, not from here -- until 2026-09-05
  // this 45s poll was the only thing behind a "live" score, and it re-read a
  // file that had not changed.
  useEffect(() => {
    const live = (data?.games || []).some((g) => g.state === 'in')
    const id = setInterval(() => setRefreshKey((k) => k + 1), live ? 3 * 60_000 : 10 * 60_000)
    const onVis = () => { if (!document.hidden) setRefreshKey((k) => k + 1) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [data])

  // The league feed, laid over the slate. Games/Home/Live/Watchlist read the
  // overlaid copy; everything with a score on it is now ESPN's score.
  const liveSnap = useNflLive(data)
  const slate = useMemo(() => withLive(data, liveSnap), [data, liveSnap])

  const openPlayer = (player, market = 'TD') => setModal({ player, market })
  const openFullProfile = (player) => {
    setModal(null)
    setTab('players')
    try {
      const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      hash.set('sport', 'nfl'); hash.set('tab', 'players'); hash.set('player', String(player.player_id))
      window.history.replaceState(null, '', `#${hash.toString()}`)
    } catch {}
  }

  return (
    <>
      <MobileCSS />
      {/* See the note in components/Dashboard.js -- same gap, same fix. */}
      <a className="skip-link" href="#board-main">Skip to the board</a>
      <NflHeader tab={tab} setTab={setTab} data={data} meta={meta} />
      <main id="board-main" className="dashboard-main"
            style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 14px 40px' }}>
        <h1 className="sr-only">{pageTitle('nfl', missingTab ? 'home' : tab)}</h1>
        {!missingTab && !loading && <TabExplainer tab={tab} texts={NFL_TEXTS} storageKey="tab_explained_nfl" accent={C.green} />}
        {missingTab ? (
          <TabNotFound
            asked={missingTab}
            sport="nfl"
            palette={C}
            onNavigate={setTab}
            doors={[['home', '🏠 HOME'], ['live', '🏈 LIVE'], ['picks', '🎯 PICKS'], ['boards', '📊 BOARDS'], ['accountability', '🧾 RESULTS'], ['report', '📋 REPORT CARD'], ['guide', '📖 GUIDE']]}
          />
        ) : loading ? (
          <div style={{
            border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
            textAlign: 'center', color: C.text3, fontSize: 12.5,
          }}>Loading slate…</div>
        ) : (
          <>
            {tab === 'home' && <Home data={slate} picks={picks} results={nflResults} matchup={matchup} logs={logs} onPlayerClick={openPlayer} setTab={setTab} />}
            {tab === 'players' && <StatPortal data={data} logs={logs} matchup={matchup} />}
            {tab === 'watchlist' && <Watchlist data={slate} onPlayerClick={openPlayer} />}
            {tab === 'games' && <Games data={slate} picks={picks} matchup={matchup} onPlayerClick={openPlayer} />}
            {tab === 'boards' && <Boards data={data} logs={logs} onPlayerClick={openPlayer} odds={odds} oddsStatus={oddsStatus} />}
            {tab === 'research' && <Research data={data} onPlayerClick={openPlayer} />}
            {tab === 'matchups' && <Matchups matchup={matchup} data={data} />}
            {tab === 'picks'    && <Picks picks={picks} results={nflResults} data={data} onPlayerClick={openPlayer} odds={odds} oddsStatus={oddsStatus} />}
            {tab === 'report' && <Report report={report} />}
            {tab === 'accountability' && <Accountability data={data} results={nflResults} onPlayerClick={openPlayer} />}
            {tab === 'pairs' && <Pairs data={data} results={nflResults} onPlayerClick={openPlayer} />}
            {tab === 'guide' && <Guide onNavigate={setTab} data={data} />}
            {tab === 'live' && <Live data={slate} picks={picks} live={liveSnap} onPlayerClick={openPlayer} setTab={setTab} />}
            {tab === 'streaks' && <Streaks data={data} logs={logs} onPlayerClick={openPlayer} />}
          </>
        )}
      </main>
      <MobileTabBarNfl tab={tab} setTab={setTab} data={slate} />
      {/* The live wire. Renders nothing until something actually happens to
          one of your names, and polls nothing unless a game is in progress or
          about to start — see components/nfl/NflWire.js. */}
      <NflWire data={slate} onPlayerClick={openPlayer} />
      <NflPlayerModal
        player={modal?.player}
        market={modal?.market}
        markets={data?.markets}
        splitMeta={{ pairs: data?.split_pairs, labels: data?.split_labels }}
        logs={logs}
        matchup={matchup}
        slate={slate}
        picks={picks}
        results={nflResults}
        onClose={() => setModal(null)}
        onFullProfile={openFullProfile}
      />
    </>
  )
}
