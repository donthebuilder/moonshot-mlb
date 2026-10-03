'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsHot } from '../../../lib/nba/useBuckets'
import BucketsTable from '../BucketsTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, DayPager, LastSeasonNote, fmtDay } from '../ui'

// 🔥 HOT HANDS -- LAMP's Hot sticks, basketball's: every rotation player in
// the day's games, his last 5 and last 10 beside his season, from his own
// game log (/api/buckets/hot). The ± is last 5 minus season. Measured, not a
// BUCKETS score. The bars are his last ten points totals, newest right.
const STATS = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['tpm', '3PM'], ['min', 'MIN']]
const f1 = (v) => (v == null ? '—' : Number(v).toFixed(1))

function Spark({ pts = [], szn }) {
  const top = Math.max(10, ...pts)
  return (
    <span aria-label={`Last ${pts.length} games, points, newest right: ${pts.join(', ')}`} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 20, verticalAlign: 'middle' }}>
      {pts.map((p, i) => <span key={i} title={`${p} pts`} style={{ width: 5, height: `${Math.max(2, (20 * p) / top)}px`, borderRadius: 1, background: szn != null && p > szn ? C.purple : C.text3, opacity: szn != null && p > szn ? 1 : 0.55 }} />)}
    </span>
  )
}

export default function Hot({ date, setDate, onOpenPlayer, onOpenTeam }) {
  const { data, error, loading } = useBucketsHot(date)
  const [k, setK] = useState('pts')
  const rows = useMemo(() => (data?.rows || []).map((r) => ({ ...r, _id: r.playerId, oppTxt: r.home ? r.opp : `@${r.opp}`, ...Object.fromEntries(STATS.flatMap(([s]) => [[`${s}_l5`, r[s]?.l5], [`${s}_l10`, r[s]?.l10], [`${s}_szn`, r[s]?.szn], [`${s}_d`, r[s]?.l5 != null && r[s]?.szn != null ? Math.round((r[s].l5 - r[s].szn) * 10) / 10 : null]])) })), [data])
  const label = Object.fromEntries(STATS)[k]
  const columns = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'oppTxt', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    { key: `${k}_d`, label: '±', group: label, w: 52, mono: true, primary: true, scale: 'div', anchor: 0, ceiling: 8, anchorLabel: 'his season average', title: `Last 5 games minus the season, ${label} a game`, fmt: (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`) },
    { key: `${k}_l5`, label: 'L5', group: label, w: 48, heat: false, mono: true, fmt: f1 },
    { key: `${k}_l10`, label: 'L10', group: label, w: 48, heat: false, mono: true, fmt: f1 },
    { key: `${k}_szn`, label: 'Season', group: label, w: 56, heat: false, mono: true, fmt: f1 },
    { key: 'spark', label: 'Last 10 (pts)', group: 'Form', w: 80, heat: false, fmt: (v, r) => <Spark pts={v} szn={r.pts?.szn} /> },
    { key: 'gp', label: 'GP', group: 'Form', w: 40, heat: false, mono: true, dim: true },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · HOT HANDS" title={data?.date ? fmtDay(data.date) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every rotation player in the day’s games: his last 5 and last 10 beside his season. ± is last 5 minus season. Measured, not modelled."
        stats={data ? [{ value: rows.length, label: 'PLAYERS', tone: C.text2 }, { value: rows.filter((r) => (r.pts_d || 0) >= 3).length, label: '+3 PTS', tone: C.purple }] : null} />
      <DayPager shown={data?.date || date} date={date} setDate={setDate} disabled={loading} />
      <Pills ariaLabel="Stat" value={k} onChange={setK} options={STATS.map(([key, text]) => ({ key, text }))} />
      {data?.stale && <LastSeasonNote label={data.seasonLabel} what="game logs" />}
      <DelayedBanner error={error} what="the players’ game logs" />
      {loading && !data ? <Loading what="every rotation player’s game log" /> : null}
      {data && !data.games.length && <EmptyState title="NO GAMES THAT DAY" note="Hot hands follows the day’s games. Page a day." />}
      {rows.length > 0 && (
        <BucketsTable rows={rows} columns={columns} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
          initialSort={{ key: `${k}_d`, dir: 'desc' }} heatMode="sorted" maxHeight={620} maxRows={rows.length}
          caption={`${label}: last 5 and last 10 games beside the season. Column headers sort; each row opens that player.`} />
      )}
      <SourceLine>Source: each player’s ESPN game log, regular season and playoffs (/api/buckets/hot). Rotation = 15+ minutes a game on the points board’s pooled line.</SourceLine>
    </div>
  )
}
