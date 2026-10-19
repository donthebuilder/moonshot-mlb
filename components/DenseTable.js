'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PREVIEW_ROWS } from './ListPreview'
import { C, NUM_FONT } from '../lib/theme'
import { useSpotlight } from '../lib/spotlight'
import { usePickLight, rowPid, pickColorOf } from '../lib/pickLight'
import { useSport } from '../lib/sport'
import { DIV_FIELD, fieldAnchor } from '../lib/scales'
import { useSportTheme } from './SportTheme'
import { useInjuryLayer } from './injuries/InjuryLayer'
import { renderV2 } from './table/v2'
import { useTeamNav } from '../lib/teamNav'
import { useIsPhone } from './MobileFold'
import { buildSorter, nextSort, encodeSort, decodeSort } from '../lib/multiSort'
import { readHashKey, FILTER_EVENT } from '../lib/filterHash'
import { lockedFor } from '../lib/members/gate'

// ── ABSENT IS NOT ZERO (2026-08-23) ─────────────────────────────────────────
// `Number(null)` is 0 and `Number('')` is 0, and both are finite, so every
// numeric cell fed a null drew a confident **0** — with the ramp colour that
// zero earns on that column. Twenty-one columns on the Pitchers table alone
// pass `n(field, null)`, which is the house idiom for "the bot published
// nothing here", and thirty-odd components render through this table.
//
// The sorter already knew the difference and had this exact predicate defined
// privately inside it, which is how the two halves of one table came to
// disagree: blanks sank to the bottom when you sorted, and read as zeroes when
// you looked. One rule now, used by both.
//
// This project's line on it: a refusal must never be rendered as a zero.
export const isBlank = (v) => v === null || v === undefined || v === '' || v === '—'
/** Number(), except that an absent value stays absent instead of becoming 0. */
const numOf = (v) => (isBlank(v) ? NaN : Number(v))

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
 *   sorted      the column(s) you are actually ranking by, plus `primary`
 *   none        no cell colour at all
 *
 * 'sorted' (2026-08-22) is the one the colour audit argues for on wide boards.
 * The reasoning: on a 24-column table, colour cannot mean "this number is
 * high" for twenty-four different questions at once — it just means "there is
 * a number here". Following the sort makes the colour mean something the
 * reader chose, which is the difference between information and decoration.
 *
 * Default stays 'full' so nothing changes until it's chosen deliberately.
 */
export const HEAT_MODES = ['full', 'standouts', 'primary', 'sorted', 'none']

const STANDOUT_SLICE = 0.2   // top 20% and bottom 20% of a column

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
export const moreBtn = () => ({
  border: `1px solid ${C.orange}66`, background: `${C.orange}14`, color: C.orange,
  // Padding widened 2026-09-13 (Donovan: "buttons/tap targets too small or
  // cramped" on mobile) — this pill is every "show N more"/"show all" button
  // on every table site-wide, so the fix here is a one-edit, every-table fix.
  borderRadius: 999, padding: '5px 10px', cursor: 'pointer',
  font: `800 9px/1.4 ${NUM_FONT}`, letterSpacing: '.04em',
})

