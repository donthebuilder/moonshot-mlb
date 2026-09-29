'use client'
import { NUM_FONT as MLB_NUM } from '../../lib/theme'
import { wilson } from '../../lib/interval'
import { bandTint } from '../ScoreBands'

// MOONSHOT'S SCORE-BANDS TABLE, FOR ANY SPORT (2026-09-29, parity plan D).
// The shape of components/ScoreBands.js: one row per score (or market), the
// bands as columns, each cell the rate with its k/n, tinted by its gap from
// that row's base rate, and GREY when the row makes no claim or the cell's
// own 95% interval covers the base. TUDDY's score quartiles and LAMP's rank
// bands both render through it.
//
// rows: [{ key, label, sub, color, base (pct), bands: [{ label, ok, n }],
//          claims (bool), verdict (text), verdictTone (colour) }]
// columns: the band labels, in order.

/**
 * MOONSHOT's claim rule for one row: the bands run in order (`dir` +1 = rising
 * to the right, -1 = falling) AND first vs last differ by a real margin
 * (two-proportion z >= 1.96). Returns { claims, z, ordered }.
 */
export function bandClaim(bands, dir = 1) {
  const live = bands.filter((b) => b.n > 0)
  if (live.length < 2) return { claims: false, z: 0, ordered: false }
  const pct = (b) => b.ok / b.n
  const ordered = live.every((b, i) => i === 0 || dir * (pct(b) - pct(live[i - 1])) >= 0)
  const a = live[0], z0 = live[live.length - 1]
  const pool = (a.ok + z0.ok) / (a.n + z0.n)
  const se = Math.sqrt(pool * (1 - pool) * (1 / a.n + 1 / z0.n))
  const z = se > 0 ? dir * (pct(z0) - pct(a)) / se : 0
  return { claims: ordered && z >= 1.96, z, ordered }
}

export default function BandTable({ rows, columns, theme, numFont = MLB_NUM, firstHead = 'score', minFirst = 118 }) {
  const C = theme
  const th = { padding: '5px 9px', textAlign: 'right', fontSize: 9.5, fontWeight: 800, color: C.text2, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
  const td = { padding: '5px 9px', textAlign: 'right', whiteSpace: 'nowrap', borderTop: `1px solid ${C.border}` }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontFamily: numFont, fontSize: 10.5 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: minFirst, position: 'sticky', left: 0, background: C.bg, zIndex: 2 }}>{firstHead}</th>
            {columns.map((q) => <th key={q} style={{ ...th, minWidth: 92 }}>{q}</th>)}
            <th style={{ ...th, textAlign: 'left', minWidth: 190 }}>verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: r.color || C.text, position: 'sticky', left: 0, background: C.bg, zIndex: 1 }}>
                {r.label}
                {r.sub && <div style={{ fontWeight: 500, fontSize: 9, color: C.text3, marginTop: 2 }}>{r.sub}</div>}
              </td>
              {columns.map((q) => {
                const b = (r.bands || []).find((x) => x.label === q)
                if (!b || !b.n) return <td key={q} style={{ ...td, color: C.text3 }}>—</td>
                const p = (100 * b.ok) / b.n
                const ci = wilson(b.ok, b.n)
                const resolved = !!ci && !(ci[0] <= r.base && r.base <= ci[1])
                const { bg, fg } = bandTint(p - r.base, r.claims && resolved, C)
                return (
                  <td key={q} title={`${r.label} ${q}: ${b.ok} of ${b.n}\nBase for this row: ${r.base.toFixed(1)}%${ci ? `\n95% interval: ${ci[0].toFixed(1)}–${ci[1].toFixed(1)}%` : ''}${r.claims ? '' : '\nGrey: this row does not support a claim.'}`}
                    style={{ ...td, background: bg, opacity: r.claims && !resolved ? 0.7 : 1 }}>
                    <span style={{ fontWeight: 800, color: fg }}>{p.toFixed(1)}%</span>
                    <span style={{ color: C.text3, fontSize: 9 }}> {b.ok}/{b.n}</span>
                  </td>
                )
              })}
              <td style={{ ...td, textAlign: 'left', fontSize: 9.5, fontWeight: 800, color: r.verdictTone || C.text3 }}>{r.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
