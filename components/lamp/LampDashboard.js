'use client'
import { TodayContext } from '../TodayContext'
import { writeHash } from '../../lib/urlState'
import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveTab, pageTitle, NHL_TABS as NHL_TAB_KEYS, NHL_NAV } from '../../lib/routes'
import { usePageTitle } from '../../lib/usePageTitle'
import { initialHashParams, setSport } from '../../lib/sport'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { AccentProvider } from '../Filters'
import { useLampScores, useLampScoresOn } from '../../lib/nhl/useLamp'
import { etToday } from '../../lib/freshness'
import ErrorBoundary from '../ErrorBoundary'
import TabNotFound from '../TabNotFound'
import MobileCSS from '../MobileCSS'
import TabExplainer from '../TabExplainer'
import LampHeader from './LampHeader'
import MobileTabBarLamp from './MobileTabBarLamp'
import { NHL_TEXTS } from './tabExplainerTexts'
import { readHashParam, readHashDay, writeHashParam } from './ui'

import Home from './tabs/Home'
import Scores from './tabs/Scores'
import Schedule from './tabs/Schedule'
import Standings from './tabs/Standings'
import Game from './tabs/Game'
import Guide from './tabs/Guide'
import Teams from './tabs/Teams'
import Team from './tabs/Team'
import Players from './tabs/Players'
import Player from './tabs/Player'
import SpecialTeams from './tabs/SpecialTeams'
import Ledger from './tabs/Ledger'
import Matchups from './tabs/Matchups'
import HotSticks from './tabs/HotSticks'
import Power from './tabs/Power'
import Watchlist from './tabs/Watchlist'
import { useLampSaves } from '../../lib/nhl/useLampSaves'
import Longshots from '../Longshots'
import StorylinesPage from '../StorylinesPage'
import LampTable from './LampTable'
import ShotMap from './tabs/ShotMap'
import LampLedger from './tabs/LampLedger'
import Numerology from './tabs/Numerology'
import Leaders from './tabs/Leaders'
import Board from './tabs/Board'
import LampSlate from './LampSlate'
import FullBoard from './tabs/FullBoard'
import Results from './tabs/Results'

// 🏒 THE LAMP SHELL. Thin on purpose, the same shape as NflDashboard and
// the MLB Dashboard: state and routing only; every opinion lives in a tab.
//
// THE ADDRESS CONTRACT, identical to the other two products so a link is a
// link everywhere: #sport=nhl&tab=<key>[&date=YYYY-MM-DD][&game=<id>]
// [&team=TOR][&player=<id>] (`p=` is read as `player=`, the way TUDDY does).
//   · an unknown tab answers NO SUCH TAB (TabNotFound), never a silent Home
//     and never a blank div (findings 2/3/15/16 in lib/routes.js);
//   · the hash is written with replaceState, so the back button leaves the
//     site rather than replaying tabs;
//   · a hash naming another sport is a sport switch (lib/sport.js has no
//     hashchange listener of its own).
//
// NO SLATE PAYLOAD HERE. MOONSHOT and TUDDY load a bot-built slate once at
// the shell and pass it down; LAMP's pages each read their own small route
// (lib/nhl/useLamp.js) because the data is live league data, not a nightly
// build — the shell only reads today's scores itself, for the live count in
// the header, and that one request is shared with Home through the CDN.
const NHL_TABS = new Set(NHL_TAB_KEYS)
// Pages that show one day and keep it in the address (`date=`). One list,
// read by setTab (which clears it elsewhere) and goBack (which restores it).
const DATED_TABS = new Set(['home', 'scores', 'schedule', 'board', 'shots', 'games', 'fullboard', 'numerology', 'matchups', 'ledger'])

