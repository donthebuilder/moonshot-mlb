'use client'
import { C, NUM_FONT } from '../lib/theme'

// 📋 ONE BOX SCORE, ONE COMPONENT.
//
// 2026-08-15, Donovan: "the box score on the at the plate is hard to read."
//
// It was hard to read because it wasn't a box score — it was a dense grid
// built for a different job, wearing box-score column names. This is the
// newspaper shape, and it is shared by the Box tab and At the Plate so there
// is exactly one of them to fix and one to look at.
//
// WHAT MAKES A BOX READABLE, in the order it matters:
//
//   1. THE NAME COLUMN IS WIDE AND STICKY. Every other column is three
//      characters; the name is the only thing you scan for, and it was the
//      one being truncated.
//   2. NUMBERS ARE TABULAR AND RIGHT-ALIGNED. A proportional font puts the
//      1s and the 4s in different places and the eye stops being able to run
//      down a column.
//   3. ZEROS RECEDE. A box is mostly zeros; if they're the same weight as the
//      hits, nothing stands out. Zeros are dim, non-zeros are normal, and the
//      things that decide games — RBI, HR — carry colour.
//   4. SUBS ARE INDENTED under the man they replaced, which is how you can
//      tell a 3-for-4 from a 3-for-4 across two people in the same slot.
//   5. THE TOTALS ROW IS A RULE, not another row of the same weight.

const cell = (dim) => ({
  fontFamily: NUM_FONT, fontSize: 11.5, textAlign: 'right',
  padding: '3px 5px', whiteSpace: 'nowrap',
  color: dim ? C.text3 : C.text,
  fontVariantNumeric: 'tabular-nums',
})

const th = {
  fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, textAlign: 'right',
  letterSpacing: '.06em', color: C.text3, padding: '0 5px 4px',
  textTransform: 'uppercase', whiteSpace: 'nowrap',
}

const BAT_COLS = [
  ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['rbi', 'RBI'],
  ['bb', 'BB'], ['k', 'K'], ['lob', 'LOB'],
]

