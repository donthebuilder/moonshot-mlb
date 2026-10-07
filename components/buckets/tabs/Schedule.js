'use client'
import PageHeader from '../../PageHeader'
import { MatchLogos } from '../../TeamMark'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsSchedule } from '../../../lib/nba/useBuckets'
import BucketsTable from '../BucketsTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, NavBtn, RimDot, SeasonTypeChip, fmtDay, fmtTip, zoneAbbrev } from '../ui'

// 📅 SCHEDULE -- the league week, day by day (LAMP's Schedule): tip times in
// the viewer's zone, finals with the score, a row a game that opens it. The
// week runs seven days from the shell's day; paging moves that one day.
export default function Schedule({ date, setDate, onOpenGame, onOpenTeam }) {
  const { data, error, loading } = useBucketsSchedule(date)
  const days = (data?.days || []).filter((d) => d.games.length)
  const total = (data?.days || []).reduce((n, d) => n + d.games.length, 0)
  const first = data?.days?.[0]?.date, last = data?.days?.[data.days.length - 1]?.date
  const cols = [
    { key: 'match', label: 'Game', group: 'Game', w: 120, heat: false, sticky: true, fmt: (v, r) => <MatchLogos sport="nba" away={r.away.abbrev} home={r.home.abbrev} px={18} />, link: (r) => (onOpenGame ? () => onOpenGame(r.id) : null) },
    { key: 'awayName', label: 'Away', group: 'Game', w: 90, heat: false, link: (r) => (onOpenTeam ? () => onOpenTeam(r.away.abbrev) : null) },
    { key: 'homeName', label: 'Home', group: 'Game', w: 90, heat: false, link: (r) => (onOpenTeam ? () => onOpenTeam(r.home.abbrev) : null) },
    { key: 'when', label: 'Tip / Score', group: 'Result', w: 110, heat: false, mono: true, fmt: (v, r) => (r.state === 'live' ? <span style={{ color: C.rim }}><RimDot size={6} />{r.detail}</span> : r.state === 'final' ? `${r.away.abbrev} ${r.away.score}-${r.home.score} ${r.home.abbrev}` : fmtTip(r.start)) },
    { key: 'type', label: 'Type', group: 'Result', w: 120, heat: false, fmt: (v, r) => (r.seasonType === 2 ? '' : <SeasonTypeChip type={r.seasonType} />) },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · SCHEDULE" title={first && last ? `${fmtDay(first)} – ${fmtDay(last)}` : 'This week'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note={`The next seven days. Times in your zone (${zoneAbbrev()}).`}
        stats={data ? [{ value: total, label: 'GAMES', tone: C.text2 }, { value: days.length, label: 'DAYS', tone: C.text2 }] : null} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <NavBtn onClick={() => setDate(data?.prevStart)} disabled={loading || !data}>‹ Prev week</NavBtn>
        <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong={!date}>This week</NavBtn>
        <NavBtn onClick={() => setDate(data?.nextStart)} disabled={loading || !data}>Next week ›</NavBtn>
      </div>
      <DelayedBanner error={error} what="the league schedule" />
      {loading && !data ? <Loading what="the week" /> : null}
      {data && !days.length && <EmptyState title="NO GAMES THIS WEEK" note="No games these seven days. Try another week." />}
      {days.map((d) => (
        <section key={d.date}>
          <Kicker>{fmtDay(d.date).toUpperCase()} · {d.games.length} GAME{d.games.length === 1 ? '' : 'S'}</Kicker>
          <BucketsTable rows={d.games.map((g) => ({ ...g, _id: g.id, match: `${g.away.abbrev} @ ${g.home.abbrev}`, awayName: g.away.name, homeName: g.home.name, when: g.start }))} columns={cols}
            onRowClick={(r) => onOpenGame?.((r?._raw ?? r).id)} heatMode="none" maxHeight={9999} maxRows={d.games.length} noGroups
            caption={`${fmtDay(d.date)}: each row opens the game; a club opens its page.`} />
        </section>
      ))}
      <SourceLine>Source: ESPN’s NBA scoreboard, one read a day (/api/buckets/schedule).</SourceLine>
    </div>
  )
}
