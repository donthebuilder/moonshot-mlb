'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// FieldChart — where the ball goes, and where a defence leaks.
//
// The football answer to the MLB spray chart, and the same job: a shape you
// read in one glance instead of a column you read one number at a time.
//
// Every cell is coloured AGAINST THE LEAGUE, not against the grid's own max.
// That distinction is the whole value: coloured against itself, every defence
// has a red zone and a green one and the chart says nothing. Against the
// league, "soft deep right" is a real claim.

const SIDES = ['left', 'middle', 'right']
const DEPTHS = ['deep', 'mid', 'short', 'behind']
const DEPTH_TITLE = { deep: 'DEEP 20+', mid: 'INT 10–19', short: 'SHORT 0–9', behind: 'BEHIND' }
const RUSH = ['left|end', 'left|tackle', 'left|guard', 'middle|middle',
  'right|guard', 'right|tackle', 'right|end']
const RUSH_TITLE = { 'left|end': 'L END', 'left|tackle': 'L TCK', 'left|guard': 'L GRD',
  'middle|middle': 'MID', 'right|guard': 'R GRD', 'right|tackle': 'R TCK', 'right|end': 'R END' }

// vs league: +25% is a real leak, -25% a real strength. Between them, nothing.
function tone(v, lg) {
  if (!Number.isFinite(v) || !Number.isFinite(lg) || lg <= 0) return null
  const d = (v - lg) / lg
  if (d >= 0.25) return { c: C.red, s: 'soft' }
  if (d >= 0.10) return { c: '#fb923c', s: 'leaky' }
  if (d <= -0.25) return { c: C.green, s: 'strong' }
  if (d <= -0.10) return { c: C.lime, s: 'firm' }
  return { c: C.text3, s: 'average' }
}

function Cell({ z, lg, metric, label, min }) {
  const v = z?.[metric]
  const n = z?.att ?? 0
  const t = tone(v, lg?.[metric])
  const thin = n < (min ?? 8)
  return (
    <div
      title={`${label} · ${n} att · ${metric} ${v ?? '—'} (league ${lg?.[metric] ?? '—'})`}
      style={{
        flex: 1, minWidth: 0, borderRadius: 8, padding: '9px 6px', textAlign: 'center',
        background: t && !thin ? `${t.c}1c` : 'rgba(255,255,255,.025)',
        border: `1px solid ${t && !thin ? `${t.c}44` : C.border}`,
        opacity: thin ? 0.45 : 1,
      }}
    >
      <div style={{
        fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900,
        color: thin ? C.text3 : (t?.c ?? C.text),
      }}>{Number.isFinite(v) ? v.toFixed(1) : '—'}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 8, color: C.text3, marginTop: 3 }}>{n}</div>
    </div>
  )
}

export default function FieldChart({ field, team, playerId, mode = 'def' }) {
  const [view, setView] = useState('pass')
  if (!field) return null

  const src = mode === 'def'
    ? (view === 'pass' ? field.def_pass : field.def_rush)
    : (view === 'pass' ? field.player_pass : field.player_rush)
  const key = mode === 'def' ? team : playerId
  const grid = src?.[key]
  const league = view === 'pass' ? field.league_pass : field.league_rush
  const metric = view === 'pass' ? 'ypa' : 'ypc'

  const worst = useMemo(() => {
    if (!grid || mode !== 'def') return null
    const zones = view === 'pass' ? Object.keys(grid) : RUSH.filter((z) => grid[z])
    let best = null
    for (const z of zones) {
      const g = grid[z]; const lg = league?.[z]
      if (!g || (g.att ?? 0) < 12 || !lg?.[metric]) continue
      const d = (g[metric] - lg[metric]) / lg[metric]
      if (!best || d > best.d) best = { z, d, v: g[metric], lg: lg[metric] }
    }
    return best
  }, [grid, league, view, metric, mode])

  if (!grid) {
    return <div style={{ color: C.text3, fontSize: 11.5, padding: 12 }}>No field data.</div>
  }

  // "middle mid" was the machine key leaking into the sentence.
  const DEPTH_WORD = { deep: 'deep', mid: 'intermediate', short: 'short', behind: 'behind the line' }
  const label = (z) => {
    if (view !== 'pass') return RUSH_TITLE[z] || z
    const [side, d] = z.split('|')
    return d === 'behind' ? `behind the line, ${side}` : `${DEPTH_WORD[d]} ${side}`
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
        {[['pass', 'Passing'], ['rush', 'Rushing']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{
            fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, cursor: 'pointer',
            padding: '4px 10px', borderRadius: 7,
            border: `1px solid ${view === k ? C.green : C.border}`,
            background: view === k ? `${C.green}18` : 'transparent',
            color: view === k ? C.green : C.text3,
          }}>{l}</button>
        ))}
      </div>

      {/* the field */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(34,197,94,.05), rgba(255,255,255,.015))',
        border: `1px solid ${C.border}`, borderRadius: 12, padding: 11,
      }}>
        {view === 'pass' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {DEPTHS.map((d) => (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontFamily: NUM_FONT, fontSize: 7.5, fontWeight: 900, color: C.text3,
                  letterSpacing: '.1em', width: 56, textAlign: 'right',
                }}>{DEPTH_TITLE[d]}</span>
                {SIDES.map((s) => (
                  <Cell key={s} z={grid[`${s}|${d}`]} lg={league?.[`${s}|${d}`]}
                        metric={metric} label={`${s} ${d}`} />
                ))}
              </div>
            ))}
            {/* line of scrimmage */}
            <div style={{
              height: 1, background: C.border2, margin: '2px 0 0 62px',
              position: 'relative',
            }}>
              <span style={{
                position: 'absolute', right: 0, top: 3, fontFamily: NUM_FONT,
                fontSize: 7.5, color: C.text3, letterSpacing: '.1em',
              }}>LINE OF SCRIMMAGE</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
            {RUSH.map((z) => (
              <div key={z} style={{ flex: 1, minWidth: 0 }}>
                <Cell z={grid[z]} lg={league?.[z]} metric={metric} label={RUSH_TITLE[z]} />
                <div style={{
                  fontFamily: NUM_FONT, fontSize: 7.5, fontWeight: 800, color: C.text3,
                  textAlign: 'center', marginTop: 4, letterSpacing: '.08em',
                }}>{RUSH_TITLE[z]}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {worst && (
        <div style={{ fontSize: 11.5, color: C.text2, marginTop: 9, lineHeight: 1.55 }}>
          Softest spot: <b style={{ color: C.red }}>{label(worst.z)}</b> —{' '}
          <b style={{ color: C.text, fontFamily: NUM_FONT }}>{worst.v.toFixed(1)}</b> vs{' '}
          <span style={{ fontFamily: NUM_FONT }}>{worst.lg.toFixed(1)}</span> league
          ({worst.d > 0 ? '+' : ''}{Math.round(worst.d * 100)}%).
        </div>
      )}
      <div style={{ fontSize: 10, color: C.text3, marginTop: 5 }}>
        Coloured against the league, not against this grid. Faded cells are under 8 attempts.
      </div>
    </div>
  )
}
