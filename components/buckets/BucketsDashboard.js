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
import LedgerShell from '../pages/LedgerShell'
import BucketsTable from './BucketsTable'
import CardSection from '../card/CardSection'
import { useMemo } from 'react'
import { TeamNav } from '../../lib/teamNav'
import HighlightBar from '../HighlightBar'
import { SportTheme } from '../SportTheme'
import { TodayContext } from '../TodayContext'
import { pageTitle, NBA_NAV, isLiveTab } from '../../lib/routes'
import { useShellRoute } from '../../lib/useShellRoute'
import { usePageTitle, addressTab } from '../../lib/usePageTitle'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { GAME_ID_RE, PLAYER_ID_RE, TEAM_RE } from '../../lib/nba/ids'
import { AccentProvider } from '../Filters'
import { useBucketsScores, useBucketsScoresOn } from '../../lib/nba/useBuckets'
import ErrorBoundary from '../ErrorBoundary'
import TabNotFound from '../TabNotFound'
import MobileCSS from '../MobileCSS'
import RefreshStamp from '../RefreshStamp'
import BucketsHeader from './BucketsHeader'
import Slip from '../Slip'
import MobileTabBarBuckets from './MobileTabBarBuckets'
import QuickSearch from '../QuickSearch'
import { BUCKETS_SUBS, BUCKETS_LINE_TABS } from './tabExplainerTexts'
import NflNote from '../nfl/NflNote'
import { readHashParam } from './ui'
import Home from './tabs/Home'
import dynamic from 'next/dynamic'
// ONE TAB'S CODE AT A TIME (2026-10-04, JS split): Home paints first; every
// other tab is fetched the first time it opens, then cached -- MOONSHOT's
// Dashboard pattern. A tab you never open costs nothing.
import TabLoading from '../TabLoading'
const Board = dynamic(() => import('./tabs/Board'), { loading: TabLoading })
const Scores = dynamic(() => import('./tabs/Scores'), { loading: TabLoading })
const Slate = dynamic(() => import('./tabs/Slate'), { loading: TabLoading })
const Game = dynamic(() => import('./tabs/Game'), { loading: TabLoading })
const Standings = dynamic(() => import('./tabs/Standings'), { loading: TabLoading })
const Matchups = dynamic(() => import('./tabs/Matchups'), { loading: TabLoading })
const Ledger = dynamic(() => import('./tabs/Ledger'), { loading: TabLoading })
const Numerology = dynamic(() => import('./tabs/Numerology'), { loading: TabLoading })
const Watchlist = dynamic(() => import('./tabs/Watchlist'), { loading: TabLoading })
const StorylinesPage = dynamic(() => import('../StorylinesPage'), { loading: TabLoading })
const Team = dynamic(() => import('./tabs/Team'), { loading: TabLoading })
const Players = dynamic(() => import('./tabs/Players'), { loading: TabLoading })
const Player = dynamic(() => import('./tabs/Player'), { loading: TabLoading })
// next/dynamic returns a wrapper that does not carry the module's statics, so the flag PlayerPeek reads (the page holds the card's one toolbar and the close in its header) is set on the wrapper itself
Player.peekToolbar = true
const Pairs = dynamic(() => import('./tabs/Pairs'), { loading: TabLoading })
const Power = dynamic(() => import('./tabs/Power'), { loading: TabLoading })
const Leaders = dynamic(() => import('./tabs/Leaders'), { loading: TabLoading })
const ShotMap = dynamic(() => import('./tabs/ShotMap'), { loading: TabLoading })
const CalledLedger = dynamic(() => import('./tabs/CalledLedger'), { loading: TabLoading })
const Results = dynamic(() => import('./tabs/Results'), { loading: TabLoading })
const Guide = dynamic(() => import('./tabs/Guide'), { loading: TabLoading })
const Binder = dynamic(() => import('./tabs/Binder'), { loading: TabLoading })   // 2026-10-12: cards earned by the players I follow (hidden with the rest of BUCKETS)
const BucketsOdds = dynamic(() => import('./BucketsOdds'))
import { useBucketsSaves } from '../../lib/nba/useBucketsSaves'
import DashFooter from '../DashFooter'
import PlayerPeek from '../PlayerPeek'
import SkipLink from '../SkipLink'
import BucketsProps from './BucketsProps'

