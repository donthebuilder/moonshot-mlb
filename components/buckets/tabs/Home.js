'use client'
import { dayLine } from '../../../lib/dayLine'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { NBA_NAV } from '../../../lib/nba/routes'
import { useBucketsBoard } from '../../../lib/nba/useBuckets'
import { sortGames } from '../GameList'
import BucketsHeadline from '../BucketsHeadline'
import { EmptyState, DelayedBanner, Loading, NavBtn } from '../ui'
import NbaTonight from '../../tonight/NbaTonight'
import HeadlineStrip from '../../HeadlineStrip'
import HomeGreeting from '../../home/HomeGreeting'
import SlateRow from '../../home/SlateRow'
import HomeLinks from '../../home/HomeLinks'
import RaceTracker from '../../RaceTracker'
import NetworkRow from '../../NetworkRow'
import { useGameTotals } from '../../GameTotalLine'
import { useStoryCards } from '../../../lib/useStoryCards'
import Fold from '../../Fold'
import TonightsCalls from '../../phone/TonightsCalls'
import HotNumbers from '../../numerology/HotNumbers'
import { useLockOf } from '../../MemberGate'

// 🌙 TONIGHT -- the NBA night in one page, rebuilt 2026-10-03 on the shared
// opener (Donovan: "the nba home seems to be missing a lot of components"):
// MOONSHOT / TUDDY / LAMP's DayHero + HeroStats, the people one tap in, the
// calls as HeadlinePicks cards (BucketsHeadline), Bucket Watch, the story
// engine's strip, then the games and who leads. Every section is a door to
// its page; a long list previews a few rows.
export default function Home({ today, date, setTab, onOpenPlayer, onOpenGame, onOpenTeam }) {
  const day = today?.data
  const games = sortGames(day?.games || [])
  const pts = useBucketsBoard(date, 'pts')
  const reb = useBucketsBoard(date, 'reb')
  const ast = useBucketsBoard(date, 'ast')
  const tpm = useBucketsBoard(date, '3pm')
  const pra = useBucketsBoard(date, 'pra')

  const boardGames = pts.data?.games || []
  // the locked games are the board's own list (lib/nba/boardRead lockedGames); the games
  // carry no `locked` field, so this read 0 every night until 10-04
  const lockedN = (pts.data?.lockedGames || []).length
  const allLocked = boardGames.length > 0 && lockedN === boardGames.length
  const heroGames = games.map((g) => ({ away: g.away?.abbrev, home: g.home?.abbrev, start: Date.parse(g.start || ''), state: g.state === 'live' ? 'live' : g.state === 'final' ? 'final' : 'pre' }))
  const hero = dayLine(heroGames, { sport: 'nba', date: day?.date || date || undefined })
  // the top points score a free viewer may read (a CALLED, not-started pick is held back, as the Top 10s were)
  const lockOf = useLockOf()
  const startOf = new Map((pts.data?.games || []).map((g) => [String(g.id), g.start]))
  const topPts = (pts.data?.rows || []).filter((r) => Number.isFinite(Number(r.score))).sort((x, y) => y.score - x.score)
    .find((r) => !lockOf({ status: r.status, key: `${r.gameId}|${r.playerId}`, time: startOf.get(String(r.gameId)), graded: r.hit === true || r.hit === false }).locked) || null

  // THE HOME, TUDDY'S LAYOUT (2026-10-22, Donovan: "build the same Home for LAMP, BUCKETS and MOONSHOT"): numbers, the greeting
  // (the day, the next tip, three tiles, the storylines strip), The Starting Five, Tonight, the calls, the races, the slate, the link
  // tiles, across the network. Bucket Watch, the Top 10s and Who leads are one tap away; title odds and the award races live on Leaders.
  const stories = useStoryCards('nba', { color: C.purple })
  const totals = useGameTotals('nba')
  const pre = games.filter((g) => g.state === 'pre' && Number.isFinite(Date.parse(g.start || ''))).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const nextG = pre[0] || null
  const kick = nextG ? { away: nextG.away?.name || nextG.away?.abbrev, home: nextG.home?.name || nextG.home?.abbrev, start: Date.parse(nextG.start) } : null
  const tiles = [
    { label: date ? 'GAMES' : 'TONIGHT', value: games.length, sub: games.length === 1 ? 'game' : 'games' },
    { label: 'TOP PTS SCORE', value: topPts ? Math.round(topPts.score) : '—', sub: topPts?.name || 'waiting for the board', dim: !topPts, onClick: topPts && onOpenPlayer ? () => onOpenPlayer(topPts.playerId) : null },
    { label: 'LOCKED', value: `${lockedN}/${boardGames.length || 0}`, sub: allLocked ? 'every game locked' : 'games locked at tip', dim: !boardGames.length },
  ]
  const slateGames = games.map((g) => ({ id: g.id, away: g.away?.abbrev, home: g.home?.abbrev, start: Date.parse(g.start || ''), state: g.state, awayScore: g.away?.score, homeScore: g.home?.score }))
  const LINKS = [
    { tab: 'fullboard', sub: 'every player, ranked' }, { tab: 'scores', sub: 'every game' }, { tab: 'leaders', sub: 'title odds, awards' },
    { tab: 'standings', sub: 'the conferences' }, { tab: 'ledger', sub: 'who scored' }, { tab: 'matchups', sub: 'defense vs position' },
    { tab: 'results', sub: 'every call graded' }, { tab: 'players', sub: 'find anyone' }, { tab: 'storylines', sub: 'every story' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <HotNumbers compact sport="nba" date={day?.date || date} theme={C} numFont={NUM_FONT} accent={C.purple} onOpen={() => setTab?.('numerology')} />

      <HomeGreeting sport="nba" theme={C} numFont={NUM_FONT} icon="🏀" eyebrow={hero.eyebrow} live={Boolean(day?.live)} kick={kick} verb="tips off" more={Math.max(0, pre.length - 1)}
        lead={!day ? 'Tonight on BUCKETS.' : hero.lead} accentText={!day ? '' : games.length ? (allLocked ? 'Grading as they land.' : 'Two called per game.') : hero.accent} tiles={tiles}>
        {stories.length ? <HeadlineStrip sport="nba" cards={stories} onOpen={(c) => (c.playerId ? onOpenPlayer?.(c.playerId) : null)} theme={C} numFont={NUM_FONT} accent={C.purple} title="STORIES" countWord="in the strip" /> : null}
      </HomeGreeting>
      <DelayedBanner error={today?.error} what="the league’s scores" />
      {!day && today?.loading ? <Loading what="tonight" /> : null}

      <BucketsHeadline theme={C} numFont={NUM_FONT} boards={{ pts: pts.data, reb: reb.data, ast: ast.data, '3pm': tpm.data, pra: pra.data }} onOpenPlayer={onOpenPlayer} />
      {/* TONIGHT (2026-10-04): who cleared, who's still to go (components/tonight/NbaTonight.js) */}
      <NbaTonight board={pts.data} date={date} onOpenPlayer={onOpenPlayer} setTab={setTab} />
      {!date && <Fold id="buckets-calls" title="🃏 Tonight's calls" meta="swipe the real cards"><TonightsCalls sport="nba" /></Fold>}
      <RaceTracker sport="nba" theme={C} numFont={NUM_FONT} onOpen={() => setTab?.('leaders')} />
      {day && !games.length ? <EmptyState title="NO GAMES TODAY" note="Nothing on the league’s calendar today. Page a day on Live, or open a club’s schedule."><NavBtn onClick={() => setTab('scores')} strong>Open Live</NavBtn></EmptyState> : null}
      <SlateRow sport="nba" theme={C} numFont={NUM_FONT} games={slateGames} totals={totals} onOpenGame={onOpenGame} title={date ? 'THE GAMES' : 'TONIGHT'} />
      <HomeLinks sport="nba" theme={C} nav={NBA_NAV} links={LINKS} setTab={setTab} label="More on BUCKETS" />
      <NetworkRow sport="nba" theme={C} numFont={NUM_FONT} />
    </div>
  )
}