export function BattingBox({ side, highlight, onPlayerClick, title }) {
  const rows = side?.batting || []
  if (!rows.length) return null
  const t = side?.totals?.batting
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3,
        paddingBottom: 3, borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>{title || side?.team?.name}</span>
        {t && (
          <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>
            {t.r} R · {t.h} H · {t.hr ? `${t.hr} HR · ` : ''}{t.lob} LOB
          </span>
        )}
      </div>
      <div className="dense-scroll rail" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', width: '100%' }}>Batters</th>
              {BAT_COLS.map(([k, l]) => <th key={k} style={th}>{l}</th>)}
              <th style={th} title="Season batting average coming into today">AVG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const on = highlight?.has?.(p.id)
              return (
                <tr key={`${p.id}-${p.spot}-${p.depth}`}
                  onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
                  style={{
                    cursor: onPlayerClick ? 'pointer' : 'default',
                    background: on ? 'rgba(249,115,22,.10)' : 'transparent',
                  }}>
                  <td style={{
                    fontSize: 11.5, padding: '3px 5px', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    // The indent IS the information: this man came in for the
                    // one above him.
                    paddingLeft: 5 + p.depth * 11,
                    color: on ? C.orange : C.text,
                    fontWeight: on ? 800 : 500,
                  }}>
                    {p.sub && <span style={{ color: C.text3, marginRight: 3 }}>↳</span>}
                    {p.name}
                    <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginLeft: 5 }}>{p.pos}</span>
                  </td>
                  {BAT_COLS.map(([k]) => {
                    const v = p[k]
                    const hot = (k === 'rbi' || k === 'h') && v > 0
                    return (
                      <td key={k} style={{
                        ...cell(!v),
                        color: !v ? C.text3 : hot ? '#4ade80' : C.text,
                        fontWeight: hot ? 800 : 500,
                      }}>{v}</td>
                    )
                  })}
                  <td style={{ ...cell(true), fontSize: 10.5 }}>{p.avg ?? '—'}</td>
                </tr>
              )
            })}
            {t && (
              <tr>
                <td style={{
                  fontSize: 10, fontWeight: 800, padding: '4px 5px 2px',
                  color: C.text3, borderTop: `1px solid ${C.border2}`, letterSpacing: '.05em',
                }}>TOTALS</td>
                {BAT_COLS.map(([k]) => (
                  <td key={k} style={{
                    ...cell(false), fontWeight: 800, fontSize: 11,
                    borderTop: `1px solid ${C.border2}`, color: C.text2,
                  }}>{t[k]}</td>
                ))}
                <td style={{ ...cell(true), borderTop: `1px solid ${C.border2}` }}>{t.avg ?? '—'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Extra-base hits and homers, called out below the table the way a
          newspaper box does — they're buried inside TB otherwise. */}
      {(() => {
        const hrs = rows.filter((p) => p.hr > 0)
        const xbh = rows.filter((p) => p.d2 > 0 || p.d3 > 0)
        const sb = rows.filter((p) => p.sb > 0)
        if (!hrs.length && !xbh.length && !sb.length) return null
        const line = (label, list, fmt) => list.length ? (
          <div><b style={{ color: C.text3 }}>{label}:</b> {list.map(fmt).join(', ')}</div>
        ) : null
        return (
          <div style={{ fontSize: 9.5, color: C.text2, lineHeight: 1.6, marginTop: 5, fontFamily: NUM_FONT }}>
            {line('HR', hrs, (p) => `${p.name}${p.hr > 1 ? ` (${p.hr})` : ''}`)}
            {line('2B/3B', xbh, (p) => `${p.name}${p.d2 > 1 || p.d3 ? ` (${p.d2}/${p.d3})` : ''}`)}
            {line('SB', sb, (p) => `${p.name}${p.sb > 1 ? ` (${p.sb})` : ''}`)}
          </div>
        )
      })()}
    </div>
  )
}

const PIT_COLS = [['ip', 'IP'], ['h', 'H'], ['r', 'R'], ['er', 'ER'], ['bb', 'BB'], ['k', 'K'], ['hr', 'HR']]

export function PitchingBox({ side, title }) {
  const rows = side?.pitching || []
  if (!rows.length) return null
  return (
    <div style={{ minWidth: 0, marginTop: 9 }}>
      <div className="dense-scroll rail" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', width: '100%' }}>
                {title || `${side?.team?.abbr || ''} pitchers`}
              </th>
              {PIT_COLS.map(([k, l]) => <th key={k} style={th}>{l}</th>)}
              <th style={th} title="Pitches thrown (strikes)">P-S</th>
              <th style={th} title="Season ERA">ERA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={`${p.id}-${i}`}>
                <td style={{
                  fontSize: 11.5, padding: '3px 5px', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  paddingLeft: p.started ? 5 : 16,
                }}>
                  {!p.started && <span style={{ color: C.text3, marginRight: 3 }}>↳</span>}
                  {p.name}
                  {p.note && <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.orange, marginLeft: 5 }}>{p.note}</span>}
                </td>
                {PIT_COLS.map(([k]) => {
                  const v = p[k]
                  const bad = (k === 'er' || k === 'hr') && v > 0
                  return (
                    <td key={k} style={{
                      ...cell(k !== 'ip' && !v),
                      color: k === 'ip' ? C.text : !v ? C.text3 : bad ? '#f87171' : k === 'k' ? '#4ade80' : C.text,
                      fontWeight: (k === 'ip' || bad || (k === 'k' && v >= 6)) ? 800 : 500,
                    }}>{v}</td>
                  )
                })}
                <td style={{ ...cell(true), fontSize: 10 }}>
                  {p.pitches ? `${p.pitches}-${p.strikes}` : '—'}
                </td>
                <td style={{ ...cell(true), fontSize: 10.5 }}>{p.era ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The innings across the top — R H E down the side. */
export function LineScore({ game }) {
  const innings = game?.innings || []
  if (!innings.length) return null
  const row = (who, label) => (
    <tr>
      <td style={{
        fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, padding: '2px 8px 2px 0',
        whiteSpace: 'nowrap', color: C.text,
      }}>{label}</td>
      {innings.map((i) => (
        <td key={i.n} style={{
          ...cell(i[who] == null || i[who] === 0), textAlign: 'center', minWidth: 20, padding: '2px 4px',
        }}>{i[who] == null ? '·' : i[who]}</td>
      ))}
      {['r', 'h', 'e'].map((k) => (
        <td key={k} style={{
          ...cell(false), textAlign: 'center', minWidth: 24, fontWeight: 800,
          color: k === 'r' ? C.orange : C.text2,
          borderLeft: k === 'r' ? `1px solid ${C.border2}` : 'none',
        }}>{game.totals?.[who]?.[k] ?? '—'}</td>
      ))}
    </tr>
  )
  return (
    <div className="dense-scroll rail" style={{ overflowX: 'auto', marginBottom: 9 }}>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }} />
            {innings.map((i) => (
              <th key={i.n} style={{ ...th, textAlign: 'center', minWidth: 20 }}>{i.n}</th>
            ))}
            {['R', 'H', 'E'].map((k) => (
              <th key={k} style={{ ...th, textAlign: 'center', minWidth: 24, color: k === 'R' ? C.orange : C.text3 }}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row('away', game.away?.abbr || 'AWAY')}
          {row('home', game.home?.abbr || 'HOME')}
        </tbody>
      </table>
    </div>
  )
}
