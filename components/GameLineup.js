'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import {
  nameOf, teamOf, nn, clean, hrScore, hitScore, prodScore, tbScore,
  pitchMixScore, barrelRate, ihrVal, recent375,
} from '../lib/player'
import { tierRole, isAligned } from '../lib/scoring'
import DenseTable from './DenseTable'

// The full lineup, dense and colored — not the top-8 card grid.
//
// The card grid answers "who are the names here". This answers "what is the
// shape of this game", which is a different question and the one you actually
// have to scan. Weak spot, aligned and matchup edge are heat columns rather
// than icons, so a lineup with four of them lights up as a block instead of
// making you count little symbols down the column.

const matchupEdge = (p) => {
  const weakSide = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const bats = clean(p?.bats || p?.handedness, '')
  if (!weakSide || !bats) return 0
  return (weakSide === 'LHB' && bats === 'L') || (weakSide === 'RHB' && bats === 'R') ? 1 : 0
}

const COLUMNS = [
  { key: 'spot',   label: '#',      heat: false, w: 26, mono: true, dim: true },
  { key: 'name',   label: 'Batter', heat: false, w: 148, bold: true, sticky: true },
  { key: 'team',   label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
  { key: 'b',      label: 'B',      heat: false, w: 22, mono: true, dim: true },
  { key: 'role',   label: 'Role',   heat: false, w: 74, dim: true },
  { key: 'weak',   label: '★ Spot', flag: true, mark: '★', w: 44,
    title: 'Weak lineup spot — this starter has been beaten in this spot' },
  { key: 'aligned', label: 'Align', flag: true, mark: '◆', w: 40,
    title: 'Signals aligned across boards' },
  { key: 'edge',   label: 'Edge',  flag: true, mark: '▲', w: 40,
    title: 'Bats into the pitcher’s weak side' },
  { key: 'hr',     label: 'HR',    w: 40, dp: 1 },
  { key: 'hit',    label: 'Hit',   w: 40, dp: 1 },
  { key: 'hrr',    label: 'HRR',   w: 40, dp: 1 },
  { key: 'tb',     label: 'TB',    w: 40, dp: 1 },
  { key: 'hrw',    label: 'HRW',   w: 40, dp: 1 },
  { key: 'dc',     label: 'DC',    w: 40, dp: 1 },
  { key: 'due',    label: 'Due',   w: 40, dp: 1 },
  { key: 'pmix',   label: 'PMix',  w: 42, dp: 1 },
  { key: 'barrel', label: 'Brl%',  w: 42, dp: 1 },
  { key: 'ihr',    label: 'IHR',   w: 42, dp: 3 },
  { key: 'd375',   label: '375+',  w: 40 },
  { key: 'hr9',    label: 'P HR/9', w: 46, dp: 2,
    title: 'Opposing starter’s HR per 9 — high is good for the hitter' },
]

export default function GameLineup({ players, onPlayerClick }) {
  const [team, setTeam] = useState('Both')

  const teams = useMemo(
    () => Array.from(new Set(players.map(teamOf).filter(Boolean))).sort(),
    [players],
  )

  const rows = useMemo(() => {
    const pool = team === 'Both' ? players : players.filter((p) => teamOf(p) === team)
    return [...pool]
      .sort((a, b) => teamOf(a).localeCompare(teamOf(b)) || (nn(a?.lineup_spot) || 99) - (nn(b?.lineup_spot) || 99))
      .map((p, i) => ({
        _key: `${p?.player_id ?? nameOf(p)}-${i}`,
        _raw: p,
        spot: p?.lineup_spot ?? '—',
        name: nameOf(p),
        team: teamOf(p),
        b: clean(p?.bats || p?.handedness, '?'),
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
        pmix: pitchMixScore(p),
        barrel: barrelRate(p) * 100,
        ihr: ihrVal(p),
        d375: recent375(p),
        hr9: nn(p?.pitcher_hr9),
      }))
  }, [players, team])

  const cols = useMemo(
    () => (team === 'Both' ? COLUMNS : COLUMNS.filter((c) => c.key !== 'team')),
    [team],
  )

  if (!players.length) return null

  const lit = (k) => rows.filter((r) => r[k]).length

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text2 }}>Lineups</span>
        {teams.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {['Both', ...teams].map((t) => (
              <button
                key={t}
                onClick={(e) => { e.stopPropagation(); setTeam(t) }}
                style={{
                  padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6,
                  cursor: 'pointer',
                  border: `1px solid ${team === t ? C.orange : C.border}`,
                  background: team === t ? 'rgba(249,115,22,.12)' : 'transparent',
                  color: team === t ? C.orange : C.text3,
                }}
              >{t}</button>
            ))}
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} hitters · ★{lit('weak')} weak · ◆{lit('aligned')} aligned · ▲{lit('edge')} edge
        </span>
      </div>

      <DenseTable
        rows={rows}
        columns={cols}
        onRowClick={onPlayerClick}
        maxHeight={420}
        caption="Batting order by default — click a header to re-sort, a row to open the hitter. ★ weak spot · ◆ aligned signals · ▲ bats into the pitcher's weak side."
      />
    </div>
  )
}
