'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { activeStops, activeChips, inkOn, edgeOn, subscribe } from '../lib/palette'
import {
  useSpotlight, cellTint, cellEdge, cellMark, SPOT_MARK,
} from '../lib/spotlight'
import { divTone, seqColor } from '../lib/scales'
import PaletteToggle from './PaletteToggle'

// Heatmap — the chart the Streamlit build leans on hardest, ported.
//
// Every column is scaled independently against its own min/max, so a strong
// cell means "high for this slate on that input" — not "high compared to the
// column beside it". Scaling columns together lets one wide-ranged column
// flatten every other one into a single shade.
//
// The palette history is below and worth keeping: this is the fourth attempt,
// and the first three all failed the same way, by asking BRIGHTNESS to carry
// the whole signal on a near-black page.

// ══ THE RAMP LIVES IN lib/palette.js NOW (2026-08-09) ════════════════════
// Donovan asked for a toggle: his original ember, the traffic light, and a
// PropFinder-style three-band red/yellow/green. All three, how they were
// solved, and why every earlier ramp was hard to read are documented there.
//
// This file keeps `ORANGE_RAMP` and `inkFor` exported under their old names
// so the ~30 call sites across the site keep working untouched — but both now
// read the ACTIVE ramp rather than a frozen array. Renaming the export would
// have been tidier and would also have been a thirty-file diff for no gain.

export { RAMPS, RAMP_IDS, DEFAULT_RAMP, usePalette, setRamp, getRamp, hydrateRamp } from '../lib/palette'

// A live view of the active ramp. Same array object forever, contents swapped
// in place when the palette changes.
//
// The first version of this was a Proxy over `[]`, which looked elegant and is
// a trap: the target is a real array whose `length` is non-configurable, so
// `ownKeys`/`getOwnPropertyDescriptor` can violate proxy invariants and throw
// a TypeError at render. Mutating one array has none of that risk and reads
// like what it is.
export const ORANGE_RAMP = [...activeStops()]

// The same live view, but for LEGEND CHIPS — swatches with no text on them.
// Signal's fills are near-black by construction, which is correct behind a
// number and invisible as a bare dot. See activeChips().
export const RAMP_CHIPS = [...activeChips()]

subscribe(() => {
  ORANGE_RAMP.length = 0
  ORANGE_RAMP.push(...activeStops())
  RAMP_CHIPS.length = 0
  RAMP_CHIPS.push(...activeChips())
})

export const inkFor = inkOn
export { edgeOn }

/**
 * rampColor for things with NO TEXT ON THEM — bars, wedges, dots.
 *
 * Same scale, chip colours. A lit ramp's fills are near-black on purpose and a
 * bar drawn in one is a bar you cannot see; there is no number sitting on top
 * of it to carry the colour. Added 2026-08-10 with Signal's rebuild.
 */
export function chipColor(v, lo, hi) {
  const f = Number(v)
  if (!Number.isFinite(f)) return null
  const span = hi - lo
  const pos = span <= 0 ? 0 : Math.max(0, Math.min(1, (f - lo) / span))
  return RAMP_CHIPS[Math.min(RAMP_CHIPS.length - 1, Math.floor(pos * RAMP_CHIPS.length))]
}

export function rampColor(v, lo, hi) {
  const f = Number(v)
  if (!Number.isFinite(f)) return null
  const stops = activeStops()
  const span = hi - lo
  const pos = span <= 0 ? 0 : Math.max(0, Math.min(1, (f - lo) / span))
  return stops[Math.min(stops.length - 1, Math.floor(pos * stops.length))]
}

/**
 * rows:    [{ label: 'BOS vs LAD', values: { 'Game Score': 61.2, ... } }]
 * columns: ['Game Score', 'Med HR', ...]
 *
 * Every column is scaled independently against its own min/max. That's the
 * whole point of the chart: a bright cell means "high for this slate on that
 * input", not "high compared to the column next to it". Scaling them together
 * would let one wide-ranged column flatten every other one to black.
 */
