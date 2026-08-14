'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, MARKETS, gradeFor } from '../../../lib/nfl/theme'
import { btnStyle } from '../../ui'

// Boards — the seven markets, one at a time, category buttons across the top.
//
// Same call the MLB side made on 2026-08-04 when HR Board and Hits & HRR were
// merged: these are the same ranking machinery pointed at different columns,
// and seven tabs for one component is seven places to fix the same bug.
//
// The score bar is the whole visual. At a glance you want the SHAPE of the
// board — is this a market with three clear plays or twenty coin flips — and
// a column of numbers doesn't show you that.

export default function Boards({ data, onPlayerClick }) {
  const [market, setMarket] = useState('TD')
  const [showLow, setShowLow] = useState(false)

  const spec = useMemo(
    () => (data?.markets || []).find((m) => m.key === market),
    [data, market],
  )

  const rows = useMemo(() => {
    const all = (data?.players || []).filter((p) => Number.isFinite(p.scores?.[market]))
    const kept = showLow ? all : all.filter((p) => !p.low_sample)
    return kept.sort((a, b) => b.scores[market] - a.scores[market]).slice(0, 60)
  }, [data, market, showLow])

  const lowCount = useMemo(
    () => (data?.players || []).filter(
      (p) => Number.isFinite(p.scores?.[market]) && p.low_sample).length,
    [data, market],
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {MARKETS.map(([key, label]) => (
          <button key={key} onClick={() => setMarket(key)}
                  style={btnStyle(C.green, market === key)}>{label}</button>
        ))}
      </div>

      {spec && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`,
          borderRadius: 10, padding: '9px 13px', marginBottom: 10,
          fontSize: 11.5, color: C.text2, lineHeight: 1.6,
        }}>
          <b style={{ color: C.text }}>{spec.label}</b> — graded at{' '}
          <b style={{ color: C.green, fontFamily: NUM_FONT }}>{spec.bar}</b>,{' '}
          {spec.positions.join(' / ')}. Score is a <b>rank</b>, not a probability: it
          answers who&apos;s most likely, never how likely.
          {spec.dropped?.length > 0 && (
            <div style={{ color: C.yellow, marginTop: 4, fontSize: 10.5 }}>
              Not available on this slate, so their weight was redistributed:{' '}
              {spec.dropped.join(', ')}.
            </div>
          )}
        </div>
      )}

      {lowCount > 0 && (
        <button
          onClick={() => setShowLow((v) => !v)}
          style={{ ...btnStyle(C.yellow, showLow), marginBottom: 10 }}
        >
          {showLow ? 'Hide' : 'Show'} {lowCount} low-sample
        </button>
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
                width: `${Math.max(0, Math.min(100, s))}%`,
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
