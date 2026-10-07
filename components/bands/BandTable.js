'use client'
import { NUM_FONT as MLB_NUM } from '../../lib/theme'
import { wilson } from '../../lib/interval'
import { bandTint } from '../ScoreBands'
import DenseTable from '../DenseTable'

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

// THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b; Donovan: "convert
// them all"). Same rows, same bands, same tint and claim rule (bandTint; grey
// = no claim, dimmed = unresolved); each band sorts by its rate.
export default function BandTable({ rows, columns, theme, numFont = MLB_NUM, firstHead = 'score', minFirst = 118, accent = null }) {
  const C = theme
  const cell = (r, q) => {
    const b = (r.bands || []).find((x) => x.label === q)
    if (!b || !b.n) return null
    const p = (100 * b.ok) / b.n
    const ci = wilson(b.ok, b.n)
    const resolved = !!ci && !(ci[0] <= r.base && r.base <= ci[1])
    return { b, p, ci, resolved, tint: bandTint(p - r.base, r.claims && resolved, C, accent) }
  }
  return (
    <DenseTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={Math.max(rows.length, 1)} accent={accent}
      caption={`Hit rate by ${firstHead} band, with the verdict for each row`}
      rows={rows.map((r) => ({ ...r, _key: r.key, ...Object.fromEntries(columns.map((q, k) => [`b${k}`, cell(r, q)?.p ?? null])) }))}
      columns={[
        { key: 'label', label: firstHead, heat: false, sticky: true, w: minFirst, fmt: (v, r) => (
          <span style={{ fontWeight: 800, color: r.color || C.text }}>{v}{r.sub && <span style={{ display: 'block', fontWeight: 500, fontSize: 9, color: C.text3, marginTop: 2 }}>{r.sub}</span>}</span>) },
        ...columns.map((q, k) => ({ key: `b${k}`, label: q, w: 96, heat: false, numeric: false, fmt: (_, r) => {
          const x = cell(r, q)
          if (!x) return <span style={{ color: C.text3 }}>—</span>
          return (
            <span title={`${r.label} ${q}: ${x.b.ok} of ${x.b.n}\nBase for this row: ${r.base.toFixed(1)}%${x.ci ? `\n95% interval: ${x.ci[0].toFixed(1)}–${x.ci[1].toFixed(1)}%` : ''}${r.claims ? '' : '\nGrey: this row does not support a claim.'}`}
              style={{ fontFamily: numFont, background: x.tint.bg, padding: '2px 5px', borderRadius: 4, opacity: r.claims && !x.resolved ? 0.7 : 1, whiteSpace: 'nowrap' }}>
              <b style={{ color: x.tint.fg }}>{x.p.toFixed(1)}%</b><span style={{ color: C.text3, fontSize: 9 }}> {x.b.ok}/{x.b.n}</span>
            </span>) } })),
        { key: 'verdict', label: 'verdict', heat: false, w: 190, fmt: (v, r) => <span style={{ fontSize: 9.5, fontWeight: 800, color: r.verdictTone || C.text3 }}>{v}</span> },
      ]} />
  )
}
