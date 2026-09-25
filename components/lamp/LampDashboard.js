'use client'
import { useEffect, useRef, useState } from 'react'
import { resolveTab, pageTitle, NHL_TABS as NHL_TAB_KEYS } from '../../lib/routes'
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
    setMissingTab('')
    setTabRaw(next)
    try {
      const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      hash.set('sport', 'nhl')
      hash.set('tab', next)
      if (next !== 'game') hash.delete('game')
      if (next !== 'scores' && next !== 'schedule') hash.delete('date')
      if (next !== 'team') hash.delete('team')
      if (next !== 'player') { hash.delete('player'); hash.delete('p') }
      window.history.replaceState(null, '', `#${hash.toString()}`)
    } catch { /* the tab still works without the address */ }
  }

  const openGame = (id) => {
    if (!/^\d{10}$/.test(String(id || ''))) return
    setGameId(String(id))
    setTab('game')
    writeHashParam('game', String(id))
  }

  const openTeam = (abbrev) => {
    const ab = String(abbrev || '').toUpperCase()
    if (!/^[A-Z]{3}$/.test(ab)) return
    setTeamKey(ab); setTab('team'); writeHashParam('team', ab)
  }
  const openPlayer = (id) => {
    if (!/^\d{7}$/.test(String(id || ''))) return
    setPlayerId(String(id)); setTab('player'); writeHashParam('player', String(id))
  }

  // Deep links: #sport=nhl&tab=standings, or &tab=game&game=2026020053.
  const hashDone = useRef(false)
  useEffect(() => {
    if (hashDone.current) return
    hashDone.current = true
    let t = null
    try {
      const live = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      if (live.get('sport') === 'nhl') t = live.get('tab')
    } catch { /* ignore */ }
    if (!NHL_TABS.has(t)) t = initialHashParams().get('tab')
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
        if (r.status !== 'default') setTabRaw(r.tab)
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
            doors={[['home', '\u{1F3E0} TONIGHT'], ['scores', '\u{1F4E1} SCORES'], ['schedule', '\u{1F4C5} SCHEDULE'], ['standings', '\u{1F4CA} STANDINGS'], ['players', '\u{1F464} PLAYERS'], ['teams', '\u{1F3DF} TEAMS'], ['leaders', '\u{1F3C6} LEADERS'], ['guide', '\u{1F4D6} GUIDE']]}
          />
        ) : (
          <ErrorBoundary resetKey={`${tab}:${gameId || ''}:${teamKey || ''}:${playerId || ''}`} label={`the ${tab} tab`}>
            {tab === 'home' && <Home today={today} onOpenGame={openGame} setTab={setTab} />}
            {tab === 'scores' && <Scores onOpenGame={openGame} />}
            {tab === 'schedule' && <Schedule onOpenGame={openGame} />}
            {tab === 'standings' && <Standings />}
            {tab === 'game' && <Game id={gameId} onBack={() => setTab('scores')} />}
            {tab === 'guide' && <Guide onNavigate={setTab} />}
            {tab === 'teams' && <Teams onOpenTeam={openTeam} />}
            {tab === 'team' && <Team abbrev={teamKey} onOpenPlayer={openPlayer} onOpenGame={openGame} onBack={() => setTab('teams')} />}
            {tab === 'players' && <Players onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'goalies' && <Players goaliesOnly onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
            {tab === 'player' && <Player id={playerId} onOpenTeam={openTeam} onOpenGame={openGame} onBack={() => setTab('players')} />}
            {tab === 'leaders' && <Leaders onOpenPlayer={openPlayer} onOpenTeam={openTeam} />}
          </ErrorBoundary>
        )}
      </main>
      <MobileTabBarLamp tab={tab} setTab={setTab} />
    </>
  )
}
