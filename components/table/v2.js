'use client'
// DENSETABLE, SKIN V2 (2026-10-01, BATCH-TABLE-SKIN-V2 -- .claude-notes/
// BATCH-TABLE-SKIN-V2-PLAN.md). Donovan, on the live mock of The Board: "this
// looks great … this is the new component … push this style to all the charts
// site wide." The SAME table -- every behaviour DenseTable owns (sort,
// shift-click tiebreak, sticky header, watch star, ⓘ, row click, CSV, the cap
// and its "show more", spotlight, pickLight) -- drawn as a DASH sheet:
//
//   - NO WASHES AT REST. Only the column you sort by is graded (the ramp the
//     table already uses, at <= 35% alpha) and every cell in it carries ▲ / ▼;
//     a shift-click tiebreak column is graded at 45% of that, no arrows.
//     Sorting by a name / team / role paints nothing.
//   - Scores (`bar`) draw a 28 x 3 bar + the figure, not a tinted cell.
//     League columns (`scale:'div'`) print plain; the warm side's figure is
//     cream 700, the other side text3, the ▲ / ▼ as today.
//   - Flags are a glyph in the accent on transparent; off is the glyph at 12%.
//   - Columns sit in their GROUPS (`group: { key, label, order }` or a plain
//     label), one group row above the headers, one rule between groups, no
//     vertical borders inside one.
//   - Team columns draw the club LOGO (TeamMark variant="logo").
//   - PHONE (<= 640px): rank + name pinned (<= 150px); the 'call' group's other
//     columns fold into a mono sub-line under the name; numbers 10px, names
//     11px, 32px rows. A name too long for the pinned cell at 11px shows the
//     surname (the full name in title=).
//   - The product's accent everywhere the skin uses one: accent prop -> the
//     SportTheme accent -> C.orange. No orange by accident.
//
// Plain functions, no hooks: DenseTable owns the state and calls renderV2.
import TeamMark from '../TeamMark'
import Tap from '../Tap'
import { STATUS_WORD } from '../../lib/callStatus'
import PlayerFace from '../PlayerFace'
import CallStatusBadge from '../CallStatusBadge'
import { ShowMoreButton } from '../ListPreview'
import { InfoDot, ExplainBanner, explainFor, explainFrom } from '../Explain'
import { ANSWERS } from '../../lib/scoreAnswers'
import { cellMark, SPOT_MARK } from '../../lib/spotlight'
import { rampColor } from '../Heatmap'
import { seqColor, divTone, SEQ_AUTO, DIV_FIELD, DIV_UP, DIV_DOWN, fieldLabel, medianOf, seqGlyph, rgbOf, catColor } from '../../lib/scales'

// ROLE CHIPS IN COLOUR AGAIN (2026-10-03, Donovan: "the roles need the
// colors back"): the chip wears the role's hue from the one role palette
// (lib/scales CAT.role, what the MLB cards use); a role it doesn't know stays
// a neutral chip, as before.
const ROLE_TOKEN = /\b(TOP15|TOP|HRR|HR|HIT|CONTACT|BASES|WATCH)\b/
export function roleHue(v, C) {
  const m = ROLE_TOKEN.exec(String(v || '').toUpperCase())
  const col = m ? catColor('role', m[1]) : null
  return col && col !== C.text3 ? col : null
}

const SORT_ALPHA = 0.35
const TIE_ALPHA = SORT_ALPHA * 0.45
// STANDOUTS AT REST (2026-10-03, Donovan picked it: "extremes only, every
// column"). Replaces 10-01's "nothing coloured until you sort": in every
// stat column the top ~20% carry a wash in the PRODUCT's accent (MOONSHOT
// orange, TUDDY green, LAMP ice, BUCKETS purple), stronger toward the
// column's best, figure bold; the bottom ~20% recede (darker cell, dimmer
// ink). No red/green. The sorted column keeps its full ramp. `invert`
// columns (lower is better) flip; heatMode 'none' tables stay plain.
const STANDOUT_SHARE = 0.2
const STANDOUT_ALPHA = [0.14, 0.34]   // from the band's edge to the column's best
const RECEDE_ALPHA = 0.55             // the bottom band: C.bg at this alpha over the row
const isBlank = (v) => v === null || v === undefined || v === '' || v === '—'
const numOf = (v) => (isBlank(v) ? NaN : Number(v))

