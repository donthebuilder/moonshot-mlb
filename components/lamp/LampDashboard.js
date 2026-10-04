'use client'
import { TeamNav } from '../../lib/teamNav'
import HighlightBar from '../HighlightBar'
import { SportTheme } from '../SportTheme'
import { TodayContext } from '../TodayContext'
import { useMemo } from 'react'
import { pageTitle, NHL_NAV, isLiveTab } from '../../lib/routes'
import { useShellRoute } from '../../lib/useShellRoute'
import { usePageTitle } from '../../lib/usePageTitle'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { AccentProvider } from '../Filters'
import { useLampScores, useLampScoresOn } from '../../lib/nhl/useLamp'
import ErrorBoundary from '../ErrorBoundary'
import TabNotFound from '../TabNotFound'
import MobileCSS from '../MobileCSS'
import TabExplainer from '../TabExplainer'
import LampHeader from './LampHeader'
import MobileTabBarLamp from './MobileTabBarLamp'
import { NHL_TEXTS } from './tabExplainerTexts'
import { readHashParam } from './ui'

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
import dynamic from 'next/dynamic'
import RefreshStamp from '../RefreshStamp'
import DashFooter from '../DashFooter'
import PlayerPeek from '../PlayerPeek'
import SkipLink from '../SkipLink'
const LampOdds = dynamic(() => import('./LampOdds'))

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
// Pages that show one day and keep it in the address (`date=`). One list,
// read by setTab (which clears it elsewhere) and goBack (which restores it).
const DATED_TABS = new Set(['home', 'scores', 'schedule', 'board', 'shots', 'games', 'fullboard', 'numerology', 'matchups', 'ledger'])

// LAMP's routing config for the shared shell router (lib/useShellRoute.js --
// moved out of this file unchanged, 2026-10-02, so BUCKETS runs on the same code).
const ROUTE = {
  sport: 'nhl', nav: NHL_NAV, datedTabs: DATED_TABS,
  ids: { game: /^\d{10}$/, team: /^[A-Z]{3}$/, player: /^\d{7}$/ },
  keep: { game: ['games'], m: ['board', 'shots'], player: ['players', 'goalies'] },
  // #tab=board&m=sog predates the Shots slot (2026-09-28): it opens there.
  rewrite: (r, get) => (r.tab === 'board' && String(get('m') || '').toLowerCase() === 'sog' ? { ...r, tab: 'shots' } : r),
}

