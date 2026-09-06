'use client'
import { useMemo, useState } from 'react'
import { C } from '../../../lib/nfl/theme'
import DenseTable from '../../DenseTable'
import { oppShort } from '../../../lib/nfl/oppLabel'
import { btnStyle, selectStyle } from '../../ui'

// Research — every number the bot has, in one sortable table.
//
// This is the tab that's useful even when the model is wrong, which in August
// is most of the time. The boards give you an opinion; this gives you the
// evidence and lets you disagree with it. It's also the honest home for the
// NGS layer: separation, YAC-over-expected and RYOE were all tested in the
// models and all but one made them WORSE, so they don't drive a score — but
// they're real measurements and they belong in front of you.
//
// Runs on the shared DenseTable, so every improvement to the MLB table (the
// multi-sort stack, the per-column ⓘ, the heat ramps) lands here for free.

const POS_GROUPS = [
  ['ALL', null],
  ['RB', ['RB']],
  ['WR', ['WR']],
  ['TE', ['TE']],
  ['QB', ['QB']],
  ['K', ['K']],
]

// Columns where a LOW number is the good one.
const INVERT = new Set([])

export default function Research({ data, onPlayerClick }) {
  const [pos, setPos] = useState('ALL')
  const [team, setTeam] = useState('')
  const [q, setQ] = useState('')

  const specs = data?.research_columns || []

  const teams = useMemo(
    () => [...new Set((data?.players || []).map((p) => p.team).filter(Boolean))].sort(),
    [data],
  )

  const rows = useMemo(() => {
    const want = POS_GROUPS.find(([k]) => k === pos)?.[1]
    const needle = q.trim().toLowerCase()
    return (data?.players || [])
      .filter((p) => !want || want.includes(p.position))
      .filter((p) => !team || p.team === team)
      .filter((p) => !needle || `${p.name} ${p.team} ${p.opp}`.toLowerCase().includes(needle))
      .map((p) => ({
        ...p.stats,
        _p: p,
        name: p.name,
        pos: p.position,
        team: p.team,
        opp: oppShort(p),
        TDSC: p.scores?.TD ?? null,
      }))
  }, [data, pos, team, q])

  const columns = useMemo(() => {
    const base = [
      { key: 'name', label: 'Player', w: 150, heat: false, sticky: true },
      { key: 'pos', label: 'POS', w: 42, heat: false },
      { key: 'team', label: 'TM', w: 42, heat: false },
      { key: 'opp', label: 'OPP', w: 46, heat: false },
      { key: 'TDSC', label: 'TD SCORE', w: 66, dp: 0 },
    ]
    // Only render a stat column if at least one row actually has it — an all-
    // dash column is noise, and with seven positions sharing one table most
    // columns are empty for most of them.
    const present = specs.filter((s) => rows.some((r) => Number.isFinite(r[s.key])))
    return [...base, ...present.map((s) => ({
      key: s.key,
      label: s.label,
      w: 58,
      invert: INVERT.has(s.key),
      // PRECISION COMES FROM THE PAYLOAD. DenseTable defaults to toFixed(0),
      // which is right for a homer count and catastrophic for a rate: target
      // share 0.198, xTD 0.63 and TDoE -0.01 every one rendered as "0" or
      // "1", so the whole table read as random noise. The bot declares `dp`
      // and `pct` alongside each stat because precision is a property of the
      // measurement, not of the table drawing it.
      dp: s.dp ?? 2,
      fmt: (v) => {
        const n = Number(v)
        if (!Number.isFinite(n)) return '—'
        return s.pct ? `${(n * 100).toFixed(s.dp ?? 1)}%` : n.toFixed(s.dp ?? 2)
      },
    }))]
  }, [specs, rows])

  return (
    <div>
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10,
      }}>
        {POS_GROUPS.map(([k]) => (
          <button key={k} onClick={() => setPos(k)} style={btnStyle(C.green, pos === k)}>{k}</button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player…"
          style={{ ...selectStyle(), width: 190, flex: '0 0 auto' }}
        />
        <select value={team} onChange={(e) => setTeam(e.target.value)}
                style={{ ...selectStyle(), width: 120, flex: '0 0 auto' }}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <DenseTable
        rows={rows}
        columns={columns}
        initialSort="TDSC"
        maxHeight={620}
        maxRows={300}
        onRowClick={(r) => onPlayerClick?.(r._p)}
        dimRow={(r) => r._p?.low_sample}
        caption={
          'Per-game trailing averages. In preseason these are last season\'s ' +
          'baselines — dimmed rows are low-sample and should be read as such. ' +
          'SEP, YACOE and RYOE come from Next Gen Stats; they are shown because ' +
          'they are real, not because the models lean on them — every one was ' +
          'tested and only RYOE (rush attempts) earned a weight.'
        }
      />
    </div>
  )
}
