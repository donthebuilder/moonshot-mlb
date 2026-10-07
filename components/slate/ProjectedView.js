'use client'
import DenseTable from '../DenseTable'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { asLogos } from '../TeamMark'

// PROJECTED OUTPUT, THE VIEW (2026-09-28). MOONSHOT's Projected output
// (components/ProjectedOutput.js) split in two: its model stays in that file,
// and everything you SEE -- the title, the filter chips, By game | By team,
// the model note, the #1-#3 podium, the bars, the sortable table with its
// graded pills -- is this, style for style. MOONSHOT renders through it
// unchanged; TUDDY (touchdowns) and LAMP (goals) pass their own rows, words
// and accent (Donovan: "we're missing projected outputs"; "MOONSHOT is the
// base"). Nothing is computed here but the table's column means.
//
// rows: [{ label ('1.  NYM @ WSH'), values: { [col]: number }, _count, _pk }], sorted and ranked
export default function ProjectedView({
  title = '📈 Projected output', tagline = 'expected COUNT, not a score — a claim that can be wrong',
  lenses = [], active = new Set(), setActive, shownCount = 0, totalCount = 0, noun = 'hitters',
  by, setBy, byOptions = ['game', 'team'],
  note = null, rows = [], primary, adj = null, unit, columns = [], pillCols = null,
  sortCol, sortDir, onSort, podiumTip = null, barsTitle = null, barsFoot = null, footnote = null,
  onOpenGame = null, onOpenTeam = null, accent = C.orange, tick = C.amber, palette = null, sport = null, large = false,
}) {
  // large (LAMP, 2026-10-06): every word 12px or more, logos 22px. Absent: the sizes below, as they were.
  const z = (n) => (large ? Math.max(12, Math.round(n + 3)) : n)
  // LOGOS (Donovan 10-02): a game or club label drawn as logos (components/TeamMark asLogos)
  const showLabel = (label, { rank = true } = {}) => asLogos(sport, String(label || ''), { px: large ? 22 : 14, rank })
  if (!rows.length) return null
  const total = rows.reduce((a, r) => a + (r.values[primary] || 0), 0)
  const podium = rows.slice(0, 3)
  const openOf = (r) => (by === 'game' ? (onOpenGame && r._pk != null ? () => onOpenGame(r._pk) : null) : (onOpenTeam && r._team ? () => onOpenTeam(r._team) : null))
  const pal = palette || {
    color: { hot: accent, warm: accent, cool: C.text2, cold: C.text3 },
    bg: { hot: alpha(accent, 0.15), warm: alpha(accent, 0.08), cool: alpha(C.text3, 0.12), cold: alpha(C.text3, 0.08) },
  }
  const pills = pillCols || new Set([primary, ...(adj ? [adj] : [])])

  return (
    <div style={{
      marginBottom: 20, background: `linear-gradient(155deg, ${C.bg2}, ${alpha(accent, 0.03)})`,
      border: `1px solid ${C.border}`, borderRadius: 13, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: z(12.5), fontWeight: 900 }}>{title}</span>
        <span style={{ fontSize: z(9.5), color: C.text3 }}>{tagline}</span>
      {/* click-to-filter — every number below recomputes over what's left */}
      <div className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {lenses.map((l) => {
          const on = active.has(l.key)
          return (
            <button key={l.key} title={l.tip}
              onClick={() => setActive((prev) => {
                const nx = new Set(prev)
                if (nx.has(l.key)) nx.delete(l.key); else nx.add(l.key)
                return nx
              })}
              style={{
                padding: '4px 11px', fontSize: z(10.5), fontWeight: 700, cursor: 'pointer',
                borderRadius: 999, whiteSpace: 'nowrap',
                border: `1px solid ${on ? accent : C.border}`,
                background: on ? alpha(accent, 0.14) : 'transparent',
                color: on ? accent : C.text3,
              }}>{l.label}</button>
          )
        })}
        {active.size > 0 && (
          <>
            <button onClick={() => setActive(new Set())} style={{
              background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
              fontSize: z(9.5), textDecoration: 'underline', textDecorationStyle: 'dotted',
            }}>clear</button>
            <span style={{ fontSize: z(9.5), color: C.text3, fontFamily: NUM_FONT }}>
              projecting {shownCount} of {totalCount} {noun}
            </span>
          </>
        )}
      </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {byOptions.map((k) => (
            <button
              key={k}
              onClick={() => setBy(k)}
              style={{
                padding: '3px 10px', fontSize: z(10.5), fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${by === k ? accent : C.border}`,
                background: by === k ? alpha(accent, 0.12) : 'transparent',
                color: by === k ? accent : C.text3,
              }}
            >By {k}</button>
          ))}
        </div>
      </div>

      {note && <div style={{ fontSize: z(9), color: C.text3, lineHeight: 1.5, margin: '0 0 8px' }}>{note}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 10 }}>
        {podium.map((r, i) => (
          <div key={r.label} title={podiumTip ? podiumTip(r) : undefined}
            style={{
              flex: '1 1 150px', minWidth: 0,
              background: i === 0 ? alpha(accent, 0.10) : 'rgba(255,255,255,.025)',
              border: `1px solid ${i === 0 ? `${accent}55` : C.border}`,
              borderRadius: 10, padding: '6px 11px',
            }}>
            <div style={{ fontSize: z(8.5), color: C.text3, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              #{i + 1} by {primary.toLowerCase()}
            </div>
            <div style={{ fontSize: z(12), fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Tap onClick={openOf(r)} title={r.label}>{showLabel(r.label, { rank: false })}</Tap>
            </div>
            <div style={{ fontSize: z(14), fontWeight: 900, color: i === 0 ? accent : C.text2, fontFamily: NUM_FONT }}>
              {r.values[primary].toFixed(1)} {unit}
              {adj && Number.isFinite(r.values[adj]) && (
                <span style={{ fontSize: z(9.5), color: C.text3, fontWeight: 700 }}> · adj {r.values[adj].toFixed(1)}</span>
              )}
            </div>
          </div>
        ))}
        <div style={{
          flex: '0 1 auto', alignSelf: 'center', fontSize: z(9.5), color: C.text3, padding: '0 6px',
        }}>
          slate projects <b style={{ color: C.text2 }}>{total.toFixed(1)} {unit}</b><br />
          across {rows.length} {by === 'game' ? (rows.length === 1 ? 'game' : 'games') : (rows.length === 1 ? 'team' : 'teams')}
        </div>
      </div>

      {(() => {
        const maxV = rows.reduce((m, r) => {
          const v = r.values[primary]
          const a = adj ? r.values[adj] : NaN
          return Math.max(m, Number.isFinite(v) ? v : 0, Number.isFinite(a) ? a : 0)
        }, 0.0001)
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: z(9), color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              {barsTitle || `${primary} by ${by}`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {rows.map((r) => {
                const val = r.values[primary]
                const av = adj ? r.values[adj] : NaN
                const pct = Math.max(0, Math.min(100, (val / maxV) * 100))
                const adjPct = Number.isFinite(av) ? Math.max(0, Math.min(100, (av / maxV) * 100)) : null
                return (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 150, flexShrink: 0, fontSize: z(10), color: C.text2, fontWeight: 700,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={r.label}><Tap onClick={openOf(r)} title={r.label}>{showLabel(r.label)}</Tap></span>
                    <span style={{ flex: 1, position: 'relative', height: 13, background: 'rgba(255,255,255,.04)', borderRadius: 4, overflow: 'visible', minWidth: 0 }}>
                      <span style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 4,
                        background: `linear-gradient(90deg, ${alpha(accent, 0.4)}, ${alpha(accent, 0.9)})`,
                      }} />
                      {adjPct != null && (
                        <span title={`${adj} ${av.toFixed(1)}`} style={{
                          position: 'absolute', left: `${adjPct}%`, top: -2, bottom: -2, width: 2,
                          background: tick, borderRadius: 1,
                        }} />
                      )}
                    </span>
                    <span style={{ width: 84, flexShrink: 0, fontFamily: NUM_FONT, fontSize: z(10.5), fontWeight: 800, color: C.text, textAlign: 'right' }}>
                      {val.toFixed(1)}
                      {adjPct != null && <span style={{ color: tick, fontWeight: 700 }}> · {av.toFixed(1)}</span>}
                    </span>
                  </div>
                )
              })}
            </div>
            {barsFoot && <div style={{ fontSize: z(9), color: C.text3, marginTop: 5 }}>{barsFoot}</div>}
          </div>
        )
      })()}

      {(() => {
        const means = {}
        columns.forEach((c) => {
          const xs = rows.map((r) => r.values[c]).filter((v) => Number.isFinite(v))
          means[c] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
        })
        const gradeOf = (col, v) => {
          if (!pills.has(col) || !Number.isFinite(v)) return null
          const mean = means[col] || 1
          const d = (v - mean) / (mean || 1)
          if (d > 0.15) return { cls: 'hot', arrow: '▲' }
          if (d > 0.05) return { cls: 'warm', arrow: '▲' }
          if (d < -0.15) return { cls: 'cold', arrow: '▼' }
          if (d < -0.05) return { cls: 'cool', arrow: '▼' }
          return null
        }
        return (
          <div
            style={{ overflowX: 'auto' }}
            tabIndex={0}
            role="region"
            aria-label="Projected output table — scrolls sideways"
          >
            {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b). Opens in the
                page's own order (the podium and bars read the same sort); its
                headers re-sort the table; the grade pills and arrows kept. */}
            <DenseTable key={`${sortCol}-${sortDir}`} bare noGroups heatMode="sorted" maxHeight={9999} maxRows={Math.max(rows.length, 1)} accent={accent}
              caption={by === 'game' ? 'Projected output by game' : 'Projected output by team'}
              rows={rows.map((r) => ({ _key: r.label, label: r.label, _r: r, ...Object.fromEntries(columns.map((c, k) => [`c${k}`, Number.isFinite(Number(r.values[c])) ? Number(r.values[c]) : null])) }))}
              columns={[
                { key: 'label', label: by === 'game' ? 'Game' : 'Team', heat: false, sticky: true, w: 120, link: (x) => openOf(x._r), fmt: (v) => <b>{showLabel(v)}</b> },
                ...columns.map((c, k) => ({ key: `c${k}`, label: c, w: 70, heat: false, numeric: false, fmt: (v) => {
                  const g = gradeOf(c, v)
                  const text = Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—'
                  return g
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 6, fontWeight: 800, fontFamily: NUM_FONT, background: pal.bg[g.cls], color: pal.color[g.cls] }}>{text} {g.arrow}</span>
                    : <span style={{ fontWeight: 600, fontFamily: NUM_FONT, color: C.text2 }}>{text}</span> } })),
              ]} />
            {footnote && <div style={{ fontSize: z(9), color: C.text3, lineHeight: 1.5, marginTop: 8 }}>{footnote}</div>}
          </div>
        )
      })()}
    </div>
  )
}

/** The sort handler MOONSHOT's table uses: click a header, click again to flip. */
export function sortClick(sortCol, setSortCol, setSortDir) {
  return (col) => {
    if (sortCol === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortCol(col); setSortDir('desc') }
  }
}

/** Sort + rank rows the way MOONSHOT's table does ("1.  NYM @ WSH"). */
export function rankRows(rows, sortCol, sortDir) {
  return [...rows].sort((a, b) => {
    const av = sortCol === 'label' ? a.label : a.values[sortCol]
    const bv = sortCol === 'label' ? b.label : b.values[sortCol]
    const cmp = sortCol === 'label' ? String(av).localeCompare(String(bv)) : ((bv ?? -Infinity) - (av ?? -Infinity))
    return sortDir === 'asc' ? -cmp : cmp
  }).map((r, i) => ({ ...r, label: `${i + 1}.  ${r.label}` }))
}
