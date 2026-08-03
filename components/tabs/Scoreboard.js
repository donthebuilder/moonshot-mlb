'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean, pct,
  recent375, recent400, ihrVal,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
} from '../../lib/player'
import { tierRole, tierColor, isAligned } from '../../lib/scoring'
import { PanelTitle, Empty, Chip, btnStyle } from '../ui'

const COLS = [
  { key: 'name',     label: 'Player',  w: 180, sticky: true },
  { key: 'team',     label: 'Team',    w: 60 },
  { key: 'role',     label: 'Role',    w: 110 },
  { key: 'hr_score', label: 'HR',      w: 60,  num: true },
  { key: 'dmg',      label: 'Damage',  w: 70,  num: true },
  { key: 'pmatch',   label: 'PMatch',  w: 70,  num: true },
  { key: 'hrr',      label: 'HRR',     w: 60,  num: true },
  { key: 'hit',      label: 'Hit',     w: 60,  num: true },
  { key: 'tb',       label: 'TB',      w: 60,  num: true },
  { key: 'pmix',     label: 'PMix',    w: 60,  num: true },
  { key: '375',      label: '375+',    w: 60,  num: true },
  { key: '400',      label: '400+',    w: 60,  num: true },
  { key: 'ihr',      label: 'IHR',     w: 70,  num: true },
  { key: 'k_rate',   label: 'K%',      w: 60,  num: true },
  { key: 'lineup',   label: 'Spot',    w: 50,  num: true },
]

function rowVal(p, key) {
  if (key === 'name') return nameOf(p)
  if (key === 'team') return teamOf(p)
  if (key === 'role') return tierRole(p)
  if (key === 'hr_score') return hrScore(p)
  if (key === 'dmg') return n(p?.damage_conversion_score, 0)
  if (key === 'pmatch') return n(p?.pitch_type_match_score, 0)
  if (key === 'hrr') return prodScore(p)
  if (key === 'hit') return hitScore(p)
  if (key === 'tb') return tbScore(p)
  if (key === 'pmix') return pitchMixScore(p)
  if (key === '375') return recent375(p)
  if (key === '400') return recent400(p)
  if (key === 'ihr') return ihrVal(p)
  if (key === 'k_rate') return n(p?.season_k_rate, 0)
  // BUGFIX: previously returned the sentinel 99 for a missing lineup spot,
  // requiring cellText() below to separately check `v === 99` to render
  // '—' instead of the literal number. Two functions silently agreeing on
  // one magic constant is fragile -- if either changes alone, a missing
  // spot would start rendering as "99" instead of "—". Returning null is
  // type-honest and self-describing; the sort comparator and cellText both
  // check for null directly instead of a magic number.
  if (key === 'lineup') {
    const v = p?.lineup_spot
    return v == null || v === '' ? null : n(v, null)
  }
  return 0
}

function cellText(p, key) {
  const v = rowVal(p, key)
  if (key === 'k_rate') return pct(v)
  if (key === 'ihr') return v ? v.toFixed(3) : '—'
  if (key === 'lineup') return v == null ? '—' : String(v)
  if (typeof v === 'number') return v ? v.toFixed(v % 1 ? 1 : 0) : '—'
  return v || '—'
}

export default function Scoreboard({ players, onPlayerClick }) {
  const [sortKey, setSortKey] = useState('hr_score')
  const [sortDir, setSortDir] = useState('desc')
  const [alignedOnly, setAlignedOnly] = useState(false)

  const alignedCount = useMemo(() => players.filter(isAligned).length, [players])

  const rows = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1
    const pool = alignedOnly ? players.filter(isAligned) : players
    return [...pool].sort((a, b) => {
      const av = rowVal(a, sortKey)
      const bv = rowVal(b, sortKey)
      // Missing values (currently only lineup_spot can be null) always sort
      // to the bottom regardless of sort direction, rather than letting
      // `null - null` / `number - null` produce NaN and silently corrupt
      // sort order for the whole column.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return dir * av.localeCompare(String(bv))
      return dir * (av - bv)
    })
  }, [players, sortKey, sortDir, alignedOnly])

  function clickHeader(key) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  if (!players.length) return <Empty text="No players yet." />

  return (
    <div>
      <PanelTitle
        title="Scoreboard"
        sub={`${rows.length} batters · click a column to sort`}
        right={
          alignedCount > 0 && (
            <button
              onClick={() => setAlignedOnly((v) => !v)}
              title="Weak-spot + pitch-match + real recent contact quality all stacking together"
              style={btnStyle(C.purple, alignedOnly)}
            >
              🧩 Aligned only ({alignedCount})
            </button>
          )
        }
      />
      <div className="scoreboard-wrap" style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 14, background: C.bg2 }}>
        <table className="scoreboard-table" style={{ borderCollapse: 'collapse', minWidth: 1100, width: '100%', fontFamily: NUM_FONT, fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.bg3 }}>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => clickHeader(c.key)}
                  className={c.sticky ? 'scoreboard-player-col' : ''}
                  title={c.key === 'dmg' ? 'Damage Conversion Score — strongest single validated HR predictor' : c.key === 'pmatch' ? 'Pitch-Type Match Score — second strongest validated HR predictor' : undefined}
                  style={{
                    textAlign: c.num ? 'right' : 'left',
                    padding: '10px 10px',
                    minWidth: c.w,
                    color: sortKey === c.key ? C.text : C.text3,
                    fontWeight: sortKey === c.key ? 800 : 600,
                    cursor: 'pointer',
                    borderBottom: `1px solid ${C.border}`,
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const role = tierRole(p)
              const rc = tierColor(role, C)
              return (
                <tr
                  key={i}
                  onClick={() => onPlayerClick?.(p)}
                  style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                >
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={c.sticky ? 'scoreboard-player-col scoreboard-player-cell' : ''}
                      style={{
                        textAlign: c.num ? 'right' : 'left',
                        padding: '9px 10px',
                        color: c.key === 'name' ? C.text : C.text2,
                        fontWeight: c.key === 'name' ? 700 : 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.key === 'name' && (
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {nameOf(p)} <span style={{ color: C.text3, fontWeight: 500, fontSize: 10 }}>vs {oppOf(p)}</span>
                          {isAligned(p) && <span title="Aligned Signals" style={{ fontSize: 10 }}>🧩</span>}
                        </div>
                      )}
                      {c.key === 'role' && <Chip color={rc}>{role}</Chip>}
                      {c.key !== 'name' && c.key !== 'role' && cellText(p, c.key)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
