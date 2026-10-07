'use client'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import NflTable from './NflTable'
import { SportTheme } from '../SportTheme'
import { THIN_G } from '../../lib/nfl/gameSplits'

// THE CARD'S SPLITS, AS A DENSE TABLE (2026-10-07). It replaces the dumbbell
// chart: the same published pairs (nfl_week.json players[].splits, per game),
// one row each, the two sides, their games, and the gap. A side with fewer than
// THIN_G games is flagged "thin". A pair needs BOTH sides published to be a row.
const SHORT = { thu: 'Thu', sun: 'Sun', mon: 'Mon', short: 'Short wk', rested: 'Rested', win: 'Win', loss: 'Loss' }

export function splitRows(player, statKey, data) {
  const sp = player?.splits || {}
  const lab = (k) => SHORT[k] || data?.labels?.[k] || k
  return (data?.pairs || []).filter(([a, b]) => sp[a] && sp[b]).map(([a, b]) => {
    const va = Number(sp[a][statKey]), vb = Number(sp[b][statKey])
    const ok = Number.isFinite(va) && Number.isFinite(vb)
    const top = Math.max(Math.abs(va), Math.abs(vb))
    return {
      _key: `${a}-${b}`, pair: `${lab(a)} / ${lab(b)}`,
      a: Number.isFinite(va) ? va : null, ga: sp[a].g, b: Number.isFinite(vb) ? vb : null, gb: sp[b].g,
      gap: ok ? va - vb : null, gapPct: ok && top > 0 ? (100 * (va - vb)) / top : null,
      thin: !(sp[a].g >= THIN_G && sp[b].g >= THIN_G),
    }
  }).filter((r) => r.a != null || r.b != null)
}

export default function NflSplitsTable({ rows, unit }) {
  if (!rows?.length) return null
  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
      <div style={{ font: `900 ${TYPE.label}px/1.2 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, margin: '16px 0 6px' }}>SPLITS · {unit.toUpperCase()}</div>
      <NflTable bare tight heatMode="none" maxHeight={9999} maxRows={12} initialSort={null}
        caption={`Per game. Each pair is first side / second side. "Thin" = under ${THIN_G} games on a side.`}
        rows={rows}
        columns={[
          { key: 'pair', group: 'Split', label: 'Pair', w: 150, heat: false, sticky: true, bold: true, fmt: (v, r) => <span>{v}{r.thin ? <span title={`Under ${THIN_G} games on a side`} style={{ color: C.orange, fontWeight: 900 }}> thin</span> : null}</span> },
          { key: 'a', group: 'Side 1', label: unit, w: 54, dp: 2 },
          { key: 'ga', group: 'Side 1', label: 'G', w: 32, dp: 0 },
          { key: 'b', group: 'Side 2', label: unit, w: 54, dp: 2 },
          { key: 'gb', group: 'Side 2', label: 'G', w: 32, dp: 0 },
          { key: 'gapPct', group: 'Gap', label: '%', w: 50, dp: 0, primary: true, title: 'First side minus second, as a share of the larger. Under 15% on this sample is noise.' },
        ]} />
    </SportTheme>
  )
}
