'use client'
import { useState, useMemo } from 'react'
import { C } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean,
  recent375, recent400, ihrVal,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
} from '../../lib/player'
import { tierRole, isAligned } from '../../lib/scoring'
import { PanelTitle, Empty, btnStyle } from '../ui'
import DenseTable from '../DenseTable'

// Scoreboard — every hitter on the slate, every column, sortable.
//
// This page was already a sortable table; what it lacked was colour. At 15+
// numeric columns an uncoloured grid gets read one cell at a time, which is
// the opposite of what a scoreboard is for. It now shares DenseTable with
// Games and the boards, so sorting, the ramp and the row-click behave
// identically everywhere instead of three tables each doing it their own way.
//
// The bespoke table this replaces carried its own comparator with a
// null-handling fix in it. DenseTable covers the same case: non-numeric values
// fall through to a string compare, and a missing lineup spot renders as '—'
// rather than a sentinel number.

const matchupEdge = (p) => {
  const weak = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const bats = clean(p?.bats || p?.handedness, '')
  if (!weak || !bats) return 0
  return (weak === 'LHB' && bats === 'L') || (weak === 'RHB' && bats === 'R') ? 1 : 0
}

const COLUMNS = [
  { key: 'name',    label: 'Player', heat: false, w: 168, bold: true, sticky: true },
  { key: 'team',    label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
  { key: 'opp',     label: 'Opp',    heat: false, w: 34, mono: true, dim: true },
  { key: 'role',    label: 'Role',   heat: false, w: 96, dim: true },
  { key: 'spot',    label: 'Spot',   heat: false, w: 40, mono: true, dim: true,
    fmt: (v) => (v == null ? '—' : String(v)) },
  { key: 'weak',    label: '★',      flag: true, mark: '★', w: 32 },
  { key: 'aligned', label: '◆',      flag: true, mark: '◆', w: 32 },
  { key: 'edge',    label: '▲',      flag: true, mark: '▲', w: 32 },
  { key: 'hr',      label: 'HR',     w: 44, dp: 1 },
  { key: 'dmg',     label: 'Damage', w: 50, dp: 1 },
  { key: 'pmatch',  label: 'PMatch', w: 50, dp: 1 },
  { key: 'hrr',     label: 'HRR',    w: 44, dp: 1 },
  { key: 'hit',     label: 'Hit',    w: 44, dp: 1 },
  { key: 'tb',      label: 'TB',     w: 44, dp: 1 },
  { key: 'hrw',     label: 'HRW',    w: 44, dp: 1 },
  { key: 'due',     label: 'Due',    w: 44, dp: 1 },
  { key: 'longest', label: 'Long',   w: 44, dp: 1 },
  { key: 'pmix',    label: 'PMix',   w: 44, dp: 1 },
  { key: 'd375',    label: '375+',   w: 42 },
  { key: 'd400',    label: '400+',   w: 42 },
  { key: 'ihr',     label: 'IHR',    w: 46, dp: 3 },
  // A high strikeout rate is bad for the hitter, so this column runs the other
  // way. Left alone, the most strikeout-prone bats on the slate glow brightest.
  { key: 'k',       label: 'K%',     w: 42, dp: 1, invert: true },
  { key: 'hr9',     label: 'P HR/9', w: 46, dp: 2 },
]

export default function Scoreboard({ players, onPlayerClick }) {
  const [alignedOnly, setAlignedOnly] = useState(false)

  const alignedCount = useMemo(() => players.filter(isAligned).length, [players])

  const rows = useMemo(() => {
    const pool = alignedOnly ? players.filter(isAligned) : players
    return pool.map((p, i) => ({
      _key: `${p?.player_id ?? nameOf(p)}-${i}`,
      _raw: p,
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      role: tierRole(p),
      spot: p?.lineup_spot == null || p?.lineup_spot === '' ? null : n(p.lineup_spot, null),
      weak: p?.weak_spot_flag ? 1 : 0,
      aligned: isAligned(p) ? 1 : 0,
      edge: matchupEdge(p),
      hr: hrScore(p),
      dmg: n(p?.damage_conversion_score, 0),
      pmatch: n(p?.pitch_type_match_score, 0),
      hrr: prodScore(p),
      hit: hitScore(p),
      tb: tbScore(p),
      hrw: n(p?.hrw_score, 0),
      due: n(p?.hr_due_score, 0),
      longest: n(p?.longest_hr_score, 0),
      pmix: pitchMixScore(p),
      d375: recent375(p),
      d400: recent400(p),
      ihr: ihrVal(p),
      k: n(p?.season_k_rate, 0) * 100,
      hr9: n(p?.pitcher_hr9, 0),
    }))
  }, [players, alignedOnly])

  if (!players.length) return <Empty text="No players yet." />

  const lit = (k) => rows.filter((r) => r[k]).length

  return (
    <div>
      <PanelTitle
        title="Scoreboard"
        sub={`${rows.length} batters · ★${lit('weak')} weak spot · ◆${lit('aligned')} aligned · ▲${lit('edge')} matchup edge`}
        right={
          alignedCount > 0 && (
            <button
              onClick={() => setAlignedOnly((v) => !v)}
              title="Weak-spot + pitch-match + real recent contact quality all stacking together"
              style={btnStyle(C.purple, alignedOnly)}
            >
              ◆ Aligned only ({alignedCount})
            </button>
          )
        }
      />

      <DenseTable
        rows={rows}
        columns={COLUMNS}
        onRowClick={onPlayerClick}
        initialSort="hr"
        maxHeight={640}
        caption="Every numeric column coloured against its own range. K% is inverted — a high strikeout rate is bad for the hitter, so it reads dark. Click a header to sort, a row to open the hitter."
      />
    </div>
  )
}
