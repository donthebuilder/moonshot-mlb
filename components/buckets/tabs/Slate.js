'use client'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { MatchLogos } from '../../TeamMark'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard, useBucketsExpected, useBucketsTeamModel } from '../../../lib/nba/useBuckets'
import { MARKET_OPTIONS, NBA_MARKETS } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import { boardRows, boardColumns, faceOf } from '../boardTable'
import { sortGames } from '../GameList'
import BucketsProjected from '../BucketsProjected'
import BucketsWeakSpots from '../BucketsWeakSpots'
import SlateCard from '../../slate/SlateCard'
import { heatTier } from '../../../lib/nhl/slateHeat'
import { EXPECTED_POINTS_WORDS } from '../../../lib/nba/teamModel'
import { basisLine } from '../BucketsTeamExpected'
import Rail from '../../Rail'
import { BucketsCards } from '../BucketsCard'
import CardButton from '../../CardButton'
import { downloadBucketsGameCard } from '../shareCard'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, NavBtn, DayPager, RimDot, fmtDay, fmtTip, readHashParam, writeHashParam } from '../ui'

// 📋 THE SLATE -- tonight one game at a time (LAMP's Slate): pick a game, see
// its calls and its board for the market you pick. The open game rides the
// address (game=), so a link opens the same game.
export default function Slate({ date, setDate, market = 'pts', onOpenPlayer, onOpenTeam, onOpenGame }) {
  const [m, setM] = useState(market)
  // MOONSHOT's / LAMP's two views: the whole night as a table, or one game at a time
  const [view, setView] = useState('games')
  const { data, error, loading } = useBucketsBoard(date, m)
  // the table view reads the points board whatever market the games view is on (its legs are points legs)
  const pts = useBucketsBoard(date, 'pts')
  const xp = useBucketsExpected(date)
  // THE TEAM MODEL (lib/nba/teamModel.js): expected points a game, the Slate dial (NHL's expected goals, NFL's expected touchdowns)
  const tm = useBucketsTeamModel(date)
  const tmBy = useMemo(() => new Map((tm.data?.games || []).map((x) => [String(x.id), x])), [tm.data])
  const xptsBy = useMemo(() => new Map((xp.data?.rows || []).map((r) => [String(r.playerId), r])), [xp.data])
  const games = sortGames(data?.games || [])
  const [pick, setPick] = useState(() => readHashParam('game'))
  const g = games.find((x) => x.id === pick) || games[0] || null
  // a back/forward or a pasted link changes the address under the page: follow it
  useEffect(() => {
    const sync = () => setPick(readHashParam('game'))
    window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])
  const choose = (id) => { setPick(id); writeHashParam('game', id) }
  const rows = g ? boardRows(data, { gameId: g.id, xpts: xptsBy }) : []
  const calls = rows.filter((r) => r.status === 'called')
  const shown = data?.date || date
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · SLATE" title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every game that day, with its calls and board."
        stats={data ? [{ value: games.length, label: 'GAMES', tone: C.text2 }] : null} />
      <DayPager shown={shown} date={date} setDate={setDate} />
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="the slate" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note="Try another day." />}
      {games.length > 0 && <Pills ariaLabel="View" value={view} onChange={setView} options={[{ key: 'games', text: '🏟 Games' }, { key: 'table', text: '📊 Table' }]} />}
      {view === 'table' && games.length > 0 && (
        <div>
          <BucketsProjected rows={pts.data?.rows || []} games={games} onOpenTeam={onOpenTeam} onOpenGame={(id) => { choose(id); setView('games') }} />
          <BucketsWeakSpots rows={pts.data?.rows || []} games={games} onOpenPlayer={onOpenPlayer} />
        </div>
      )}
      {/* THE STRIP ON THE SHARED GAME CARD (2026-10-03, Donovan: "the cards for
          the games pages ... used wherever we use those type of games pages"):
          components/slate/SlateCard, as MOONSHOT, TUDDY and LAMP's slates --
          the dial is the game's best BUCKETS score on this market, 🔒 locked
          before tip / ◻ still a preview, tip time / live / final. */}
      {view === 'games' && games.length > 0 && (
        <div>
          <Rail itemMin={264} gap={8} wheelScroll={false}>
            {games.map((x) => {
              const xs = (data?.rows || []).filter((r) => r.gameId === x.id && Number.isFinite(Number(r.score)))
              const best = xs.length ? Math.max(...xs.map((r) => Number(r.score))) : null
              const locked = xs.length > 0 && xs.every((r) => r.locked !== false)
              const st = x.state
              const m1 = tmBy.get(String(x.id)) || null
              const heat = m1?.heat ?? 0
              const tier = heatTier(heat)
              const way = m1?.basis === 'this season' ? '' : ` (${m1?.basis})`
              return <SlateCard key={x.id} sport="nba" accent={C.purple} on={g?.id === x.id} onSelect={choose} card={{
                large: true,
                id: x.id, title: <MatchLogos sport="nba" away={x.away.abbrev} home={x.home.abbrev} px={30} gap={5} />, past: st === 'final',
                heat, tooltip: `${x.away.abbrev} @ ${x.home.abbrev}`,
                dial: { value: m1 ? m1.total : null, dp: 0, pct: m1 ? 100 * heat : null, col: tier === 'hot' ? C.purple : tier === 'cold' ? C.text3 : C.text2,
                  title: m1 ? `${m1.total.toFixed(1)} ${EXPECTED_POINTS_WORDS} in this game${way}: ${x.away.abbrev} ${m1.away.pts.toFixed(1)}, ${x.home.abbrev} ${m1.home.pts.toFixed(1)}, from each club's points a game against the other's allowed. The ring fills against every pairing of the league's clubs.${best != null ? ` Best ${NBA_MARKETS[m].label} score here: ${Math.round(best)}.` : ''}` : `No ${EXPECTED_POINTS_WORDS} number for this game yet.` },
                lead: <span title={locked ? 'The board locked before tip' : 'A preview until the board locks'}>{locked ? '🔒' : '◻'}</span>,
                status: st === 'live' ? { kind: 'live', text: x.detail || 'LIVE' } : st === 'final' ? { kind: 'final', text: `${x.away.score}-${x.home.score} F` } : { kind: 'time', text: fmtTip(x.start) },
                extra: <span>{EXPECTED_POINTS_WORDS}{m1 ? ` · ${x.away.abbrev} ${Math.round(m1.away.pts)}, ${x.home.abbrev} ${Math.round(m1.home.pts)}${way}` : ' · —'}</span>,
              }} />
            })}
          </Rail>
          <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.4, color: C.text3 }}>Tip-off order. Dial = {EXPECTED_POINTS_WORDS} (team model). 🔒 locked, ◻ preview.{(() => { const b = basisLine(games.map((x) => tmBy.get(String(x.id))), games.some((x) => x.seasonType === 1)); return b ? ` ${b}` : tm.error ? ` No ${EXPECTED_POINTS_WORDS} number yet: the league feed is slow.` : '' })()}</div>
        </div>
      )}
      {view === 'games' && g && (<>
        <Pills ariaLabel="Market" value={m} onChange={(k) => { setM(k); writeHashParam('m', k === 'pts' ? null : k) }} options={MARKET_OPTIONS} />
        {/* the title and venue stack in one block so Open game and the 📸 (fix15: this game as a PNG -- the two clubs, the team
            model's expected points, its players on the board) stay on the same line on a phone */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.text2 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <b style={{ color: C.text }}>{g.away.name} at {g.home.name}</b>
            <div>{g.venue}</div>
          </div>
          <NavBtn onClick={() => onOpenGame?.(g.id)}>Open game →</NavBtn>
          <CardButton sport="nba" label="Download this game as an image" onDownload={() => downloadBucketsGameCard({ g, rows, tm: tmBy.get(String(g.id)) || null, market: m, date: shown || '' })} />
        </div>
        {/* the game's calls as the prop cards (components/buckets/BucketsCard) */}
        {calls.length > 0 && <BucketsCards market={m} onOpen={onOpenPlayer} rows={[...calls].sort((a, b) => b.score - a.score)} />}
        {rows.length > 0
          ? <BucketsTable rows={rows} columns={boardColumns(m, { onOpenTeam, onOpenGame, withGame: false, withXpts: true })} statusOf={(r) => r.status}
              onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={faceOf} dimRow={(r) => r.status === 'off'}
              initialSort={{ key: 'nightRank', dir: 'asc' }} heatMode="sorted" maxHeight={560} maxRows={Math.max(rows.length, 1)}
              caption={`This game’s board for ${NBA_MARKETS[m].label}. Each row opens that player.`} />
          : <EmptyState title={NBA_MARKETS[m].startersOnly ? 'NO STARTERS LISTED YET' : 'NOBODY RATED IN THIS GAME'} note={NBA_MARKETS[m].startersOnly ? 'First basket waits for the pre-tip box score.' : 'No player in this game has ten NBA games on file.'} />}
      </>)}
      <SourceLine>Same rows as Props (/api/buckets/board), filtered to one game.</SourceLine>
    </div>
  )
}
