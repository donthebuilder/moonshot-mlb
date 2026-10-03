'use client'
import { useState } from 'react'
import PageHeader from '../../PageHeader'
import { MatchLogos } from '../../TeamMark'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard } from '../../../lib/nba/useBuckets'
import { MARKET_OPTIONS, NBA_MARKETS } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import { boardRows, boardColumns, faceOf } from '../boardTable'
import { sortGames } from '../GameList'
import BucketsProjected from '../BucketsProjected'
import BucketsWeakSpots from '../BucketsWeakSpots'
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
  const games = sortGames(data?.games || [])
  const [pick, setPick] = useState(() => readHashParam('game'))
  const g = games.find((x) => x.id === pick) || games[0] || null
  const choose = (id) => { setPick(id); writeHashParam('game', id) }
  const rows = g ? boardRows(data, { gameId: g.id }) : []
  const calls = rows.filter((r) => r.status === 'called')
  const shown = data?.date || date
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · SLATE" title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every game that day, one at a time: its calls and its board for the market you pick."
        stats={data ? [{ value: games.length, label: 'GAMES', tone: C.text2 }] : null} />
      <DayPager shown={shown} date={date} setDate={setDate} />
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="the slate" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note="Page a day for the next slate." />}
      {games.length > 0 && <Pills ariaLabel="View" value={view} onChange={setView} options={[{ key: 'games', text: '🏟 Games' }, { key: 'table', text: '📊 Table' }]} />}
      {view === 'table' && games.length > 0 && (
        <div>
          <BucketsProjected rows={pts.data?.rows || []} games={games} onOpenTeam={onOpenTeam} onOpenGame={(id) => { choose(id); setView('games') }} />
          <BucketsWeakSpots rows={pts.data?.rows || []} games={games} onOpenPlayer={onOpenPlayer} />
        </div>
      )}
      {view === 'games' && games.length > 0 && (
        <div role="tablist" aria-label="Games" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {games.map((x) => {
            const on = g?.id === x.id
            return (
              <button key={x.id} type="button" role="tab" aria-selected={on} onClick={() => choose(x.id)} style={{ flex: 'none', minHeight: 44, padding: '0 12px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? C.purple : C.border2}`, background: on ? `${C.purple}1a` : C.bg2, color: on ? C.text : C.text2, display: 'inline-flex', alignItems: 'center', gap: 8, font: `800 11px/1 ${NUM_FONT}` }}>
                <MatchLogos sport="nba" away={x.away.abbrev} home={x.home.abbrev} px={18} />
                <span>{x.state === 'live' ? <><RimDot size={6} />{x.detail}</> : x.state === 'final' ? `${x.away.score}-${x.home.score} F` : fmtTip(x.start)}</span>
              </button>
            )
          })}
        </div>
      )}
      {view === 'games' && g && (<>
        <Pills ariaLabel="Market" value={m} onChange={(k) => { setM(k); writeHashParam('m', k === 'pts' ? null : k) }} options={MARKET_OPTIONS} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: C.text2 }}>
          <b style={{ color: C.text }}>{g.away.name} at {g.home.name}</b>
          <span>{g.venue}</span>
          <NavBtn onClick={() => onOpenGame?.(g.id)}>Open game →</NavBtn>
        </div>
        {calls.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {calls.map((r) => (
              <button key={r._id} type="button" onClick={() => onOpenPlayer?.(r.playerId)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${C.purple}`, background: `${C.purple}14`, color: C.text, font: `800 12px/1 ${NUM_FONT}`, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: C.purple, fontSize: 10 }}>{r.role || 'CALLED'}</span>{r.name}<span style={{ color: C.text3 }}>{r.team} · {r.score}</span>
              </button>
            ))}
          </div>
        )}
        {rows.length > 0
          ? <BucketsTable rows={rows} columns={boardColumns(m, { onOpenTeam, onOpenGame, withGame: false })} statusOf={(r) => r.status}
              onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={faceOf} dimRow={(r) => r.status === 'off'}
              initialSort={{ key: 'nightRank', dir: 'asc' }} heatMode="sorted" maxHeight={560} maxRows={Math.max(rows.length, 1)}
              caption={`This game’s board for ${NBA_MARKETS[m].label}. Each row opens that player.`} />
          : <EmptyState title={NBA_MARKETS[m].startersOnly ? 'NO STARTERS LISTED YET' : 'NOBODY RATED IN THIS GAME'} note={NBA_MARKETS[m].startersOnly ? 'First basket waits for the pre-tip box score.' : 'No player in this game has ten NBA games on file.'} />}
      </>)}
      <SourceLine>Same rows as Props (/api/buckets/board), filtered to one game.</SourceLine>
    </div>
  )
}
