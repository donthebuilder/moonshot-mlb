'use client'
import { useMemo } from 'react'
import { C } from '../../lib/nfl/theme'
import NflTable from './NflTable'
import { hasContext } from '../../lib/nfl/gameSplits'

// GAME LOG -- every game he played, newest first, one row each. MOONSHOT's game
// log is the same table (DenseTable, one row a game); the columns are football's.
// A column he never records anything in (a back's passing yards) is not drawn.
// Result and home/away only appear when the log carries them (never guessed).
const COLS = [
  { key: 'g_td', label: 'TD', group: 'Scoring', w: 40, dp: 0 },
  { key: 'g_rec', label: 'REC', group: 'Receiving', w: 42, dp: 0 },
  { key: 'g_recyd', label: 'REC YD', group: 'Receiving', w: 54, dp: 0 },
  { key: 'g_car', label: 'CAR', group: 'Rushing', w: 42, dp: 0 },
  { key: 'g_ruyd', label: 'RUSH YD', group: 'Rushing', w: 60, dp: 0 },
  { key: 'g_payd', label: 'PASS YD', group: 'Passing', w: 60, dp: 0 },
  { key: 'g_kick', label: 'KICK PTS', group: 'Kicking', w: 58, dp: 0 },
]

export default function NflGameLog({ log }) {
  const rows = useMemo(() => [...(Array.isArray(log) ? log : [])].reverse().map((g, i) => ({
    ...g, _key: `${g.s}-${g.w}-${i}`,
    game: `${String(g.s).slice(-2)} wk ${g.w ?? '–'}`,
    vs: g.opp ? `${g.h === 0 ? '@' : g.h === 1 ? 'vs ' : ''}${g.opp}` : '—',
    res: g.r || null,
  })), [log])
  if (!rows.length) return <div style={{ fontSize: 13, color: C.text3 }}>No games logged for him in this window.</div>
  const withRes = hasContext(log) && rows.some((r) => r.res)
  const cols = [
    { key: 'game', label: 'Game', group: 'Game', w: 66, heat: false, sticky: true, bold: true },
    { key: 'vs', label: 'Opp', group: 'Game', w: 62, heat: false, fmt: (v, r) => (r.opp
      ? <a href={`#sport=nfl&tab=team&team=${r.opp}`} title={`${r.opp} team page`} style={{ color: 'inherit', textDecoration: 'none' }}>{v}</a>
      : '—') },
    ...(withRes ? [{ key: 'res', label: 'Res', group: 'Game', w: 38, heat: false }] : []),
    ...COLS.filter((c) => rows.some((r) => Number(r[c.key]) > 0)),
  ]
  return (
    <NflTable rows={rows} columns={cols} initialSort={null} maxRows={8} maxHeight={9999} caption="His game log" />
  )
}
