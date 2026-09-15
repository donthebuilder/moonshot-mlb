'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, MARKETS, gradeFor } from '../../../lib/nfl/theme'
import { quoteFor } from '../../../lib/nfl/oddsMatch'
import OddsLine from '../../OddsLine'
import OddsStatus from '../../OddsStatus'
import NflFace from '../NflFace'
import { ActiveFilters, FilterBar, FilterSearch, FilterSelect, PillRow, Segmented } from '../../Filters'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'

const LOG_FIELD = {
  TD: 'g_td',
  REC_YDS: 'g_recyd',
  REC: 'g_rec',
  RUSH_YDS: 'g_ruyd',
  RUSH_ATT: 'g_car',
  PASS_YDS: 'g_payd',
  KICK_PTS: 'g_kick',
}

function recentForm(logs, playerId, market, bar) {
  const field = LOG_FIELD[market]
  const games = logs?.logs?.[String(playerId)]?.log
  if (!field || !Array.isArray(games)) return null
  const points = games
    .filter((game) => Number.isFinite(game?.[field]))
    .slice(-8)
    .map((game) => ({ value: Number(game[field]), week: game.w, season: game.s }))
  if (points.length < 2) return null

  const split = Math.max(1, Math.floor(points.length / 2))
  const older = points.slice(0, split)
  const newer = points.slice(split)
  const average = (items) => items.reduce((sum, point) => sum + point.value, 0) / items.length
  const delta = average(newer) - average(older)
  const hits = points.filter((point) => point.value >= Number(bar)).length
  return { points, delta, hits }
}

function FormSparkline({ form, bar, color }) {
  if (!form) return <span style={{ color: C.text3, fontSize: 9 }}>No form</span>
  const values = form.points.map((point) => point.value)
  const ceiling = Math.max(Number(bar) || 0, ...values, 1)
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? 32 : 2 + (index / (values.length - 1)) * 60
    const y = 24 - (Math.max(0, value) / ceiling) * 20
    return `${x},${y}`
  }).join(' ')
  const barY = 24 - (Math.max(0, Number(bar) || 0) / ceiling) * 20
  const direction = form.delta > 0.05 ? '▲' : form.delta < -0.05 ? '▼' : '—'
  const directionColor = form.delta > 0.05 ? C.green : form.delta < -0.05 ? C.red : C.text3

  return (
    <span title={`${form.hits}/${form.points.length} cleared the market bar in the last ${form.points.length} games`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="66" height="27" viewBox="0 0 66 27" role="img" aria-label={`Recent form: ${form.hits} of ${form.points.length} games cleared the bar`}>
        <line x1="1" x2="65" y1={barY} y2={barY} stroke={C.border2} strokeDasharray="2 2" />
        <polyline points={coords} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {form.points.map((point, index) => {
          const [x, y] = coords.split(' ')[index].split(',')
          return <circle key={`${point.season}-${point.week}`} cx={x} cy={y} r="1.8" fill={point.value >= Number(bar) ? C.green : color} />
        })}
      </svg>
      <b style={{ color: directionColor, fontFamily: NUM_FONT, fontSize: 9 }}>{direction}</b>
    </span>
  )
}

// Boards — the seven markets, one at a time, category buttons across the top.
//
// Same call the MLB side made on 2026-08-04 when HR Board and Hits & HRR were
// merged: these are the same ranking machinery pointed at different columns,
// and seven tabs for one component is seven places to fix the same bug.
//
// The score bar is the whole visual. At a glance you want the SHAPE of the
// board — is this a market with three clear plays or twenty coin flips — and
// a column of numbers doesn't show you that.

export default function Boards({ data, logs, onPlayerClick, odds, oddsStatus }) {
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
    // 60 was most of a 102-player preseason pool. Week 1 scores 500+, so 60
    // is a silent truncation of the board this tab exists to be -- and there
    // was no "showing 60 of N" anywhere to say so.
    return kept.sort((a, b) => b.scores[market] - a.scores[market]).slice(0, 200)
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
          <div style={{ color: C.text3, marginTop: 3, fontSize: 9.5 }}>
            Form line = last 8 games · dotted line = market bar · arrow compares recent half with prior half
          </div>
          {/* The single most common misread of the board (08-29 review): an 81
              looks like an 81% chance. Say what it is where it first appears. */}
          <div style={{ color: C.text3, marginTop: 3, fontSize: 9.5 }}>
            The score is a <b style={{ color: C.text2 }}>league ranking on a 0–100 scale</b>, not a probability — 81 means far up the league on this market&apos;s inputs, not an 81% chance.
          </div>
        </div>
      )}

      {/* CARD BOARD (2026-09-15, Donovan: "the props card board is okay we
          just need the pictures on there ... a table flip wouldn't be bad,
          I do like the props card"). Same rows, same scores, same sparkline,
          same odds line, same onClick -- this is a presentation change only,
          not a new data path. Photo comes from the same NflFace tile every
          other TUDDY page already uses (real ESPN headshot keyed off the
          player's own espn_id, team-colored monogram when there isn't one --
          never invented). */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))', gap: 8,
      }}>
        {rows.map((p, i) => {
          const s = p.scores[market]
          const g = gradeFor(s)
          const form = recentForm(logs, p.player_id, market, spec?.bar)
          return (
            <button
              key={p.player_id}
              onClick={() => onPlayerClick?.(p, market)}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', gap: 7,
                textAlign: 'left', cursor: 'pointer',
                background: C.bg2, border: `1px solid ${C.border}`,
                borderTop: `3px solid ${g.color}`, borderRadius: 10,
                padding: '9px 10px 10px', overflow: 'hidden',
                opacity: p.low_sample ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3, minWidth: 13,
                }}>{i + 1}</span>
                <NflFace player={p} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nfl-board-name" style={{
                    fontSize: 12.5, fontWeight: 700, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.name}</div>
                  <div className="nfl-board-matchup" style={{
                    fontSize: 10, color: C.text3, fontFamily: NUM_FONT,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.position} · {p.team} {p.opp ? `vs ${p.opp}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                  {/* The grade, same ladder as the MLB board. The number alone
                      doesn't tell you whether 61 is good on this slate. */}
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: 16, fontWeight: 900, color: g.color, lineHeight: 1,
                  }}>{Math.round(s)}</div>
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, color: g.color,
                    border: `1px solid ${g.color}55`, borderRadius: 5,
                    padding: '1px 4px', marginTop: 3, textAlign: 'center',
                  }}>{g.label}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <FormSparkline form={form} bar={spec?.bar} color={g.color} />
                {/* The book's line, when one exists for this player/market --
                    renders nothing per-card when it doesn't (no line offered is
                    a normal, per-player state; the banner above is what says
                    whether the FETCH itself found anything at all). */}
                {odds && <OddsLine quote={quoteFor(odds, p, market)} compact />}
              </div>

              {(injuryTag(p) || p.carryover) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {injuryTag(p) && (
                    <span title={injuryTitle(injuryTag(p))} style={{
                      fontSize: 9, fontWeight: 900, color: injuryColor(injuryTag(p), C),
                    }}>{injuryTag(p)}</span>
                  )}
                  {p.carryover && (
                    <span
                      title="Built from last season's per-game baseline -- no current-season form yet."
                      style={{ fontSize: 9, fontWeight: 900, color: C.purple }}
                    >CO</span>
                  )}
                </div>
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
