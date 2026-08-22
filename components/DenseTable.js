'use client'
import { useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import {
  useSpotlight, washOf, cellTint, cellEdge, cellMark, SPOT_MARK,
} from '../lib/spotlight'
import { ORANGE_RAMP, rampColor, inkFor } from './Heatmap'
import { edgeOn } from '../lib/palette'
import { seqColor, divTone, SEQ_AUTO } from '../lib/scales'
import { explainFor, InfoDot, ExplainBanner } from './Explain'

// DenseTable — the PropFinder table pattern.
//
// Twenty-odd stat columns, every numeric column colored against its OWN range,
// rows clickable. The colouring is the whole point: at this density an
// uncolored table is a wall of digits and you end up reading it one cell at a
// time. Coloured, the shape of a hitter is visible before you read a number.
//
// Column spec:
//   { key, label, w?, fmt?, heat?, invert?, flag?, sticky? }
//   heat:false  -> plain cell (names, teams, handedness)
//   invert:true -> low is good, so the ramp runs the other way
//   flag:true   -> boolean-ish; lit if truthy, dark if not
//
// ── FOLDING, FOR THE PHONE (2026-08-22, pass 2) ────────────────────────────
//   fold: true   on a TEXT column -> at phone width it leaves the row and
//                becomes part of the sticky name cell's sub-line instead.
//                On a FLAG column -> its mark joins a glyph run after the
//                name, and only when lit. Three flag columns at 32px each is
//                96px spent showing mostly '·'; the same information is four
//                characters when it only draws the ones that are on.
//   foldLabel    what to call it on the fold line. Defaults to `label`; pass
//                false to print the value bare (a team abbreviation does not
//                need to be told it is a team), or a string to prefix it.
//   blankWhen(v) -> true means THIS VALUE IS AN ABSENCE, not a low number.
//                The cell prints (via fmt) with no fill at all.
//
// blankWhen exists because of one column. pitch_type_match_score is 0 for the
// median hitter on the slate, and a 0 there means "no pitch match was found",
// not "the worst match on the board". Painted at the bottom of the ramp it
// made half the column read as a wall of failure. lib/scales.js already says
// a blank is not a zero and must never be painted like one; this is the case
// where a zero is a blank.
//
// Why this exists. Rundown is the page Donovan opens first and calls the
// most-used on the site. At 430px it spends every one of those 430 pixels on
// ☆ + Player + Tm + Opp + Role + Spot — 382px of chrome and identity — and
// shows ZERO numeric columns. The board's entire answer is off-screen, and
// the colour work is invisible with it. The furthest tracker had the same
// defect and got a ladder above the table; a 269-row board cannot have a
// ladder, so the fix has to be in the table.
//
// Folding, not hiding: every folded value still renders, in the same row, one
// line down, with its label. Nothing is lost and about 180px comes back —
// enough for four numeric columns on a phone instead of none.

// ── THE SCALE FIELDS (2026-08-22, the colour-system pass) ──────────────────
//   scale:  'seq' | 'div' | 'none'    which of the three scales this column is
//   domain: [lo, hi] | 'auto'         SEQUENTIAL ONLY — the ramp's ends.
//   anchor / ceiling / deadband       DIVERGING ONLY — see lib/scales.js
//
// A column that says nothing keeps the OLD behaviour exactly, so this is
// additive and no existing board moves until it opts in. The direction of
// travel, though, is stated here so the next person does not have to guess:
// heat should be OPT-IN. Today it is opt-out (`c.heat !== false`), which is
// why the Due board paints twenty-four columns on one ramp and reads as a
// wash — see heatMode 'sorted' below, which is the opt-in version.

/**
 * HEAT MODE — how much of the table is coloured.
 *
 * DenseTable was built on the argument that at 25 columns an uncoloured table
 * is a wall of digits you read one cell at a time, and that argument is true.
 * But it produced a table where EVERY numeric column is shaded against its own
 * range, which is more colour than any of the four apps in the redesign
 * reference — and notably more than PropFinder, the only one of them that
 * colours by value at all. PropFinder's line is "colour coding makes the
 * standouts impossible to miss", and that only works because everything else
 * is NOT coloured.
 *
 *   full        every numeric column, every row — what shipped
 *   standouts   only the top and bottom slice of each column
 *   primary     only columns marked `primary: true`; the rest go neutral
 *   sorted      the column(s) you are actually ranking by, plus `primary`,
 *               plus anything that declares a `scale` of its own
 *   none        no cell colour at all
 *
 * 'sorted' (2026-08-22) is the one the colour audit argues for on wide boards.
 * The reasoning: on a 24-column table, colour cannot mean "this number is
 * high" for twenty-four different questions at once — it just means "there is
 * a number here". Following the sort makes the colour mean something the
 * reader chose, which is the difference between information and decoration.
 * A column with its own declared scale (a diverging gap, a fixed-domain score)
 * still paints, because it was chosen deliberately rather than by default.
 *
 * Default stays 'full' so nothing changes until it's chosen deliberately.
 */
export const HEAT_MODES = ['full', 'standouts', 'primary', 'sorted', 'none']

const STANDOUT_SLICE = 0.2   // top 20% and bottom 20% of a column

/**
 * The unit marker a column's own scale implies, or '' for one that implies
 * none. Derived from the spec rather than typed per column, so a board cannot
 * declare a 0-100 domain and then forget to say so in the header.
 */
export function scaleSuffix(c) {
  if (!c || c.scale !== 'seq' || !Array.isArray(c.domain)) return ''
  const [lo, hi] = c.domain
  // ANY zero-based score domain, not just 0-100. The first version of this
  // hard-coded /100 and would have printed nothing for the one column on the
  // Rundown that most needed a unit: pitch_type_match_score runs 0 to 120 with
  // a MEDIAN OF ZERO, sat between six genuine 0-100 scores, and read as one.
  // Measured on the live slate, 2026-08-22: 25 of 269 rows above 100.
  return lo === 0 && Number.isFinite(hi) && hi >= 1 ? ` /${hi}` : ''
}

export default function DenseTable({
  rows = [],
  columns = [],
  heatMode = 'full',
  onRowClick = null,
  maxHeight = 460,
  initialSort = null,
  dense = true,
  caption = '',
  maxRows = 200,
  // dimRow(row) -> true renders that row at reduced opacity. Used for
  // sample gates: a rate built on four batted balls should not sit at the
  // same visual weight as one built on two hundred.
  dimRow = null,
}) {
  // MULTI-SORT. `sort` is an ordered list of keys, not one key.
  //
  // Plain click  -> make this the only sort key, descending.
  // Click again  -> flip that key's direction.
  // Shift-click  -> add this key BELOW the existing ones as a tiebreaker,
  //                 or flip it if it's already in the stack.
  // Shift-click a key that's already last -> cycles desc, asc, removed.
  //
  // The ordinal is drawn in the header so the precedence is visible; a stack
  // you can't see is worse than no stack at all, because you can't tell why
  // the rows moved.
  const [sort, setSort] = useState(initialSort ? [{ key: initialSort, dir: 'desc' }] : [])
  // ✨ site-wide spotlight v2 — a row whose _raw slate record matches one of
  // the user's named highlights washes in THAT light's color; when several
  // match, priority (1 = top) decides. Rows without _raw simply can't match.
  const { firstMatch } = useSpotlight()
  const railRef = useRef(null)

  // 📖 TAP A HEADER'S ⓘ FOR WHAT THE COLUMN MEANS (2026-08-09).
  //
  // Every column already carries a `title=`, and on a phone a title attribute
  // shows nothing at all — there is no hover on a touch screen. So the 25
  // columns of this table have, on the surface where it matters most, no
  // labels beyond four-letter abbreviations: PMATCH, HRW, IHR, PMIX. That is
  // "I still don't see what I'm looking at", literally.
  //
  // The explanation opens in a banner ABOVE the table rather than inside the
  // header cell, for two reasons: a th in a 25-column nowrap header has no
  // room to grow a sentence, and the header's own click is already spoken for
  // by sorting (the dot stops propagation so the two never collide).
  const [explain, setExplain] = useState(null)
  // Caption fold — collapsed by default; see the caption block below for why.
  const [capOpen, setCapOpen] = useState(false)

  const heatCols = useMemo(() => columns.filter((c) => c.heat !== false && !c.flag && !c.action), [columns])

  // Text columns that collapse into the name cell on a phone. Only ever text:
  // folding a heat cell would fold its colour away with it, which is the
  // opposite of the point.
  const foldCols = useMemo(
    () => columns.filter((c) => c.fold && c.heat === false && !c.action && !c.flag),
    [columns],
  )
  const foldFlags = useMemo(() => columns.filter((c) => c.fold && c.flag), [columns])

  // The first text column — where a lit row wears its bar and its glyph. Falls
  // back to the first non-action column so a table with no sticky column still
  // marks something rather than nothing.
  const firstTextKey = useMemo(() => {
    const sticky = columns.find((c) => c.sticky && c.heat === false)
    if (sticky) return sticky.key
    const text = columns.find((c) => c.heat === false && !c.action && !c.flag)
    return text ? text.key : null
  }, [columns])

  const ranges = useMemo(() => {
    const out = {}
    heatCols.forEach((c) => {
      const vals = rows.map((r) => Number(r[c.key])).filter(Number.isFinite)
      out[c.key] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
    })
    return out
  }, [rows, heatCols])

  // Cutoffs for 'standouts': the value at the 20th and 80th percentile of each
  // column. Percentile rather than a fixed distance from the extremes, so one
  // outlier can't drag the whole band with it.
  const cuts = useMemo(() => {
    if (heatMode !== 'standouts') return {}
    const out = {}
    heatCols.forEach((c) => {
      const vals = rows.map((r) => Number(r[c.key])).filter(Number.isFinite).sort((a, b) => a - b)
      if (vals.length < 5) { out[c.key] = null; return }
      const lo = vals[Math.floor(vals.length * STANDOUT_SLICE)]
      const hi = vals[Math.ceil(vals.length * (1 - STANDOUT_SLICE)) - 1]
      out[c.key] = [lo, hi]
    })
    return out
  }, [rows, heatCols, heatMode])

  // Does this cell get colour at all, under the current mode?
  const lit = (c, num) => {
    if (heatMode === 'none') return false
    if (!Number.isFinite(num)) return false
    if (heatMode === 'full') return true
    if (heatMode === 'primary') return c.primary === true
    if (heatMode === 'sorted') {
      // A declared scale is a deliberate choice and always paints; otherwise
      // colour follows what the reader asked to rank by.
      if (c.scale === 'seq' || c.scale === 'div') return true
      if (c.primary === true) return true
      return sort.some((s) => s.key === c.key)
    }
    const k = cuts[c.key]
    if (!k) return false
    return c.invert ? (num <= k[0] || num >= k[1]) : (num >= k[1] || num <= k[0])
  }

  const sorted = useMemo(() => {
    if (!sort.length) return rows
    // Missing values sink to the bottom whichever way the column is pointing.
    // Flipping to ascending on a column full of dashes used to fill the top of
    // the table with blanks, which is never what you wanted from the click.
    const blank = (v) => v === null || v === undefined || v === '' || v === '—'
    const cmpOne = (a, b, { key, dir }) => {
      const av = a[key], bv = b[key]
      const ab = blank(av), bb = blank(bv)
      if (ab && bb) return 0
      if (ab) return 1
      if (bb) return -1
      const mul = dir === 'desc' ? -1 : 1
      const an = Number(av), bn = Number(bv)
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul
      return String(av).localeCompare(String(bv)) * mul
    }
    return [...rows].sort((a, b) => {
      for (const s of sort) {
        const r = cmpOne(a, b, s)
        if (r !== 0) return r
      }
      return 0
    })
  }, [rows, sort])

  const view = sorted.length > maxRows ? sorted.slice(0, maxRows) : sorted

  // 📄 THE CHEAT SHEET (2026-08-15, from ballparkpal's Export CSV). Every
  // DenseTable can hand you its CURRENT view — sorted how you sorted it —
  // as a CSV. Raw values, not the formatted strings, so the sheet is
  // spreadsheet-ready rather than full of '+12%' strings.
  const exportCsv = () => {
    const esc = (v) => {
      const t = v == null ? '' : String(v)
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const cols = columns.filter((c) => !String(c.key).startsWith('_'))
    const lines = [cols.map((c) => esc(c.label)).join(',')]
    sorted.forEach((r) => lines.push(cols.map((c) => esc(r[c.key])).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `moonshot-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const truncated = sorted.length - view.length

  if (!rows.length || !columns.length) return null

  const pad = dense ? '5px 6px' : '8px 9px'

  const toggle = (key, additive) => setSort((s) => {
    const i = s.findIndex((x) => x.key === key)
    if (!additive) {
      // Plain click: this key alone. Flip if it was already the only key.
      if (i === 0 && s.length === 1) return [{ key, dir: s[0].dir === 'desc' ? 'asc' : 'desc' }]
      return [{ key, dir: 'desc' }]
    }
    if (i < 0) return [...s, { key, dir: 'desc' }]
    const next = [...s]
    if (next[i].dir === 'desc') { next[i] = { key, dir: 'asc' }; return next }
    next.splice(i, 1)                       // third shift-click removes it
    return next
  })

  return (
    <div>
      <ExplainBanner label={explain?.label} text={explain?.text} onClose={() => setExplain(null)} />
      {/* The stack, said out loud. Shift-click was the only way to build a
          tiebreaker and nothing ever showed what was stacked — on a phone it
          was impossible outright. These chips ARE the stack: tap one to flip
          it, ✕ to drop it, clear to reset. Shift-click still works on desktop
          and now has a visible result. */}
      {sort.length > 0 && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 6px' }}>
          <span style={{ fontFamily: NUM_FONT, fontSize: 8, fontWeight: 800, letterSpacing: '.08em', color: C.text3, textTransform: 'uppercase' }}>
            sorted by
          </span>
          {sort.map((x2, i2) => {
            const col = columns.find((c2) => c2.key === x2.key)
            return (
              <span key={x2.key} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800,
                border: `1px solid ${C.orange}55`, background: 'rgba(249,115,22,.10)',
                color: C.orange, borderRadius: 999, padding: '1.5px 4px 1.5px 8px',
              }}>
                <span onClick={() => setSort((s2) => s2.map((y) => (y.key === x2.key ? { ...y, dir: y.dir === 'desc' ? 'asc' : 'desc' } : y)))} style={{ cursor: 'pointer' }}
                  title="Flip this column's direction">
                  {i2 + 1}. {col?.label || x2.key} {x2.dir === 'desc' ? '▼' : '▲'}
                </span>
                <span onClick={() => setSort((s2) => s2.filter((y) => y.key !== x2.key))}
                  title="Drop this column from the sort"
                  style={{ cursor: 'pointer', color: C.text3, padding: '0 3px', fontSize: 10 }}>✕</span>
              </span>
            )
          })}
          {sort.length > 1 && (
            <span onClick={() => setSort([])} style={{
              fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, cursor: 'pointer',
              textDecoration: 'underline', textDecorationStyle: 'dotted',
            }}>clear</span>
          )}
          <span style={{ fontFamily: NUM_FONT, fontSize: 8, color: C.text3 }}>
            · shift-click a header to add a tiebreaker
          </span>
        </div>
      )}
      {/* .dense-wrap exists only so MobileCSS can hang a right-edge fade off
          it. The fade can't live on .dense-scroll itself — a pseudo-element on
          a scroll container scrolls away with the content, so it would drift
          off screen exactly when you need it. */}
      <div className="dense-wrap">
      {/* ⌨️ KEYBOARD SCROLL (2026-08-15, Donovan: "charts are hard to
          maneuver on the web because no side scroll... so i can use keyboard
          to move left or right"). The rail is focusable — click or Tab into
          any table and the arrow keys pan it, shift for a whole screen. And
          the horizontal scrollbar is VISIBLE now: a thin rule under wide
          tables, instead of content silently hiding off the right edge. */}
      <div
        className="dense-scroll kb-rail"
        ref={railRef}
        tabIndex={0}
        onKeyDown={(e) => {
          const el = railRef.current
          if (!el) return
          const step = e.shiftKey ? el.clientWidth * 0.9 : 90
          if (e.key === 'ArrowRight') { el.scrollBy({ left: step, behavior: 'smooth' }); e.preventDefault() }
          else if (e.key === 'ArrowLeft') { el.scrollBy({ left: -step, behavior: 'smooth' }); e.preventDefault() }
          else if (e.key === 'ArrowDown') { el.scrollBy({ top: 64, behavior: 'smooth' }); e.preventDefault() }
          else if (e.key === 'ArrowUp') { el.scrollBy({ top: -64, behavior: 'smooth' }); e.preventDefault() }
        }}
        style={{
          border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto',
          maxHeight, background: C.bg2, outline: 'none',
        }}>
        <style>{`
          /* Folding is a PHONE behaviour only — above 860px the whole table
             fits and a sub-line under every name would just be noise. Same
             breakpoint MobileCSS uses for the swipe hint, deliberately: they
             are two halves of the same "this table is wider than your screen"
             problem. */
          .dense-fold, .dense-fold-flags { display: none; }
          @media (max-width: 860px) {
            .dense-folded { display: none !important; }
            .dense-fold-flags {
              display: inline; margin-left: 4px; font-size: 9px;
              color: ${C.orange}; letter-spacing: 1px;
            }
            /* WRAPS RATHER THAN TRUNCATES. Ellipsised, "CHC · vs SEA · HR
               Bet · #1" lost the role and the lineup spot — which is deleting
               information to save eleven pixels of row height, and the rule
               is condense the form, keep every fact. */
            .dense-fold {
              display: block; font-family: ${NUM_FONT}; font-size: 8.5px;
              font-weight: 500; color: ${C.text3}; letter-spacing: .01em;
              margin-top: 1px; white-space: normal; line-height: 1.35;
            }
          }
          .kb-rail::-webkit-scrollbar { height: 7px; width: 7px; display: block; }
          .kb-rail::-webkit-scrollbar-thumb { background: rgba(249,115,22,.35); border-radius: 4px; }
          .kb-rail::-webkit-scrollbar-track { background: rgba(255,255,255,.03); }
          .kb-rail:focus-visible { box-shadow: 0 0 0 1.5px rgba(249,115,22,.5); }
        `}</style>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr>
              {columns.map((c) => {
                const si = sort.findIndex((x) => x.key === c.key)
                const on = si >= 0
                const dir = on ? sort[si].dir : null
                // A column opts in by having a glossary entry for its key or
                // its label; anything unknown simply gets no dot, so this is
                // safe for every table on the site without touching them.
                const plain = c.explain || explainFor(c.term, c.key, c.label)
                return (
                  <th
                    key={c.key}
                    className={[c.sticky ? 'dense-sticky' : '', c.fold ? 'dense-folded' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={(e) => toggle(c.key, e.shiftKey)}
                    title={`${c.title || c.label}\n\nClick to sort. Shift-click to add as a tiebreaker under the current sort.`}
                    style={{
                      position: c.sticky ? 'sticky' : undefined,
                      left: c.sticky ? 0 : undefined,
                      zIndex: c.sticky ? 4 : undefined,
                      // Header dress (2026-08-08, modest): a darker cap row
                      // with an ember underline — solid under the sorted
                      // column, faint elsewhere — so "what am I sorted by"
                      // reads from the header itself.
                      background: C.bg3, cursor: 'pointer', userSelect: 'none',
                      fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase',
                      color: on ? C.orange : C.text3, fontWeight: on ? 900 : 700,
                      padding: pad, whiteSpace: 'nowrap',
                      textAlign: c.heat === false ? 'left' : 'center',
                      borderBottom: `2px solid ${on ? C.orange : 'rgba(249,115,22,.18)'}`,
                      width: c.w, minWidth: c.w,
                    }}
                  >
                    {c.label}
                    {/* ── THE UNIT, IN THE HEADER (2026-08-22) ──────────────
                        Donovan's constraint: "A 0-100 score is not a
                        probability; a measured frequency with its denominator
                        is. Never blur the two."

                        A score column now carries `/100` where someone looks
                        for a unit. It reads at 8.5px, costs no cell width, and
                        it is the half of the distinction that goes on the
                        SCORE — the other half is a frequency printing its
                        denominator, which is a different treatment on purpose
                        so the two can never be mistaken for each other.

                        Tooltips already said this. On a phone nobody sees a
                        tooltip, which is how the confusion started. */}
                    {scaleSuffix(c) && (
                      <span style={{
                        fontWeight: 600, opacity: 0.6, letterSpacing: 0,
                        textTransform: 'none', marginLeft: 1,
                      }}>{scaleSuffix(c)}</span>
                    )}
                    {plain && (
                      <InfoDot
                        on={explain?.key === c.key}
                        onClick={() => setExplain((cur) => (
                          cur?.key === c.key ? null : { key: c.key, label: c.label, text: plain }
                        ))}
                      />
                    )}
                    {on && (
                      <>
                        {dir === 'desc' ? ' ▾' : ' ▴'}
                        {sort.length > 1 && (
                          <sup style={{ fontSize: 7.5, marginLeft: 1, opacity: 0.85 }}>{si + 1}</sup>
                        )}
                      </>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, ri) => {
              // ✨ THE WINNING HIGHLIGHT, RESOLVED ONCE PER ROW.
              //
              // It used to be computed inline inside the <tr> style and applied
              // ONLY there, as an inset box-shadow — which every <td> then
              // painted over with its own opaque background. See the comment on
              // cellTint in lib/spotlight.js: the wash was correct and
              // invisible, on every board, which is why "the highlights don't
              // work on the columns" outlived three fixes.
              //
              // Now the row resolves its light once and each cell decides how to
              // wear it: text cells take a tint, the first cell takes the bar
              // and a glyph, and heat cells are left alone because their
              // background already means their own value.
              const light = firstMatch(r._raw ?? r)
              return (
              <tr
                key={r._key ?? ri}
                onClick={onRowClick ? () => onRowClick(r._raw ?? r) : undefined}
                title={light ? `Highlight: ${light.name || 'match'}` : undefined}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  opacity: dimRow?.(r) ? 0.42 : 1,
                  // Kept for the case where a row has no cells of its own to
                  // paint (an empty or single-cell table), and because it costs
                  // nothing when it is covered.
                  ...(light ? washOf(light.color) : {}),
                }}
                className={onRowClick ? "dense-row dense-click" : "dense-row"}
              >
                {columns.map((c) => {
                  const v = r[c.key]

                  // ACTION CELL — a button inside the table, not a stat.
                  // { key, action:true, onAction:(row)=>…, mark:'★' }
                  // Lit from the row's own truthy value, and it stops the click
                  // from bubbling into onRowClick so starring a hitter doesn't
                  // also open his card.
                  if (c.action) {
                    const lit = !!v && v !== 0
                    return (
                      <td key={c.key} style={{
                        textAlign: 'center', padding: 0,
                        borderRight: `1px solid ${C.bg}`, borderBottom: `1px solid ${C.bg}`,
                        background: C.bg2,
                      }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); c.onAction?.(r._raw ?? r) }}
                          title={lit ? (c.titleOn || 'Remove') : (c.titleOff || 'Add')}
                          style={{
                            width: '100%', padding: pad, border: 'none', cursor: 'pointer',
                            // A UI accent, NOT a data colour. This used to be
                            // ORANGE_RAMP[5] — borrowing a step off the heat
                            // scale — so when the ramp went red-to-green on
                            // 2026-08-09 the watchlist star turned olive. A
                            // control that means "on" should never move
                            // because the meaning of a data colour changed.
                            background: lit ? C.orange : 'transparent',
                            color: lit ? '#0a0a0b' : C.text3,
                            fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, lineHeight: 1,
                          }}
                        >{lit ? (c.mark || '★') : (c.markOff || '☆')}</button>
                      </td>
                    )
                  }

                  if (c.flag) {
                    const lit = !!v && v !== 0 && v !== '—'
                    return (
                      <td key={c.key} className={c.fold ? 'dense-folded' : undefined} style={{
                        textAlign: 'center', padding: pad,
                        // Same reasoning as the star above: a flag is on or
                        // off, not high or low, so it takes the site accent
                        // rather than a step off the heat ramp.
                        background: lit ? C.orange : C.bg3,
                        color: lit ? '#0a0a0b' : C.text3,
                        fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800,
                        borderRight: `1px solid ${C.bg}`, borderBottom: `1px solid ${C.bg}`,
                      }}>{lit ? (c.mark || '●') : '·'}</td>
                    )
                  }

                  if (c.heat === false) {
                    // A TEXT CELL CAN CARRY THE LIGHT, because its background is
                    // a flat surface colour rather than a measurement. This is
                    // where the highlight actually becomes visible in a table —
                    // the <tr>'s inset shadow was always painted over by
                    // exactly this `background: C.bg2`.
                    const isFirstText = c.sticky || c.key === firstTextKey
                    return (
                      <td key={c.key} className={[
                        c.sticky ? 'dense-sticky' : '',
                        c.fold ? 'dense-folded' : '',
                      ].filter(Boolean).join(' ') || undefined} style={{
                        position: c.sticky ? 'sticky' : undefined,
                        left: c.sticky ? 0 : undefined,
                        zIndex: c.sticky ? 1 : undefined,
                        background: C.bg2,
                        padding: pad, fontSize: 11, fontWeight: c.bold ? 700 : 500,
                        color: c.dim ? C.text3 : C.text,
                        fontFamily: c.mono ? NUM_FONT : 'inherit',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: c.w, borderRight: `1px solid ${C.border}`,
                        borderBottom: `1px solid ${C.bg}`,
                        ...(light ? cellTint(light.color) : {}),
                        // The 3px bar belongs on the row's first cell, which is
                        // the element that actually paints there.
                        ...(light && isFirstText ? cellEdge(light.color) : {}),
                      }}>
                        {light && isFirstText && (
                          <span
                            title={`Highlight: ${light.name || 'match'}`}
                            style={cellMark(light.color)}
                          >{SPOT_MARK}</span>
                        )}
                        {c.fmt ? c.fmt(v, r) : (v ?? '—')}
                        {/* THE FOLDED VALUES, on the phone only. Same row,
                            same data, one line down — see the note at the top
                            of this file on why Rundown needed it. */}
                        {isFirstText && foldFlags.length > 0 && (() => {
                          const on = foldFlags.filter((fc) => {
                            const fv = r[fc.key]
                            return !!fv && fv !== 0 && fv !== '—'
                          })
                          if (!on.length) return null
                          return (
                            <span
                              className="dense-fold-flags"
                              title={on.map((fc) => `${fc.mark || '\u25cf'} ${fc.title || fc.label}`).join(' \u00b7 ')}
                            >{on.map((fc) => fc.mark || '\u25cf').join('')}</span>
                          )
                        })()}
                        {isFirstText && foldCols.length > 0 && (
                          <span className="dense-fold">
                            {foldCols.map((fc, i) => {
                              const fv = r[fc.key]
                              const txt = fc.fmt ? fc.fmt(fv, r) : (fv ?? '\u2014')
                              const lab = fc.foldLabel === undefined ? fc.label : fc.foldLabel
                              return (
                                <span key={fc.key}>
                                  {i > 0 && <span style={{ opacity: 0.45 }}> · </span>}
                                  {lab && (
                                    <span style={{ opacity: 0.55 }}>
                                      {lab}{/[A-Za-z0-9]$/.test(String(lab)) ? ' ' : ''}
                                    </span>
                                  )}
                                  {txt}
                                </span>
                              )
                            })}
                          </span>
                        )}
                      </td>
                    )
                  }

                  const [lo, hi] = ranges[c.key] || [0, 1]
                  const num = Number(v)

                  // ── DIVERGING COLUMN ───────────────────────────────────
                  // A signed distance from a stated zero: a tint, quiet ink,
                  // and an arrow. The arrow is not decoration — a diverging
                  // ramp's luminance is a V and a V cannot be ordered by
                  // lightness, so the sign has to be carried by something
                  // that is not colour at all. See lib/scales.js.
                  if (c.scale === 'div') {
                    const on = lit(c, num)
                    const d = on
                      ? divTone(num, {
                          anchor: c.anchor ?? 0,
                          ceiling: c.ceiling ?? 1,
                          deadband: c.deadband ?? 0.08,
                          invert: c.invert === true,
                        })
                      : { bg: 'transparent', fg: C.text3, glyph: '' }
                    const shown = c.fmt ? c.fmt(v, r)
                      : (Number.isFinite(num) ? num.toFixed(c.dp ?? 0) : '—')
                    return (
                      <td key={c.key}
                        title={`${c.label}: ${Number.isFinite(num) ? num.toFixed(c.dp ?? 2) : '—'} · against ${c.anchorLabel || (c.anchor ?? 0)}`}
                        style={{
                          background: d.bg, color: d.fg,
                          fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 700,
                          textAlign: 'center', padding: pad,
                          borderRight: `1px solid ${C.bg}`, borderBottom: `1px solid ${C.bg}`,
                          minWidth: c.w || 40,
                        }}>
                        {shown}
                        {d.glyph && (
                          <span style={{ marginLeft: 3, fontSize: 8, opacity: 0.85 }}>{d.glyph}</span>
                        )}
                      </td>
                    )
                  }

                  const absent = typeof c.blankWhen === 'function' && c.blankWhen(num, r)
                  const bg = (!absent && lit(c, num))
                    ? (c.scale === 'seq' && c.domain && c.domain !== SEQ_AUTO
                        ? seqColor(num, c.domain)
                        : c.invert ? rampColor(hi - (num - lo), lo, hi) : rampColor(num, lo, hi))
                    : null
                  // ROUNDED TOOLTIP. This used to print the raw float, so
                  // hovering a Fit cell read "Fit: 38.36650000000001" — a
                  // float-precision artefact presented as if it were a
                  // measurement. Show it at the column's own precision.
                  const titleNum = !Number.isFinite(num) ? '—'
                    : Number.isInteger(num) ? String(num)
                    : num.toFixed(c.dp ?? 2)
                  return (
                    <td key={c.key} title={`${c.label}: ${titleNum}`} style={{
                      background: bg || C.bg3, color: bg ? inkFor(bg) : C.text3,
                      fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 700,
                      textAlign: 'center', padding: pad,
                      // A ramp may light its own edge (neon does). The inset
                      // ring sits INSIDE the cell so it can't change the
                      // table's metrics — a 1px outer border on 25 columns
                      // would reflow the whole grid the moment you switched
                      // palette.
                      boxShadow: (bg && edgeOn(bg)) ? `inset 0 0 0 1px ${edgeOn(bg)}` : undefined,
                      borderRight: `1px solid ${C.bg}`, borderBottom: `1px solid ${C.bg}`,
                      minWidth: c.w || 40,
                    }}>{c.fmt ? c.fmt(v, r) : (Number.isFinite(num) ? num.toFixed(c.dp ?? 0) : '—')}</td>
                  )
                })}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </div>
      {/* PHONE AFFORDANCE. These tables are 15-25 columns wide; on a 390px
          screen you see the name and about three of them. The scroll always
          worked, but nothing on screen said it was there, so the honest
          reading of the page was "this table is broken". Hidden above 860px
          by MobileCSS — on a desktop the whole table is already visible and
          the line would just be noise. */}
      <div className="dense-swipe" aria-hidden="true">
        swipe the table sideways for the rest of the columns → <span>(the name column stays put)</span>
      </div>
      {/* ── THE CAPTION FOLD (2026-08-09) ───────────────────────────────────
          Donovan: "I think it's a little too much written words."
          He's right, and this component is where most of them are. Sixteen
          boards carry captions of 45+ words and one runs to 223 — call it
          1,300 words of grey fine print under the tables, every one of them
          explaining a real caveat somebody eventually needs.
          Deleting them would trade a wordiness problem for an honesty problem.
          So: the FIRST SENTENCE stays, always — that's the part that says what
          the table is — and everything after it folds behind "why ▸". Nothing
          is lost, the default page is short, and one change here shortens all
          sixteen boards at once instead of sixteen hand-edits that drift.
          The shift-click hint moves inside the fold too: it's a power-user
          affordance printed under every table on the site, which is the
          definition of something that doesn't need to be on screen by default. */}
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        {/* 📄 the cheat sheet — this view, sorted how you sorted it */}
        <button onClick={exportCsv} title="Download this table — current sort, raw values — as a CSV cheat sheet"
          style={{
            float: 'right', fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, cursor: 'pointer',
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
            borderRadius: 999, padding: '2px 9px', marginLeft: 8,
          }}>⬇ CSV</button>
        {truncated > 0 && (
          <span style={{ color: C.orange }}>
            Showing the top {view.length} of {sorted.length} — sort a column to bring others up.{' '}
          </span>
        )}
        {(() => {
          const full = caption || 'Every column is colored against its own range. Click a header to sort, a row to open the hitter.'
          // Split on the first sentence end that's followed by a space and a
          // capital — so "1.5 runs" and "e.g." don't get treated as the end.
          const m = String(full).match(/^([\s\S]*?[.!?])\s+(?=[A-Z“"])/)
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
        {capOpen && (
          <>
            {' '}<b style={{ color: C.text2 }}>Shift-click a header</b> to add it as a tiebreaker under the
            current sort — shift-click again to flip it, a third time to drop it.
          </>
        )}
        {sort.length > 1 && (
          <>
            {' '}Sorting by{' '}
            <b style={{ color: C.orange }}>
              {sort.map((s, i) => {
                const col = columns.find((c) => c.key === s.key)
                return `${i ? ' then ' : ''}${col?.label || s.key} ${s.dir === 'desc' ? '↓' : '↑'}`
              }).join('')}
            </b>.
            {' '}<span
              onClick={() => setSort(initialSort ? [{ key: initialSort, dir: 'desc' }] : [])}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >Reset</span>
          </>
        )}
        {' '}Blanks always sort to the bottom, whichever way a column points.
      </div>
      <style jsx>{`
        /* @media (hover: hover) IS LOAD-BEARING (2026-08-16). Unqualified,
           this rule is the single worst offender in Donovan's "the highlights
           are showing on the columns" report: on a touch screen there is no
           pointer to leave, so iOS keeps :hover asserted on the last thing you
           tapped. Every row you touched on a board stayed lit at 1.22
           brightness until you happened to tap somewhere else — a trail of
           highlighted rows behind you, which is exactly what it looked like.
           Touch gets a real press state instead, in MobileCSS. */
        @media (hover: hover) {
          .dense-row:hover td { filter: brightness(1.22); }
        }
      `}</style>
    </div>
  )
}
