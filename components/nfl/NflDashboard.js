'use client'
import { useEffect, useRef, useState } from 'react'
import { C } from '../../lib/nfl/theme'
import { fetchNfl, nflSlatePaths, nflReportPaths, nflMetaPaths, nflMatchupPaths, nflLogPaths, nflPicksPaths, nflResultsPaths, nflOddsPaths, nflOddsStatusPaths, nflSlateLooksReal, nflMatchupLooksReal, nflPicksLooksReal, nflOddsLooksReal } from '../../lib/nfl/dataSource'
import { initialHashParams } from '../../lib/sport'
import NflHeader from './NflHeader'
import NflPlayerModal from './NflPlayerModal'
import MobileCSS from '../MobileCSS'

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

const NFL_TABS = new Set(['home', 'games', 'picks', 'boards', 'players', 'watchlist', 'research', 'matchups', 'report', 'accountability', 'pairs', 'guide'])

// The NFL shell. Thin on purpose — state and routing only, same as the MLB
// Dashboard. Everything with an opinion lives in a tab file.
//
// Polls slower than the MLB side by design: baseball reprices every half
// inning, football gives you one slate a week and three score changes an hour.
// 45s while anything is live, 10 minutes otherwise.

export default function NflDashboard() {
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
  const [odds, setOdds] = useState(null)
  const [oddsStatus, setOddsStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)      // { player, market }
  const [refreshKey, setRefreshKey] = useState(0)

  const setTab = (next) => {
    if (!NFL_TABS.has(next)) return
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
    setTab(NFL_TABS.has(t) ? t : 'home')
  }, [])

  // Keep manually edited hashes and browser-driven hash changes in sync with
  // the visible NFL panel. replaceState navigation above deliberately does
  // not add a history entry for every tab click.
  useEffect(() => {
    const readHash = () => {
      try {
        const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
        const next = hash.get('tab')
        if (hash.get('sport') === 'nfl' && NFL_TABS.has(next)) setTabRaw(next)
      } catch { /* ignore malformed hashes */ }
    }
    window.addEventListener('hashchange', readHash)
    return () => window.removeEventListener('hashchange', readHash)
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
      fetchNfl(nflOddsPaths(), nflOddsLooksReal).then((j) => { if (alive) setOdds(j) }),
      // No validator, same reasoning as nflResultsPaths above: no_key/empty
      // is a normal, well-labelled status state, not a bad payload to reject.
      fetchNfl(nflOddsStatusPaths()).then((j) => { if (alive) setOddsStatus(j) }),
    ]).then(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refreshKey])

  useEffect(() => {
    const live = (data?.games || []).some((g) => g.state === 'in')
    const id = setInterval(() => setRefreshKey((k) => k + 1), live ? 45_000 : 10 * 60_000)
    return () => clearInterval(id)
  }, [data])

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
      <NflHeader tab={tab} setTab={setTab} data={data} meta={meta} />
      <main className="dashboard-main"
            style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 14px 40px' }}>
        {loading ? (
          <div style={{
            border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
            textAlign: 'center', color: C.text3, fontSize: 12.5,
          }}>Loading slate…</div>
        ) : (
          <>
            {tab === 'home' && <Home data={data} picks={picks} results={nflResults} matchup={matchup} logs={logs} onPlayerClick={openPlayer} setTab={setTab} />}
            {tab === 'players' && <StatPortal data={data} logs={logs} matchup={matchup} />}
            {tab === 'watchlist' && <Watchlist data={data} onPlayerClick={openPlayer} />}
            {tab === 'games' && <Games data={data} picks={picks} matchup={matchup} onPlayerClick={openPlayer} />}
            {tab === 'boards' && <Boards data={data} logs={logs} onPlayerClick={openPlayer} odds={odds} oddsStatus={oddsStatus} />}
            {tab === 'research' && <Research data={data} onPlayerClick={openPlayer} />}
            {tab === 'matchups' && <Matchups matchup={matchup} data={data} />}
            {tab === 'picks'    && <Picks picks={picks} results={nflResults} data={data} onPlayerClick={openPlayer} odds={odds} oddsStatus={oddsStatus} />}
            {tab === 'report' && <Report report={report} />}
            {tab === 'accountability' && <Accountability data={data} results={nflResults} onPlayerClick={openPlayer} />}
            {tab === 'pairs' && <Pairs data={data} results={nflResults} onPlayerClick={openPlayer} />}
            {tab === 'guide' && <Guide />}
          </>
        )}
      </main>
      <NflPlayerModal
        player={modal?.player}
        market={modal?.market}
        markets={data?.markets}
        splitMeta={{ pairs: data?.split_pairs, labels: data?.split_labels }}
        logs={logs}
        matchup={matchup}
        slate={data}
        onClose={() => setModal(null)}
        onFullProfile={openFullProfile}
      />
    </>
  )
}
