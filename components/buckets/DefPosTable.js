'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { POS_WORD, WINDOWS, DEF_STATS } from '../../lib/nba/defPos'
import BucketsTable from './BucketsTable'
import { Pills } from './ui'

// 🛡 D1 · DEFENSE VS POSITION, EVERY CLUB (2026-10-19, mock D1). What each defense gave up a game to guards /
// forwards / centers over its last 5, last 10 or the season, each with its rank of 30 (1 = gave up the most).
// /api/buckets/defpos (lib/nba/defPos.js). Tonight's clubs first; All 30 a tap away. Standouts at rest (DenseTable v2).
const rankTone = (r) => (r == null ? C.text3 : r <= 6 ? C.purple : r >= 25 ? C.text3 : C.text2)

export function statCell(v, rank) {
  return <span style={{ display: 'inline-grid', lineHeight: 1.15, justifyItems: 'end' }}><b>{v == null ? '—' : Number(v).toFixed(1)}</b><span style={{ fontSize: 10, fontFamily: NUM_FONT, color: rankTone(rank) }}>#{rank ?? '—'}</span></span>
}

// words: POS_WORD (G / F / C) or POS5_WORD (PG..C, lib/nba/defPos posView) -- the table's own positions
export default function DefPosTable({ byPos, words = POS_WORD, tonight = [], onOpenTeam }) {
  const [pos, setPos] = useState(Object.keys(words)[0])
  const [win, setWin] = useState('Season')
  const [scope, setScope] = useState(tonight.length ? 'tonight' : 'all')
  const t = byPos?.[pos]?.[win] || {}
  const clubs = Object.keys(t).filter((c) => scope === 'all' || tonight.includes(c))
  const rows = clubs.map((c) => ({ _id: c, abbrev: c, gp: t[c].gp, ranks: t[c].r, ...t[c].v }))
  const cols = [
    { key: 'abbrev', label: 'Club', group: 'Defense', w: 60, heat: false, sticky: true, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.abbrev) : null) },
    { key: 'gp', label: 'GP', group: 'Defense', w: 36, heat: false, mono: true, dim: true },
    ...DEF_STATS.map(([k, label]) => ({
      key: k, label, group: `Allowed to ${words[pos].toLowerCase()} · a game`, w: 56, mono: true,
      title: `${label} this defense gave up a game to ${words[pos].toLowerCase()}, and its rank of 30 (1 = the most)`,
      fmt: (v, r) => statCell(v, r.ranks?.[k]),
    })),
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
      <Pills ariaLabel="Position" value={pos} onChange={setPos} options={Object.keys(words).map((k) => ({ key: k, text: words === POS_WORD ? words[k].toUpperCase() : k, title: words[k] }))} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pills ariaLabel="Games" value={win} onChange={setWin} options={WINDOWS.map(([k, text]) => ({ key: k, text: text.toUpperCase() }))} />
        {tonight.length > 0 && <Pills ariaLabel="Clubs" value={scope} onChange={setScope} options={[{ key: 'tonight', text: 'THAT DAY' }, { key: 'all', text: 'ALL 30' }]} />}
      </div>
      <BucketsTable rows={rows} columns={cols} onRowClick={(r) => onOpenTeam?.((r?._raw ?? r).abbrev)} initialSort={{ key: 'pts', dir: 'desc' }}
        heatMode="standouts" maxHeight={620} maxRows={30} rowEdge={(r) => (scope === 'all' && tonight.includes((r?._raw ?? r).abbrev) ? C.purple : null)}
        caption={`Rank of 30: #1 gave up the most.${scope === 'all' && tonight.length ? ' A purple edge = playing that day.' : ''}`} />
    </div>
  )
}