export default function Heatmap({
  rows = [],
  columns = [],
  title = '',
  caption = '',
  fmt = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : '—'),
  labelWidth = 150,
  onRowClick = null,
  maxHeight = null,
  // ── PER-COLUMN SCALES (2026-08-22, the colour-system pass) ───────────────
  //
  // `scales` is { [columnName]: spec }, where spec is one of
  //     { kind: 'seq', domain: [lo, hi] }        a magnitude on a stated scale
  //     { kind: 'div', anchor, ceiling, deadband, invert }   a signed distance
  //     { kind: 'none' }                          a number, drawn as a number
  //
  // WHY THIS EXISTS. The lineup × damage grid put ten columns on one ramp:
  // two 0-100 model scores, a SIGNED DIFFERENCE ("vs own") on a
  // one-directional scale, a raw PA count, and SLG/ISO multiplied by 1000 to
  // make them share the ramp's range. Donovan: "great info, visually off."
  // Every one of those is a different kind of number and only one kind of
  // colour was available. Now there are three.
  //
  // A column with no spec keeps the old per-column auto-normalised ramp, so
  // every existing Heatmap on the site renders exactly as it did.
  scales = null,
  // Per-column formatters, so a column can print .913 instead of 913 without
  // the whole grid changing precision.
  fmts = null,
}) {
  const [hover, setHover] = useState(null)
  // The user's named highlight rules, so a chart lights the same rows a board
  // does. Same hook DenseTable uses — one source, so the two cannot disagree.
  const { firstMatch } = useSpotlight()
  // Caption fold (2026-08-12), ported from DenseTable — see its header
  // comment for why: the first sentence stays visible, the rest (plus the
  // sort hint) folds behind "why ▸" so this chart's fine print matches every
  // other table's on the site instead of always running in full underneath.
  const [capOpen, setCapOpen] = useState(false)
  // ── MULTI-SORT (2026-08-09) ────────────────────────────────────────────
  // Donovan: "make sure the multi-sorts work."
  //
  // DenseTable has had a real sort STACK for a while — plain click sets the
  // key, shift-click adds a tiebreaker, a third shift-click drops it. This
  // chart had a single key and a different mental model, so the same gesture
  // did different things on two tables that look alike. Same behaviour now,
  // same shape of state, so there is one thing to learn.
  const [sort, setSort] = useState([])

  const ranges = useMemo(() => {
    const out = {}
    columns.forEach((c) => {
      const vals = rows.map((r) => Number(r.values?.[c])).filter((v) => Number.isFinite(v))
      out[c] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
    })
    return out
  }, [rows, columns])

  // Blanks sink to the bottom whichever way the column points — flipping to
  // ascending on a sparse column should not fill the top with empty cells.
  // `Number(null)` is 0, not NaN — so a missing cell used to sort as a REAL
  // ZERO and float to the top of any ascending sort. Caught by test, and the
  // original single-key version had the same bug: it checked Number.isFinite
  // on the converted value, which nulls pass. The raw value has to be checked
  // before the conversion. DenseTable already did this; now both agree.
  const blank = (v) => v === null || v === undefined || v === '' || v === '—'
  const cmpOne = (a, b, { key, dir }) => {
    const raw = a.values?.[key]
    const rawB = b.values?.[key]
    const av = Number(raw)
    const bv = Number(rawB)
    const ab = blank(raw) || !Number.isFinite(av)
    const bb = blank(rawB) || !Number.isFinite(bv)
    if (ab && bb) return 0
    if (ab) return 1
    if (bb) return -1
    return (av - bv) * (dir === 'desc' ? -1 : 1)
  }

  const view = sort.length
    ? [...rows].sort((a, b) => {
        for (const s of sort) {
          const r = cmpOne(a, b, s)
          if (r !== 0) return r
        }
        return 0
      })
    : rows

  const toggle = (key, additive) => setSort((s) => {
    const i = s.findIndex((x) => x.key === key)
    if (!additive) {
      // Plain click: this key alone, flipping if it was already the only one.
      if (i === 0 && s.length === 1) return [{ key, dir: s[0].dir === 'desc' ? 'asc' : 'desc' }]
      return [{ key, dir: 'desc' }]
    }
    if (i < 0) return [...s, { key, dir: 'desc' }]
    const next = [...s]
    if (next[i].dir === 'desc') { next[i] = { key, dir: 'asc' }; return next }
    next.splice(i, 1)                       // third shift-click removes it
    return next
  })

  if (!rows.length || !columns.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 7,
          letterSpacing: '.02em',
        }}>{title}</div>
      )}

      {/* heat-scroll: a heatmap with 15 slate rows is ~400px tall and, unlike
          a DenseTable, it is usually handed no maxHeight — so on a phone it
          runs past the fold and takes the page with it. The phone rule caps it
          and lets it scroll inside itself, which it is already set up to do. */}
      <div className="dense-scroll heat-scroll" style={{
        border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto',
        maxHeight: maxHeight || undefined, background: C.bg2,
        WebkitOverflowScrolling: 'touch',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', left: 0, zIndex: 2, background: C.bg2,
                width: labelWidth, minWidth: labelWidth,
                borderBottom: `1px solid ${C.border}`,
              }} />
              {columns.map((c) => {
                const si = sort.findIndex((x) => x.key === c)
                const on = si >= 0
                return (
                  <th
                    key={c}
                    onClick={(e) => toggle(c, e.shiftKey)}
                    title={`${c}\n\nClick to sort. Shift-click to add as a tiebreaker under the current sort.`}
                    style={{
                      fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase',
                      color: on || hover?.col === c ? C.orange : C.text3,
                      fontWeight: 700, padding: '7px 5px', whiteSpace: 'nowrap',
                      borderBottom: `1px solid ${on ? C.orange : C.border}`,
                      background: C.bg2, cursor: 'pointer', userSelect: 'none',
                      transition: 'color .1s',
                    }}
                  >
                    {c}
                    {on ? (sort[si].dir === 'desc' ? ' ▾' : ' ▴') : ''}
                    {/* The ordinal makes precedence visible. A sort stack you
                        cannot see is worse than none, because you cannot tell
                        why the rows moved. */}
                    {on && sort.length > 1 && (
                      <sup style={{ fontSize: 7, marginLeft: 1, opacity: 0.85 }}>{si + 1}</sup>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, ri) => {
              // ✨ HIGHLIGHTS REACH THE CHARTS NOW (2026-08-17).
              //
              // Donovan: "the highlight worked for the cards and not the columns
              // or the spreadsheets excel things charts."
              //
              // This component had ZERO spotlight support — not a broken
              // implementation, an absent one. Every cell here is a heat cell
              // whose background IS its value, so the light cannot be a
              // background: it lands on the sticky label cell as a bar, a tint
              // and a glyph. Rows carrying a `_raw` slate record can match;
              // rows built from something else (a game, a park) simply don't,
              // which is the same rule DenseTable uses.
              const light = r._raw ? firstMatch(r._raw) : null
              return (
              <tr
                key={r.label ?? ri}
                onClick={onRowClick ? () => onRowClick(r, ri) : undefined}
                title={light
                  ? `Highlight: ${light.name || 'match'}${onRowClick ? ` · open ${r.label}` : ''}`
                  : (onRowClick ? `Open ${r.label}` : undefined)}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                <td style={{
                  position: 'sticky', left: 0, zIndex: 1,
                  background: hover?.row === ri ? C.bg3 : C.bg2,
                  fontSize: 11.5, fontWeight: 700,
                  color: hover?.row === ri ? C.text : C.text2,
                  padding: '0 10px', width: labelWidth, minWidth: labelWidth,
                  maxWidth: labelWidth, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  borderRight: `1px solid ${C.border}`,
                  transition: 'background .1s',
                  // Order matters: the tint must come AFTER the hover
                  // background or hovering a lit row would blank its light.
                  ...(light ? cellTint(light.color) : {}),
                  ...(light ? cellEdge(light.color) : {}),
                }}>
                  {light && (
                    <span style={cellMark(light.color)}>{SPOT_MARK}</span>
                  )}
                  {r.label}
                </td>

                {columns.map((c) => {
                  const raw = r.values?.[c]
                  const [lo, hi] = ranges[c]
                  const spec = scales?.[c]
                  const on = hover?.row === ri || hover?.col === c
                  const show = (fmts && fmts[c]) ? fmts[c](raw) : fmt(raw)

                  // A signed distance from a stated zero: tint + arrow, never
                  // a solid fill. The two constructions look different on
                  // purpose — see lib/scales.js.
                  if (spec?.kind === 'div') {
                    const d = divTone(raw, {
                      anchor: spec.anchor ?? 0,
                      ceiling: spec.ceiling ?? 1,
                      deadband: spec.deadband ?? 0.08,
                      invert: spec.invert === true,
                    })
                    return (
                      <td
                        key={c}
                        onMouseEnter={() => setHover({ row: ri, col: c })}
                        onMouseLeave={() => setHover(null)}
                        title={`${r.label} · ${c}: ${show} — against ${spec.anchorLabel ?? spec.anchor ?? 0}`}
                        style={{
                          background: d.bg, color: d.fg,
                          fontFamily: NUM_FONT, fontSize: 11, fontWeight: 700,
                          textAlign: 'center', padding: '7px 5px',
                          borderRight: `1px solid ${C.bg}`,
                          borderBottom: `1px solid ${C.bg}`,
                          outline: on ? `1px solid ${C.border2}` : 'none',
                          outlineOffset: -1,
                          minWidth: 46,
                        }}
                      >
                        {show}
                        {d.glyph && <span style={{ marginLeft: 2, fontSize: 8, opacity: 0.85 }}>{d.glyph}</span>}
                      </td>
                    )
                  }

                  // 'none' — a number that is simply a number. A raw count
                  // with no ceiling is the commonest case and it was being
                  // painted like a score.
                  if (spec?.kind === 'none') {
                    return (
                      <td
                        key={c}
                        onMouseEnter={() => setHover({ row: ri, col: c })}
                        onMouseLeave={() => setHover(null)}
                        title={`${r.label} · ${c}: ${show}`}
                        style={{
                          background: C.bg3, color: C.text2,
                          fontFamily: NUM_FONT, fontSize: 11, fontWeight: 700,
                          textAlign: 'center', padding: '7px 5px',
                          borderRight: `1px solid ${C.bg}`,
                          borderBottom: `1px solid ${C.bg}`,
                          outline: on ? `1px solid ${C.border2}` : 'none',
                          outlineOffset: -1,
                          minWidth: 46,
                        }}
                      >{show}</td>
                    )
                  }

                  const bg = spec?.kind === 'seq' && spec.domain
                    ? seqColor(raw, spec.domain)
                    : rampColor(raw, lo, hi)
                  return (
                    <td
                      key={c}
                      onMouseEnter={() => setHover({ row: ri, col: c })}
                      onMouseLeave={() => setHover(null)}
                      title={`${r.label} · ${c}: ${show}${spec?.domain ? ` — on ${spec.domain[0]}–${spec.domain[1]}` : ''}`}
                      style={{
                        background: bg || C.bg3,
                        color: bg ? inkFor(bg) : C.text3,
                        boxShadow: (bg && edgeOn(bg)) ? `inset 0 0 0 1px ${edgeOn(bg)}` : undefined,
                        fontFamily: NUM_FONT, fontSize: 11, fontWeight: 700,
                        textAlign: 'center', padding: '7px 5px',
                        borderRight: `1px solid ${C.bg}`,
                        borderBottom: `1px solid ${C.bg}`,
                        outline: on ? `1px solid ${C.border2}` : 'none',
                        outlineOffset: -1,
                        minWidth: 46,
                      }}
                    >{show}</td>
                  )
                })}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 7,
        fontSize: 9.5, color: C.text3,
      }}>
        <span>low</span>
        <span style={{ display: 'flex', borderRadius: 3, overflow: 'hidden' }}>
          {ORANGE_RAMP.map((c) => (
            <span key={c} style={{ width: 16, height: 8, background: c }} />
          ))}
        </span>
        <span>high</span>
        <span style={{ marginLeft: 4, flex: 1, minWidth: 180 }}>
          {(() => {
            const base = caption || 'Each column is scaled on its own, so a strong cell means high for this slate on that input — not comparable across columns.'
            const full = `${base} Click a column to sort; click it twice more to clear.`
            // Split on the first sentence end that's followed by a space and a
            // capital — same regex as DenseTable, so "1.5 runs" / "e.g." don't
            // get treated as the end.
            const m = String(full).match(/^([\s\S]*?[.!?])\s+(?=[A-Z"])/)
            const head = m ? m[1] : full
            const rest = m ? String(full).slice(m[0].length) : ''
            if (!rest) return full
            return (
              <>
                {head}{' '}
                <button onClick={() => setCapOpen((v) => !v)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: C.text2, fontSize: 9.5, textDecoration: 'underline dotted rgba(255,255,255,.25)',
                  textUnderlineOffset: 3, fontFamily: 'inherit',
                }}>{capOpen ? 'less ▴' : 'why ▸'}</button>
                {capOpen && <> {rest}</>}
              </>
            )
          })()}
        </span>
        {/* The picker sits ON the legend because that is where someone is
            already looking when they think "I can't read this". Burying it in
            a settings menu means the complaint never turns into a fix. */}
        <span style={{ flexBasis: 220, flexShrink: 0 }}><PaletteToggle compact /></span>
      </div>
    </div>
  )
}
