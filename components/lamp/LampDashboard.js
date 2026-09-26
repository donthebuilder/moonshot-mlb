'use client'
import { useEffect, useRef, useState } from 'react'
import { resolveTab, pageTitle, NHL_TABS as NHL_TAB_KEYS, NHL_NAV } from '../../lib/routes'
import { initialHashParams, setSport } from '../../lib/sport'
import { C } from '../../lib/nhl/theme'
import { useLampScores } from '../../lib/nhl/useLamp'
import ErrorBoundary from '../ErrorBoundary'
import TabNotFound from '../TabNotFound'
import MobileCSS from '../MobileCSS'
import TabExplainer from '../TabExplainer'
import LampHeader from './LampHeader'
import MobileTabBarLamp from './MobileTabBarLamp'
import { NHL_TEXTS } from './tabExplainerTexts'
import { readHashParam, writeHashParam } from './ui'

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
import Leaders from './tabs/Leaders'
import Board from './tabs/Board'
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
const DATED_TABS = new Set(['scores', 'schedule', 'board', 'fullboard'])

export default function LampDashboard({ palettePass = 0 }) {
  const [tab, setTabRaw] = useState('home')
  const [gameId, setGameId] = useState(null)
  const [teamKey, setTeamKey] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [missingTab, setMissingTab] = useState('')
  useEffect(() => {
    // Set it now AND once more shortly after: on a cold open Next writes the
    // route's static <title> after this effect's first run, so Home (the one
    // tab whose state never changes after mount) kept "The board — MOONSHOT
    // & TUDDY" in the tab bar. Measured at 390px, 2026-09-25.
    const set = () => { try { document.title = `${pageTitle('nhl', tab)} · DASH Network` } catch { /* ignore */ } }
    set()
    const id = setTimeout(set, 600)
    return () => clearTimeout(id)
  }, [tab])

  const setTab = (next) => {
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
      if (next !== 'game') hash.delete('game')
      if (!DATED_TABS.has(next)) hash.delete('date')
      if (next !== 'team') hash.delete('team')
      if (next !== 'player') { hash.delete('player'); hash.delete('p') }
      window.history.replaceState(null, '', `#${hash.toString()}`)
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
  // In-app only: the hash is still replaceState, the browser's Back still
  // leaves the site.
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
    const to = trail.current.pop()
    if (!to) { setTab(fallback); return }
    if (to.tab === 'game' && to.gameId) setGameId(to.gameId)
    if (to.tab === 'team' && to.teamKey) setTeamKey(to.teamKey)
    if (to.tab === 'player' && to.playerId) setPlayerId(to.playerId)
    setTab(to.tab)
    if (to.tab === 'game' && to.gameId) writeHashParam('game', to.gameId)
    if (to.tab === 'team' && to.teamKey) writeHashParam('team', to.teamKey)
    if (to.tab === 'player' && to.playerId) writeHashParam('player', to.playerId)
    if (to.date && DATED_TABS.has(to.tab)) writeHashParam('date', to.date)
  }

  const openGame = (id) => {
    if (!/^\d{10}$/.test(String(id || ''))) return
    remember()
    setGameId(String(id))
    setTab('game')
    writeHashParam('game', String(id))
  }

  const openTeam = (abbrev) => {
    const ab = String(abbrev || '').toUpperCase()
    if (!/^[A-Z]{3}$/.test(ab)) return
    remember()
    setTeamKey(ab); setTab('team'); writeHashParam('team', ab)
  }
  const openPlayer = (id) => {
    if (!/^\d{7}$/.test(String(id || ''))) return
    remember()
    setPlayerId(String(id)); setTab('player'); writeHashParam('player', String(id))
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
    const g = readHashParam('game') || initialHashParams().get('game')
    if (r.status === 'missing') { setMissingTab(r.asked); return }
    if (r.tab === 'game' && /^\d{10}$/.test(String(g || ''))) setGameId(String(g))
    const tm = String(readHashParam('team') || initialHashParams().get('team') || '').toUpperCase()
    if (r.tab === 'team' && /^[A-Z]{3}$/.test(tm)) setTeamKey(tm)
    const pl = readHashParam('player') || readHashParam('p') || initialHashParams().get('player') || initialHashParams().get('p')
    if (r.tab === 'player' && /^\d{7}$/.test(String(pl || ''))) setPlayerId(String(pl))
    setTab(r.tab)
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
        setMissingTab('')
        if (r.tab === 'game') { const g = hash.get('game'); if (/^\d{10}$/.test(String(g || ''))) setGameId(String(g)) }
        if (r.tab === 'team') { const tm = String(hash.get('team') || '').toUpperCase(); if (/^[A-Z]{3}$/.test(tm)) setTeamKey(tm) }
        if (r.tab === 'player') { const pl = hash.get('player') || hash.get('p'); if (/^\d{7}$/.test(String(pl || ''))) setPlayerId(String(pl)) }
        // A hash that names LAMP and no tab IS an address — Tonight. This
        // used to leave the previous panel on screen under a URL that said
        // otherwise (measured live, 2026-09-25); MOONSHOT's and TUDDY's
        // shells still do (flagged, not changed here).
        trail.current = []
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

  return (
    <>
      <MobileCSS />
      <a className="skip-link" href="#board-main">Skip to the board</a>
      <LampHeader tab={tab} setTab={setTab} live={live} />
      <main id="board-main" className="dashboard-main" style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 14px 40px', background: C.bg, color: C.text }}>
        <h1 className="sr-only">{pageTitle('nhl', missingTab ? 'home' : tab)}</h1>
        {!missingTab && <TabExplainer tab={tab} texts={NHL_TEXTS} storageKey="tab_explained_nhl" accent={C.ice} />}
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
            {tab === 'home' && <Home today={today} onOpenGame={openGame} setTab={setTab} />}
            {tab === 'scores' && <Scores onOpenGame={openGame} />}
            {tab === 'schedule' && <Schedule onOpenGame={openGame} />}
            {tab === 'standings' && <Standings onOpenTeam={openTeam} />}
            {tab === 'game' && <Game id={gameId} backLabel={backLabel('scores')} onBack={() => goBack('scores')} />}
            {tab === 'guide' && <Guide onNavigate={setTab} />}
            {tab === 'teams' && <Teams onOpenTeam={openTeam} />}
            {tab === 'team' && <Team abbrev={teamKey} onOpenPlayer={openPlayer} onOpenGame={openGame} backLabel={backLabel('teams')} onBack={() => goBack('teams')} />}
            {tab === 'players' && <Players onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'goalies' && <Players goaliesOnly onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'player' && <Player id={playerId} onOpenTeam={openTeam} onOpenGame={openGame} backLabel={backLabel('players')} onBack={() => goBack('players')} />}
            {tab === 'leaders' && <Leaders onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'board' && <Board onOpenPlayer={openPlayer} onOpenGame={openGame} onOpenTeam={openTeam} />}
            {tab === 'fullboard' && <FullBoard onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'results' && <Results onOpenPlayer={openPlayer} />}
          </ErrorBoundary>
        )}
      </main>
      <MobileTabBarLamp tab={tab} setTab={setTab} />
    </>
  )
}