export default function LampDashboard({ palettePass = 0 }) {
  // Followed skaters, remembered night by night for "Your nights, graded".
  useLampSaves()
  const { tab, setTab, gameId, teamKey, playerId, missingTab, date, setDate, badDate, setBadDate, openGame, openTeam, openPlayer, backLabel, goBack, peekId, peekPlayer, closePeek } = useShellRoute(ROUTE)
  usePageTitle(`${pageTitle('nhl', tab)} · DASH Network`)

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
      <SkipLink />
      <LampHeader tab={tab} setTab={setTab} live={live} date={date} setDate={setDate} scores={shown} liveScores={today} onOpenPlayer={peekPlayer} onOpenGame={openGame} />
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
        ) : (<>
          {/* ✨ who you highlighted (lib/pickLight.js) -- only while someone is */}
          <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
            <HighlightBar sport="nhl" onOpen={(id) => peekPlayer(id)} />
          </SportTheme>
          {/* ONE ACCENT SOURCE (0g C2-C6 root cause): every tab inside its product's theme */}
          <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
          {/* the ↻ on the live pages: nothing refreshes on a timer (lib/liveRefresh.js) */}
          {isLiveTab('nhl', tab) && <RefreshStamp live={live > 0} style={{ marginBottom: 8 }} />}
          <TeamNav.Provider value={openTeam}>
          <ErrorBoundary resetKey={`${tab}:${gameId || ''}:${teamKey || ''}:${playerId || ''}`} label={`the ${tab} tab`}>
            {tab === 'home' && <Home today={shown} date={date} onOpenGame={openGame} onOpenPlayer={peekPlayer} onOpenTeam={openTeam} setTab={setTab} />}
            {tab === 'scores' && <Scores onOpenGame={openGame} date={date} setDate={setDate} />}
            {tab === 'schedule' && <Schedule onOpenGame={openGame} date={date} setDate={setDate} />}
            {tab === 'standings' && <Standings onOpenTeam={openTeam} />}
            {tab === 'game' && <Game id={gameId} onOpenPlayer={peekPlayer} onOpenTeam={openTeam} onOpenGame={openGame} backLabel={backLabel('scores')} onBack={() => goBack('scores')} />}
            {tab === 'guide' && <Guide onNavigate={setTab} />}
            {tab === 'teams' && <Teams onOpenTeam={openTeam} />}
            {tab === 'team' && <Team abbrev={teamKey} onOpenPlayer={peekPlayer} onOpenGame={openGame} backLabel={backLabel('teams')} onBack={() => goBack('teams')} />}
            {tab === 'players' && <Players onOpenTeam={openTeam} onOpenGame={openGame} />}
            {tab === 'goalies' && <Players goaliesOnly onOpenTeam={openTeam} onOpenGame={openGame} />}
            {tab === 'player' && <Player id={playerId} onOpenTeam={openTeam} onOpenGame={openGame} backLabel={backLabel('players')} onBack={() => goBack('players')} />}
            {tab === 'leaders' && <Leaders onOpenPlayer={peekPlayer} onOpenTeam={openTeam} />}
            {tab === 'specialteams' && <SpecialTeams onOpenTeam={openTeam} onOpenPlayer={peekPlayer} />}
            {tab === 'matchups' && <Matchups date={date} onOpenPlayer={peekPlayer} onOpenTeam={openTeam} />}
            {tab === 'ledger' && <Ledger date={date} onOpenPlayer={peekPlayer} onOpenTeam={openTeam} onOpenGame={openGame} />}
            {tab === 'hotsticks' && <HotSticks onOpenPlayer={peekPlayer} />}
            {tab === 'power' && <Power onOpenPlayer={peekPlayer} />}
            {tab === 'watchlist' && <Watchlist onOpenPlayer={peekPlayer} />}
            {tab === 'storylines' && <StorylinesPage sport="nhl" eyebrow="LAMP · STORYLINES" theme={C} numFont={NUM_FONT} accent={C.ice} onOpenPlayer={peekPlayer} onOpenGame={openGame} date={date} />}
            {/* MOONSHOT's Odds page, sport="nhl" (2026-10-02, components/lamp/LampOdds.js) */}
            {tab === 'odds' && <LampOdds onOpenPlayer={peekPlayer} />}
            {tab === 'longshots' && <Longshots sport="nhl" eyebrow="LAMP · LONGSHOTS" theme={C} numFont={NUM_FONT} accent={C.ice} Table={LampTable} onOpenPlayer={peekPlayer} />}
            {tab === 'shotmap' && <ShotMap onOpenPlayer={peekPlayer} />}
            {tab === 'lampledger' && <LampLedger onOpenPlayer={peekPlayer} onOpenTeam={openTeam} />}
            {tab === 'numerology' && <Numerology date={date} onOpenPlayer={peekPlayer} />}
            {(tab === 'board' || tab === 'shots') && <Board onOpenPlayer={peekPlayer} onOpenGame={openGame} onOpenTeam={openTeam} date={date} setDate={setDate}
              market={tab === 'shots' ? 'SOG' : (['PTS', 'AST'].includes(String(readHashParam('m') || '').toUpperCase()) ? String(readHashParam('m')).toUpperCase() : 'GOAL')}
              onMarket={(m) => setTab(m === 'SOG' ? 'shots' : 'board')} />}
            {tab === 'games' && <LampSlate onOpenPlayer={peekPlayer} onOpenGame={openGame} onOpenTeam={openTeam} date={date} setDate={setDate} />}
            {tab === 'fullboard' && <FullBoard onOpenPlayer={peekPlayer} onOpenTeam={openTeam} date={date} setDate={setDate} />}
            {tab === 'results' && <Results onOpenPlayer={peekPlayer} />}
          </ErrorBoundary>
          <DashFooter sport="nhl" theme={C} onGuide={() => setTab('guide')} />
          {/* a tapped player opens his card over the page (Donovan 10-03); Full page = the player tab */}
          <PlayerPeek id={peekId} Page={Player} theme={C} accent={C.ice} onClose={closePeek} onFullPage={openPlayer} onOpenTeam={openTeam} onOpenGame={openGame} />
          </TeamNav.Provider>
          </SportTheme>
        </>
        )}
      </main>
      </TodayContext.Provider>
      <MobileTabBarLamp tab={tab} setTab={setTab} />
    </AccentProvider>
  )
}
