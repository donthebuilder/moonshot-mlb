'use client'
import { useMemo } from 'react'
import { C } from '../lib/theme'
import {
  nameOf, teamOf, oppOf, nn, clean, hrScore, hitScore, prodScore, tbScore,
  pitchMixScore, barrelRate, ihrVal, recent375,
} from '../lib/player'
import { tierRole, scoreFor, isAligned } from '../lib/scoring'
import Heatmap from './Heatmap'
import DenseTable from './DenseTable'

// One block, reused by every hitter board: the profile heatmap over the top
// names, then the full dense table underneath.
//
// The card grids each board already had say WHO. Neither of these says who --
// the heatmap says which input is carrying each name, and the table lets you
// re-sort on any column and find the ones the default ranking buried.

const matchupEdge = (p) => {
  const weak = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const bats = clean(p?.bats || p?.handedness, '')
  if (!weak || !bats) return 0
  return (weak === 'LHB' && bats === 'L') || (weak === 'RHB' && bats === 'R') ? 1 : 0
}

const COLUMNS = [
  { key: 'name',    label: 'Batter',  heat: false, w: 148, bold: true, sticky: true },
  { key: 'team',    label: 'Tm',      heat: false, w: 34, mono: true, dim: true },
  { key: 'opp',     label: 'Opp',     heat: false, w: 34, mono: true, dim: true },
  { key: 'spot',    label: '#',       heat: false, w: 24, mono: true, dim: true },
  { key: 'role',    label: 'Role',    heat: false, w: 72, dim: true },
  { key: 'weak',    label: '★ Spot',  flag: true, mark: '★', w: 44 },
  { key: 'aligned', label: 'Align',   flag: true, mark: '◆', w: 40 },
  { key: 'edge',    label: 'Edge',    flag: true, mark: '▲', w: 40 },
  { key: 'hr',      label: 'HR',      w: 40, dp: 1 },
  { key: 'hit',     label: 'Hit',     w: 40, dp: 1 },
  { key: 'hrr',     label: 'HRR',     w: 40, dp: 1 },
  { key: 'tb',      label: 'TB',      w: 40, dp: 1 },
  { key: 'hrw',     label: 'HRW',     w: 40, dp: 1 },
  { key: 'dc',      label: 'DC',      w: 40, dp: 1 },
  { key: 'due',     label: 'Due',     w: 40, dp: 1 },
  { key: 'longest', label: 'Long',    w: 42, dp: 1 },
  { key: 'pmix',    label: 'PMix',    w: 42, dp: 1 },
  { key: 'barrel',  label: 'Brl%',    w: 42, dp: 1 },
  { key: 'ihr',     label: 'IHR',     w: 44, dp: 3 },
  { key: 'd375',    label: '375+',    w: 40 },
  { key: 'hr9',     label: 'P HR/9',  w: 46, dp: 2 },
]

export default function HitterHeat({
  players = [],
  type = 'hr',
  title = 'Profile',
  topN = 15,
  onPlayerClick,
  showHeatmap = true,
  showTable = true,
}) {
  const ranked = useMemo(
    () => [...players].sort((a, b) => scoreFor(b, type) - scoreFor(a, type)),
    [players, type],
  )

  const rows = useMemo(() => ranked.map((p, i) => ({
    _key: `${p?.player_id ?? nameOf(p)}-${i}`,
    _raw: p,
    name: nameOf(p),
    team: teamOf(p),
    opp: oppOf(p),
    spot: p?.lineup_spot ?? '—',
    role: tierRole(p),
    weak: p?.weak_spot_flag ? 1 : 0,
    aligned: isAligned(p) ? 1 : 0,
    edge: matchupEdge(p),
    hr: hrScore(p),
    hit: hitScore(p),
    hrr: prodScore(p),
    tb: tbScore(p),
    hrw: nn(p?.hrw_score),
    dc: nn(p?.damage_conversion_score),
    due: nn(p?.hr_due_score),
    longest: nn(p?.longest_hr_score),
    pmix: pitchMixScore(p),
    barrel: barrelRate(p) * 100,
    ihr: ihrVal(p),
    d375: recent375(p),
    hr9: nn(p?.pitcher_hr9),
  })), [ranked])

  if (!ranked.length) return null

  const lit = (k) => rows.filter((r) => r[k]).length

  return (
    <div style={{ margin: '4px 0 20px' }}>
      {showHeatmap && (
        <Heatmap
          rows={ranked.slice(0, topN).map((p) => ({
            label: nameOf(p),
            values: {
              Score: scoreFor(p, type),
              HR: hrScore(p), Hit: hitScore(p), HRR: prodScore(p), TB: tbScore(p),
              HRW: nn(p?.hrw_score), DC: nn(p?.damage_conversion_score),
              Due: nn(p?.hr_due_score), PMix: pitchMixScore(p),
              Barrel: barrelRate(p) * 100,
              'P HR/9': nn(p?.pitcher_hr9) * 30,
            },
          }))}
          columns={['Score', 'HR', 'Hit', 'HRR', 'TB', 'HRW', 'DC', 'Due', 'PMix', 'Barrel', 'P HR/9']}
          title={`${title} — top ${Math.min(topN, ranked.length)} profile`}
          labelWidth={140}
          onRowClick={onPlayerClick ? (r, i) => onPlayerClick(ranked[i]) : null}
        />
      )}

      {showTable && (
        <>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, margin: '2px 0 7px',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text2 }}>Full board</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3 }}>
              {rows.length} hitters · ★{lit('weak')} weak · ◆{lit('aligned')} aligned · ▲{lit('edge')} edge
            </span>
          </div>
          <DenseTable
            rows={rows}
            columns={COLUMNS}
            onRowClick={onPlayerClick}
            maxHeight={460}
          />
        </>
      )}
    </div>
  )
}
