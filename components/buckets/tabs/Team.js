'use client'
import PageHeader from '../../PageHeader'
import TeamMark from '../../TeamMark'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsTeam } from '../../../lib/nba/useBuckets'
import { nbaTeam } from '../../../lib/nba/teams'
import BucketsTable from '../BucketsTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, BackBtn, LastSeasonNote, SeasonTypeChip, fmtDay, fmtTip, gameDay } from '../ui'

// 🏟 ONE CLUB -- record and seed, the roster with each player's season line,
// and the schedule (/api/buckets/team). Before the season the lines are last
// season's, and the page says so.
export default function Team({ abbrev, onBack, backLabel = 'Teams', onOpenPlayer, onOpenGame, onOpenTeam }) {
  const known = nbaTeam(abbrev)
  const { data, error, loading } = useBucketsTeam(known ? abbrev : null)
  if (!abbrev) return <EmptyState title="NO CLUB PICKED" note="Open a club from Teams or Standings."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!known) return <EmptyState title="NO SUCH CLUB" note={`“${String(abbrev).slice(0, 8)}” isn’t an NBA club code.`}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  const st = data?.standing
  const roster = (data?.players || []).map((p) => ({ ...p, _id: p.id, playerId: p.id, inj: (p.injuries || []).map((i) => i.status || i.type || '').filter(Boolean).join(', ') }))
  const cols = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true, fmt: (v, r) => <span>{v}{r.inj ? <span style={{ color: C.amber, fontSize: 10, marginLeft: 4 }}>{r.inj}</span> : null}</span> },
    { key: 'pos', label: 'Pos', group: 'Player', w: 36, heat: false, mono: true, dim: true },
    { key: 'jersey', label: '#', group: 'Player', w: 32, heat: false, mono: true, dim: true, rankCol: false },
    { key: 'age', label: 'Age', group: 'Player', w: 36, heat: false, mono: true, dim: true },
    { key: 'gp', label: 'GP', group: 'Season', w: 36, mono: true },
    { key: 'min', label: 'MIN', group: 'Season', w: 44, mono: true, dp: 1 },
    { key: 'pts', label: 'PTS', group: 'Season', w: 44, mono: true, dp: 1, primary: true },
    { key: 'reb', label: 'REB', group: 'Season', w: 44, mono: true, dp: 1 },
    { key: 'ast', label: 'AST', group: 'Season', w: 44, mono: true, dp: 1 },
    { key: 'tpm', label: '3PM', group: 'Season', w: 44, mono: true, dp: 1 },
  ]
  const sched = (data?.schedule || []).map((g) => ({ ...g, _id: g.id, day: gameDay(g.start), oppTxt: g.home ? g.opp : `@${g.opp}`, res: g.result ? `${g.result} ${g.us}-${g.them}` : '' }))
  const schedCols = [
    { key: 'day', label: 'Date', group: 'Game', w: 90, heat: false, sticky: true, fmt: (v) => fmtDay(v) },
    { key: 'oppTxt', label: 'Opp', group: 'Game', w: 56, heat: false, mono: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    { key: 'res', label: 'Result', group: 'Result', w: 80, heat: false, mono: true, fmt: (v, r) => v || (r.state === 'pre' ? fmtTip(r.start) : r.state === 'live' ? 'LIVE' : '—') },
    { key: 'seasonType', label: 'Type', group: 'Result', w: 110, heat: false, fmt: (v) => (v === 2 ? '' : <SeasonTypeChip type={v} />) },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackBtn onBack={onBack} label={backLabel} />
      <PageHeader eyebrow={`BUCKETS · ${known.conf === 'E' ? 'EAST' : 'WEST'} · ${known.div.toUpperCase()}`} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><TeamMark sport="nba" abbr={known.abbrev} variant="logo" px={32} />{known.place} {known.nick}</span>}
        theme={C} numFont={NUM_FONT} accent={C.purple} showToday={false}
        note={st ? `${data.seasonLabel}: ${st.w}-${st.l}, seed ${st.seed} in the ${known.conf === 'E' ? 'East' : 'West'}${st.streak && st.streak !== '-' ? ` · ${st.streak}` : ''}` : null}
        stats={st ? [{ value: `${st.w}-${st.l}`, label: 'RECORD', tone: C.text }, { value: st.seed, label: 'SEED', tone: C.purple }, { value: st.diff, label: 'DIFF', tone: C.text2 }] : null} />
      {data?.stale && <LastSeasonNote label={data.seasonLabel} what="season lines" />}
      <DelayedBanner error={error} what="the club feed" />
      {loading && !data ? <Loading what="the club" /> : null}
      {roster.length > 0 && (
        <section>
          <Kicker>ROSTER · {roster.length}</Kicker>
          <BucketsTable rows={roster} columns={cols} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
            initialSort={{ key: 'pts', dir: 'desc' }} heatMode="sorted" maxHeight={9999} maxRows={roster.length}
            caption={`${known.nick} roster with ${data.seasonLabel} lines. Each row opens that player.`} />
        </section>
      )}
      {sched.length > 0 && (
        <section>
          <Kicker>SCHEDULE · {sched.length} GAMES</Kicker>
          <BucketsTable rows={sched} columns={schedCols} onRowClick={(r) => onOpenGame?.((r?._raw ?? r).id)} heatMode="none" maxHeight={420} maxRows={sched.length}
            caption="The club’s schedule as ESPN lists it. Each row opens the game." />
        </section>
      )}
      <SourceLine>Source: ESPN roster, injuries, schedule and season stats (/api/buckets/team).</SourceLine>
    </div>
  )
}