// Pages that show one day and keep it in the address (`date=`).
const DATED_TABS = new Set(['home', 'scores', 'board', 'fullboard', 'games', 'matchups', 'power', 'ledger', 'storylines', 'odds', 'numerology'])
const MARKETS = new Set(['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td', 'first'])
const ROUTE = {
  sport: 'nba', nav: NBA_NAV, datedTabs: DATED_TABS,
  ids: { game: GAME_ID_RE, team: TEAM_RE, player: PLAYER_ID_RE },
  // the shot map's pick rides team= / player= too
  keep: { game: ['games'], m: ['board', 'games', 'fullboard'], player: ['players', 'shotmap'], team: ['shotmap'] },
}

export default function BucketsDashboard() {
  const { routed, tab, setTab, gameId, teamKey, playerId, missingTab, date, setDate, badDate, setBadDate, openGame, openTeam, openPlayer, backLabel, goBack, peekId, peekPlayer, closePeek, stepPlayer } = useShellRoute(ROUTE)
  usePageTitle(`${pageTitle('nba', routed ? tab : addressTab('nba'))} · DASH Network`, 'nba')   // before it routes: the address's tab, not Home's title for a frame (2026-10-21)
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
  // a tapped player opens his card over the page (components/PlayerPeek); Full page = openPlayer
  const nav = { onOpenPlayer: peekPlayer, onOpenGame: openGame, onOpenTeam: openTeam }

  return (
    <AccentProvider value={C.purple}>
      <MobileCSS />
      <SkipLink />
      <BucketsHeader setTab={setTab} live={live} date={date} setDate={setDate} scores={shown} liveScores={today} onOpenPlayer={peekPlayer} onOpenGame={openGame} />
      <TodayContext.Provider value={nbaToday}>
      <main id="board-main" className="dashboard-main" style={{ maxWidth: 1300, margin: '0 auto', padding: '14px 14px 40px', background: C.bg, color: C.text }}>
        <h1 className="sr-only">{pageTitle('nba', missingTab ? 'home' : tab)}</h1>
        {/* the page's one line and its (?), TUDDY's (NflDashboard): only on a page with no header of its own (2026-10-20, the chip is gone) */}
        {routed && !missingTab && BUCKETS_LINE_TABS.has(tab) && <div style={{ margin: '2px 0 12px', fontSize: 12, lineHeight: 1.45, color: C.text3 }}><NflNote tab={tab} subs={BUCKETS_SUBS} /></div>}
        {badDate && !missingTab && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px', padding: '8px 12px', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.border2}`, borderRadius: 10, background: C.bg2, fontSize: 12, color: C.text2 }}>
            <span style={{ flex: 1 }}><b style={{ color: C.text, fontFamily: NUM_FONT }}>{badDate}</b> isn&apos;t a real date, so that day is unavailable. Showing tonight instead.</span>
            <button type="button" onClick={() => setBadDate('')} aria-label="Dismiss" style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        )}
        {missingTab ? (
          <TabNotFound asked={missingTab} sport="nba" palette={C} onNavigate={setTab}
            doors={[['home', '\u{1F319} TONIGHT'], ['board', '\u{1F0CF} PROPS'], ['scores', '\u{1F4E1} LIVE'], ['standings', '\u{1F4C8} STANDINGS'], ['players', '\u{1F464} PLAYERS'], ['leaders', '\u{1F3C6} LEADERS'], ['guide', '❓ GUIDE']]} />
        ) : (<>
          <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
            <HighlightBar sport="nba" onOpen={(id) => peekPlayer(id)} />
          </SportTheme>
          <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
          {isLiveTab('nba', tab) && <RefreshStamp live={live > 0} className={tab === 'games' ? 'slate-stamp' : undefined} style={{ marginBottom: 8 }} />}
          <TeamNav.Provider value={openTeam}>
          <ErrorBoundary resetKey={`${tab}:${gameId || ''}:${teamKey || ''}:${playerId || ''}`} label={`the ${tab} tab`}>
            {/* nothing mounts until the address is read (lib/useShellRoute `routed`): a deep link never pays for Home first */}
            {routed && (<>
            {tab === 'home' && <Home today={shown} date={date} setTab={setTab} {...nav} />}
            {/* Props is MOONSHOT's page now (2026-10-04): the cards, then the board under them */}
            {tab === 'board' && <BucketsProps date={date} onOpenPlayer={peekPlayer} />}
            {/* Props is the cards; the table of every player is Rankings (one page, 2026-10-06) */}
            {tab === 'board' && <button type="button" onClick={() => setTab('fullboard')} style={{ display: 'block', minHeight: 44, marginTop: 14, padding: '0 4px', border: 0, background: 'transparent', color: C.purple, font: `800 12px/1 ${NUM_FONT}`, cursor: 'pointer' }}>Every player, every number, and why: {NBA_NAV.fullboard.label} ›</button>}
            {tab === 'fullboard' && <Board date={date} setDate={setDate} market={market} {...nav} />}
            {tab === 'scores' && <Scores date={date} setDate={setDate} onOpenGame={openGame} onOpenTeam={openTeam} />}
            {/* TOP TOTALS now ride each game (components/GameTotalLine.js); the record stays in the Ledger */}
            {tab === 'games' && <Slate date={date} setDate={setDate} market={market} {...nav} />}
            {/* THE CARD (2026-10-20, Donovan "turn it on"): one line under the slate, as LAMP's; its record is in the Ledger (LedgerShell's Record) */}
            {tab === 'games' && <CardSection sport="nba" Table={BucketsTable} compact />}
            {tab === 'game' && <Game id={gameId} {...nav} backLabel={backLabel('scores')} onBack={() => goBack('scores')} />}
            {tab === 'odds' && <BucketsOdds date={date} onOpenPlayer={peekPlayer} />}
            {tab === 'storylines' && <StorylinesPage sport="nba" previewGames={4} eyebrow="BUCKETS · STORYLINES" theme={C} numFont={NUM_FONT} accent={C.purple} onOpenPlayer={peekPlayer} onOpenGame={openGame} date={date} />}
            {tab === 'watchlist' && <Watchlist onOpenPlayer={peekPlayer} onOpenTeam={openTeam} onOpenGame={openGame} />}
            {/* THE LEDGER (2026-10-13): Tonight | Called | Record | Archive, as LAMP's (components/pages/LedgerShell; Called and Archive: tabs/CalledLedger) */}
            {tab === 'ledger' && <LedgerShell sport="nba" date={date} bodies={{
              tonight: () => <Ledger date={date} setDate={setDate} {...nav} />,
              called: () => <CalledLedger onOpenPlayer={peekPlayer} onOpenTeam={openTeam} />,
              record: () => <Results {...nav} />,
              archive: () => <CalledLedger onOpenPlayer={peekPlayer} onOpenTeam={openTeam} initialView="season" />,
            }} />}
            {tab === 'numerology' && <Numerology date={date} onOpenPlayer={peekPlayer} />}
            {tab === 'matchups' && <Matchups date={date} setDate={setDate} onOpenTeam={openTeam} onOpenGame={openGame} />}
            {tab === 'standings' && <Standings onOpenTeam={openTeam} />}
            {tab === 'team' && <Team abbrev={teamKey} {...nav} backLabel={backLabel('standings')} onBack={() => goBack('standings')} />}
            {tab === 'players' && <Players {...nav} />}
            {tab === 'player' && <Player id={playerId} {...nav} onStep={stepPlayer} backLabel={backLabel('players')} onBack={() => goBack('players')} />}
            {tab === 'power' && <Power date={date} setDate={setDate} {...nav} />}
            {tab === 'pairs' && <Pairs onOpenPlayer={peekPlayer} />}
            {tab === 'leaders' && <Leaders {...nav} />}
            {tab === 'shotmap' && <ShotMap {...nav} />}
            {tab === 'binder' && <Binder />}
            {tab === 'guide' && <Guide onNavigate={setTab} />}
                      </>)}
          </ErrorBoundary>
          <DashFooter sport="nba" theme={C} onGuide={() => setTab('guide')} />
          <PlayerPeek id={peekId} Page={Player} theme={C} accent={C.purple} onClose={closePeek} onFullPage={openPlayer} onOpenTeam={openTeam} onOpenGame={openGame} onStep={stepPlayer} />
          </TeamNav.Provider>
          </SportTheme>
        </>)}
      </main>
      </TodayContext.Provider>
      {/* no tab lit on NO SUCH TAB (audit 14 B7b) */}
      {/* ONE SEARCH, EVERY PRODUCT (2026-10-07): players, clubs and games; Ctrl/Cmd-K, "/" or the header's search button */}
      <QuickSearch sport="nba" />
      <MobileTabBarBuckets tab={missingTab ? null : tab} setTab={setTab} />
      <Slip sport="nba" C={C} NUM_FONT={NUM_FONT} accent={C.purple} onOpenProps={() => setTab('board')} />
    </AccentProvider>
  )
}
