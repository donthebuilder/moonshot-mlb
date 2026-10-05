'use client'
import PageHeader from '../../PageHeader'
import TeamMark from '../../TeamMark'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useMemo } from 'react'
import { useBucketsTeam, useBucketsDefense, useBucketsShots } from '../../../lib/nba/useBuckets'
import { unpackShots } from '../../../lib/nba/shots'
import ShotChart from '../ShotChart'
import Tap from '../../Tap'
import { nbaTeam } from '../../../lib/nba/teams'
import BucketsTable from '../BucketsTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, BackBtn, LastSeasonNote, SeasonTypeChip, fmtDay, fmtTip, gameDay } from '../ui'

// 🏟 ONE CLUB -- record and seed, the roster with each player's season line,
// and the schedule (/api/buckets/team). Before the season the lines are last
// season's, and the page says so.
export default function Team({ abbrev, onBack, backLabel = 'Teams', onOpenPlayer, onOpenGame, onOpenTeam }) {
  const known = nbaTeam(abbrev)
  const { data, error, loading } = useBucketsTeam(known ? abbrev : null)
  const defense = useBucketsDefense(null)
  const shotsRead = useBucketsShots(known ? { team: known.abbrev } : null)
  const shots = useMemo(() => unpackShots(shotsRead.data?.shots), [shotsRead.data])
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
      <PageHeader eyebrow={`BUCKETS · ${known.conf === 'E' ? 'EAST' : 'WEST'} · ${known.div.toUpperCase()}`} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><TeamMark sport="nba" abbr={known.abbrev} variant="logo" px={56} />{known.place} {known.nick}</span>}
        theme={C} numFont={NUM_FONT} accent={C.purple} showToday={false}
        note={st ? `${data.seasonLabel}: ${st.w}-${st.l}, seed ${st.seed} in the ${known.conf === 'E' ? 'East' : 'West'}${st.streak && st.streak !== '-' ? ` · ${st.streak}` : ''}` : null}
        stats={st ? [{ value: `${st.w}-${st.l}`, label: 'RECORD', tone: C.text }, { value: st.seed, label: 'SEED', tone: C.purple }, { value: st.diff, label: 'DIFF', tone: C.text2 }] : null} />
      {data?.stale && <LastSeasonNote label={data.seasonLabel} what="season lines" />}
      <DelayedBanner error={error} what="the club feed" />
      {loading && !data ? <Loading what="the club" /> : null}
      <TeamGlance data={data} roster={roster} def={(defense.data?.teams || []).find((t) => t.abbrev === known.abbrev)} defLabel={defense.data?.seasonLabel} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} />
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
      {shots.length > 0 && (
        <section>
          <Kicker>WHERE {known.abbrev} SHOOTS FROM · {shots.length} ATTEMPTS ON FILE</Kicker>
          <ShotChart shots={shots} filters={['result', 'type']} title={`${known.nick}, every field-goal attempt on file`}
            source="Every field-goal attempt on file for the club, from ESPN play-by-play." />
        </section>
      )}
      <SourceLine>Source: ESPN roster, injuries, schedule and season stats (/api/buckets/team); defence /api/buckets/defense; shots /api/buckets/shots.</SourceLine>
    </div>
  )
}

// THE CLUB AT A GLANCE: its leaders (the roster's own lines), its last five
// results, and what its defence allows with the rank among the 30.
const LEAD = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['tpm', '3PM']]
function TeamGlance({ data, roster, def, defLabel, onOpenPlayer, onOpenGame }) {
  if (!data) return null
  const pool = roster.filter((p) => (p.gp || 0) >= 10)
  const leaders = LEAD.map(([k, label]) => ({ k, label, p: [...(pool.length ? pool : roster)].filter((p) => p[k] != null).sort((a, b) => b[k] - a[k])[0] })).filter((x) => x.p)
  const last5 = (data.schedule || []).filter((g) => g.state === 'final').slice(-5).reverse()
  const cell = { border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', background: C.bg2, minWidth: 0 }
  const lab = { fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT }
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {leaders.length > 0 && (
        <div>
          <Kicker>TEAM LEADERS · {data.seasonLabel}</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
            {leaders.map(({ k, label, p }) => (
              <Tap key={k} onClick={() => onOpenPlayer?.(p.playerId)} title={p.name}>
                <span style={{ ...cell, display: 'grid', gap: 2, minHeight: 44 }}>
                  <span style={lab}>{label} A GAME</span>
                  <span style={{ fontWeight: 800, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: C.purple }}>{Number(p[k]).toFixed(1)}</span>
                </span>
              </Tap>
            ))}
          </div>
        </div>
      )}
      {last5.length > 0 && (
        <div>
          <Kicker>LAST {last5.length} RESULTS</Kicker>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {last5.map((g) => (
              <Tap key={g.id} onClick={() => onOpenGame?.(g.id)} title={`${g.home ? 'vs' : '@'} ${g.opp}`}>
                <span style={{ ...cell, display: 'inline-flex', gap: 6, alignItems: 'center', minHeight: 44, fontFamily: NUM_FONT, fontSize: 12 }}>
                  <b style={{ color: g.result === 'W' ? C.green : C.text3 }}>{g.result}</b>{g.home ? 'vs' : '@'} {g.opp} {g.us}-{g.them}
                </span>
              </Tap>
            ))}
          </div>
        </div>
      )}
      {def && (
        <div>
          <Kicker>ITS DEFENCE ALLOWS A GAME · {defLabel} (RANK OF 30, 1 = GIVES UP THE MOST)</Kicker>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: 12 }}>
            {[['oppPts', 'PTS'], ['oppReb', 'REB'], ['oppAst', 'AST'], ['oppTpm', '3PM'], ['oppFgPct', 'FG%']].map(([k, label]) => (
              <span key={k} style={{ ...cell, display: 'grid', gap: 2 }}>
                <span style={lab}>{label}</span>
                <b style={{ color: C.text }}>{def[k] == null ? '—' : k === 'oppFgPct' ? `${(def[k] * 100).toFixed(1)}%` : def[k].toFixed(1)}</b>
                <span style={{ fontSize: 10, color: def.ranks?.[k] <= 5 ? C.rim : C.text3 }}>#{def.ranks?.[k] ?? '—'}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