export default function LampDashboard({ palettePass = 0 }) {
  const [tab, setTabRaw] = useState('home')
  // Followed skaters, remembered night by night for "Your nights, graded".
  useLampSaves()
  const [gameId, setGameId] = useState(null)
  const [teamKey, setTeamKey] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [missingTab, setMissingTab] = useState('')
  // ONE DAY FOR THE WHOLE SHELL (2026-09-26, shell-parity step 1). The
  // header's Today / Tmrw, the day buttons on Board, The Board, Scores and
  // Schedule, and the address all read and move this one value -- each tab
  // used to keep its own, so the header could never say which day you were
  // on. null = today. It rides the address (`date=`) on the dated tabs, so a
  // refresh or a shared link keeps it.
  const [date, setDateRaw] = useState(() => readHashDay())
  // A date= that isn't a real day (audit 00A fix 5: date=2026-13-45) used to
  // become tonight in silence. It still does -- but the page says so, once.
  const [badDate, setBadDate] = useState('')
  useEffect(() => { const raw = readHashParam('date'); if (raw && !readHashDay()) setBadDate(String(raw).slice(0, 20)) }, [])
  const setDate = (d) => setDateRaw(d && d !== etToday() ? d : null)
  useEffect(() => { if (DATED_TABS.has(tab)) writeHashParam('date', date) }, [tab, date])
  // On a cold open Next writes the route's static <title> after the first
  // effect (measured 2026-09-25); lib/usePageTitle.js holds ours against it
  // -- it replaced the 600ms second write that used to live here.
  usePageTitle(`${pageTitle('nhl', tab)} · DASH Network`)

  // `push` (2026-09-27, audit 00A root fix 1): a tab you tap adds a history
  // entry, so Back returns to the last one; the mount-time resolve replaces.
  const setTab = (next, { push = true } = {}) => {
    if (!NHL_TABS.has(next)) return
    // Leaving through the chrome (rail, bar, sheet, wordmark, a Guide door)
    // is a fresh start, not a step on the trail; only the openers above
    // push onto it, and only goBack() pops.
    if (next !== 'game' && next !== 'team' && next !== 'player') trail.current = []
    setMissingTab('')
    setTabRaw(next)
    try {
      const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      hash.set('sport', 'nhl')
      hash.set('tab', next)
      if (next !== 'game' && next !== 'games') hash.delete('game')   // the Slate keeps its open game too
      if (next !== 'board' && next !== 'shots') hash.delete('m')
      if (!DATED_TABS.has(next)) hash.delete('date')
      if (next !== 'team') hash.delete('team')
      if (next !== 'player') { hash.delete('player'); hash.delete('p') }
      // A detail page keeps its entry's marker (openDetail); the chrome's
      // own navigation starts clean.
      // Only LAMP's own marker rides along -- never window.history.state, whose
      // __NA flag makes Next skip syncing the new URL (lib/urlState.js).
      const detail = next === 'game' || next === 'team' || next === 'player'
      const keep = detail && window.history.state?.lampDetail ? { lampDetail: true } : null
      const was = new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get('tab')
      writeHash(hash, { push: push && !detail && Boolean(was) && was !== next, state: keep })
    } catch { /* the tab still works without the address */ }
  }

  // ── THE TRAIL: a detail page goes back to where it was opened from ────
  // (2026-09-25, the navigation pass). Measured live: Player's "‹ Back"
  // always landed on the Players directory — from a Team roster, Goalies,
  // Leaders, the Board, the Record — and Game's "‹ Scores" dropped the day
  // (Scores for Sep 24 → a game → back = today). A button that says Back
  // and goes somewhere else is a wrong destination, and a day that vanishes
  // on the way through a game is stale state. So: every opener records the
  // view it left (tab + the id or day that view was on), goBack() restores
  // that view — ids and day included, written back into the address — and
  // the button is labelled with the place it returns to. A deep link has no
  // trail, so each page keeps its old default (Scores / Teams / Players).
  // BROWSER BACK TOO (2026-09-26, found in the LAMP research pass: Board ->
  // a player -> Back left the site). Opening a detail page now PUSHES a
  // history entry (openDetail), marked { lampDetail: true }, so the
  // browser's Back returns to the view it came from -- the hashchange
  // listener below rebuilds it from the address. The in-page Back steps
  // that same history when it can, so the two can never disagree.
  const trail = useRef([])
  const here = () => ({ tab, gameId, teamKey, playerId, date: readHashParam('date') })
  const remember = () => {
    const h = here()
    const top = trail.current[trail.current.length - 1]
    if (top && top.tab === h.tab && top.gameId === h.gameId && top.teamKey === h.teamKey && top.playerId === h.playerId && top.date === h.date) return
    trail.current = [...trail.current.slice(-11), h]
  }
  const backTarget = () => trail.current[trail.current.length - 1] || null
  const backLabel = (fallback) => NHL_NAV[backTarget()?.tab || fallback]?.label || NHL_NAV[fallback].label
  const goBack = (fallback) => {
    if (window.history.state?.lampDetail) { trail.current.pop(); window.history.back(); return }
    const to = trail.current.pop()
    if (!to) { setTab(fallback); return }
    if (to.tab === 'game' && to.gameId) setGameId(to.gameId)
    if (to.tab === 'team' && to.teamKey) setTeamKey(to.teamKey)
    if (to.tab === 'player' && to.playerId) setPlayerId(to.playerId)
    setTab(to.tab)
    if (to.tab === 'game' && to.gameId) writeHashParam('game', to.gameId)
    if (to.tab === 'team' && to.teamKey) writeHashParam('team', to.teamKey)
    if (to.tab === 'player' && to.playerId) writeHashParam('player', to.playerId)
    if (to.date && DATED_TABS.has(to.tab)) { writeHashParam('date', to.date); setDateRaw(to.date) }
  }

  // A new browser history entry for a detail page, pushed ONCE with its
  // final address and marked, so goBack knows it may step the browser's own
  // history. (Pushing a copy and rewriting it afterwards lost the rewrite:
  // Next re-applies the URL it last saw pushed -- measured 09-26.)
  const openDetail = (next, key, value) => {
    try {
      const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      h.set('sport', 'nhl'); h.set('tab', next)
      for (const k of ['game', 'team', 'player', 'p']) h.delete(k)
      if (!DATED_TABS.has(next)) h.delete('date')
      h.set(key, value)
      window.history.pushState({ lampDetail: true }, '', `#${h.toString()}`)
    } catch { /* the page still works without the address */ }
    setMissingTab('')
    setTabRaw(next)
  }
  const openGame = (id) => {
    if (!/^\d{10}$/.test(String(id || ''))) return
    remember()
    setGameId(String(id)); openDetail('game', 'game', String(id))
  }

  const openTeam = (abbrev) => {
    const ab = String(abbrev || '').toUpperCase()
    if (!/^[A-Z]{3}$/.test(ab)) return
    remember()
    setTeamKey(ab); openDetail('team', 'team', ab)
  }
  const openPlayer = (id) => {
    if (!/^\d{7}$/.test(String(id || ''))) return
    remember()
    setPlayerId(String(id)); openDetail('player', 'player', String(id))
  }

  // Deep links: #sport=nhl&tab=standings, or &tab=game&game=2026020053.
  const hashDone = useRef(false)
  useEffect(() => {
    if (hashDone.current) return
    hashDone.current = true
    // THE LIVE HASH ANSWERS WHEN IT NAMES LAMP (2026-09-25, navigation
    // pass). This read `if (!NHL_TABS.has(t)) t = snapshot.get('tab')`, so a
    // sport switch INTO LAMP from a page LAMP does not have (TUDDY's Props,
    // MOONSHOT's Props) — where lib/sport.js has already deleted the tab and
    // written #sport=nhl — fell through to the tab the page LOADED with and
    // printed NO SUCH TAB touchdowns under an address that says Tonight.
    // Measured live. The snapshot is only for a cold open the MLB shell may
    // have rewritten before this shell mounted: when the live hash does not
    // name LAMP, or names it with a word LAMP cannot resolve at all and the
    // snapshot carries one it can.
    let t = null
    let liveIsUs = false
    try {
      const live = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      if (live.get('sport') === 'nhl') { liveIsUs = true; t = live.get('tab') }
      // One address per page: `p=` (MOONSHOT's parameter, what the other two
      // shells also accept) is rewritten to LAMP's own `player=` before the
      // tab resolves, the way NflDashboard does.
      if (liveIsUs && live.get('p') && !live.get('player')) {
        live.set('player', live.get('p')); live.delete('p')
        window.history.replaceState(null, '', `#${live.toString()}`)
      }
    } catch { /* ignore */ }
    const snapTab = initialHashParams().get('tab')
    if (!liveIsUs) t = snapTab
    else if (t && resolveTab('nhl', t).status === 'missing' && snapTab && resolveTab('nhl', snapTab).status !== 'missing') t = snapTab
    const r = resolveTab('nhl', t)
    // #tab=board&m=sog predates the Shots slot (2026-09-28): it opens there.
    if (r.tab === 'board' && String(readHashParam('m') || initialHashParams().get('m') || '').toLowerCase() === 'sog') r.tab = 'shots'
    const g = readHashParam('game') || initialHashParams().get('game')
    if (r.status === 'missing') { setMissingTab(r.asked); return }
    if (r.tab === 'game' && /^\d{10}$/.test(String(g || ''))) setGameId(String(g))
    const tm = String(readHashParam('team') || initialHashParams().get('team') || '').toUpperCase()
    if (r.tab === 'team' && /^[A-Z]{3}$/.test(tm)) setTeamKey(tm)
    const pl = readHashParam('player') || readHashParam('p') || initialHashParams().get('player') || initialHashParams().get('p')
    // Any id a link carries reaches the player page -- a malformed one too, so
    // the page can say NO SUCH PLAYER instead of "no player picked" (audit 00A
    // fix 5: player=1 used to look like a link with no player at all).
    if (r.tab === 'player' && pl) setPlayerId(String(pl).slice(0, 20))
    setTab(r.tab, { push: false })
  }, [])

  // Manually edited hashes and browser-driven hash changes stay in sync
  // with the visible panel (finding 16: every case answers).
  useEffect(() => {
    const readHash = () => {
      try {
        const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
        const sp = hash.get('sport')
        if (sp && sp !== 'nhl') { setSport(sp); return }
        if (sp !== 'nhl') return
        const r = resolveTab('nhl', hash.get('tab'))
        if (r.status === 'missing') { setMissingTab(r.asked); return }
        if (r.tab === 'board' && String(hash.get('m') || '').toLowerCase() === 'sog') r.tab = 'shots'
        setMissingTab('')
        if (r.tab === 'game') { const g = hash.get('game'); if (/^\d{10}$/.test(String(g || ''))) setGameId(String(g)) }
        if (r.tab === 'team') { const tm = String(hash.get('team') || '').toUpperCase(); if (/^[A-Z]{3}$/.test(tm)) setTeamKey(tm) }
        if (r.tab === 'player') { const pl = hash.get('player') || hash.get('p'); if (pl) setPlayerId(String(pl).slice(0, 20)) }
        // A hash that names LAMP and no tab IS an address — Tonight. This
        // used to leave the previous panel on screen under a URL that said
        // otherwise (measured live, 2026-09-25); MOONSHOT's and TUDDY's
        // shells follow the same rule since 2026-09-26.
        trail.current = []
        // A typed or linked address is the truth about the day, too.
        setDateRaw(readHashDay())
        setTabRaw(r.tab)
      } catch { /* ignore malformed hashes */ }
    }
    window.addEventListener('hashchange', readHash)
    return () => window.removeEventListener('hashchange', readHash)
  }, [])

  // Today's live count for the header lamp. Same route Home reads; the CDN
  // serves the second call.
  const today = useLampScores(null)
  const live = today.data?.live || 0
  // The picked day's scores, fetched only when a day other than today is
  // picked; Home and the ticker read whichever is showing.
  const picked = useLampScoresOn(date)
  const shown = date ? picked : today
  // THE TODAY LINE's day (2026-09-28): the day LAMP is showing, from its scores.
  const nhlToday = useMemo(() => {
    const d = shown?.data
    if (!d) return null
    return { sport: 'nhl', date: d.date || null, games: (d.games || []).map((g) => ({ away: g.away?.abbrev, home: g.home?.abbrev, start: Date.parse(g.startUtc || ''), state: g.state === 'live' ? 'live' : g.state === 'final' ? 'final' : 'pre' })), next: d.next ? { date: d.next } : null }
  }, [shown])

  return (
    <AccentProvider value={C.ice}>
      <MobileCSS />
      <a className="skip-link" href="#board-main">Skip to the board</a>
      <LampHeader tab={tab} setTab={setTab} live={live} date={date} setDate={setDate} scores={shown} liveScores={today} onOpenPlayer={openPlayer} onOpenGame={openGame} />
      <TodayContext.Provider value={nhlToday}>
      <main id="board-main" className="dashboard-main" style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 14px 40px', background: C.bg, color: C.text }}>
        <h1 className="sr-only">{pageTitle('nhl', missingTab ? 'home' : tab)}</h1>
        {!missingTab && <TabExplainer tab={tab} texts={NHL_TEXTS} storageKey="tab_explained_nhl" accent={C.ice} />}
        {badDate && !missingTab && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px', padding: '8px 12px', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`, borderRadius: 10, background: C.bg2, fontSize: 12, color: C.text2 }}>
            <span style={{ flex: 1 }}><b style={{ color: C.text, fontFamily: NUM_FONT }}>{badDate}</b> isn&apos;t a real date, so that day is unavailable -- showing tonight instead.</span>
            <button type="button" onClick={() => setBadDate('')} aria-label="Dismiss" style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        )}
        {missingTab ? (
          <TabNotFound
            asked={missingTab}
            sport="nhl"
            palette={C}
            onNavigate={setTab}
            doors={[['home', '\u{1F3E0} TONIGHT'], ['board', '\u{1F3AF} BOARD'], ['scores', '\u{1F4E1} SCORES'], ['schedule', '\u{1F4C5} SCHEDULE'], ['standings', '\u{1F4CA} STANDINGS'], ['players', '\u{1F464} PLAYERS'], ['teams', '\u{1F3DF} TEAMS'], ['leaders', '\u{1F3C6} LEADERS'], ['guide', '\u{1F4D6} GUIDE']]}
          />
        ) : (
          <ErrorBoundary resetKey={`${tab}:${gameId || ''}:${teamKey || ''}:${playerId || ''}`} label={`the ${tab} tab`}>
            {tab === 'home' && <Home today={shown} date={date} onOpenGame={openGame} onOpenPlayer={openPlayer} onOpenTeam={openTeam} setTab={setTab} />}
            {tab === 'scores' && <Scores onOpenGame={openGame} date={date} setDate={setDate} />}
            {tab === 'schedule' && <Schedule onOpenGame={openGame} date={date} setDate={setDate} />}
            {tab === 'standings' && <Standings onOpenTeam={openTeam} />}
            {tab === 'game' && <Game id={gameId} onOpenPlayer={openPlayer} backLabel={backLabel('scores')} onBack={() => goBack('scores')} />}
            {tab === 'guide' && <Guide onNavigate={setTab} />}
            {tab === 'teams' && <Teams onOpenTeam={openTeam} />}
            {tab === 'team' && <Team abbrev={teamKey} onOpenPlayer={openPlayer} onOpenGame={openGame} backLabel={backLabel('teams')} onBack={() => goBack('teams')} />}
            {tab === 'players' && <Players onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'goalies' && <Players goaliesOnly onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'player' && <Player id={playerId} onOpenTeam={openTeam} onOpenGame={openGame} backLabel={backLabel('players')} onBack={() => goBack('players')} />}
            {tab === 'leaders' && <Leaders onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'specialteams' && <SpecialTeams onOpenTeam={openTeam} />}
            {tab === 'matchups' && <Matchups date={date} onOpenPlayer={openPlayer} />}
            {tab === 'ledger' && <Ledger date={date} onOpenPlayer={openPlayer} onOpenTeam={openTeam} onOpenGame={openGame} />}
            {tab === 'hotsticks' && <HotSticks onOpenPlayer={openPlayer} />}
            {tab === 'power' && <Power onOpenPlayer={openPlayer} />}
            {tab === 'watchlist' && <Watchlist onOpenPlayer={openPlayer} />}
            {tab === 'storylines' && <StorylinesPage sport="nhl" eyebrow="LAMP · STORYLINES" theme={C} numFont={NUM_FONT} accent={C.ice} onOpenPlayer={openPlayer} onOpenGame={openGame} date={date} />}
            {tab === 'longshots' && <Longshots sport="nhl" eyebrow="LAMP · LONGSHOTS" theme={C} numFont={NUM_FONT} accent={C.ice} Table={LampTable} onOpenPlayer={openPlayer} />}
            {tab === 'shotmap' && <ShotMap onOpenPlayer={openPlayer} />}
            {tab === 'lampledger' && <LampLedger onOpenPlayer={openPlayer} />}
            {tab === 'numerology' && <Numerology date={date} onOpenPlayer={openPlayer} />}
            {(tab === 'board' || tab === 'shots') && <Board onOpenPlayer={openPlayer} onOpenGame={openGame} onOpenTeam={openTeam} date={date} setDate={setDate}
              market={tab === 'shots' ? 'SOG' : 'GOAL'} onMarket={(m) => setTab(m === 'SOG' ? 'shots' : 'board')} />}
            {tab === 'games' && <LampSlate onOpenPlayer={openPlayer} onOpenGame={openGame} onOpenTeam={openTeam} date={date} setDate={setDate} />}
            {tab === 'fullboard' && <FullBoard onOpenPlayer={openPlayer} onOpenTeam={openTeam} date={date} setDate={setDate} />}
            {tab === 'results' && <Results onOpenPlayer={openPlayer} />}
          </ErrorBoundary>
        )}
      </main>
      </TodayContext.Provider>
      <MobileTabBarLamp tab={tab} setTab={setTab} />
    </AccentProvider>
  )
}
