'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsScores } from '../../../lib/nba/useBuckets'
import GameList from '../GameList'
import { EmptyState, DelayedBanner, Loading, SourceLine, DayPager, SeasonTypeChip, fmtDay, zoneAbbrev } from '../ui'

// 📡 LIVE -- every game on one NBA day: score, quarter, clock. Nothing ranked,
// nothing modelled. The day is the league's Eastern calendar day; times print
// in the viewer's zone. Pulls on the ↻ while a game is live (no timer).
export default function Scores({ date, setDate, onOpenGame }) {
  const { data, error, loading } = useBucketsScores(date)
  const games = data?.games || []
  const shown = data?.date || date
  const final = games.filter((g) => g.state === 'final').length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · LIVE" title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note={`Every game that day — score, quarter and clock. Times are in your zone (${zoneAbbrev()}); the day is the league’s Eastern calendar day.`}
        stats={data ? [{ value: data.live, label: 'LIVE', tone: data.live ? C.rim : C.text3 }, { value: final, label: 'FINAL', tone: C.text2 }, { value: games.length, label: 'GAMES', tone: C.text2 }] : null} />
      <DayPager shown={shown} date={date} setDate={setDate} disabled={loading} todayWord="Today">
        {[...new Set(games.map((g) => g.seasonType))].map((t) => <SeasonTypeChip key={t} type={t} />)}
      </DayPager>
      <DelayedBanner error={error} what="the league’s score feed" />
      {loading && !data ? <Loading what="the scores" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note={`The league has nothing scheduled for ${fmtDay(shown)}. Page a day, or open a club’s schedule.`} />}
      {games.length > 0 && <GameList games={games} onOpenGame={onOpenGame} />}
      <SourceLine>Source: ESPN’s NBA scoreboard, read server-side by /api/buckets/scores.{data?.fetchedAt ? ` Last read ${new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.` : ''}</SourceLine>
    </div>
  )
}
