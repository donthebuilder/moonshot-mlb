'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsPlayers } from '../../../lib/nba/useBuckets'
import BucketsTable from '../BucketsTable'
import { DelayedBanner, Loading, SourceLine, LastSeasonNote, EmptyState } from '../ui'

// 👤 PLAYERS -- every player on the league's season stats (the directory
// /api/buckets/players). Search a name or a club; tap a row for the file.
export default function Players({ onOpenPlayer, onOpenTeam }) {
  const { data, error, loading } = useBucketsPlayers()
  const [qy, setQy] = useState('')
  const rows = useMemo(() => {
    const s = qy.trim().toLowerCase()
    return (data?.players || []).filter((p) => !s || p.name.toLowerCase().includes(s) || String(p.team).toLowerCase() === s).map((p) => ({ ...p, _id: p.id, playerId: p.id }))
  }, [data, qy])
  const cols = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'pos', label: 'Pos', group: 'Player', w: 36, heat: false, mono: true, dim: true },
    { key: 'gp', label: 'GP', group: 'Season', w: 36, mono: true },
    { key: 'min', label: 'MIN', group: 'Season', w: 44, mono: true, dp: 1 },
    { key: 'pts', label: 'PTS', group: 'Season', w: 44, mono: true, dp: 1, primary: true },
    { key: 'reb', label: 'REB', group: 'Season', w: 44, mono: true, dp: 1 },
    { key: 'ast', label: 'AST', group: 'Season', w: 44, mono: true, dp: 1 },
    { key: 'tpm', label: '3PM', group: 'Season', w: 44, mono: true, dp: 1 },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · PLAYERS" title="Every player" theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every player. Type a name or club; tap a row."
        stats={data ? [{ value: data.players.length, label: 'PLAYERS', tone: C.text2 }] : null} />
      {data?.stale && <LastSeasonNote label={data.seasonLabel} what="season lines" />}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT }}>
        SEARCH
        <input type="search" value={qy} onChange={(e) => setQy(e.target.value)} placeholder="A name, or a club (BOS)" enterKeyHint="search"
          style={{ minHeight: 44, maxWidth: 420, borderRadius: 10, border: `1px solid ${qy ? C.purple : C.border2}`, background: C.bg2, color: C.text, fontSize: 16, padding: '0 12px' }} />
      </label>
      <DelayedBanner error={error} what="the league’s stats" />
      {loading && !data ? <Loading what="the players" /> : null}
      {data && !rows.length && <EmptyState title="NOBODY BY THAT NAME" note="Try a surname or a club like BOS." />}
      {rows.length > 0 && <BucketsTable rows={rows} columns={cols} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
        initialSort={{ key: 'pts', dir: 'desc' }} heatMode="sorted" maxHeight={620} maxRows={rows.length}
        caption="Every player, per game. Column headers sort; each row opens that player; the team opens the club." />}
      <SourceLine>Source: ESPN’s league stats by athlete (/api/buckets/players).</SourceLine>
    </div>
  )
}
