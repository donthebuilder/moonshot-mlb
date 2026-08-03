'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, pct,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore,
  recent375, recent400, ihrVal, avgEV, hardHitRate, barrelRate, maxEV, playerId, launchAngle,
} from '../../lib/player'
import { tierRole, tierColor, isAligned } from '../../lib/scoring'
import { PanelTitle, Empty, Chip, btnStyle } from '../ui'
import Heatmap from '../Heatmap'

// Reads the raw pull-rate field directly rather than assuming an unverified
// helper export exists in lib/player -- the bot stores this as a 0-1 decimal
// under a couple of possible field names depending on which pass wrote it.
function pullRate(p) {
  const v = p?.recent_pull_rate ?? p?.pull_rate ?? null
  return v == null ? 0 : Number(v)
}

const STATS = [
  { key: 'hr',     label: 'HR Score',     fmt: (v) => v.toFixed(1) },
  { key: 'hrr',    label: 'HRR Score',    fmt: (v) => v.toFixed(1) },
  { key: 'hit',    label: 'Hit Score',    fmt: (v) => v.toFixed(1) },
  { key: 'tb',     label: 'TB Score',     fmt: (v) => v.toFixed(1) },
  { key: 'pmix',   label: 'Pitch Mix',    fmt: (v) => v.toFixed(1) },
  { key: '375',    label: '375+ count',   fmt: (v) => String(v) },
  { key: '400',    label: '400+ count',   fmt: (v) => String(v) },
  { key: 'ihr',    label: 'Ideal HR%',    fmt: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'ev',     label: 'Avg Exit Velo',fmt: (v) => v.toFixed(1) + ' mph' },
  { key: 'maxev',  label: 'Max EV',       fmt: (v) => v.toFixed(1) + ' mph' },
  { key: 'barrel', label: 'Barrel %',     fmt: (v) => pct(v) },
  { key: 'hard',   label: 'Hard Hit %',   fmt: (v) => pct(v) },
  { key: 'pull',   label: 'Pull %',       fmt: (v) => pct(v) },
  { key: 'la',     label: 'Launch Angle', fmt: (v) => v.toFixed(1) + '°' },
  { key: 'season_hr',  label: 'Season HR',    fmt: (v) => String(v) },
  { key: 'season_avg', label: 'Season AVG',   fmt: (v) => v.toFixed(3) },
]

const getter = {
  hr: hrScore, hrr: prodScore, hit: hitScore, tb: tbScore, pmix: pitchMixScore,
  '375': recent375, '400': recent400, ihr: ihrVal,
  ev: avgEV, maxev: maxEV, barrel: barrelRate, hard: hardHitRate,
  pull: pullRate, la: launchAngle,
  season_hr: (p) => n(p?.season_hr, 0), season_avg: (p) => n(p?.season_avg, 0),
}

// Simple min-value quick filters -- a few "unique" stats per the request,
// not a full filter builder. Each filter is just "show players at or above
// this value." Threshold defaults are 0 (off) until the person sets one.
const QUICK_FILTERS = [
  { key: 'pull',  label: 'Min Pull%',     get: pullRate,    step: 5,    isPct: true },
  { key: 'la',    label: 'Min Launch°',   get: launchAngle, step: 1,    isPct: false },
  { key: '375',   label: 'Min 375+',      get: recent375,   step: 1,    isPct: false },
]

export default function Leaders({ players, onPlayerClick }) {
  const [stat, setStat] = useState('hr')
  const [alignedOnly, setAlignedOnly] = useState(false)
  const [quickFilters, setQuickFilters] = useState({}) // { pull: 0.4, la: 15, '375': 1 }
  const meta = STATS.find((s) => s.key === stat) || STATS[0]

  const ranked = useMemo(() => {
    const f = getter[stat]
    let pool = alignedOnly ? players.filter(isAligned) : players
    for (const qf of QUICK_FILTERS) {
      const rawMin = quickFilters[qf.key]
      if (rawMin != null && rawMin > 0) {
        const min = qf.isPct ? rawMin / 100 : rawMin
        pool = pool.filter((p) => qf.get(p) >= min)
      }
    }
    return [...pool]
      .map((p) => ({ p, v: f(p) }))
      .filter((x) => Number.isFinite(x.v) && x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 25)
  }, [players, stat, alignedOnly, quickFilters])

  const alignedCount = useMemo(() => players.filter(isAligned).length, [players])

  const setFilter = (key, rawValue) => {
    const value = rawValue === '' ? null : Number(rawValue)
    setQuickFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      <PanelTitle
        title="League Leaders"
        sub={`Top 25 by ${meta.label} on this slate`}
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
      <div className="leaders-controls" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {STATS.map((s) => (
          <button key={s.key} onClick={() => setStat(s.key)} style={btnStyle(C.cyan, stat === s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase', letterSpacing: '.05em' }}>Quick filters</span>
        {QUICK_FILTERS.map((qf) => (
          <label key={qf.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.text2 }}>
            {qf.label}
            <input
              type="number"
              step={qf.step}
              min={0}
              placeholder="—"
              value={quickFilters[qf.key] ?? ''}
              onChange={(e) => setFilter(qf.key, e.target.value)}
              style={{
                width: 56, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6,
                padding: '3px 6px', fontSize: 11, color: C.text, fontFamily: NUM_FONT, outline: 'none',
              }}
            />
            {qf.isPct ? '%' : ''}
          </label>
        ))}
      </div>
      {!ranked.length ? (
        <Empty text="Not enough data for this leaderboard yet." />
      ) : (
        <>
        {/* A leaderboard on one stat only tells you the order on that stat.
            The interesting question is whether the leader on THIS board is
            anywhere on the others -- a name bright in one column and dark
            across the rest is a specialist, not a play. */}
        <Heatmap
          rows={ranked.map(({ p }) => ({
            label: nameOf(p),
            values: {
              HR: hrScore(p), HRR: prodScore(p), Hit: hitScore(p), TB: tbScore(p),
              PMix: pitchMixScore(p),
              'IHR%': ihrVal(p) * 100,
              'Brl%': barrelRate(p) * 100,
              'HH%': hardHitRate(p) * 100,
              'Avg EV': avgEV(p),
              'Max EV': maxEV(p),
              LA: launchAngle(p),
              '375+': recent375(p),
              'Szn HR': n(p?.season_hr, 0),
            },
          }))}
          columns={['HR', 'HRR', 'Hit', 'TB', 'PMix', 'IHR%', 'Brl%', 'HH%', 'Avg EV', 'Max EV', 'LA', '375+', 'Szn HR']}
          title={`Top 25 by ${meta.label} — across every other leaderboard`}
          labelWidth={150}
          fmt={(v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—')}
          onRowClick={onPlayerClick ? (r, i) => onPlayerClick(ranked[i].p) : null}
        />
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {ranked.map(({ p, v }, i) => {
            const role = tierRole(p)
            const rc = tierColor(role, C)
            return (
              <div
                key={playerId(p) + i}
                onClick={() => onPlayerClick?.(p)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 110px 80px',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderTop: i ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontFamily: NUM_FONT, color: i < 3 ? C.yellow : C.text3, fontWeight: 800, fontSize: 13 }}>{i + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {nameOf(p)}
                    {isAligned(p) && <span title="Aligned Signals" style={{ fontSize: 11 }}>🧩</span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{teamOf(p)} vs {oppOf(p)}</div>
                </div>
                <div><Chip color={rc}>{role}</Chip></div>
                <div style={{ textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 800, fontSize: 14 }}>{meta.fmt(v)}</div>
              </div>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}