/** any CSS colour we produce (hex or rgb[a]) at alpha a */
export function withAlpha(col, a) {
  const s = String(col || '')
  const m = /^rgba?\(([^)]+)\)/.exec(s)
  const [r, g, b] = m ? m[1].split(',').slice(0, 3).map((x) => Number(x.trim())) : rgbOf(s)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`
}

// ── the skin, resolved: prop -> ?skin= (search or hash; also remembered) ->
//    localStorage 'dash_table_skin' -> null (the caller's default)
export const SKIN_KEY = 'dash_table_skin'
export function readSkin() {
  if (typeof window === 'undefined') return null
  try {
    const q = new URLSearchParams(window.location.search).get('skin')
      || new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get('skin')
    if (q === 'v2' || q === 'classic') {
      try { window.localStorage.setItem(SKIN_KEY, q) } catch { /* private mode */ }
      return q
    }
    const ls = window.localStorage.getItem(SKIN_KEY)
    return ls === 'v2' || ls === 'classic' ? ls : null
  } catch { return null }
}

// ── groups: a column's group as { key, label, order }; a string is its own
//    label, ordered by first appearance. Ungrouped columns ride with the
//    group before them, so a partly-tagged table never scatters.
const groupOf = (c) => (c.group == null ? null : typeof c.group === 'string' ? { key: c.group, label: c.group, order: null } : c.group)
// A WIDE TABLE WITH NO GROUPS (8+ columns) is split in two, never guessed
// further: the who-columns up to and including its name column, labelled with
// that column's own name ("Player", "Team"), then the numbers. A small table
// gets no group row -- on a phone that row is 18px of scroll for nothing.
const AUTO_MIN = 8
function autoGroups(columns) {
  if (columns.length < AUTO_MIN || columns.some((c) => c.group != null)) return columns
  const ni = columns.findIndex((c) => c.sticky && c.heat === false)
  if (ni < 0) return columns
  let end = ni
  while (end + 1 < columns.length && columns[end + 1].heat === false && !columns[end + 1].flag && (columns[end + 1].fold || columns[end + 1].logo || columns[end + 1].teamMark || /^(pos|position|team|tm|opp|oppTxt|vs|g)$/.test(columns[end + 1].key))) end++
  const who = { key: 'who', label: String(columns[ni].label || 'Who').trim() || 'Who', order: 0, auto: true }
  const nums = { key: 'numbers', label: 'The numbers', order: 1, auto: true }
  return columns.map((c, i) => ({ ...c, group: i <= end ? who : nums }))
}

export function orderByGroup(input) {
  const columns = autoGroups(input)
  if (!columns.some((c) => c.group != null)) return columns
  let last = null
  const seen = new Map()
  const tagged = columns.map((c, i) => {
    const g = groupOf(c) || last
    last = g
    if (g && !seen.has(g.key)) seen.set(g.key, seen.size)
    return { c, i, g }
  })
  const rank = (g) => (g ? (g.order ?? 1000 + seen.get(g.key)) : -1)
  return tagged.sort((a, b) => (rank(a.g) - rank(b.g)) || (a.i - b.i)).map((t) => ({ ...t.c, _g: t.g }))
}

// ── names that fit: measured at the phone's 11px, against the pinned cell
const NAME_ROOM = 108   // 122px pinned name cell - 2 x 6px padding - a hair
let _ctx = null
const fits = (name) => {
  if (typeof document === 'undefined') return true
  try {
    if (!_ctx) _ctx = document.createElement('canvas').getContext('2d')
    const fam = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
    _ctx.font = `600 11px ${fam}`
    return _ctx.measureText(String(name)).width <= NAME_ROOM
  } catch { return true }
}
const surname = (name) => {
  const parts = String(name || '').trim().split(/\s+/)
  if (parts.length < 2) return name
  const tail = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1]) ? parts.slice(-2).join(' ') : parts[parts.length - 1]
  return tail
}

export function v2Css(C, ac, NUM_FONT) {
  return `
    .dtv2 table { border-collapse: separate; border-spacing: 0; width: 100%; }
    .dtv2 th, .dtv2 td { background: ${C.bg2}; }
    .dtv2 .g-row th { font: 800 10px/1 system-ui, -apple-system, sans-serif; letter-spacing: .16em; text-transform: uppercase;
      color: ${C.text3}; height: 18px; padding: 0 8px; position: relative; text-align: left; white-space: nowrap; overflow: visible; }
    .dtv2 .g-tick { display: inline-block; width: 14px; height: 2px; background: ${ac}; vertical-align: middle; margin-right: 6px; border-radius: 1px; }
    .dtv2 .h-row th { font: 700 9px/1.2 ${NUM_FONT}; letter-spacing: .06em; text-transform: uppercase; color: ${C.text3};
      height: 24px; padding: 0 7px; white-space: nowrap; cursor: pointer; user-select: none; border-bottom: 1px solid ${C.border}; }
    .dtv2 .h-row th.on { color: ${C.text}; box-shadow: inset 0 -2px 0 ${ac}; }
    /* the ⓘ keeps its tap padding but not the line: middle-aligned, no line height of its own */
    .dtv2 .h-row th .explain-dot { vertical-align: middle; line-height: 1; }
    /* on a mouse, the ⓘ's tap padding must not swallow a click meant to sort */
    @media (pointer: fine) { .dtv2 .h-row th .explain-dot { padding: 2px 3px !important; margin: -2px -1px -2px 2px !important; } }
    .dtv2 .h-row th > span { line-height: 0; }
    /* DESKTOP FIT (2026-10-03, Donovan: "columns on desktop need to be sized
       right"): a header label may wrap to two lines at its spaces, so a
       column is as wide as its numbers, not its longest label; 10px, bottom-
       aligned so the figures line up. Phones keep their own rules below. */
    @media (min-width: 641px) {
      .dtv2 .h-row th { white-space: normal; font-size: 10px; line-height: 1.15; height: auto; padding: 5px 7px 4px; vertical-align: bottom; overflow-wrap: normal; word-break: keep-all; }
    }
    .dtv2 td { height: 36px; padding: 0 7px; border-bottom: 1px solid ${C.border}; white-space: nowrap; }
    .dtv2 td.num { font: 500 11.5px/1 ${NUM_FONT}; color: ${C.text2}; text-align: right; }
    .dtv2 td.num b { font-weight: 700; }
    .dtv2 td.name { font: 600 12.5px/1.15 system-ui, -apple-system, sans-serif; color: ${C.text}; overflow: hidden; text-overflow: ellipsis; }
    .dtv2 td.txt { font: 500 11px/1.2 system-ui, -apple-system, sans-serif; color: ${C.text2}; overflow: hidden; text-overflow: ellipsis; }
    .dtv2 td.rank, .dtv2 th.rank { font: 800 15px/1 system-ui, -apple-system, sans-serif; color: ${C.text3}; text-align: right; }
    .dtv2 th.rank { font-size: 9px; }
    .dtv2 .g0 { box-shadow: inset 1px 0 0 ${C.border2}; }
    .dtv2 .h-row th.g0.on { box-shadow: inset 1px 0 0 ${C.border2}, inset 0 -2px 0 ${ac}; }
    .dtv2 .bar { display: inline-block; width: 28px; height: 3px; border-radius: 2px; background: ${C.bg3}; vertical-align: middle; margin-right: 6px; position: relative; overflow: hidden; }
    .dtv2 .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; }
    .dtv2 .glyph { font-size: 12px; font-weight: 800; }
    .dtv2 .arrow { margin-left: 3px; font-size: 8px; opacity: .9; }
    .dtv2 .sub { display: none; }
    .dtv2.dtv2-tight td { height: 24px !important; }
    .dtv2.dtv2-tight td.name { padding-top: 0 !important; padding-bottom: 0 !important; }
    .dtv2 .dtv2-scroll { -webkit-overflow-scrolling: touch; }
    .dtv2 th.rank { overflow: hidden; }
    .dtv2 .short { display: none; }
    .dtv2 tr.dtv2-row { cursor: default; }
    .dtv2 tr.dtv2-click { cursor: pointer; }
    @media (hover: hover) { .dtv2 tr.dtv2-row:hover td { background: ${C.bg3}; } }
    @media (max-width: 760px) { .dtv2 .dense-face { display: none !important; } }
    @media (max-width: 640px) {
      .dtv2 .dtv2-scroll { scrollbar-width: none; }
      .dtv2 .dtv2-scroll::-webkit-scrollbar { display: none; }
      .dtv2 .fold { display: none !important; }
      .dtv2 td { height: 32px; padding: 0 5px !important; }
      .dtv2 .g-row th { padding: 0 8px !important; }
      .dtv2 td.num { font-size: 10px; }
      .dtv2 td.name { font-size: 11px; line-height: 1.1; padding: 2px 6px !important; }
      .dtv2 td.name, .dtv2 th.name { width: 122px !important; min-width: 122px !important; max-width: 122px !important; }
      .dtv2 td.rank { font-size: 13px; padding: 0 3px 0 0 !important; }
      .dtv2 td.rank, .dtv2 th.rank { width: 26px !important; min-width: 26px !important; max-width: 26px !important; padding: 0 3px 0 0; }
      .dtv2 .sub img { width: 11px !important; height: 11px !important; margin: -2px 0; }
      .dtv2 td.name > button { min-height: 0 !important; }
      /* the star: a 44px hit box, a 32px layout box (classic's negative-margin trick) */
      .dtv2 td.dense-action button { height: 44px !important; min-height: 44px !important; margin: -6px 0 !important; }
      /* the ☆ is a real control on a phone: a full 44 x 44 thumb target */
      .dtv2 td.dense-action, .dtv2 .h-row th.act { width: 44px !important; min-width: 44px !important; max-width: 44px !important; }
      .dtv2 td.dense-action button { width: 44px !important; }
      .dtv2 .pin2 { left: 26px !important; }
      /* a long label wraps to two lines on a phone rather than widening its column */
      /* the site's phone table rule pads every th / td 6px; the sheet sets its own */
      .dtv2 .h-row th { font-size: 8px; padding: 0 5px !important; }
      /* the ⓘ in a header: the site's phone button floor (32px) must not make the header row taller */
      .dtv2 .h-row th button { min-height: 0 !important; }
      .dtv2 .h-row th.long { white-space: normal; line-height: 1.15; vertical-align: bottom; min-width: 0 !important; }
      .dtv2 .bar { width: 20px; margin-right: 4px; }
      .dtv2 .sub { display: block; font: 700 8.5px/1.15 ${NUM_FONT}; color: ${C.text3}; letter-spacing: .02em; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dtv2 .long .full { display: none; }
      .dtv2 .long .short { display: inline; }
    }
  `
}

/**
 * renderV2(ctx): the v2 sheet. ctx carries DenseTable's own state and props.
 */
export function renderV2(ctx) {
  const {
    C, NUM_FONT, ac, columns: rawColumns, view, sorted, sort, setSort, toggle, ranges, fields, lit,
    heatMode = 'full', ramp, rowEdge, faceOf, onRowClick, dimRow, pick, rowPid, pickColorOf, firstMatch,
    explain, setExplain, dict, scoreTerms, caveat, accent, maxHeight, caption,
    truncated, maxRows, extra, setExtra, exportCsv, railRef, statusOf, title, initialStack, firstTextKey,
    capOpen, setCapOpen, bare, footRows, tight, noGroups, onOpenTeam = null,
  } = ctx
  const ordered = noGroups ? rawColumns.map((c) => ({ ...c, group: null })) : orderByGroup(rawColumns)
  // THE STATUS STAMP (plan step 4): when the caller can say each row's status,
  // a Status column joins the CALL group, after its last column. The word is
  // lib/callStatus STATUS_WORD via CallStatusBadge; the status is the caller's.
  const withStatus = typeof statusOf === 'function'
  // a table that already draws its own status column (LAMP's, which also
  // carries the graded result) marks it `statusCol` and keeps it
  const columns = (() => {
    if (!withStatus || ordered.some((c) => c.statusCol)) return ordered
    const nm = ordered.find((c) => c.sticky && c.heat === false)
    const g = nm?._g || null
    let at = ordered.indexOf(nm)
    ordered.forEach((c, i) => { if (g && c._g?.key === g.key) at = i })
    const col = { key: '_status', label: 'Status', heat: false, _status: true, _g: g, w: 118, title: `${STATUS_WORD.called}: the bot\u2019s pick. ${STATUS_WORD.board}: inside the board, not picked. ${STATUS_WORD.off}: outside the board.` }
    return [...ordered.slice(0, at + 1), col, ...ordered.slice(at + 1)]
  })()
  // the # column: tagged, or the plain '#' text column every board uses
  const isRank = (c) => c.rankCol === true || (c.rankCol !== false && c.heat === false && String(c.label).trim() === '#')
  const rankC = columns.find(isRank)
  const nameC = columns.find((c) => c.sticky && c.heat === false) || columns.find((c) => c.key === firstTextKey)
  // the 'call' group's other text columns fold into the phone sub-line
  const callKey = nameC?._g?.key ?? null
  // (or a column tagged `fold`, for tables without groups)
  const folds = (c) => c !== nameC && !isRank(c) && (c.fold === true
    // the ☆ never folds (Donovan 10-01: "fix the watchlist bug star") -- a
    // phone must be able to watch a player from every table, the Board too
    || (c.fold !== false && !!callKey && c._g?.key === callKey && c.heat === false && !c.action))
  const logoOf = (c) => c.teamMark || c.logo || null
  const s0 = sort[0]?.key ?? null, s1 = sort[1]?.key ?? null
  const eligible = (c) => c.heat !== false && !c.flag && !c.action
  // EVERY SORTED STAT GETS THE GRADE (Donovan 10-01: "when i click on each
  // sort they all should have the new heat mapping"). A text-flagged column
  // whose values are numbers (L5 AVG, Spot, a count) is graded like any stat
  // when you sort by it -- the ramp over its own range. Never the # column
  // (it is the opening sort, and a wash at rest is the one thing v2 removes),
  // never a name, club, role or status.
  const numericText = new Map()
  const isNumericText = (c) => {
    if (!c || c.heat !== false || c.numeric === false || c.rankCol || isRank(c) || c.sticky || c.teamMark || c.logo || c.key === 'role' || c._status || c.statusCol) return false
    if (!numericText.has(c.key)) {
      const vs = sorted.map((r) => r[c.key]).filter((v) => !isBlank(v))
      const nums = vs.map(Number).filter(Number.isFinite)
      numericText.set(c.key, vs.length > 0 && nums.length / vs.length >= 0.6 ? [Math.min(...nums), Math.max(...nums)] : null)
    }
    return !!numericText.get(c.key)
  }
  // the standout bands, per stat column, over the rows on screen
  const bands = {}
  if (heatMode !== 'none') {
    for (const c of columns) {
      if (!eligible(c) || c.standout === false || c.scale === 'div' || logoOf(c) || isRank(c) || c.bar) continue
      // `view`, not `sorted` (2026-10-04 audit 04 A2): on a capped preview the
      // bands came from every row, so the 12 shown -- the best by score --
      // all cleared the top band and every cell lit.
      const nums = (view || sorted).map((r) => numOf(r[c.key])).filter(Number.isFinite).sort((a, b) => a - b)
      if (nums.length < 6 || new Set(nums).size < 4) continue
      const at = (q) => nums[Math.min(nums.length - 1, Math.max(0, Math.floor(q * (nums.length - 1))))]
      const lo = at(STANDOUT_SHARE), hi = at(1 - STANDOUT_SHARE)
      if (hi <= lo) continue
      bands[c.key] = { lo, hi, min: nums[0], max: nums[nums.length - 1], invert: c.invert === true }
    }
  }
  /** 'top' with a strength 0..1, 'low', or null -- the column's own direction */
  const standout = (c, num) => {
    const b = bands[c.key]
    if (!b || !Number.isFinite(num)) return null
    const good = b.invert ? num <= b.lo : num >= b.hi
    const bad = b.invert ? num >= b.hi : num <= b.lo
    if (good) {
      const edge = b.invert ? b.lo : b.hi, best = b.invert ? b.min : b.max
      const t = best === edge ? 1 : Math.max(0, Math.min(1, (num - edge) / (best - edge)))
      return { kind: 'top', t }
    }
    return bad ? { kind: 'low' } : null
  }
  const medians = {}
  for (const k of [s0, s1]) {
    const c = columns.find((x) => x.key === k)
    if (c && (eligible(c) || isNumericText(c))) medians[k] = medianOf(sorted.map((r) => numOf(r[k])))
  }
  const groupStart = new Set()
  columns.forEach((c, i) => { if (i > 0 && c._g && c._g.key !== columns[i - 1]._g?.key) groupStart.add(c.key) })

  const pinStyle = (c, head) => {
    if (c === rankC) return { position: 'sticky', left: 0, zIndex: head ? 5 : 2 }
    if (c === nameC) return { position: 'sticky', left: rankC ? (rankC.w || 40) : 0, zIndex: head ? 5 : 2 }
    return null
  }
  const cls = (c, base) => [base, groupStart.has(c.key) ? 'g0' : '', folds(c) ? 'fold' : '', c === nameC && rankC ? 'pin2' : ''].filter(Boolean).join(' ')

  // the grade a sorted column wears, from the SAME colour the classic table
  // computes for it (ramp / seq domain / ramp over the column's range / divTone)
  const gradeOf = (c, num, a) => {
    if (!Number.isFinite(num)) return null
    const fld = c.anchor === DIV_FIELD ? fields[c.key] : null
    if (c.scale === 'div' && (c.anchor !== DIV_FIELD || fld)) {
      const d = divTone(num, { anchor: fld ? fld.anchor : (c.anchor ?? 0), ceiling: fld ? fld.ceiling : (c.ceiling ?? 1), deadband: c.deadband ?? 0.08, invert: c.invert === true })
      return d.bg === 'transparent' ? null : withAlpha(d.bg, a)
    }
    const [lo, hi] = ranges[c.key] || [0, 1]
    const [dlo, dhi] = c.domain && c.domain !== SEQ_AUTO ? c.domain : [lo, hi]
    const col = ramp
      ? ramp(dhi > dlo ? (c.invert ? (dhi - num) : (num - dlo)) / (dhi - dlo) : 0.5)
      : c.scale === 'seq' && c.domain && c.domain !== SEQ_AUTO ? seqColor(num, c.domain)
        : c.invert ? rampColor(hi - (num - lo), lo, hi) : rampColor(num, lo, hi)
    return col ? withAlpha(col, a) : null
  }

  const head = (
    <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
      {columns.some((c) => c._g) && (
        <tr className="g-row">
          {columns.map((c, i) => {
            // the label sits on the first column of its run that a phone still
            // shows (a folded column is hidden there), so it is drawn once and
            // never hides under a pinned cell
            const lead = columns.find((x) => x._g?.key === c._g?.key && !folds(x))
            const label = c._g && c === lead ? c._g.label : null
            return (
              <th key={c.key} className={cls(c, '')} style={{ ...(pinStyle(c, true) || {}), position: pinStyle(c, true) ? 'sticky' : 'relative', zIndex: pinStyle(c, true) ? (label ? 7 : 6) : label ? 4 : 3 }}>
                {/* absolute: a group's label must not widen its first column */}
                {label ? <span style={{ position: 'absolute', left: 8, top: 0, bottom: 0, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', pointerEvents: 'none' }}><span className="g-tick" />{label}</span> : null}
              </th>
            )
          })}
        </tr>
      )}
      <tr className="h-row">
        {columns.map((c) => {
          const si = sort.findIndex((x) => x.key === c.key)
          const on = si >= 0
          const dir = on ? sort[si].dir : null
          const plain = c.explain || (dict ? explainFrom(dict, c.term, c.key, c.label) : explainFor(c.term, c.key, c.label)) || (c.answers ? ANSWERS[c.answers]?.what : null)
          return (
            <th key={c.key} scope="col" aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={cls(c, [on ? 'on' : '', isRank(c) ? 'rank' : '', c === nameC ? 'name' : '', c.action ? 'act' : '', /\s/.test(String(c.label || '').trim()) && String(c.label).length > 9 ? 'long' : ''].filter(Boolean).join(' '))}
              onClick={c._status ? undefined : (e) => toggle(c.key, e.shiftKey)}
              title={`${c.title || c.label}\n\nClick to sort. Shift-click to add as a tiebreaker under the current sort.`}
              style={{ ...(pinStyle(c, true) || {}), textAlign: (c.heat === false && !isNumericText(c)) || c.action ? 'left' : 'right', width: logoOf(c) ? 34 : c.w, minWidth: logoOf(c) ? 34 : (c === rankC || c === nameC ? c.w : undefined) }}>
              {String(c.label || '').trim() ? c.label : <span className="sr-only">{c.title || c.key || 'Column'}</span>}
              {plain && (
                <span style={{ opacity: explain?.key === c.key ? 1 : 0.55 }}>
                  <InfoDot on={explain?.key === c.key}
                    onClick={() => setExplain((cur) => (cur?.key === c.key ? null : { key: c.key, label: c.label, text: plain, art: c.art || null, answers: c.answers || null }))} />
                </span>
              )}
              {on && <>{dir === 'desc' ? ' ▾' : ' ▴'}{sort.length > 1 && <sup style={{ fontSize: 7.5, marginLeft: 1, opacity: 0.85 }}>{si + 1}</sup>}</>}
            </th>
          )
        })}
      </tr>
    </thead>
  )

  const body = (
    <tbody>
      {view.map((r, ri) => {
        const pid = pick.count ? rowPid(r) : ''
        const light = (pid && pick.has(pid) ? { color: pickColorOf(C), name: `you highlighted ${pick.map[pid] || 'him'}`, mark: '✨' } : null) || firstMatch(r._raw ?? r)
        const tint = light ? withAlpha(light.color, 0.05) : null
        const status = withStatus ? statusOf(r) : null
        const called = status === 'called'
        const watched = columns.some((c) => c.action && r[c.key])
        return (
          <tr key={r._key ?? ri} onClick={onRowClick ? () => onRowClick(r._raw ?? r) : undefined}
            title={light ? `Highlight: ${light.name || 'match'}` : undefined}
            className={onRowClick ? 'dtv2-row dtv2-click dense-row dense-click' : 'dtv2-row dense-row'}
            style={{ opacity: dimRow?.(r) ? 0.42 : 1 }}>
            {columns.map((c) => {
              const v = r[c.key]
              const pin = pinStyle(c, false) || {}
              const bgTint = tint ? { background: `linear-gradient(${tint}, ${tint}), ${C.bg2}` } : null

              if (c.action) {
                const on = !!v && v !== 0
                return (
                  <td key={c.key} className={cls(c, 'dense-action')} style={{ textAlign: 'center', padding: 0, ...pin, ...(bgTint || {}) }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); c.onAction?.(r._raw ?? r) }}
                      title={on ? (c.titleOn || 'Remove') : (c.titleOff || 'Add')} aria-pressed={on}
                      style={{ width: '100%', height: 36, border: 'none', background: 'transparent', cursor: 'pointer', color: on ? ac : C.text3, fontSize: 13, fontWeight: 800 }}>
                      {on ? (c.mark || '★') : (c.markOff || '☆')}
                    </button>
                  </td>
                )
              }

              if (c.flag) {
                const on = !!v && v !== 0 && v !== '—'
                return (
                  <td key={c.key} className={cls(c, 'num')} style={{ textAlign: 'center', ...(bgTint || {}) }}>
                    <span className="glyph" style={{ color: on ? ac : C.text3, opacity: on ? 1 : 0.12 }}>{c.mark || '●'}</span>
                  </td>
                )
              }

              if (c._status) {
                return <td key={c.key} className={cls(c, 'txt')} style={bgTint || undefined}><CallStatusBadge status={status} accent={ac} /></td>
              }

              if (c.heat === false) {
                const isName = c === nameC
                const textTitle = c.titleKey ? (r?.[c.titleKey] || undefined) : undefined
                // an opponent / team CODE in a text cell is a club link too (the product's team
                // door); "his team is the logo, the opponent is quiet text" -- quiet, not dead
                const go = c.link ? c.link(r._raw ?? r) : (!isName && (c.key === 'opp' || c.key === 'team') && onOpenTeam && /^[A-Z]{2,4}$/.test(String(v)) ? () => onOpenTeam(String(v)) : null)
                if (isRank(c)) {
                  return (
                    <td key={c.key} className={cls(c, 'rank')} style={{ ...pin, ...(called ? { color: ac } : {}), ...(bgTint || {}) }}>
                      {(() => {
                        if (!c.fmt) return v ?? '—'
                        // a formatter that returns an element (LAMP's CALLED chip on the
                        // rank) is drawn as one; String() printed "[object Object]"
                        const out = c.fmt(v, r)
                        return typeof out === 'string' || typeof out === 'number' ? String(out).replace(/^#/, '') : out
                      })()}
                    </td>
                  )
                }
                if (logoOf(c) && v && v !== '—') {
                  const mark = <TeamMark sport={logoOf(c)} abbr={v} variant="logo" px={18} />   // 14 -> 18 (10-03: "logos need to be bigger")
                  // the column's own link, else the product's team door (lib/teamNav)
                  const open = go || (onOpenTeam && /^[A-Z]{2,4}$/.test(String(v)) ? () => onOpenTeam(String(v)) : null)
                  return <td key={c.key} className={cls(c, 'txt')} title={String(v)} style={{ ...pin, ...(bgTint || {}) }}>{open ? <Tap onClick={open}>{mark}</Tap> : mark}</td>
                }
                const content = c.fmt ? c.fmt(v, r) : (v ?? '—')
                if (isName) {
                  const full = String(typeof content === 'string' ? content : (v ?? ''))
                  const long = typeof content === 'string' && !fits(full)
                  const edge = light ? light.color : rowEdge?.(r) || (called ? ac : null)
                  // the phone sub-line: CALLED · [logo] ATL · v [logo] (+ ★ when watched)
                  const sub = []
                  if (called) sub.push(<span key="st" style={{ color: ac }}>CALLED</span>)
                  let firstTeam = true
                  for (const fc of columns) {
                    if (!folds(fc) || fc.action) continue
                    const fv = r[fc.key]
                    if (isBlank(fv)) continue
                    // a called row has no room for the opponent at 122px (plan: rough edge)
                    if (logoOf(fc)) {
                      // logos only (Donovan 10-02: "just do logos simple"); the code rides the logo's title / alt
                      // the logo is a link like its own column's: the column's link, else the
                      // product's team door (a tap on the sub-line logo used to fall through to the row's player card)
                      if (!(called && !firstTeam)) {
                        const mk = <TeamMark sport={logoOf(fc)} abbr={fv} variant="logo" px={11} />
                        const goTeam = fc.link ? fc.link(r._raw ?? r) : (onOpenTeam && /^[A-Z]{2,4}$/.test(String(fv)) ? () => onOpenTeam(String(fv)) : null)
                        sub.push(<span key={fc.key} data-vs={firstTeam ? undefined : 1} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{firstTeam ? null : 'v '}{goTeam ? <Tap onClick={goTeam}>{mk}</Tap> : mk}</span>)
                      }
                      firstTeam = false
                    } else if (fc.key !== 'role' && !fc._status) {
                      // a short folded value (POS "RB", a G2) rides the sub-line; a long one
                      // (a role sentence) stays on the desktop column only
                      const txt = String(fc.fmt ? fc.fmt(fv, r) : fv)
                      if (txt.length <= 6) {
                        const goT = (fc.key === 'opp' || fc.key === 'team') && onOpenTeam && /^[A-Z]{2,4}$/.test(txt) ? () => onOpenTeam(txt) : null
                        sub.push(<span key={fc.key}>{goT ? <Tap onClick={goT}>{txt}</Tap> : txt}</span>)
                      }
                    }
                  }
                  if (watched) sub.push(<span key="w" style={{ color: ac }}>★</span>)
                  const nameEl = typeof content === 'string'
                    ? <><span className="full">{content}</span><span className="short">{surname(content)}</span></>
                    : content
                  return (
                    <td key={c.key} title={long ? full : textTitle} className={cls(c, `name${long ? ' long' : ''}`)}
                      style={{ ...pin, ...(edge ? { boxShadow: `inset 3px 0 0 ${edge}` } : {}), ...(bgTint || {}), maxWidth: c.w }}>
                      {light && <span title={`Highlight: ${light.name || 'match'}`} style={cellMark(light.color)}>{light.mark || SPOT_MARK}</span>}
                      {faceOf && (() => { const f = faceOf(r); return f ? <PlayerFace {...f} variant="table" size={18} className="dense-face" style={{ margin: '-6px 5px -6px 0' }} /> : null })()}
                      {go ? <Tap onClick={go}>{nameEl}</Tap> : nameEl}
                      {sub.length > 0 && (
                        <div className="sub">{sub.map((x, i) => <span key={i}>{i && !x.props?.['data-vs'] ? ' · ' : i ? ' ' : ''}{x}</span>)}</div>
                      )}
                    </td>
                  )
                }
                const role = c.key === 'role'
                // a number in a text column, sorted: the grade + its arrow
                let tBg = null, tArrow = ''
                if ((c.key === s0 || c.key === s1) && isNumericText(c)) {
                  const n = numOf(v)
                  const [lo, hi] = numericText.get(c.key)
                  const col = Number.isFinite(n) ? (c.invert ? rampColor(hi - (n - lo), lo, hi) : rampColor(n, lo, hi)) : null
                  if (col) tBg = withAlpha(col, c.key === s0 ? SORT_ALPHA : TIE_ALPHA)
                  if (c.key === s0) { const g = seqGlyph(n, medians[c.key]); tArrow = g === DIV_UP || g === DIV_DOWN ? g : '' }
                }
                return (
                  <td key={c.key} title={textTitle} className={cls(c, c.mono || isNumericText(c) ? 'num' : 'txt')}
                    style={{ ...pin, textAlign: isNumericText(c) ? 'right' : 'left', maxWidth: c.w, ...(tBg ? { background: `linear-gradient(${tBg}, ${tBg}), ${C.bg2}` } : bgTint || {}) }}>
                    {role && !isBlank(v)
                      ? (() => {
                          const hue = roleHue(v, C)
                          return <span style={{ border: `1px solid ${hue ? withAlpha(hue, 0.55) : C.border2}`, background: hue ? withAlpha(hue, 0.12) : 'transparent', color: hue || undefined, fontWeight: hue ? 800 : undefined, borderRadius: 5, padding: '2px 6px', fontSize: 11 }}>{go ? <Tap onClick={go}>{content}</Tap> : content}</span>
                        })()
                      : go ? <Tap onClick={go}>{content}</Tap> : content}
                    {tArrow && <span className="arrow" style={{ color: tArrow === DIV_UP ? (C.cream || C.text) : C.text3 }}>{tArrow}</span>}
                  </td>
                )
              }

              // ── numbers
              const num = numOf(v)
              const gone = typeof c.blankWhen === 'function' && c.blankWhen(num, r)
              const isSort = c.key === s0, isTie = c.key === s1
              let bg = !gone && (isSort || isTie) ? gradeOf(c, num, isSort ? SORT_ALPHA : TIE_ALPHA) : null
              let arrow = ''
              let ink = C.text2, weight = 500
              if (!bg && !gone) {
                const so = standout(c, num)
                if (so?.kind === 'top') {
                  bg = withAlpha(ac, STANDOUT_ALPHA[0] + (STANDOUT_ALPHA[1] - STANDOUT_ALPHA[0]) * so.t)
                  ink = C.text; weight = 700
                } else if (so?.kind === 'low') {
                  bg = withAlpha(C.bg, RECEDE_ALPHA)
                  ink = C.text3
                }
              }
              const fld = c.anchor === DIV_FIELD ? fields[c.key] : null
              const divOK = c.scale === 'div' && (c.anchor !== DIV_FIELD || !!fld)
              if (divOK && !gone && (lit(c, num) || isSort)) {
                const d = divTone(num, { anchor: fld ? fld.anchor : (c.anchor ?? 0), ceiling: fld ? fld.ceiling : (c.ceiling ?? 1), deadband: c.deadband ?? 0.08, invert: c.invert === true })
                const warm = d.t != null && Math.abs(d.t) >= (c.deadband ?? 0.08) && (c.invert ? d.t < 0 : d.t > 0)
                if (d.glyph === DIV_UP || d.glyph === DIV_DOWN) {
                  arrow = d.glyph
                  if (warm) { ink = C.cream || C.text; weight = 700 } else ink = C.text3
                }
              } else if (isSort && !gone) {
                arrow = seqGlyph(num, medians[c.key])
                if (arrow !== DIV_UP && arrow !== DIV_DOWN) arrow = ''
              }
              if (isTie) arrow = ''
              // a column's own tone (a box score: zeros recede, hits / RBI warm,
              // ER / HR red) -- the meaning of the number, not a heat wash
              if (typeof c.tone === 'function') { const tn = c.tone(num, r); if (tn?.color) ink = tn.color; if (tn?.weight) weight = tn.weight }
              const shown = gone ? '—' : c.fmt ? c.fmt(v, r) : (Number.isFinite(num) ? num.toFixed(c.dp ?? 0) : '—')
              const titleNum = !Number.isFinite(num) ? '—' : Number.isInteger(num) ? String(num) : num.toFixed(c.dp ?? 2)
              const zero = divOK ? (fld ? fieldLabel(fld, c.dp ?? 1) : (c.anchorLabel || String(c.anchor ?? 0))) : null
              let barEl = null
              if (c.bar && Number.isFinite(num) && !gone) {
                const [lo, hi] = ranges[c.key] || [0, 1]
                const [dlo, dhi] = c.domain && c.domain !== SEQ_AUTO ? c.domain : [lo, hi]
                const f = dhi > dlo ? Math.max(0, Math.min(1, (num - dlo) / (dhi - dlo))) : 0
                barEl = <span className="bar" aria-hidden="true"><i style={{ width: `${Math.round(f * 100)}%`, background: c.bar === 'primary' ? ac : C.text3 }} /></span>
                ink = C.text; weight = 700
              }
              return (
                <td key={c.key} className={cls(c, 'num')}
                  title={`${c.label}: ${titleNum}${zero ? ` · against ${zero}` : ''}`}
                  style={{ ...(bg ? { background: `linear-gradient(${bg}, ${bg}), ${C.bg2}` } : bgTint || {}), color: ink, fontWeight: weight, minWidth: c.w ? Math.min(c.w, 64) : 36 }}>
                  {barEl}{shown}
                  {arrow && <span className="arrow" style={{ color: arrow === DIV_UP ? (C.cream || C.text) : C.text3 }}>{arrow}</span>}
                </td>
              )
            })}
          </tr>
        )
      })}
    </tbody>
  )

  const foot = Array.isArray(footRows) && footRows.length ? (
    <tfoot>
      {footRows.map((fr, fi) => (
        <tr key={`f${fi}`}>
          {columns.map((c) => {
            const v = fr[c.key]
            const isName = c === nameC
            const first = fi === 0 ? { borderTop: `1px solid ${C.border2}` } : {}
            return (
              <td key={c.key} className={cls(c, isName ? 'name' : c.heat === false && !isNumericText(c) ? 'txt' : 'num')}
                style={{ ...(pinStyle(c, false) || {}), ...first, fontWeight: 800, color: isName ? C.text3 : C.text2, ...(isName ? { fontSize: 10, letterSpacing: '.05em' } : {}) }}>
                {v == null ? '' : c.fmt && !isName ? c.fmt(v, fr) : v}
              </td>
            )
          })}
        </tr>
      ))}
    </tfoot>
  ) : null

  const sortWords = sort.map((s, i) => {
    const col = rawColumns.find((c) => c.key === s.key)
    return `${i ? ' then ' : ''}${col?.label || s.key} ${s.dir === 'desc' ? '▼' : '▲'}`
  }).join('')
  const isInitial = JSON.stringify(sort) === JSON.stringify(initialStack())

  return (
    <div className={tight ? 'dtv2 dtv2-tight' : 'dtv2'}>
      <style>{v2Css(C, ac, NUM_FONT)}</style>
      <ExplainBanner label={explain?.label} text={explain?.text} onClose={() => setExplain(null)}
        scoreTerms={scoreTerms} caveat={caveat} accent={accent || ac} art={explain?.art} answers={explain?.answers} />
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, overflow: 'hidden' }}>
        {/* THE SHEET HEAD, only when it says something the table doesn't: a
            title, or a sort you chose (with its reset). At the opening sort the
            header's own ▴ says it, and a head would push the first row down
            (plan: first-row y no lower than classic). */}
        {(title || !isInitial) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 12px', minHeight: 28, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
          {title && <span style={{ font: '800 16px/1.1 system-ui, -apple-system, sans-serif', color: C.text }}>{title}</span>}
          <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>{sorted.length} row{sorted.length === 1 ? '' : 's'}</span>
          <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
            {sort.length ? <>sorted · <b style={{ color: C.text2 }}>{sortWords}</b></> : 'unsorted'}
            {!isInitial && (
              <button type="button" onClick={() => setSort(initialStack())}
                style={{ marginLeft: 8, background: 'none', border: 'none', color: C.text3, textDecoration: 'underline dotted', cursor: 'pointer', fontFamily: NUM_FONT, fontSize: 10, padding: '6px 2px', minHeight: 0 }}>reset</button>
            )}
          </span>
        </div>
        )}
        <div className="dense-wrap">
          <div className="dtv2-scroll kb-rail" ref={railRef} tabIndex={0}
            onKeyDown={(e) => {
              const el = railRef.current
              if (!el) return
              const step = e.shiftKey ? el.clientWidth * 0.9 : 90
              if (e.key === 'ArrowRight') { el.scrollBy({ left: step, behavior: 'smooth' }); e.preventDefault() }
              else if (e.key === 'ArrowLeft') { el.scrollBy({ left: -step, behavior: 'smooth' }); e.preventDefault() }
            }}
            style={{ overflow: 'auto', maxHeight, outline: 'none' }}>
            <style>{`
              .dtv2 .kb-rail::-webkit-scrollbar { height: 7px; width: 7px; display: block; }
              .dtv2 .kb-rail::-webkit-scrollbar-thumb { background: ${withAlpha(ac, 0.35)}; border-radius: 4px; }
              .dtv2 .kb-rail:focus-visible { box-shadow: inset 0 0 0 1.5px ${withAlpha(ac, 0.5)}; }
            `}</style>
            <table>
              <caption className="sr-only">{caption || (onRowClick ? 'Column headers sort; tap a row to open him.' : 'Column headers sort.')}</caption>
              {head}
              {body}
              {foot}
            </table>
          </div>
        </div>
      </div>
      {!bare && <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {(() => {
            const full = caption || 'Colour follows what you sort by: the sorted column is graded, ▲ above the middle of the rows on screen, ▼ below. Click a header to sort, a row to open the hitter.'
            const m = String(full).match(/^([\s\S]*?[.!?])\s+(?=[A-Z“"])/)
            const headTxt = m ? m[1] : full
            const rest = m ? String(full).slice(m[0].length) : ''
            return (
              <div style={{ marginTop: 6 }}>
                {headTxt}{rest && <>{' '}
                  <button type="button" onClick={() => setCapOpen((v) => !v)} style={{ background: 'none', border: 'none', padding: '12px 6px', margin: '-12px -6px', minHeight: 0, cursor: 'pointer', color: C.text2, fontSize: 9.5, textDecoration: 'underline dotted', textUnderlineOffset: 3, fontFamily: 'inherit' }}>{capOpen ? 'less ▴' : 'why ▸'}</button>
                  {capOpen && <> {rest} <b style={{ color: C.text2 }}>Shift-click a header</b> to add it as a tiebreaker. Blanks always sort to the bottom.</>}
                </>}
              </div>
            )
          })()}
          {truncated > 0 && (
            <ShowMoreButton open={false} restN={Math.min(maxRows, truncated)} toggle={() => setExtra((n) => n + maxRows)} itemWord={`of ${sorted.length}`} />
          )}
          {extra > 0 && (
            <ShowMoreButton open restN={0} toggle={() => setExtra(0)} />
          )}
        </div>
        <button type="button" onClick={exportCsv} title="Download this table — current sort, raw values — as a CSV cheat sheet"
          style={{ fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'transparent', color: C.text3, borderRadius: 999, padding: '5px 12px', marginTop: 6 }}>⬇ CSV</button>
      </div>}
    </div>
  )
}
