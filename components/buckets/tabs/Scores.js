'use client'
import PageHeader from '../../PageHeader'
import PageViews from '../../PageViews'
import Schedule from './Schedule'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsScores } from '../../../lib/nba/useBuckets'
import GameList from '../GameList'
import { EmptyState, DelayedBanner, Loading, DayPager, SeasonTypeChip, Why, fmtDay, zoneAbbrev } from '../ui'
import { localTime } from '../../../lib/localTime'

// 📡 LIVE -- every game on one NBA day: score, quarter, clock. Nothing ranked,
// nothing modelled. The day is the league's Eastern calendar day; times print
// in the viewer's zone. Pulls on the ↻ while a game is live (no timer).
// 2026-10-20 (style audit, LAMP's 10-17 move): the schedule is this page's second view, "Week" (components/PageViews.js). #tab=schedule is an
// alias that lands here with lens=week (lib/routes.js ALIAS_PARAMS); only the chosen view is mounted.
export default function Scores({ date, setDate, onOpenGame, onOpenTeam }) {
  return <PageViews views={[
    { key: 'day', label: 'Day', node: <Day date={date} setDate={setDate} onOpenGame={onOpenGame} /> },
    { key: 'week', label: 'Week', node: <Schedule date={date} setDate={setDate} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} /> },
  ]} />
}

function Day({ date, setDate, onOpenGame }) {
  const { data, error, loading } = useBucketsScores(date)
  const games = data?.games || []
  const shown = data?.date || date
  const final = games.filter((g) => g.state === 'final').length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · SCORES" title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note={<>Every game that day: score, quarter and clock. <Why label="Live" text={`Times are in your zone (${zoneAbbrev()}). The day is the league’s Eastern calendar day.`} /></>}
        stats={data ? [{ value: data.live, label: 'LIVE', tone: data.live ? C.rim : C.text3 }, { value: final, label: 'FINAL', tone: C.text2 }, { value: games.length, label: 'GAMES', tone: C.text2 }] : null} />
      <DayPager shown={shown} date={date} setDate={setDate} disabled={loading} todayWord="Today">
        {[...new Set(games.map((g) => g.seasonType))].map((t) => <SeasonTypeChip key={t} type={t} />)}
      </DayPager>
      <DelayedBanner error={error} what="the league’s scores" />
      {loading && !data ? <Loading what="the scores" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note={`Nothing scheduled for ${fmtDay(shown)}. Try another day, or open a club’s schedule.`} />}
      {games.length > 0 && <GameList games={games} onOpenGame={onOpenGame} />}
    </div>
  )
}
