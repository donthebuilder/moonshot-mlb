'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard, useBucketsLeaders } from '../../../lib/nba/useBuckets'
import { boardRows } from '../boardTable'
import GameList from '../GameList'
import BucketsTable from '../BucketsTable'
import { EmptyState, DelayedBanner, Loading, Kicker, NavBtn, SourceLine, LastSeasonNote, fmtDay } from '../ui'

// 🌙 TONIGHT -- the NBA night in one page (LAMP's Home, MOONSHOT's order):
// the games, the points calls, and who leads the league. Every section is a
// door to its page; a long list previews a few rows.
export default function Home({ today, date, setTab, onOpenPlayer, onOpenGame, onOpenTeam }) {
  const day = today?.data
  const games = day?.games || []
  const board = useBucketsBoard(date, 'pts')
  const leaders = useBucketsLeaders()
  const calls = boardRows(board.data, { calledOnly: true }).slice(0, 8)
  const top = (leaders.data?.categories || []).map((c) => ({ ...c.leaders?.[0], cat: c.label, _id: c.key })).filter((r) => r.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="BUCKETS · TONIGHT" title={day?.date ? fmtDay(day.date) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="The NBA night in one page: the games, the points calls, and who leads the league."
        stats={day ? [{ value: games.length, label: 'GAMES', tone: C.text2 }, { value: day.live, label: 'LIVE', tone: day.live ? C.rim : C.text3 }] : null} />
      <DelayedBanner error={today?.error} what="the league’s score feed" />
      {!day && today?.loading ? <Loading what="tonight" /> : null}
      <section>
        <Kicker>THE GAMES</Kicker>
        {day && !games.length ? <EmptyState title="NO GAMES TODAY" note="Nothing on the league’s calendar today. Page a day on Live, or open a club’s schedule."><NavBtn onClick={() => setTab('scores')} strong>Open Live</NavBtn></EmptyState> : null}
        {games.length > 0 && <GameList games={games} onOpenGame={onOpenGame} />}
      </section>
      <section>
        <Kicker>THE POINTS CALLS</Kicker>
        {calls.length > 0 ? (
          <BucketsTable rows={calls} columns={[
            { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
            { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
            { key: 'oppTxt', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
            { key: 'score', label: 'Score', group: 'Call', w: 54, dp: 0, primary: true },
            { key: 'role', label: 'Call', group: 'Call', w: 64, heat: false, mono: true, fmt: (v, r) => <span style={{ color: C.purple, fontWeight: 900 }}>{v || 'CALLED'}{r.locked ? '' : ' · PREVIEW'}</span> },
          ]} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
            heatMode="none" maxHeight={9999} maxRows={8} caption="The points board’s calls, one per team in each game. Each row opens that player." />
        ) : board.data ? <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>{board.data.games?.length ? 'No calls on the points board yet.' : 'No games, no calls.'}</p> : null}
        <div style={{ marginTop: 8 }}><NavBtn onClick={() => setTab('board')} strong>Every market on Props →</NavBtn></div>
      </section>
      <section>
        <Kicker>WHO LEADS{leaders.data?.seasonLabel ? ` · ${leaders.data.seasonLabel}` : ''}</Kicker>
        {leaders.data?.stale && <LastSeasonNote label={leaders.data.seasonLabel} what="leaders" />}
        {top.length > 0 && (
          <BucketsTable rows={top.map((r) => ({ ...r, playerId: r.id }))} columns={[
            { key: 'cat', label: 'Per game', group: 'Leader', w: 90, heat: false, mono: true },
            { key: 'name', label: 'Player', group: 'Leader', w: 150, heat: false, bold: true, sticky: true },
            { key: 'team', label: 'Tm', group: 'Leader', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
            { key: 'value', label: 'Value', group: 'Line', w: 56, heat: false, mono: true, dp: 1 },
          ]} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
            heatMode="none" maxHeight={9999} maxRows={top.length} caption="The league leader in each category. Each row opens that player." />
        )}
        <div style={{ marginTop: 8 }}><NavBtn onClick={() => setTab('leaders')}>Every leader →</NavBtn></div>
      </section>
      <SourceLine>Games: /api/buckets/scores. Calls: /api/buckets/board (points). Leaders: /api/buckets/leaders.</SourceLine>
    </div>
  )
}
