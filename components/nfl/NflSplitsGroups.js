'use client'
// TUDDY'S SPLITS, MOONSHOT'S TABLE (Donovan 10-18: "splits should be MLB's splits component shared (a table) ... make the whole
// NFL portal like MLB's"). MOONSHOT's splits tab (components/PlayerSplits.js): a pill row of groups (its own GroupPicker,
// shared), then one dense table of that group's rows. Here the groups are lib/nfl/gameSplits.js splitPairs (where, when,
// result, the defense at his role, roof, surface, rest), each row one side, from his logged games; the columns are games,
// touchdowns, TD a game, the share of games with one, and the per-game yardage he actually records (a column of nothing
// is not drawn). A side under three games is dimmed, the way the old tiles were.
import { useMemo, useState } from 'react'
import { splitPairs } from '../../lib/nfl/gameSplits'
import { GroupPicker } from '../PlayerSplits'
import NflTable from './NflTable'
import ScrollHint from '../player/ScrollHint'

const STATS = [
  { key: 'tdPerG', group: 'Touchdowns', label: 'TD/G', dp: 2, primaryFor: 'TD' },
  { key: 'tdPct', group: 'Touchdowns', label: 'TD%', dp: 0, title: 'Share of these games with a touchdown' },
  { key: 'rec', group: 'Per game', label: 'REC', dp: 1, primaryFor: 'REC' },
  { key: 'recyd', group: 'Per game', label: 'REC YD', w: 58, dp: 1, primaryFor: 'REC_YDS' },
  { key: 'car', group: 'Per game', label: 'CAR', dp: 1, primaryFor: 'RUSH_ATT' },
  { key: 'ruyd', group: 'Per game', label: 'RU YD', w: 54, dp: 1, primaryFor: 'RUSH_YDS' },
  { key: 'payd', group: 'Per game', label: 'PA YD', w: 56, dp: 0, primaryFor: 'PASS_YDS' },
]

export default function NflSplitsGroups({ log, market = 'TD', dvp = null, role = null }) {
  const pairs = useMemo(() => splitPairs(log, { dvp, role }), [log, dvp, role])
  const [active, setActive] = useState('where')
  if (!pairs.length) return null
  const group = pairs.find((p) => p.key === active) || pairs[0]
  const rows = group.sides.map((s) => ({ ...s, _key: s.label, split: s.label, _dim: s.g > 0 && s.g < 3 }))   // aggregateNflGames carries its own split: 'Combo'; the side's name wins
  const all = pairs.flatMap((p) => p.sides)
  const columns = [
    { key: 'split', label: 'Split', group: group.label, w: 128, heat: false, bold: true, sticky: true },
    { key: 'g', label: 'G', group: 'Games', w: 34, heat: false, dp: 0 },   // its own group: a first-group column folds into the name cell
    { key: 'td', label: 'TD', group: 'Touchdowns', w: 36, dp: 0 },
    ...STATS.filter((c) => all.some((s) => s[c.key] != null && s[c.key] !== 0))
      .map((c) => ({ ...c, w: c.w || 46, primary: c.primaryFor === market })),
  ]
  return (
    <section aria-label="Splits" style={{ margin: '4px 0 12px' }}>
      <GroupPicker groups={pairs} active={group.key} onPick={setActive} />
      <ScrollHint>
        <NflTable rows={rows} columns={columns} heatMode="sorted" maxRows={rows.length} maxHeight={9999} dimRow={(r) => r._dim}
          caption={`${group.label}: his logged games, each side. A side under three games is dimmed.`} />
      </ScrollHint>
    </section>
  )
}
