'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import DenseTable from '../../DenseTable'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import PageHeader from '../../PageHeader'
import { oppShort } from '../../../lib/nfl/oppLabel'
import { FilterBar, FilterPill, FilterSearch, FilterSelect } from '../../Filters'

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
  const watchlist = useNflWatchlist(data)
  const [pos, setPos] = useState('ALL')
  const [team, setTeam] = useState('')
  const [q, setQ] = useState('')
  // The same ONLY toggle Boards and Touchdowns carry (2026-09-18).
  const [onlyWatched, setOnlyWatched] = useState(false)

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
      .filter((p) => !onlyWatched || watchlist.isPinned(p.player_id))
      .map((p) => ({
        ...p.stats,
        _p: p,
        _raw: p,
        name: p.name,
        pos: p.position,
        team: p.team,
        opp: oppShort(p),
        TDSC: p.scores?.TD ?? null,
        watched: watchlist.isPinned(p.player_id) ? 1 : 0,
      }))
  }, [data, pos, team, q, onlyWatched, watchlist])

  // Counts on the controls, the way Boards and Touchdowns carry them -- a
  // filter that says how many it will leave is worth more than one that
  // doesn't.
  const posOptions = useMemo(() => {
    const pool = data?.players || []
    return POS_GROUPS.map(([k, want]) => ({
      key: k,
      count: want ? pool.filter((p) => want.includes(p.position)).length : pool.length,
    }))
  }, [data])

  const teamOptions = useMemo(() => {
    const pool = data?.players || []
    const counts = {}
    for (const p of pool) if (p.team) counts[p.team] = (counts[p.team] || 0) + 1
    return [
      { key: '', label: 'All teams', count: pool.length },
      ...teams.map((t) => ({ key: t, label: t, count: counts[t] || 0 })),
    ]
  }, [data, teams])

  const columns = useMemo(() => {
    const base = [
      { key: 'watched', label: '☆', action: true, w: 28, mark: '★', markOff: '☆',
        titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
        onAction: (row) => watchlist.toggle(row) },
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
  }, [specs, rows, watchlist])

  return (
    <div>
      <PageHeader
        eyebrow="TUDDY · RESEARCH"
        title="Every player, every published number"
        note="The raw board behind the calls — every stat the bot publishes for every scored player, sortable, with no model opinion layered on top. Tap a name to open his card."
        theme={C}
        numFont={NUM_FONT}
        accent={C.green}
      />
      {/* THE HOUSE RESEARCH BAR (2026-09-18). This page used to open with five
          plain buttons, a bare <input> and a bare <select> -- its own third
          idiom, against Boards' and Touchdowns' shared one. Same grammar as
          those two now: pills, then the filter bar, then the ONLY row. */}
      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 2 }}>
        {posOptions.map((o) => (
          <FilterPill key={o.key} active={pos === o.key} onClick={() => setPos(o.key)} count={o.count}>
            {o.key === 'ALL' ? 'Everyone' : o.key}
          </FilterPill>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        <FilterBar>
          <FilterSearch value={q} onChange={setQ} placeholder="Search player…" width={165} />
          <FilterSelect label="Team" value={team} options={teamOptions} onChange={setTeam} />
        </FilterBar>
      </div>

      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Only</span>
        <FilterPill active={onlyWatched} onClick={() => setOnlyWatched(!onlyWatched)} title="Only names on your watchlist.">
          ★ Watchlist
        </FilterPill>
      </div>

      <div style={{ fontSize: 12, color: C.text3, margin: '8px 0 6px', lineHeight: 1.55 }}>
        {rows.length} player{rows.length === 1 ? '' : 's'} — every published stat, sorted by whichever column you tap.
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
