'use client'
import { useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsLeaders } from '../../../lib/nba/useBuckets'
import BucketsTable from '../BucketsTable'
import { DelayedBanner, Loading, SourceLine, Pills, LastSeasonNote, EmptyState } from '../ui'

// 🏆 LEADERS -- who leads the league per game, five categories, a 20-game
// floor (/api/buckets/leaders). Measured, not modelled.
export default function Leaders({ onOpenPlayer, onOpenTeam }) {
  const { data, error, loading } = useBucketsLeaders()
  const cats = data?.categories || []
  const [k, setK] = useState('pts')
  const cat = cats.find((c) => c.key === k) || cats[0]
  const rows = (cat?.leaders || []).map((p, i) => ({ ...p, _id: p.id, playerId: p.id, rank: i + 1 }))
  const cols = [
    { key: 'rank', label: '#', group: 'Player', w: 32, heat: false, mono: true, dim: true },
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'value', label: cat?.label || '', group: 'Per game', w: 60, mono: true, dp: 1, primary: true },
    { key: 'gp', label: 'GP', group: 'Per game', w: 40, heat: false, mono: true },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · LEADERS" title={data?.seasonLabel ? `${data.seasonLabel} leaders` : 'Leaders'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note={`Per game, regular season, at least ${data?.minGames || 20} games played. Straight from the league’s stats.`} />
      {data?.stale && <LastSeasonNote label={data.seasonLabel} what="leaders" />}
      {cats.length > 0 && <Pills ariaLabel="Category" value={cat?.key} onChange={setK} options={cats.map((c) => ({ key: c.key, text: c.label }))} />}
      <DelayedBanner error={error} what="the league’s stats" />
      {loading && !data ? <Loading what="the leaders" /> : null}
      {data && !rows.length && <EmptyState title="NO LEADERS YET" note="Nobody has the games played to qualify." />}
      {rows.length > 0 && <BucketsTable rows={rows} columns={cols} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
        initialSort={{ key: 'rank', dir: 'asc' }} heatMode="none" maxHeight={9999} maxRows={rows.length} caption={`The league’s top ${rows.length} in ${cat.label}. Each row opens that player.`} />}
      <SourceLine>Source: ESPN’s league stats by athlete (/api/buckets/leaders).</SourceLine>
    </div>
  )
}
