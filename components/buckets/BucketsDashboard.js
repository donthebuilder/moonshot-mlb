'use client'
// 🏀 THE BUCKETS SHELL -- LampDashboard's shape, on the same router
// (lib/useShellRoute.js): state and routing only; every opinion lives in a tab.
// The address contract is the other products' own:
//   #sport=nba&tab=<key>[&date=YYYY-MM-DD][&game=<9 digits>][&team=BOS][&player=<id>]
// Like LAMP, each page reads its own small route (lib/nba/useBuckets.js) --
// live league data, not a nightly build; the shell reads only today's scores,
// for the live count in the header (the same request Home makes).
// HIDDEN until it opens: SportRoot renders this only for a visitor
// /api/buckets/access lets in, and every /api/buckets route enforces the same.
import { useMemo } from 'react'
import { TeamNav } from '../../lib/teamNav'
import HighlightBar from '../HighlightBar'
import { SportTheme } from '../SportTheme'
import { TodayContext } from '../TodayContext'
import { pageTitle, NBA_NAV, isLiveTab } from '../../lib/routes'
import { useShellRoute } from '../../lib/useShellRoute'
import { usePageTitle } from '../../lib/usePageTitle'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { GAME_ID_RE, PLAYER_ID_RE, TEAM_RE } from '../../lib/nba/ids'
import { AccentProvider } from '../Filters'
import { useBucketsScores, useBucketsScoresOn } from '../../lib/nba/useBuckets'
import ErrorBoundary from '../ErrorBoundary'
import TabNotFound from '../TabNotFound'
import MobileCSS from '../MobileCSS'
import TabExplainer from '../TabExplainer'
import RefreshStamp from '../RefreshStamp'
import BucketsHeader from './BucketsHeader'
import MobileTabBarBuckets from './MobileTabBarBuckets'
import { NBA_TEXTS } from './tabExplainerTexts'
import { readHashParam } from './ui'
import Home from './tabs/Home'
import Board from './tabs/Board'
import FullBoard from './tabs/FullBoard'
import Scores from './tabs/Scores'
import Slate from './tabs/Slate'
import Game from './tabs/Game'
import Standings from './tabs/Standings'
import Schedule from './tabs/Schedule'
import Matchups from './tabs/Matchups'
import Hot from './tabs/Hot'
import Ledger from './tabs/Ledger'
import Watchlist from './tabs/Watchlist'
import StorylinesPage from '../StorylinesPage'
import dynamic from 'next/dynamic'
const BucketsOdds = dynamic(() => import('./BucketsOdds'))
import { useBucketsSaves } from '../../lib/nba/useBucketsSaves'
import Teams from './tabs/Teams'
import Team from './tabs/Team'
import Players from './tabs/Players'
import Player from './tabs/Player'
import Leaders from './tabs/Leaders'
import ShotMap from './tabs/ShotMap'
import Results from './tabs/Results'
import Guide from './tabs/Guide'
import DashFooter from '../DashFooter'

// Pages that show one day and keep it in the address (`date=`).
const DATED_TABS = new Set(['home', 'scores', 'board', 'fullboard', 'games', 'schedule', 'matchups', 'hot', 'ledger', 'storylines', 'odds'])
const MARKETS = new Set(['pts', 'reb', 'ast', '3pm', 'pra', 'first'])
const ROUTE = {
  sport: 'nba', nav: NBA_NAV, datedTabs: DATED_TABS,
  ids: { game: GAME_ID_RE, team: TEAM_RE, player: PLAYER_ID_RE },
  // the shot map's pick rides team= / player= too
  keep: { game: ['games'], m: ['board', 'games'], player: ['players', 'shotmap'], team: ['shotmap'] },
}

