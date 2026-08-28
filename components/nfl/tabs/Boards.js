'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, MARKETS, gradeFor } from '../../../lib/nfl/theme'
import { quoteFor } from '../../../lib/nfl/oddsMatch'
import OddsLine from '../../OddsLine'
import OddsStatus from '../../OddsStatus'
import { ActiveFilters, FilterBar, FilterSearch, FilterSelect, PillRow, Segmented } from '../../Filters'

// Boards — the seven markets, one at a time, category buttons across the top.
//
// Same call the MLB side made on 2026-08-04 when HR Board and Hits & HRR were
// merged: these are the same ranking machinery pointed at different columns,
// and seven tabs for one component is seven places to fix the same bug.
//
// The score bar is the whole visual. At a glance you want the SHAPE of the
// board — is this a market with three clear plays or twenty coin flips — and
// a column of numbers doesn't show you that.

export default function Boards({ data, onPlayerClick, odds, oddsStatus }) {
  const [market, setMarket] = useState('TD')
  const [showLow, setShowLow] = useState(false)
  const [query, setQuery] = useState('')
  const [team, setTeam] = useState('all')
  const [position, setPosition] = useState('all')

  const spec = useMemo(
    () => (data?.markets || []).find((m) => m.key === market),
    [data, market],
  )

  const rows = useMemo(() => {
    const all = (data?.players || []).filter((p) => Number.isFinite(p.scores?.[market]))
    const needle = query.trim().toLowerCase()
    const kept = all.filter((p) => (
      (showLow || !p.low_sample)
      && (team === 'all' || p.team === team)
      && (position === 'all' || p.position === position)
      && (!needle || String(p.name || '').toLowerCase().includes(needle))
    ))
    return kept.sort((a, b) => b.scores[market] - a.scores[market]).slice(0, 60)
  }, [data, market, showLow, query, team, position])

  const filterOptions = useMemo(() => {
    const eligible = (data?.players || []).filter((p) => Number.isFinite(p.scores?.[market]))
    const countBy = (key) => eligible.reduce((acc, p) => {
      const value = p[key]
      if (value) acc[value] = (acc[value] || 0) + 1
      return acc
    }, {})
    const teams = countBy('team')
    const positions = countBy('position')
    return {
      teams: [{ key: 'all', label: 'All teams', count: eligible.length }, ...Object.keys(teams).sort().map((key) => ({ key, label: key, count: teams[key] }))],
      positions: [{ key: 'all', label: 'All positions', count: eligible.length }, ...Object.keys(positions).sort().map((key) => ({ key, label: key, count: positions[key] }))],
    }
  }, [data, market])

  const marketOptions = useMemo(() => MARKETS.map(([key, label]) => ({
    key, label,
    count: (data?.players || []).filter((p) => Number.isFinite(p.scores?.[key]) && (showLow || !p.low_sample)).length,
  })), [data, showLow])

  const lowCount = useMemo(
    () => (data?.players || []).filter(
      (p) => Number.isFinite(p.scores?.[market]) && p.low_sample).length,
    [data, market],
  )

  return (
    <div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 11,
        padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12,
        background: C.bg2,
      }}>
        <PillRow label="Market" value={market} options={marketOptions} onChange={setMarket} />
        <FilterBar>
          <FilterSearch value={query} onChange={setQuery} placeholder="Search player…" width={165} />
          <FilterSelect label="Team" value={team} options={filterOptions.teams} onChange={setTeam} />
          <FilterSelect label="Position" value={position} options={filterOptions.positions} onChange={setPosition} />
          <Segmented
            label="Sample"
            value={showLow ? 'all' : 'trusted'}
            onChange={(value) => setShowLow(value === 'all')}
            options={[
              { key: 'trusted', label: 'Trusted' },
              { key: 'all', label: `All${lowCount ? ` +${lowCount}` : ''}` },
            ]}
          />
        </FilterBar>
        <ActiveFilters
          shown={rows.length}
          total={(data?.players || []).filter((p) => Number.isFinite(p.scores?.[market])).length}
          filters={[
            query && { key: 'query', label: `Name: ${query}`, onClear: () => setQuery('') },
            team !== 'all' && { key: 'team', label: `Team: ${team}`, onClear: () => setTeam('all') },
            position !== 'all' && { key: 'position', label: `Position: ${position}`, onClear: () => setPosition('all') },
            showLow && { key: 'sample', label: 'Low-sample included', onClear: () => setShowLow(false) },
          ]}
          onClearAll={() => { setQuery(''); setTeam('all'); setPosition('all'); setShowLow(false) }}
        />
      </div>

      {/* Says WHY there's no price on any row below, rather than every row
          just silently carrying nothing — same discipline odds_status.json
          enforces on the MLB side. Silent (renders null) once a fetch has
          actually succeeded; see components/OddsStatus.js's own TONE table. */}
      {oddsStatus && (
        <div style={{ marginBottom: 10 }}><OddsStatus status={oddsStatus} /></div>
      )}

      {spec && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`,
          borderRadius: 10, padding: '9px 13px', marginBottom: 10,
          fontSize: 11.5, color: C.text2, lineHeight: 1.6,
        }}>
          <b style={{ color: C.text }}>{spec.label}</b> · bar{' '}
          <b style={{ color: C.green, fontFamily: NUM_FONT }}>{spec.bar}</b> ·{' '}
          {spec.positions.join(' / ')}
          {spec.dropped?.length > 0 && (
            <div style={{ color: C.yellow, marginTop: 3, fontSize: 10 }}>
              no lines this slate · weight redistributed
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((p, i) => {
          const s = p.scores[market]
          const g = gradeFor(s)
          return (
            <button
              key={p.player_id}
              onClick={() => onPlayerClick?.(p, market)}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', textAlign: 'left', cursor: 'pointer',
                background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9,
                padding: '7px 11px', overflow: 'hidden',
                opacity: p.low_sample ? 0.5 : 1,
              }}
            >
              {/* the bar IS the score — read the board's shape before any number */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                // The fill spans the LIVE band, not 0-100. On the MLB scale
                // nothing legitimately reaches 100, so a raw percentage made
                // every bar look half-empty and flattened the difference
                // between a 67 and a 30.
                width: `${Math.max(2, Math.min(100, ((s - 20) / 60) * 100))}%`,
                background: `linear-gradient(90deg, ${g.color}1f, transparent)`,
                pointerEvents: 'none',
              }} />
              <span style={{
                position: 'relative', fontFamily: NUM_FONT, fontSize: 10,
                color: C.text3, minWidth: 20,
              }}>{i + 1}</span>
              <span style={{
                position: 'relative', fontFamily: NUM_FONT, fontSize: 14,
                fontWeight: 900, color: g.color, minWidth: 36,
              }}>{Math.round(s)}</span>
              {/* The grade, same ladder as the MLB board. The number alone
                  doesn't tell you whether 61 is good on this slate. */}
              <span style={{
                position: 'relative', fontFamily: NUM_FONT, fontSize: 9.5,
                fontWeight: 900, color: g.color, minWidth: 22,
                border: `1px solid ${g.color}55`, borderRadius: 5,
                padding: '1px 4px', textAlign: 'center',
              }}>{g.label}</span>
              <span style={{
                position: 'relative', fontSize: 12.5, fontWeight: 700, color: C.text,
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.name}</span>
              <span style={{
                position: 'relative', fontSize: 10, color: C.text3, fontFamily: NUM_FONT,
              }}>{p.position}</span>
              <span style={{
                position: 'relative', fontSize: 10.5, color: C.text2,
                fontFamily: NUM_FONT, minWidth: 74, textAlign: 'right',
              }}>{p.team} {p.opp ? `vs ${p.opp}` : ''}</span>
              {/* The book's line, when one exists for this player/market —
                  renders nothing per-row when it doesn't (no line offered is
                  a normal, per-player state; the banner above is what says
                  whether the FETCH itself found anything at all). */}
              {odds && (
                <span style={{ position: 'relative' }}>
                  <OddsLine quote={quoteFor(odds, p, market)} compact />
                </span>
              )}
              {p.questionable && (
                <span style={{
                  position: 'relative', fontSize: 9, fontWeight: 900, color: C.yellow,
                }}>Q</span>
              )}
              {p.carryover && (
                <span
                  title="Built from last season's per-game baseline — no current-season form yet."
                  style={{ position: 'relative', fontSize: 9, fontWeight: 900, color: C.purple }}
                >CO</span>
              )}
            </button>
          )
        })}
      </div>

      {!rows.length && (
        <div style={{
          border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
          textAlign: 'center', color: C.text3, fontSize: 12.5,
        }}>Nothing scored for this market on this slate.</div>
      )}
    </div>
  )
}