export default function DenseTable({
  // TWO SPORTS, ONE TABLE (2026-09-20). The ⓘ in these headers has worked
  // since it was written -- and looked up every term in the BASEBALL
  // glossary, so on all twelve NFL tables it found nothing and no dot ever
  // appeared. The machinery was there the whole time; the dictionary was the
  // missing half. Defaults keep every MLB caller byte-identical; TUDDY hands
  // in its own through components/nfl/NflTable.js.
  dict = null,
  accent = null,
  scoreTerms = null,
  caveat = null,
  rows = [],
  columns = [],
  heatMode = 'full',
  onRowClick = null,
  maxHeight = 460,
  initialSort = null,
  dense = true,
  caption = '',
  maxRows = 200,
  // moreStep: how many rows one "Show more" tap adds. Absent, it is maxRows (the old behaviour). The phone app previews 3 rows and opens the rest in one tap.
  moreStep = 0,
  // dimRow(row) -> true renders that row at reduced opacity. Used for
  // sample gates: a rate built on four batted balls should not sit at the
  // same visual weight as one built on two hundred.
  dimRow = null,
  // LAMP BOARD (2026-09-26, lamp research step 1). Both additive; absent,
  // every existing table draws exactly as before.
  //   ramp(t) -> colour, t in 0..1: a product's own sequential ramp in place
  //     of the default for heat cells (LAMP's ice ramp, lib/nhl/theme).
  //   rowEdge(row) -> colour | null: a 3px stripe on the row's first text
  //     cell -- the called-row marker, drawn where the spotlight's bar goes.
  ramp = null,
  rowEdge = null,
  // FACES IN TABLES (2026-09-27, BATCH-FACES step 8): faceOf(row) ->
  // { sport, id?, espnId?, photo? } puts an 18px face before the first text
  // cell's value, DESKTOP ONLY (hidden at 760px and under by the .dense-face
  // rule below). Negative vertical margins keep it out of the line box, so
  // the row height does not change. Absent: nothing renders.
  faceOf = null,
  // nameCell: 'player' draws the shared player name cell (components/table/PlayerNameCell.js, 2026-10-13): face, name that fits, one
  // chip line, one row height. One prop per table; absent, the name cell is what it always was.
  nameCell = null,
  // compactPhoneRow: with nameCell 'player', a PHONE row is 52px (the desktop height) instead of 58px, so a short list (the LAMP watchlist) shows 7 rows. The face keeps 36px; the tap target stays 44px.
  compactPhoneRow = false,
  // THE ONE SKIN (components/table/v2.js; the 'classic' skin and ?skin= were
  // deleted 2026-10-11, Wave 4 -- a ?skin= in an old link is simply ignored).
  //   statusOf  (row) -> 'called'|'board'|'off'|null, from the caller's one
  //             status rule; it is stamped in the CALL group.
  //   title     the sheet head.
  statusOf = null,
  // gateOf (2026-10-16): (row) -> { key, started, graded, free } | null from components/MemberGate.js useCallGate; a CALLED stamp the viewer may not see draws as the Members lock. Absent: nothing changes.
  gateOf = null,
  title = '',
  //   bare      v2: no footer (caption fold + CSV) -- for small tables repeated
  //             down a page (a division each), where eight footers are scroll.
  bare = false,
  //   footRows  v2: rows drawn under the body, never sorted, under a rule --
  //             a box score's TOTALS line.
  footRows = null,
  //   tight     v2: 24px rows (a box score: a lineup is read top to bottom)
  //   noGroups  v2: no group row, not even the automatic one
  tight = false,
  noGroups = false,
  //   sortUrlKey  the sort chain rides the address under this hash key
  //               ("sort=adj.d,a5.a"): a shared link opens the same order, a
  //               saved view keeps it. Absent: the sort lives only in the table.
  sortUrlKey = null,
}) {
  const sportTheme = useSportTheme()
  const injuryLayer = useInjuryLayer()   // the availability chip beside a player's name (lib/injuries); null outside the app shell
  const teamNav = useTeamNav()
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
  // initialSort is a key (descending, the historical default) or
  // { key, dir } for a column that reads top-down the other way -- a rank
  // column's #1 belongs at the top, and 'desc' would have put #270 there.
  const initialStack = () => (initialSort
    ? [typeof initialSort === 'string' ? { key: initialSort, dir: 'desc' } : { key: initialSort.key, dir: initialSort.dir || 'desc' }]
    : [])
  const [sort, setSort] = useState(initialStack)
  // TIERS (2026-10-07): the ＋ tier button arms ONE extra tap -- the next header
  // tapped is added as the next tier instead of replacing the sort. Shift-click
  // still does the same on a mouse. lib/multiSort.js says what a tier is.
  const [adding, setAdding] = useState(false)
  const phone = useIsPhone(640)   // v2's group row counts the columns a phone still shows
  // the chain in the address, when the caller asked for it (read after mount, so the server render never disagrees)
  const colSig = columns.map((c) => c.key).join('|')
  const sortHydrated = useRef(false)
  useEffect(() => {
    if (!sortUrlKey) return undefined
    const valid = new Set(colSig.split('|'))
    const read = (fromEvent) => {
      const fromUrl = decodeSort(readHashKey(sortUrlKey), valid)
      if (fromUrl.length) setSort(fromUrl)
      else if (fromEvent) setSort(initialStack())
    }
    read(false)
    sortHydrated.current = true
    const onEvt = () => read(true)
    window.addEventListener('hashchange', onEvt)
    window.addEventListener(FILTER_EVENT, onEvt)
    return () => { window.removeEventListener('hashchange', onEvt); window.removeEventListener(FILTER_EVENT, onEvt) }
    // initialStack is stable per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortUrlKey, colSig])
  useEffect(() => {
    if (!sortUrlKey || !sortHydrated.current) return
    try {
      const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      const mine = encodeSort(sort)
      const init = encodeSort(initialStack())
      const cur = h.get(sortUrlKey) || ''
      if (mine === init || !mine) { if (!cur) return; h.delete(sortUrlKey) } else { if (cur === mine) return; h.set(sortUrlKey, mine) }
      const q = h.toString()
      window.history.replaceState(null, '', q ? `#${q}` : window.location.pathname + window.location.search)
    } catch { /* the sort still works without the address */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, sortUrlKey])
  // ✨ site-wide spotlight v2 — a row whose _raw slate record matches one of
  // the user's named highlights washes in THAT light's color; when several
  // match, priority (1 = top) decides. Rows without _raw simply can't match.
  const { firstMatch } = useSpotlight()
  // ✨ THE TAP HIGHLIGHT (2026-09-30, lib/pickLight.js): names tapped on the
  // numerology chips (any product) stay lit here too, worn as one more light.
  // It wins the row over a Spotlight rule (resolved below).
  const tableSport = useSport()   // a team / opponent code in a text cell draws as this sport's logo (v2 teamCodeOf)
  const pick = usePickLight(tableSport)
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


  // The first text column — where a lit row wears its bar and its glyph. Falls
  // back to the first non-action column so a table with no sticky column still
  // marks something rather than nothing.
  const firstTextKey = useMemo(() => {
    const sticky = columns.find((c) => c.sticky && c.heat === false)
    if (sticky) return sticky.key
    const text = columns.find((c) => c.heat === false && !c.action && !c.flag)
    return text ? text.key : null
  }, [columns])

  // ── A THIN ROW MUST NOT SET THE SCALE (2026-08-29) ───────────────────────
  //
  // Donovan, on the pitch table: a K-Curve line resting on TWO balls in play
  // showed (100.0) BRL% and still read as the brightest thing on the board.
  // dimRow was already wired and the row was already dimmed and its rates
  // already parenthesised — and it did not help, because dimming a row does
  // not stop it OWNING THE TOP OF THE RAMP. Every other row on that table was
  // being coloured as a fraction of a number produced by two swings, so the
  // real rows were squashed into the bottom of the gradient while the
  // unqualified one sat at the ceiling wearing 42% opacity.
  //
  // The gate now applies to the SCALE, not just the row: when a table supplies
  // dimRow, the min and max come from qualifying rows only. Thin rows keep
  // their real values, stay sortable, stay counted, and clamp to the ends of
  // the honest scale rather than defining it.
  //
  // Guard: if fewer than three rows qualify there is no meaningful scale to
  // build from them, so every row is used, exactly as before. A table where
  // almost nothing clears the gate should look flat — that is the truth about
  // it — rather than pick a ramp out of two numbers.
  const ranges = useMemo(() => {
    const out = {}
    const qualified = typeof dimRow === 'function' ? rows.filter((r) => !dimRow(r)) : rows
    const scaleRows = qualified.length >= 3 ? qualified : rows
    heatCols.forEach((c) => {
      // numOf, not Number: a column where half the arms published nothing was
      // computing its ramp against a floor of phantom zeroes, so the arms that
      // DID publish were all squashed into the top of the gradient.
      const vals = scaleRows.map((r) => numOf(r[c.key])).filter(Number.isFinite)
      out[c.key] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
    })
    return out
  }, [rows, heatCols, dimRow])

  // ── FIELD ANCHORS ─────────────────────────────────────────────────────────
  // A column that asked for `anchor: DIV_FIELD` gets its zero from the rows on
  // screen — the middle of tonight's slate — and its ceiling from the wider of
  // the two tails. `fieldAnchor` returns null when the column cannot support
  // one (too few rows, no spread), and a null here is not a fallback to
  // something approximate: the cell falls all the way back to its plain
  // sequential fill and draws no arrow at all. See lib/scales.js.
  const fields = useMemo(() => {
    const out = {}
    heatCols.forEach((c) => {
      if (c.scale !== 'div' || c.anchor !== DIV_FIELD) return
      const blank = typeof c.blankWhen === 'function' ? c.blankWhen : null
      out[c.key] = fieldAnchor(rows
        .filter((r) => !blank || !blank(numOf(r[c.key]), r))
        .map((r) => r[c.key]))
    })
    return out
  }, [rows, heatCols])

  // Cutoffs for 'standouts': the value at the 20th and 80th percentile of each
  // column. Percentile rather than a fixed distance from the extremes, so one
  // outlier can't drag the whole band with it.
  const cuts = useMemo(() => {
    if (heatMode !== 'standouts') return {}
    const out = {}
    // Same gate as `ranges` above: a percentile band built including rows that
    // do not clear the sample gate is a band drawn around noise.
    const qualified = typeof dimRow === 'function' ? rows.filter((r) => !dimRow(r)) : rows
    const scaleRows = qualified.length >= 5 ? qualified : rows
    heatCols.forEach((c) => {
      const vals = scaleRows.map((r) => Number(r[c.key])).filter(Number.isFinite).sort((a, b) => a - b)
      if (vals.length < 5) { out[c.key] = null; return }
      const lo = vals[Math.floor(vals.length * STANDOUT_SLICE)]
      const hi = vals[Math.ceil(vals.length * (1 - STANDOUT_SLICE)) - 1]
      out[c.key] = [lo, hi]
    })
    return out
  }, [rows, heatCols, heatMode, dimRow])

  // Does this cell get colour at all, under the current mode?
  const lit = (c, num) => {
    if (heatMode === 'none') return false
    if (!Number.isFinite(num)) return false
    if (heatMode === 'full') return true
    if (heatMode === 'primary') return c.primary === true
    if (heatMode === 'sorted') {
      // WHAT YOU SORTED BY, PLUS `primary`. An earlier version also painted
      // anything carrying a declared scale, which quietly undid the whole
      // point the moment a board declared twenty of them — the Rundown's
      // stat-column pass would have put it straight back to a wash. A scale
      // says HOW a column is drawn when it is drawn; `primary` is what says
      // it is always worth drawing.
      if (c.primary === true) return true
      return sort.some((s) => s.key === c.key)
    }
    const k = cuts[c.key]
    if (!k) return false
    return c.invert ? (num <= k[0] || num >= k[1]) : (num >= k[1] || num <= k[0])
  }

  // The rows in sort order. ONE key is the plain raw order it always was; two or
  // more make TIERS (lib/multiSort.js): the first key groups, the next orders inside.
  // Missing values sink to the bottom whichever way the column is pointing.
  const sorter = useMemo(() => buildSorter(sort, rows, (k) => columns.find((c) => c.key === k)), [rows, sort, columns])
  const sorted = useMemo(() => {
    if (!sort.length) return rows
    return [...rows].sort(sorter.compare)
  }, [rows, sort, sorter])

  // ── #19: A CAP WITH NO WAY PAST IT ───────────────────────────────────────
  //
  // "top 300 of 515" on Research and "top 200 of 703" on You, sort-only: the
  // remaining rows were unreachable unless a sort happened to surface them,
  // which is not a way to find a specific hitter. The cap itself is right --
  // 700 rows of a heat-mapped table is a slow page nobody asked for -- so
  // this keeps the cap and adds the door: one control that raises it a page
  // at a time, and one that lifts it entirely for anyone who wants the lot.
  const [extra, setExtra] = useState(0)
  // THE ONE SHOW-MORE RULE (Donovan 10-18; components/ListPreview.js): a short table (cap 12 or less) that
  // would cut rows previews PREVIEW_ROWS, and one tap shows all of it. A big board (Rankings, 60) keeps its cap.
  const baseCap = maxRows <= 12 && sorted.length > maxRows ? Math.min(maxRows, PREVIEW_ROWS) : maxRows
  const cap = baseCap + extra
  const view = sorted.length > cap ? sorted.slice(0, cap) : sorted

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
    // the members gate: a CALLED row the viewer may not read exports as the ON THE BOARD row it is drawn as
    const hid = (r) => { if (!gateOf || typeof statusOf !== 'function') return false; const g = gateOf(r); return Boolean(g) && lockedFor({ status: statusOf(r), started: g.started, graded: g.graded, key: g.key, free: g.free, memberState: 'free' }) }
    sorted.forEach((r) => { const h = hid(r); lines.push(cols.map((c) => esc(h && r[c.key] === 'called' ? 'board' : r[c.key])).join(',')) })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `moonshot-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const truncated = sorted.length - view.length

  if (!rows.length || !columns.length) return null



  const toggle = (key, additive) => {
    const extend = additive || adding
    setSort((s) => nextSort(s, key, extend))
    if (adding) setAdding(false)
  }

  // the product's accent, never orange by accident (plan: R0 step 4, C2)
  const ac = accent || (sportTheme.themed ? sportTheme.accent : null) || C.orange
  return renderV2({
    C, NUM_FONT, ac, columns, view, sorted, sort, setSort, toggle, adding, setAdding, tierSig: sorter.tierSig, phone, ranges, fields, lit,
    heatMode, ramp, rowEdge, faceOf, onRowClick, dimRow, pick, rowPid, pickColorOf, firstMatch,
    explain, setExplain, dict, scoreTerms, caveat, accent, maxHeight, caption,
    truncated, maxRows, moreStep, extra, setExtra, exportCsv, railRef, statusOf, title, initialStack, firstTextKey, gateOf,
    capOpen, setCapOpen, bare, footRows, tight, noGroups, onOpenTeam: teamNav, sport: tableSport, injuryLayer, nameCell, compactPhoneRow,
  })
}
