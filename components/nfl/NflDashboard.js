'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveTab, pageTitle, NFL_TABS as NFL_TAB_KEYS } from '../../lib/routes'
import { usePageTitle } from '../../lib/usePageTitle'
import ErrorBoundary from '../ErrorBoundary'
import TabNotFound from '../TabNotFound'
import { C, NUM_FONT } from '../../lib/nfl/theme'
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
import Touchdowns from './tabs/Touchdowns'
import Research from './tabs/Research'
import Matchups from './tabs/Matchups'
import Explosive from './tabs/Explosive'
import Numerology from './tabs/Numerology'
import Picks from './tabs/Picks'
import Report from './tabs/Report'
import Accountability from './tabs/Accountability'
import TuddyLedger from './tabs/TuddyLedger'
import BoxScores from './tabs/BoxScores'
import Scores from './tabs/Scores'
import Pairs from './tabs/Pairs'
import Guide from './tabs/Guide'
import Live from './tabs/Live'
import Streaks from './tabs/Streaks'
import Leaders from './tabs/Leaders'
import Storylines from './tabs/Storylines'
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
// ── IS THIS WEEK'S BOARD? (2026-09-24 audit, UX-8 / rule 25) ───────────────
// TUDDY had no equivalent of MOONSHOT's StaleBanner. When the football
// pipeline fails, lib/nfl/dataSource.js quietly serves the committed
// snapshot (public/data/nfl/week.json, an August preseason build) or the last
// good branch copy, and the page renders it under this week's header with no
// warning. The BUILT pill in the header says the age if you hover it; a
// board that is a week old on a Sunday needs to say so out loud.
function NflStaleBanner({ meta, data, loading }) {
  if (loading) return null
  const raw = meta?.built_at || data?.built_at || ''
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return null
  const ageH = (Date.now() - t) / 36e5
  const preseason = String(data?.mode || '') && String(data?.mode) !== 'week'
  if (ageH < 48 && !preseason) return null
  const days = Math.floor(ageH / 24)
  const loud = ageH >= 24 * 7 || preseason
  const when = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div role="status" style={{
      margin: '0 0 12px', padding: '10px 14px', borderRadius: 10,
      border: `1px solid ${loud ? C.orange : C.border2}`, background: loud ? 'rgba(249,115,22,.08)' : C.bg2,
      color: C.text2, fontSize: 12, lineHeight: 1.5,
    }}>
      <b style={{ color: loud ? C.orange : C.text, fontFamily: NUM_FONT, letterSpacing: '.04em' }}>
        {preseason ? 'PRESEASON BOARD' : 'BOARD DATA DELAYED'}
      </b>
      {' \u00b7 '}
      {preseason
        ? `This is a preseason build from ${when}, not this week\u2019s slate. The football pipeline has not published a regular-season board yet.`
        : `The last football build landed ${days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.round(ageH)}h`} ago (${when}). Everything on TUDDY is from that run until the next one lands.`}
    </div>
  )
}

export default function NflDashboard({ palettePass = 0 }) {
  const [tab, setTabRaw] = useState('home')
  usePageTitle(`${pageTitle('nfl', tab)} \u00b7 DASH Network`)
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
  // THIS WEEK / NEXT WEEK (2026-09-18) -- MOONSHOT's own today/tomorrow state,
  // worded for football. 'next' swaps the four week-scoped payloads for the
  // bot's look-ahead build (lib/nfl/dataSource.js); the graded record, the
  // report card and the live feed stay on this week, because a week that
  // hasn't happened has no results and nothing live in it.
  const [weekMode, setWeekMode] = useState('this')

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
    // 2026-09-24 audit (NAV-6): every NFL link on /called and every TD card
    // carried `p=<gsis>` -- MLB's parameter -- and this shell only read
    // `player=` on tab=players, so a shared touchdown never opened the man.
    // Normalise `p=` into the address the player file understands before
    // the tab is resolved.
    try {
      const live = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      const snap = initialHashParams()
      const p = live.get('p') || snap.get('p')
      const isNfl = (live.get('sport') || snap.get('sport')) === 'nfl'
      if (isNfl && p && !live.get('player')) {
        live.set('sport', 'nfl'); live.set('tab', 'players'); live.set('player', p); live.delete('p')
        window.history.replaceState(null, '', `#${live.toString()}`)
      }
    } catch { /* ignore */ }
    // Prefer the live hash when switching sports without a reload, then fall
    // back to the module-load snapshot for a direct NFL deep link.
    //
    // THE LIVE HASH ANSWERS WHEN IT NAMES TUDDY (2026-09-25, the navigation
    // pass). `if (!NFL_TABS.has(t)) t = snapshot` meant a sport switch INTO
    // TUDDY from a page TUDDY does not have (LAMP's Schedule, Standings,
    // Teams, a Game) -- where lib/sport.js has already deleted the tab and
    // written #sport=nfl -- fell through to the tab the page LOADED with and
    // printed NO SUCH TAB schedule under an address that says This week.
    // Measured live. The snapshot is only for a cold open the MLB shell may
    // have rewritten before this shell mounted: when the live hash does not
    // name TUDDY, or names it with a word TUDDY cannot resolve at all while
    // the snapshot carries one it can. Same change in LampDashboard.
    let t = null
    let liveIsUs = false
    try {
      const live = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      if (live.get('sport') === 'nfl') { liveIsUs = true; t = live.get('tab') }
    } catch { /* ignore */ }
    const snapTab = initialHashParams().get('tab')
    if (!liveIsUs) t = snapTab
    else if (t && resolveTab('nfl', t).status === 'missing' && snapTab && resolveTab('nfl', snapTab).status !== 'missing') t = snapTab
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
        // No tab = Home (2026-09-26, same rule as LAMP and MOONSHOT), unless
        // the hash only names a player, which opens him where you are.
        if (r.status !== 'default' || !(hash.get('player') || hash.get('p'))) setTabRaw(r.tab)
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
      fetchNfl(nflSlatePaths(weekMode), nflSlateLooksReal).then((j) => { if (alive) setData(j) }),
      fetchNfl(nflReportPaths()).then((j) => { if (alive) setReport(j) }),
      fetchNfl(nflMetaPaths()).then((j) => { if (alive) setMeta(j) }),
      fetchNfl(nflMatchupPaths(weekMode), nflMatchupLooksReal).then((j) => { if (alive) setMatchup(j) }),
      fetchNfl(nflLogPaths(weekMode)).then((j) => { if (alive) setLogs(j) }),
      fetchNfl(nflPicksPaths(weekMode), nflPicksLooksReal).then((j) => { if (alive) setPicks(j) }),
      // No validator: an absent results file is the normal state before
      // kickoff, and there is no committed snapshot to lose a race against.
      fetchNfl(nflResultsPaths()).then((j) => { if (alive) setNflResults(j) }),
      fetchNfl(nflOddsPaths(), nflOddsLooksReal).then((j) => { if (alive) setOddsRaw(j) }),
      // No validator, same reasoning as nflResultsPaths above: no_key/empty
      // is a normal, well-labelled status state, not a bad payload to reject.
      fetchNfl(nflOddsStatusPaths()).then((j) => { if (alive) setOddsStatus(j) }),
    ]).then(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refreshKey, weekMode])

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
  // The card's peer list: everyone playing, ranked by the market the card is
  // showing, so ‹ › walks from a better name to a worse one rather than
  // through payload order. Recomputed only when the slate or that market
  // changes, not on every render of an open card.
  const modalPeers = useMemo(() => {
    const mk = modal?.market || 'TD'
    return (slate?.players || [])
      .filter((p) => !p.on_bye && Number.isFinite(p?.scores?.[mk]))
      .sort((a, b) => (b.scores[mk] - a.scores[mk]))
  }, [slate, modal?.market])
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
      <NflHeader tab={tab} setTab={setTab} data={data} meta={meta} matchup={matchup} weekMode={weekMode} setWeekMode={setWeekMode} onPlayerClick={openPlayer} />
      <main id="board-main" className="dashboard-main"
            style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 14px 40px' }}>
        <h1 className="sr-only">{pageTitle('nfl', missingTab ? 'home' : tab)}</h1>
        <NflStaleBanner meta={meta} data={data} loading={loading} />
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
          <ErrorBoundary resetKey={tab} label={`the ${tab} tab`}>
            {tab === 'home' && <Home data={slate} picks={picks} results={nflResults} matchup={matchup} logs={logs} onPlayerClick={openPlayer} setTab={setTab} />}
            {tab === 'players' && <StatPortal data={data} logs={logs} matchup={matchup} />}
            {tab === 'watchlist' && <Watchlist data={slate} matchup={matchup} logs={logs} onPlayerClick={openPlayer} />}
            {tab === 'games' && <Games data={slate} picks={picks} matchup={matchup} logs={logs} results={nflResults} onPlayerClick={openPlayer} />}
            {tab === 'touchdowns' && <Touchdowns data={slate} matchup={matchup} odds={odds} onPlayerClick={openPlayer} oddsStatus={oddsStatus} />}
            {tab === 'boards' && <Boards data={data} logs={logs} matchup={matchup} onPlayerClick={openPlayer} odds={odds} oddsStatus={oddsStatus} />}
            {tab === 'research' && <Research data={data} onPlayerClick={openPlayer} />}
            {tab === 'matchups' && <Matchups matchup={matchup} data={data} />}
            {tab === 'explosive' && <Explosive matchup={matchup} data={data} onPlayerClick={openPlayer} />}
            {tab === 'numerology' && <Numerology data={data} />}
            {tab === 'picks'    && <Picks picks={picks} results={nflResults} data={data} matchup={matchup} onPlayerClick={openPlayer} odds={odds} oddsStatus={oddsStatus} logs={logs} />}
            {tab === 'report' && <Report report={report} />}
            {tab === 'accountability' && <Accountability data={data} results={nflResults} onPlayerClick={openPlayer} />}
            {tab === 'tuddyledger' && <TuddyLedger data={data} results={nflResults} onPlayerClick={openPlayer} />}
            {tab === 'boxscores' && <BoxScores data={data} onPlayerClick={openPlayer} />}
            {tab === 'scores' && <Scores data={slate} />}
            {tab === 'pairs' && <Pairs data={data} results={nflResults} onPlayerClick={openPlayer} />}
            {tab === 'guide' && <Guide onNavigate={setTab} data={data} />}
            {tab === 'live' && <Live data={slate} picks={picks} live={liveSnap} matchup={matchup} logs={logs} results={nflResults} onPlayerClick={openPlayer} setTab={setTab} />}
            {tab === 'streaks' && <Streaks data={data} logs={logs} onPlayerClick={openPlayer} />}
            {tab === 'leaders' && <Leaders data={data} onPlayerClick={openPlayer} />}
            {tab === 'storylines' && <Storylines data={data} logs={logs} results={nflResults} onPlayerClick={openPlayer} setTab={setTab} />}
          </ErrorBoundary>
        )}
      </main>
      <MobileTabBarNfl tab={tab} setTab={setTab} />
      {/* The live wire. Renders nothing until something actually happens to
          one of your names, and polls nothing unless a game is in progress or
          about to start — see components/nfl/NflWire.js. */}
      <NflWire data={slate} onPlayerClick={openPlayer} />
      {/* A crash in the card should close the card, not the site. */}
      <ErrorBoundary resetKey={modal?.player?.player_id ?? modal?.player?.id} label="the player card">
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
        // ‹ › AND THE SEARCH INSIDE THE CARD (2026-09-20). MOONSHOT walks the
        // list that was ON SCREEN, in its order, because Dashboard already
        // holds the filtered slate every tab renders from. TUDDY's tabs each
        // own their own filtering, so there is no single on-screen list to
        // hand over -- this passes the whole board instead, minus byes, in
        // score order for the market the card is open on.
        //
        // Said plainly rather than dressed up as the same thing: the arrows
        // walk the board, not your current filter. Threading each tab's own
        // list up to here is the change that would close that gap, and it is
        // a bigger one than this card needed.
        peers={modalPeers}
        onNavigate={(p) => setModal((m) => ({ ...(m || {}), player: p }))}
      />
      </ErrorBoundary>
    </>
  )
}
