'use client'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import PageHeader from '../../PageHeader'
import TeamMark from '../../TeamMark'
import Tap from '../../Tap'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsGame } from '../../../lib/nba/useBuckets'
import { GAME_ID_RE } from '../../../lib/nba/ids'
import BucketsTable from '../BucketsTable'
import ShotChart from '../ShotChart'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, BackBtn, NavBtn, RimDot, fmtTip, gameDay, fmtDay } from '../ui'

// the 3D court loads only when opened (next/dynamic, as the other 3D views)
const CourtArena = dynamic(() => import('../CourtArena'), { ssr: false })

// 🏀 ONE GAME -- the line score, both box scores, every field-goal attempt on
// the floor (the shot chart, and the 3D court on tap), and who scored first.
// Every number is the feed's (/api/buckets/game: ESPN's summary + play-by-play).
const pct = (m, a) => (a ? `${Math.round((100 * m) / a)}%` : '—')

export default function Game({ id, onBack, backLabel = 'Live', onOpenPlayer, onOpenTeam }) {
  const ok = GAME_ID_RE.test(String(id || ''))
  const { data, error, loading } = useBucketsGame(ok ? id : null)
  const [three, setThree] = useState(false)
  const names = useMemo(() => Object.fromEntries((data?.box || []).map((p) => [p.id, p.name])), [data])
  const teams = useMemo(() => (data ? { [data.away.id]: data.away.abbrev, [data.home.id]: data.home.abbrev } : {}), [data])
  if (!id) return <EmptyState title="NO GAME PICKED" note="Open a game from Live or the Slate."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!ok) return <EmptyState title="NO SUCH GAME" note={`“${String(id).slice(0, 20)}” isn’t an NBA game id.`}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !data) return <div style={{ display: 'grid', gap: 10 }}><BackBtn onBack={onBack} label={backLabel} /><Loading what="the game" /></div>
  if (!data) return <div style={{ display: 'grid', gap: 10 }}><BackBtn onBack={onBack} label={backLabel} />{error && error.status !== 404 && error.status !== 400 ? <DelayedBanner error={error} what="the game feed" /> : <EmptyState title="NO SUCH GAME" note="The league has no NBA game under that id." />}</div>

  const { away, home } = data
  const live = data.state === 'live', done = data.state === 'final'
  const periods = Math.max(away.linescores?.length || 0, home.linescores?.length || 0)
  const qLabel = (i) => (i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ''}`)
  const fb = data.firsts?.firstFieldGoal
  const fp = data.firsts?.firstPoints
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackBtn onBack={onBack} label={backLabel} />
      <PageHeader eyebrow={`BUCKETS · GAME · ${fmtDay(gameDay(data.date)).toUpperCase()}`} title={`${away.name} at ${home.name}`} theme={C} numFont={NUM_FONT} accent={C.purple} showToday={false}
        note={<>{live ? <><RimDot />{data.detail}</> : done ? 'Final' : `Tip ${fmtTip(data.date)}`}{data.venue ? ` · ${data.venue}` : ''}</>}
      />
      <DelayedBanner error={error} what="the game feed" />
      {periods > 0 && <LineScore teams={[away, home]} periods={periods} qLabel={qLabel} done={done} onOpenTeam={onOpenTeam} />}
      {(fb || fp) && (
        <div style={{ fontSize: 12, color: C.text2, display: 'grid', gap: 4 }}>
          {fb && <div><Kicker>FIRST FIELD GOAL</Kicker><PlayLine play={fb} name={names[fb.player_id]} onOpenPlayer={onOpenPlayer} /></div>}
          {fp && fp.player_id !== fb?.player_id && <div><Kicker>FIRST POINTS</Kicker><PlayLine play={fp} name={names[fp.player_id]} onOpenPlayer={onOpenPlayer} /></div>}
        </div>
      )}
      {[away, home].map((t) => <BoxTable key={t.id} team={t} box={(data.box || []).filter((p) => p.team === t.abbrev)} onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} />)}
      {(data.shots || []).length > 0 ? (
        <section>
          <Kicker>EVERY SHOT · {data.shots.length} FIELD-GOAL ATTEMPTS</Kicker>
          <ShotChart shots={data.shots} names={names} teams={teams} title={`Shot chart, ${away.abbrev} at ${home.abbrev}`} />
          <div style={{ marginTop: 10 }}><NavBtn onClick={() => setThree((v) => !v)} strong={three}>{three ? 'Close the 3D court' : '🏀 3D court'}</NavBtn></div>
          {three ? <div style={{ marginTop: 8 }}><CourtArena shots={data.shots} names={names} /></div> : null}
        </section>
      ) : <EmptyState title={done || live ? 'NO SHOT LOCATIONS' : 'NO SHOTS YET'} note={done || live ? 'The play-by-play for this game carries no shot spots.' : 'The shot chart fills from the play-by-play once the game tips.'} />}
      <SourceLine>Source: ESPN’s game summary and play-by-play (/api/buckets/game). Free throws and end-of-quarter heaves are left off the chart, as in the box score.</SourceLine>
    </div>
  )
}

// The play's own words, his name in it a tap (the feed's text starts with it)
function PlayLine({ play, name, onOpenPlayer }) {
  const who = name || play.player_id
  const rest = name && String(play.text || '').startsWith(name) ? String(play.text).slice(name.length) : ` — ${play.text || ''}`
  return <span><Tap onClick={() => onOpenPlayer?.(play.player_id)}><b style={{ color: C.text }}>{who}</b></Tap>{rest}</span>
}

// The line score: two rows, a column a quarter. Small enough to be a plain
// table (as LAMP's period table); the club opens its page.
function LineScore({ teams, periods, qLabel, done, onOpenTeam }) {
  const cell = { padding: '0 6px', textAlign: 'right', fontFamily: NUM_FONT, fontSize: 13, minWidth: 28 }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.bg2 }}>
      <caption className="sr-only">The line score, by quarter</caption>
      <thead><tr style={{ color: C.text3, fontSize: 11 }}>
        <th scope="col" style={{ ...cell, textAlign: 'left', height: 32 }}>TEAM</th>
        {Array.from({ length: periods }, (_, i) => <th key={i} scope="col" style={cell}>{qLabel(i)}</th>)}
        <th scope="col" style={{ ...cell, color: C.text2 }}>T</th>
      </tr></thead>
      <tbody>{teams.map((t) => (
        <tr key={t.id} style={{ borderTop: `1px solid ${C.border}` }}>
          <th scope="row" style={{ ...cell, textAlign: 'left', height: 44 }}><Tap onClick={() => onOpenTeam?.(t.abbrev)} title={t.name}><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><TeamMark sport="nba" abbr={t.abbrev} variant="logo" px={20} />{t.abbrev}</span></Tap></th>
          {Array.from({ length: periods }, (_, i) => <td key={i} style={{ ...cell, color: C.text2 }}>{t.linescores?.[i] ?? ''}</td>)}
          <td style={{ ...cell, fontWeight: 900, color: done && t.winner ? C.text : C.text2 }}>{t.score ?? 0}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

function BoxTable({ team, box, onOpenPlayer, onOpenTeam }) {
  const rows = box.map((p) => ({ ...p, _id: p.id, playerId: p.id, fg: p.dnp ? '' : `${p.fgm}-${p.fga}`, tp: p.dnp ? '' : `${p.tpm}-${p.tpa}`, ft: p.dnp ? '' : `${p.ftm}-${p.fta}`, role: p.starter ? 'S' : '' }))
  const tot = (k) => box.reduce((n, p) => n + (Number(p[k]) || 0), 0)
  const cols = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true, fmt: (v, r) => <span>{v}{r.starter ? <span style={{ color: C.text3, fontSize: 10, marginLeft: 4 }}>S</span> : null}{r.dnp ? <span style={{ color: C.text3, fontSize: 10, marginLeft: 4 }}>DNP{r.reason ? ` · ${r.reason}` : ''}</span> : null}</span> },
    { key: 'min', label: 'MIN', group: 'Line', w: 42, mono: true },
    { key: 'pts', label: 'PTS', group: 'Line', w: 42, mono: true, primary: true },
    { key: 'reb', label: 'REB', group: 'Line', w: 42, mono: true },
    { key: 'ast', label: 'AST', group: 'Line', w: 42, mono: true },
    { key: 'fg', label: 'FG', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'tp', label: '3PT', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'ft', label: 'FT', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'stl', label: 'STL', group: 'Defense', w: 40, mono: true },
    { key: 'blk', label: 'BLK', group: 'Defense', w: 40, mono: true },
    { key: 'to', label: 'TO', group: 'Defense', w: 40, mono: true },
  ]
  return (
    <section>
      <Kicker><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TeamMark sport="nba" abbr={team.abbrev} variant="logo" px={16} /><Tap onClick={() => onOpenTeam?.(team.abbrev)}>{String(team.name).toUpperCase()}</Tap> · FG {pct(tot('fgm'), tot('fga'))} · 3PT {tot('tpm')}-{tot('tpa')}</span></Kicker>
      {rows.length ? <BucketsTable rows={rows} columns={cols} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
        dimRow={(r) => r.dnp} heatMode="sorted" maxHeight={9999} maxRows={rows.length} initialSort={null}
        caption={`${team.name} box score. Each row opens that player.`} />
        : <p style={{ fontSize: 12, color: C.text3 }}>No box score yet.</p>}
    </section>
  )
}
