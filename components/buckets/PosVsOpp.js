'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { POS_WORD, VS_STATS, posOf, vsRows, beatShare } from '../../lib/nba/defPos'
import { useBucketsPosVs } from '../../lib/nba/useBuckets'
import { playerHref } from '../../lib/routes'
import BucketsTable from './BucketsTable'
import { LastSeasonNote, Pills, fmtDay } from './ui'

// 🆚 P1 · HIS POSITION VS THIS OPPONENT (2026-10-19, mock P1). Every starter at his position who played this club,
// newest first, each against HIS OWN average in his other games that season (no book line was saved for those games;
// once lines are on file this can take the real line). "Beat" = more than his own average. lib/nba/defPos.js.
const md = (d) => fmtDay(d).replace(/^\w+,?\s*/, '')

export default function PosVsOpp({ opp, espnPos, onOpenGame }) {
  const pos = posOf(espnPos)
  const { data } = useBucketsPosVs(opp, pos)
  const [stat, setStat] = useState('pts')
  const [where, setWhere] = useState('all')
  const [res, setRes] = useState('all')
  const all = useMemo(() => vsRows(data?.rows || [], stat), [data, stat])
  const rows = all.filter((r) => (where === 'all' || (where === 'at' ? !r.home : r.home)) && (res === 'all' || (res === 'w' ? r.team_won === false : r.team_won === true)))
  if (!pos || !opp || !data?.rows?.length) return null
  const label = VS_STATS.find(([k]) => k === stat)?.[1]
  const shares = [['L5', beatShare(rows, 5)], ['L10', beatShare(rows, 10)], ['Season', beatShare(rows)]]
  const cols = [
    { key: 'name', label: 'Player', group: 'Starter', w: 128, heat: false, sticky: true, bold: true, numeric: false, link: (r) => () => window.location.assign(playerHref('nba', r.player_id)) },
    { key: 'team', label: 'Club', group: 'Starter', w: 48, heat: false, mono: true, teamMark: 'nba' },
    { key: 'game_date', label: 'Date', group: 'Game', w: 64, heat: false, mono: true, fmt: (v, r) => `${md(v)} ${r.home ? 'vs' : '@'}`, link: (r) => (onOpenGame ? () => onOpenGame(r.game_id) : null) },
    { key: 'v', label, group: 'His line', w: 48, heat: false, mono: true, bold: true, fmt: (v, r) => <span style={{ color: r.beat ? C.purple : C.text3 }}>{v ?? '—'}</span> },
    { key: 'avg', label: 'Avg', group: 'His line', w: 48, heat: false, mono: true, dim: true, fmt: (v) => (v == null ? '—' : v.toFixed(1)) },
    { key: 'diff', label: '+/−', group: 'His line', w: 52, heat: false, mono: true, fmt: (v, r) => <span style={{ color: r.beat ? C.purple : C.text3 }}>{v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`}</span> },
    { key: 'min', label: 'MIN', group: 'His line', w: 44, heat: false, mono: true, dim: true, fmt: (v) => (v == null ? '—' : Math.round(v)) },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
      {data.stale && <LastSeasonNote label={data.seasonLabel} what={`${opp} numbers`} />}
      <div style={{ font: `800 12px/1.3 ${NUM_FONT}`, color: C.text2 }}>STARTING {POS_WORD[pos].toUpperCase()} VS {opp} · BEAT THEIR OWN {label} AVG</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {shares.map(([k, s]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, minHeight: 32, padding: '6px 10px', borderRadius: 8, border: `1px solid ${s.of && s.beat / s.of >= 0.6 ? C.purple : C.border2}`, font: `700 12px/1 ${NUM_FONT}`, color: C.text2 }}>
            {k} <b style={{ fontSize: 14, color: s.of && s.beat / s.of >= 0.6 ? C.purple : C.text }}>{s.beat} of {s.of}</b>
          </span>
        ))}
      </div>
      <Pills ariaLabel="Stat" value={stat} onChange={setStat} options={VS_STATS.map(([k, text]) => ({ key: k, text }))} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pills ariaLabel="Where" value={where} onChange={setWhere} options={[{ key: 'all', text: 'ALL' }, { key: 'at', text: `@ ${opp}` }, { key: 'vs', text: `VS ${opp}` }]} />
        <Pills ariaLabel="Result" value={res} onChange={setRes} options={[{ key: 'all', text: 'ALL' }, { key: 'w', text: `${opp} WON` }, { key: 'l', text: `${opp} LOST` }]} />
      </div>
      <BucketsTable rows={rows.map((r) => ({ ...r, _id: `${r.game_id}-${r.player_id}` }))} columns={cols} heatMode="none" maxHeight={9999} maxRows={8} moreStep={20}
        caption={`L5 / L10 = ${opp}'s last 5 / 10 games, every starter at the spot. Avg = that player's own average in his other games.`} />
    </div>
  )
}