export default function BucketsDashboard() {
  const { tab, setTab, gameId, teamKey, playerId, missingTab, date, setDate, badDate, setBadDate, openGame, openTeam, openPlayer, backLabel, goBack } = useShellRoute(ROUTE)
  usePageTitle(`${pageTitle('nba', tab)} · DASH Network`)
  // starred players, remembered night by night for "Your nights, graded"
  useBucketsSaves()

  const today = useBucketsScores(null)
  const live = today.data?.live || 0
  const picked = useBucketsScoresOn(date)
  const shown = date ? picked : today
  const nbaToday = useMemo(() => {
    const d = shown?.data
    if (!d) return null
    return { sport: 'nba', date: d.date || null, games: (d.games || []).map((g) => ({ away: g.away?.abbrev, home: g.home?.abbrev, start: Date.parse(g.start || ''), state: g.state === 'live' ? 'live' : g.state === 'final' ? 'final' : 'pre' })), next: null }
  }, [shown])
  const m = String(readHashParam('m') || '').toLowerCase()
  const market = MARKETS.has(m) ? m : 'pts'
  const nav = { onOpenPlayer: openPlayer, onOpenGame: openGame, onOpenTeam: openTeam }

  return (
    <AccentProvider value={C.purple}>
      <MobileCSS />
      <a className="skip-link" href="#board-main">Skip to the board</a>
      <BucketsHeader setTab={setTab} live={live} date={date} setDate={setDate} scores={shown} liveScores={today} onOpenPlayer={openPlayer} onOpenGame={openGame} />
      <TodayContext.Provider value={nbaToday}>
      <main id="board-main" className="dashboard-main" style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 14px 40px', background: C.bg, color: C.text }}>
        <h1 className="sr-only">{pageTitle('nba', missingTab ? 'home' : tab)}</h1>
        {!missingTab && <TabExplainer tab={tab} texts={NBA_TEXTS} storageKey="tab_explained_nba" accent={C.purple} />}
        {badDate && !missingTab && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px', padding: '8px 12px', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`, borderRadius: 10, background: C.bg2, fontSize: 12, color: C.text2 }}>
            <span style={{ flex: 1 }}><b style={{ color: C.text, fontFamily: NUM_FONT }}>{badDate}</b> isn&apos;t a real date, so that day is unavailable -- showing tonight instead.</span>
            <button type="button" onClick={() => setBadDate('')} aria-label="Dismiss" style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        )}
        {missingTab ? (
          <TabNotFound asked={missingTab} sport="nba" palette={C} onNavigate={setTab}
            doors={[['home', '\u{1F319} TONIGHT'], ['board', '\u{1F0CF} PROPS'], ['scores', '\u{1F4E1} LIVE'], ['standings', '\u{1F4C8} STANDINGS'], ['players', '\u{1F464} PLAYERS'], ['teams', '\u{1F3DF} TEAMS'], ['leaders', '\u{1F3C6} LEADERS'], ['guide', '❓ GUIDE']]} />
        ) : (<>
          <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
            <HighlightBar sport="nba" onOpen={(id) => openPlayer(id)} />
          </SportTheme>
          <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
          {isLiveTab('nba', tab) && <RefreshStamp live={live > 0} style={{ marginBottom: 8 }} />}
          <TeamNav.Provider value={openTeam}>
          <ErrorBoundary resetKey={`${tab}:${gameId || ''}:${teamKey || ''}:${playerId || ''}`} label={`the ${tab} tab`}>
            {tab === 'home' && <Home today={shown} date={date} setTab={setTab} {...nav} />}
            {tab === 'board' && <Board date={date} setDate={setDate} market={market} {...nav} />}
            {tab === 'fullboard' && <FullBoard date={date} setDate={setDate} {...nav} />}
            {tab === 'scores' && <Scores date={date} setDate={setDate} onOpenGame={openGame} />}
            {tab === 'games' && <Slate date={date} setDate={setDate} market={market} {...nav} />}
            {tab === 'game' && <Game id={gameId} {...nav} backLabel={backLabel('scores')} onBack={() => goBack('scores')} />}
            {tab === 'schedule' && <Schedule date={date} setDate={setDate} onOpenGame={openGame} onOpenTeam={openTeam} />}
            {tab === 'odds' && <BucketsOdds date={date} onOpenPlayer={openPlayer} />}
            {tab === 'storylines' && <StorylinesPage sport="nba" eyebrow="BUCKETS · STORYLINES" theme={C} numFont={NUM_FONT} accent={C.purple} onOpenPlayer={openPlayer} onOpenGame={openGame} date={date} />}
            {tab === 'watchlist' && <Watchlist onOpenPlayer={openPlayer} />}
            {tab === 'ledger' && <Ledger date={date} setDate={setDate} {...nav} />}
            {tab === 'hot' && <Hot date={date} setDate={setDate} {...nav} />}
            {tab === 'matchups' && <Matchups date={date} setDate={setDate} onOpenTeam={openTeam} onOpenGame={openGame} />}
            {tab === 'standings' && <Standings onOpenTeam={openTeam} />}
            {tab === 'teams' && <Teams onOpenTeam={openTeam} />}
            {tab === 'team' && <Team abbrev={teamKey} {...nav} backLabel={backLabel('teams')} onBack={() => goBack('teams')} />}
            {tab === 'players' && <Players {...nav} />}
            {tab === 'player' && <Player id={playerId} {...nav} backLabel={backLabel('players')} onBack={() => goBack('players')} />}
            {tab === 'leaders' && <Leaders {...nav} />}
            {tab === 'shotmap' && <ShotMap {...nav} />}
            {tab === 'results' && <Results {...nav} />}
            {tab === 'guide' && <Guide onNavigate={setTab} />}
          </ErrorBoundary>
          <DashFooter sport="nba" theme={C} onGuide={() => setTab('guide')} />
          </TeamNav.Provider>
          </SportTheme>
        </>)}
      </main>
      </TodayContext.Provider>
      <MobileTabBarBuckets tab={tab} setTab={setTab} />
    </AccentProvider>
  )
}
