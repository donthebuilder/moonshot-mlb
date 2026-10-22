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
import { teamHref } from '../../lib/routes'
import { STATUS_WORD } from '../../lib/callStatus'
import PlayerFace from '../PlayerFace'
import CallStatusBadge from '../CallStatusBadge'
import { lockedFor } from '../../lib/members/gate'
import { HiddenCalledLine } from '../MemberGate'
import PlayerNameCell, { PC_GEOM } from './PlayerNameCell'
import { RankMoveCell } from '../RankMove'
import InjuryChip from '../injuries/InjuryChip'
import { ShowMoreButton } from '../ListPreview'
import { flatChip } from '../../lib/chips'
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

// the one short line that explains tiers (it is also the ＋ tier button's tooltip, and it is printed on screen while a tier is being added, so a tap reads it too)
// What may ride the phone sub-line under a name (10-18): a position, with an optional depth number.
const SUB_POS = /^(QB|RB|WR|TE|FB|K|P|DST|DEF|SP|RP|C|1B|2B|3B|SS|LF|CF|RF|DH|OF|IF|UT|LW|RW|D|G|F|PG|SG|SF|PF)\d?$/
// An opponent column (opp, oppTxt, vs, opponent): never under the name.
const OPP_KEY = /^(opp|vs$|opponent)/i
const TIER_HELP = 'Your first column groups the rows (top, middle, bottom). Each column you add puts the rows in order inside their group.'
const headBtn = { background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline dotted', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, padding: '11px 8px', margin: '-11px -2px -11px 4px', minHeight: 0, lineHeight: 1 }
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
    .dtv2 .g-row th > span { height: 18px; line-height: 18px; }
    /* TIERS (2026-10-07): the number of the tier a header holds, and a rule where a tier begins */
    .dtv2 .tier-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 13px; height: 13px; margin-left: 4px; border-radius: 7px; background: ${ac}; color: ${C.bg}; font: 800 10px/1 ${NUM_FONT}; vertical-align: middle; }
    .dtv2 tr.tier-start td { border-top: 2px solid ${withAlpha(ac, 0.6)}; }
    .dtv2 .g-tick { display: inline-block; width: 14px; height: 2px; background: ${ac}; vertical-align: middle; margin-right: 6px; border-radius: 1px; }
    .dtv2 .h-row th { font: 700 9px/1.2 ${NUM_FONT}; letter-spacing: .06em; text-transform: uppercase; color: ${C.text3};
      height: 24px; padding: 0 7px; white-space: nowrap; cursor: pointer; user-select: none; border-bottom: 1px solid ${C.border}; }
    .dtv2 .h-row th.on { color: ${C.text}; box-shadow: inset 0 -2px 0 ${ac}; }
    /* the ⓘ keeps its tap padding but not the line: middle-aligned, no line height of its own */
    .dtv2 .h-row th .explain-dot { vertical-align: middle; line-height: 1; }
    /* on a mouse, the ⓘ's tap padding must not swallow a click meant to sort */
    @media (pointer: fine) { .dtv2 .h-row th .explain-dot { padding: 2px 3px !important; margin: -2px -1px -2px 2px !important; } }
    /* on touch, the ⓘ's tap padding must exist wherever a v2 table renders: MobileCSS only mounts in the app shell, so on /called and /start the ⓘ was a bare 10x11 (check-mobile, landscape). Same box as MobileCSS's, negative margins keep the label where it was. */
    /* 10-18: no info dot in the headers on a touch screen. It sat on the spot you tap to sort or add a tier; the table's one Columns tap explains them all. */
    @media (pointer: coarse) { .dtv2 .h-row th .explain-dot { display: none !important; } }
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
    /* a sub-only column (the opponent, a game) rides the sub-line on desktop too: quiet text, one line under the name */
    .dtv2 .sub.sub-d { display: flex; flex-wrap: wrap; align-items: center; gap: 0 7px; font: 700 9.5px/1.15 ${NUM_FONT}; color: ${C.text3}; letter-spacing: .02em; margin-top: 1px; }
    .dtv2 .sub.sub-d > span:not(.sub-only) { display: none; }
    .dtv2 .sub.sub-d .vs::before { content: 'vs '; opacity: .7; }
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
      /* the pieces of the sub-line (status, club, opponent) wrap onto a second line rather than ending in an \"…\" (2026-10-07: a phone's tap targets are 32px wide, so three of them never fit one 110px line) */
      .dtv2 .sub { display: flex; flex-wrap: nowrap; overflow: hidden; align-items: center; gap: 0 7px; font: 700 8.5px/1.15 ${NUM_FONT}; color: ${C.text3}; letter-spacing: .02em; margin-top: 1px; }
      /* 10-18: the logo under the name is a link, and the site's touch rule gave its button a 32px floor, so every
         row was 50px, not 32px. The layout box is the 11px logo again; the tap box is 9px / 10px of invisible
         padding handed back as negative margin (the player cell's chip trick), so the logo stays a ~30px target. */
      .dtv2 .sub .tap-link, .dtv2 .sub button { min-height: 0 !important; min-width: 0 !important; padding: 9px 10px !important; margin: -9px -10px !important; line-height: 0; }
      /* the dots between the pieces of the sub-line are tight (2026-10-07): spaces around them pushed the opponent off a 122px cell as an "…" */
      .dtv2 .sub .dot { margin: 0 3px; }
      /* a phone shows the whole sub-line again (status, club, opponent), and a called row still drops the opponent's logo */
      .dtv2 .sub.sub-d > span:not(.sub-only) { display: inline; }
      .dtv2 .sub .opp-called { display: none; }
      .dtv2 .sub.sub-d .vs::before { content: none; }
      .dtv2 .sub.sub-d { font-size: 8.5px; }
      /* the availability chip rides the sub-line on a phone (the name cell clips it); inline beside the name elsewhere (lib/injuries) */
      .dtv2 .inj-in { display: none; }
      .dtv2 .long .full { display: none; }
      .dtv2 .long .short { display: inline; }
    }
    /* THE PLAYER NAME CELL (2026-10-13, PLAYER-ROWS; components/table/PlayerNameCell.js). ONE ROW HEIGHT: 52px on a desktop, 58px on a
       phone, for every row, whatever the name or the Why sentence says (the cell is centred; a Why is two clamped lines). The face is
       36px on a phone, 40px on a desktop. The geometry (cell width, face, gap) is PC_GEOM, the component's twin of these numbers. */
    .dtv2-pc td { height: 44px; vertical-align: middle; }
    .dtv2.dtv2-pc td.name, .dtv2.dtv2-pc th.name { width: 200px !important; min-width: 200px !important; max-width: 200px !important; }
    .dtv2.dtv2-pc td.pcell { padding: 0 7px !important; overflow: visible; white-space: normal; }
    .dtv2 .pc { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .dtv2 .pc-face { flex: none; display: inline-flex; margin: 2px; }
    .dtv2 .pc-body { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; flex: 1 1 auto; }
    /* flex, so the spotlight mark (a 9px glyph, 12px with its margin: PlayerNameCell takes it off the name's room) sits BESIDE the name, not on a line of its own */
    .dtv2 .pc-name { display: flex; align-items: baseline; min-width: 0; font-weight: 600; line-height: 1.12; color: ${C.text}; }
    .dtv2 .pc-name .tap-link { display: block; flex: 1 1 auto; min-width: 0; max-width: 100%; text-align: left; }
    .dtv2 .pc-name > .pc-nm { flex: 1 1 auto; min-width: 0; }
    .dtv2 .pc-nm { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    .dtv2 .pc-name[data-fit="surname"] .pc-nm { overflow-wrap: anywhere; }
    .dtv2 .pc-chips { display: flex; align-items: center; flex-wrap: nowrap; gap: 5px; min-height: 13px; font: 800 10px/1.3 ${NUM_FONT}; letter-spacing: .04em; color: ${C.text3}; white-space: nowrap; }
    .dtv2 .pc-chip { display: inline-flex; align-items: center; flex: none; }
    .dtv2 .pc-chip img { display: block; }
    /* the site's touch rule gives every button a 32px floor; here the 44px target is the ::after hit box (.tap-link), the layout box stays the text's */
    .dtv2 .pc .tap-link { min-height: 0 !important; min-width: 0 !important; padding: 0 !important; line-height: inherit; }
    /* a chip's tap box is 9px (10px sideways) of invisible padding, handed back as negative margin: the logo (14px) is a 32px target, the layout does not move */
    .dtv2 .pc-chip .tap-link { padding: 9px 10px !important; margin: -9px -10px !important; }
    /* the rank move's 32px tap box needs a rank column of at least that width; a table with a fixed name cell lets the auto layout squeeze it (landscape, 844px) */
    @media (min-width: 641px) { .dtv2-pc td.rank, .dtv2-pc th.rank { min-width: 36px; } }
    /* 2026-10-13: the star is a 44px thumb target on every touch screen, not only under 640px (a phone turned sideways is 844 wide). The row is 36px here, so -4px keeps its height. */
    @media (pointer: coarse) and (min-width: 641px) {
      .dtv2 td.dense-action button { height: 44px !important; min-height: 44px !important; width: 44px !important; margin: -4px 0 !important; }
      .dtv2 td.dense-action, .dtv2 .h-row th.act { width: 44px !important; min-width: 44px !important; max-width: 44px !important; }
    }
    @media (max-width: 640px) {
      .dtv2-pc td { height: 40px; }
      .dtv2.dtv2-pc52 td { height: 40px; }   /* compactPhoneRow: 52px on a phone too (LAMP watchlist) */
      .dtv2.dtv2-pc td.name, .dtv2.dtv2-pc th.name { width: 156px !important; min-width: 156px !important; max-width: 156px !important; }
      .dtv2.dtv2-pc td.pcell { padding: 0 6px !important; }
      /* wideName (a column flag, 2026-10-20, the Card on a phone): a name cell that holds a logo and a full name at 156px, the
         shared player cell's phone width, instead of the 122px default */
      .dtv2.dtv2-nw td.name, .dtv2.dtv2-nw th.name { width: 156px !important; min-width: 156px !important; max-width: 156px !important; }

      /* 40px rows (10-18): one line of name (the cell picks the surname when the full name does not fit), chips under it */
      .dtv2 .pc-nm { -webkit-line-clamp: 1; white-space: nowrap; text-overflow: ellipsis; display: block; }
      .dtv2 .pc-body { gap: 1px; }
      .dtv2 .pc { gap: 7px; }
    }
    @media (max-width: 370px) {
      /* the smallest phones (360): 136px, and the name may wrap to a second line rather than lose letters */
      .dtv2.dtv2-nw td.name, .dtv2.dtv2-nw th.name { width: 136px !important; min-width: 136px !important; max-width: 136px !important; }
      .dtv2.dtv2-nw td.name .nw-wrap { white-space: normal !important; }
      .dtv2.dtv2-nw td.name .nw-wrap .tap-link { white-space: normal !important; overflow: visible !important; }
    }
  `
}

// A CLUB CODE IN A TEXT CELL (nav audit 10-06): an opponent / team column's code
// ("UTA", LAMP's "@BUF") is a club link; the code is what the door gets, never the "@".
// THE OPPONENT IS QUIET TEXT (CLAUDE.md; Donovan 10-18: "the fucking logos for both teams ... one team logo is fine").
// His club is the logo; an opponent column (opp / oppTxt / lastOpp / vs / opponent) draws its code in quiet text, still the
// club's link. A sticky column is the row's own identity (h2h's Opponent rows), so it keeps its logo.
const OPP_RE = /^(opp|lastopp|vs\b|vs$|opponent)/i
const isOppCol = (c) => !c.sticky && OPP_RE.test(String(c.key))
const quietCode = (code, away, open, sport = null) => {
  const t = <span data-opp="" style={{ fontSize: 11, fontWeight: 600, opacity: 0.62, letterSpacing: '.02em' }}>{away ? '@' : ''}{code}</span>
  if (open) return <Tap onClick={open}>{t}</Tap>
  // no team handler on this table: the club's own page, so the code is still a link (check-clickable caught 'ARI' on the card)
  const href = sport ? teamHref(sport, code) : null
  return href ? <a href={href} className="tap-box" style={{ color: 'inherit', textDecoration: 'none' }}>{t}</a> : t
}
const teamCodeOf = (key, v) => {
  if (!/^(opp|team)/i.test(String(key))) return null
  const m = /^@?\s*([A-Z]{2,4})$/.exec(String(v ?? '').trim())
  return m ? m[1] : null
}

/**
 * renderV2(ctx): the v2 sheet. ctx carries DenseTable's own state and props.
 */
export function renderV2(ctx) {
  const {
    C, NUM_FONT, ac, columns: rawColumns, view, sorted, sort, setSort, toggle, ranges, fields, lit,
    heatMode = 'full', ramp, rowEdge, faceOf, onRowClick, dimRow, pick, rowPid, pickColorOf, firstMatch,
    explain, setExplain, dict, scoreTerms, caveat, accent, maxHeight, caption,
    truncated, maxRows, moreStep = 0, extra, setExtra, exportCsv, railRef, statusOf, gateOf = null, title, initialStack, firstTextKey,
    capOpen, setCapOpen, bare, footRows, tight, noGroups, onOpenTeam = null, sport = null, injuryLayer = null,
    adding = false, setAdding = () => {}, tierSig = null, phone = false, nameCell = null, compactPhoneRow = false,
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
    const col = { key: '_status', label: 'Status', heat: false, _status: true, _g: g, w: 118, title: `${STATUS_WORD.called}: our pick. ${STATUS_WORD.board}: inside the board, not picked. ${STATUS_WORD.off}: outside the board.` }
    return [...ordered.slice(0, at + 1), col, ...ordered.slice(at + 1)]
  })()
  // SUB-ONLY COLUMNS (2026-10-10, Donovan: "we dont need opp as a column on the rankings it takes up space"):
  // a column tagged `subOnly` is not drawn as a column at any width. Its value rides the sub-line under the
  // player's name on desktop and on a phone, so the opponent / game stays one glance and one tap away (the link
  // is the column's own) while the table spends no width on it.
  const vis = columns.filter((c) => !c.subOnly)
  // the # column: tagged, or the plain '#' text column every board uses
  const isRank = (c) => c.rankCol === true || (c.rankCol !== false && c.heat === false && String(c.label).trim() === '#')
  const rankC = columns.find(isRank)
  const nameC = columns.find((c) => c.sticky && c.heat === false) || columns.find((c) => c.key === firstTextKey)
  // THE PLAYER NAME CELL (2026-10-13): `nameCell: 'player'` on the table (or on its name column) draws components/table/PlayerNameCell.js
  const pcell = nameCell === 'player' || nameC?.nameCell === 'player'
  const wideName = !pcell && Boolean(nameC?.wideName)
  // the 'call' group's other text columns fold into the phone sub-line
  const callKey = nameC?._g?.key ?? null
  // (or a column tagged `fold`, for tables without groups)
  const folds = (c) => c !== nameC && !isRank(c) && (c.fold === true || c.subOnly === true
    // the player cell's chips carry his club on a phone: its own logo column folds away there (the desktop keeps it)
    || (pcell && /^(team|tm)$/.test(c.key) && !!logoOf(c))
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
  // A HIGHLIGHT WASH MUST COVER EVERY CELL OF ITS ROW (2026-10-07, Donovan: "the white band in the middle").
  // A cell with its own fill (a standout, a receded cell, a sorted grade) used to REPLACE the row's highlight
  // wash instead of sitting under it, so a highlighted row read as bands: washed in the pinned cells and the
  // empty ones, bare across the graded ones, with a step in the row rule where the two met. The wash is a
  // layer now: the highlight over the cell's own fill over the sheet.
  const layers = (...cols) => {
    const l = cols.filter(Boolean)
    return l.length ? { background: `${l.map((x) => `linear-gradient(${x}, ${x})`).join(', ')}, ${C.bg2}` } : null
  }
  const groupStart = new Set()
  vis.forEach((c, i) => { if (i > 0 && c._g && c._g.key !== vis[i - 1]._g?.key) groupStart.add(c.key) })

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
          {(() => {
            // ONE CELL PER GROUP (2026-10-07, Donovan: "words half-cut"). The label used to hang off the
            // group's first column, so a table scrolled sideways cut "MODEL SCORES" to "DEL SCORES" under
            // the pinned name. Now a group is one cell spanning its columns and the label is sticky: it
            // stays at the pinned edge while any part of its group is on screen. A column a phone folds
            // away is not counted there (`phone`, DenseTable's own matchMedia at 640px).
            const pinW = (rankC ? (phone ? 26 : (rankC.w || 40)) : 0) + (nameC ? (pcell ? (phone ? PC_GEOM.phone.cell : PC_GEOM.desk.cell) : phone ? (wideName ? 156 : 122) : (nameC.w || 150)) : 0)
            const runs = []
            vis.forEach((c) => {
              const key = c._g?.key ?? null
              const last = runs[runs.length - 1]
              if (last && last.key === key) last.cols.push(c)
              else runs.push({ key, g: c._g || null, cols: [c] })
            })
            return runs.map((run, ri) => {
              const shown = run.cols.filter((c) => !(phone && folds(c)))
              if (!shown.length) return null
              const pinned = run.cols.some((c) => c === rankC || c === nameC)
              const first = run.cols[0]
              const label = run.g ? run.g.label : null
              return (
                <th key={`${run.key ?? 'none'}-${ri}`} colSpan={shown.length} className={groupStart.has(first.key) ? 'g0' : ''} style={{ position: 'relative', zIndex: 4 }}>
                  {label ? <span style={{ position: 'sticky', left: pinned ? 8 : pinW + 8, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', pointerEvents: 'none' }}><span className="g-tick" />{label}</span> : null}
                </th>
              )
            })
          })()}
        </tr>
      )}
      <tr className="h-row">
        {vis.map((c) => {
          const si = sort.findIndex((x) => x.key === c.key)
          const on = si >= 0
          const dir = on ? sort[si].dir : null
          const plain = c.explain || (dict ? explainFrom(dict, c.term, c.key, c.label) : explainFor(c.term, c.key, c.label)) || (c.answers ? ANSWERS[c.answers]?.what : null)
          return (
            <th key={c.key} scope="col" aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={cls(c, [on ? 'on' : '', isRank(c) ? 'rank' : '', c === nameC ? 'name' : '', c.action ? 'act' : '', /\s/.test(String(c.label || '').trim()) && String(c.label).length > 9 ? 'long' : ''].filter(Boolean).join(' '))}
              onClick={c._status ? undefined : (e) => toggle(c.key, e.shiftKey)}
              title={`${c.title || c.label}\n\nTap to sort. To sort in tiers: tap \uff0b Tiers, then tap the next column.`}
              style={{ ...(pinStyle(c, true) || {}), textAlign: (c.heat === false && !isNumericText(c)) || c.action ? 'left' : 'right', width: logoOf(c) ? (c.code ? 58 : 34) : c.w, minWidth: logoOf(c) ? (c.code ? 58 : 34) : (c === rankC || c === nameC ? c.w : undefined) }}>
              {String(c.label || '').trim() ? c.label : <span className="sr-only">{c.title || c.key || 'Column'}</span>}
              {plain && (
                <span style={{ opacity: explain?.key === c.key ? 1 : 0.55 }}>
                  <InfoDot on={explain?.key === c.key}
                    onClick={() => setExplain((cur) => (cur?.key === c.key ? null : { key: c.key, label: c.label, text: plain, art: c.art || null, answers: c.answers || null }))} />
                </span>
              )}
              {on && <>{dir === 'desc' ? ' ▾' : ' ▴'}{sort.length > 1 && <span className="tier-badge" title={`Tier ${si + 1} of ${sort.length}`}>{si + 1}</span>}</>}
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
        const gate = gateOf ? gateOf(r) : null
        // THE MEMBERS GATE (components/MemberGate.js; Donovan 2026-10-16 "just show them as ON THE BOARD"): a CALLED row the viewer may not read IS an ON THE BOARD row
        // from here down (stamp, accent, edge, chips, sub-line), so nothing else needs to know. Graded / started rows and everyone else keep the real status.
        const status0 = withStatus ? statusOf(r) : null
        const status = gate && lockedFor({ status: status0, started: gate.started, graded: gate.graded, key: gate.key, free: gate.free, memberState: 'free' }) ? 'board' : status0
        const called = status === 'called'
        const watched = columns.some((c) => c.action && r[c.key])
        // a rule where a tier begins (two or more sort keys, lib/multiSort.js)
        const sig = tierSig ? tierSig(r) : ''
        const tierStart = ri > 0 && sig !== '' && sig !== tierSig(view[ri - 1])
        return (
          <tr key={r._key ?? ri} onClick={onRowClick ? () => onRowClick(r._raw ?? r) : undefined}
            title={light ? `Highlight: ${light.name || 'match'}` : undefined}
            className={`${onRowClick ? 'dtv2-row dtv2-click dense-row dense-click' : 'dtv2-row dense-row'}${tierStart ? ' tier-start' : ''}`}
            style={{ opacity: dimRow?.(r) ? 0.42 : 1 }}>
            {vis.map((c) => {
              const v = r[c.key]
              const pin = pinStyle(c, false) || {}
              const bgTint = tint ? { background: `linear-gradient(${tint}, ${tint}), ${C.bg2}` } : null

              if (c.action) {
                const on = !!v && v !== 0
                // `show(row)` false: no control in this row (a slip '+' with no real price is not drawn), the cell stays so the columns line up
                if (c.show && !c.show(r._raw ?? r)) return <td key={c.key} className={cls(c, 'dense-action')} style={{ padding: 0, ...pin, ...(bgTint || {}) }} />
                return (
                  <td key={c.key} className={cls(c, 'dense-action')} style={{ textAlign: 'center', padding: 0, ...pin, ...(bgTint || {}) }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); c.onAction?.(r._raw ?? r) }}
                      title={on ? (c.titleOn || 'Remove') : (c.titleOff || 'Add')} aria-label={on ? (c.titleOn || 'Remove') : (c.titleOff || 'Add')} aria-pressed={on}
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
                const go = c.link ? c.link(r._raw ?? r) : (!isName && onOpenTeam && teamCodeOf(c.key, v) ? () => onOpenTeam(teamCodeOf(c.key, v)) : null)
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
                      {/* RANK MOVE (2026-10-10): places moved since the last update, under the number (components/RankMove.js). Information only. */}
                      {r.rankMove?.move ? <RankMoveCell cell={r.rankMove} block up={ac} down={C.text3} size={phone ? 10 : 9.5} style={{ marginTop: 2 }} /> : null}
                    </td>
                  )
                }
                if (logoOf(c) && isOppCol(c) && v && v !== '—') {
                  const code = String(v).replace(/^@\s*/, '')
                  const open = go || (onOpenTeam && /^[A-Z]{2,4}$/.test(code) ? () => onOpenTeam(code) : null)
                  return <td key={c.key} className={cls(c, 'txt')} title={code} style={{ ...pin, ...(bgTint || {}) }}>{quietCode(code, /^@/.test(String(v)), open, logoOf(c))}</td>
                }
                if (logoOf(c) && v && v !== '—' && !/^tie$/i.test(String(v))) {   // a tied meeting (h2h Winner) has no club to draw
                  const mark = <TeamMark sport={logoOf(c)} abbr={v} variant="logo" px={18} />   // 14 -> 18 (10-03: "logos need to be bigger")
                  // `code` (fix5-nflgame, 10-06): a one-game table names the club beside its logo
                  const markCode = c.code ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{mark}<span style={{ fontSize: 12, fontWeight: 700, color: 'inherit' }}>{String(v)}</span></span> : mark
                  // the column's own link, else the product's team door (lib/teamNav)
                  const open = go || (onOpenTeam && /^[A-Z]{2,4}$/.test(String(v)) ? () => onOpenTeam(String(v)) : null)
                  return <td key={c.key} className={cls(c, 'txt')} title={String(v)} style={{ ...pin, ...(bgTint || {}) }}>{open ? <Tap onClick={open}>{markCode}</Tap> : markCode}</td>
                }
                const content = c.fmt ? c.fmt(v, r) : (v ?? '—')
                // A TEAM / OPPONENT CODE IN A TEXT CELL IS THE CLUB'S LOGO (2026-10-15, Donovan 10-02 / 10-14: a club is its
                // logo, never "TB" in text). One rule for every sport's Opp / Vs / Team column: the code rides the logo's
                // title / alt, LAMP's "@BUF" keeps a quiet "@", and the cell stays the club's link (the column's own, else the team door).
                const clubCode = !isName && c.key !== 'role' && typeof content !== 'object' && sport ? teamCodeOf(c.key, content) : null
                if (clubCode && isOppCol(c)) {
                  return <td key={c.key} className={cls(c, 'txt')} title={clubCode} style={{ ...pin, ...(bgTint || {}) }}>{quietCode(clubCode, /^@/.test(String(content).trim()), go, sport)}</td>
                }
                if (clubCode) {
                  const away = /^@/.test(String(content).trim())
                  const mk = <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, verticalAlign: 'middle' }}>{away ? <span aria-hidden="true" style={{ opacity: 0.5 }}>@</span> : null}<TeamMark sport={sport} abbr={clubCode} variant="logo" px={18} /></span>
                  return <td key={c.key} className={cls(c, 'txt')} title={clubCode} style={{ ...pin, ...(bgTint || {}) }}>{go ? <Tap onClick={go}>{mk}</Tap> : mk}</td>
                }
                if (isName) {
                  const full = String(typeof content === 'string' ? content : (v ?? ''))
                  const long = typeof content === 'string' && !fits(full)
                  const edge = light ? light.color : rowEdge?.(r) || (called ? ac : null)
                  // the phone sub-line: CALLED · [logo] ATL · v [logo] (+ ★ when watched)
                  // availability beside the call (lib/injuries): CALLED stays callStatus's word, the chip says OUT / Q / D beside it. Information only.
                  const rawRow = r._raw ?? r
                  const injEntry = injuryLayer?.entryFor ? injuryLayer.entryFor({ player_id: rawRow.player_id ?? rawRow.playerId, name: rawRow.name ?? rawRow.player ?? (typeof content === 'string' ? content : ''), team: rawRow.team }) : null
                  const sub = []
                  if (called) sub.push(<span key="st" style={{ color: ac }}>CALLED</span>)
                  let firstTeam = true
                  for (const fc of columns) {
                    if (!folds(fc) || fc.action) continue
                    const fv = r[fc.key]
                    if (isBlank(fv)) continue
                    if (logoOf(fc)) {
                      // ONE LOGO UNDER THE NAME (Donovan 10-18: "one team logo is fine, not all this other extra shit
                      // under the name"): his club only. The opponent left the sub-line, as it left the player name
                      // cell on 10-14; the matchup is on every page already. The logo alone; the code rides its title / alt.
                      if (!firstTeam || OPP_KEY.test(fc.key)) continue
                      const mk = <TeamMark sport={logoOf(fc)} abbr={fv} variant="logo" px={11} />
                      const goTeam = fc.link ? fc.link(r._raw ?? r) : (onOpenTeam && /^[A-Z]{2,4}$/.test(String(fv)) ? () => onOpenTeam(String(fv)) : null)
                      sub.push(<span key={fc.key} style={{ display: 'inline-flex', alignItems: 'center' }}>{goTeam ? <Tap onClick={goTeam}>{mk}</Tap> : mk}</span>)
                      firstTeam = false
                    } else if (fc.key !== 'role' && !fc._status) {
                      // a short folded value (POS "RB", a G2) rides the sub-line; a long one
                      // (a role sentence) stays on the desktop column only. A sub-only value (the
                      // opponent, a game) is always short enough and keeps its own link.
                      const txt = String(fc.fmt ? fc.fmt(fv, r) : fv)
                      // 10-18: under the name rides a position (WR, RB1, LW, SS) or a sub-only label that tells a
                      // player's rows apart (the market on the calls sheet, LAMP's game). A line ("1+"), the
                      // opponent and other short codes stay in their own columns.
                      // His club as a text code (Pairs' "LA") is his logo, the same one logo as a logo column.
                      const ownCode = sport && !OPP_KEY.test(fc.key) ? teamCodeOf(fc.key, txt) : null
                      if (ownCode && !firstTeam) continue
                      if (ownCode) firstTeam = false
                      if (ownCode || (fc.subOnly ? !OPP_KEY.test(fc.key) : SUB_POS.test(txt.trim()))) {
                        const goT = fc.link ? fc.link(r._raw ?? r) : (onOpenTeam && teamCodeOf(fc.key, txt) ? () => onOpenTeam(teamCodeOf(fc.key, txt)) : null)
                        const subCode = sport ? teamCodeOf(fc.key, txt) : null   // an opponent / team code is its logo, not text
                        const shownTxt = subCode ? <TeamMark sport={sport} abbr={subCode} variant="logo" px={11} /> : txt
                        sub.push(<span key={fc.key} data-cls={fc.subOnly ? `sub-only${fc.key === 'opp' && /^[A-Z]{2,4}$/.test(txt) ? ' vs' : ''}` : undefined}>{goT ? <Tap onClick={goT}>{shownTxt}</Tap> : shownTxt}</span>)
                      }
                    }
                  }
                  if (watched) sub.push(<span key="w" style={{ color: ac }}>★</span>)
                  if (injEntry) sub.push(<span key="inj"><InjuryChip entry={injEntry} C={C} font={NUM_FONT} size={8.5} style={{ marginLeft: 0 }} /></span>)
                  if (pcell) {
                    // THE PLAYER NAME CELL (2026-10-13): face, a name that fits, one line of chips; the row is one height
                    // (components/table/PlayerNameCell.js). Chips in a fixed order: position, club logo + opponent, the call, the injury, the star.
                    const nm = String(rawRow.name ?? rawRow.player ?? (typeof content === 'string' ? content : (v ?? '')))
                    const rowTeam = String(rawRow.team ?? r.team ?? '').toUpperCase()
                    const chips = []
                    const posC = columns.find((x) => x !== nameC && !x.action && /^(pos|position)$/.test(x.key))
                    const posV = posC ? r[posC.key] : (r.pos ?? rawRow.pos ?? null)
                    const posTxt = isBlank(posV) ? '' : String(posC?.fmt && typeof posC.fmt(posV, r) === 'string' ? posC.fmt(posV, r) : posV).slice(0, 6)
                    if (posTxt) chips.push({ key: 'pos', prio: 2, phoneOnly: true, text: posTxt, node: <span className="pc-pos">{posTxt}</span> })
                    const clubC = columns.find((x) => x !== nameC && logoOf(x) && /^(team|tm)$/.test(x.key))
                    const clubV = clubC ? r[clubC.key] : rowTeam
                    const sportKey = clubC ? logoOf(clubC) : (columns.map(logoOf).find(Boolean) || null)
                    if (sportKey && !isBlank(clubV) && /^[A-Z]{2,4}$/.test(String(clubV))) {
                      const openClub = clubC?.link ? clubC.link(rawRow) : (onOpenTeam ? () => onOpenTeam(String(clubV)) : null)
                      const mk = <TeamMark sport={sportKey} abbr={String(clubV)} variant="logo" px={phone ? 14 : 16} />
                      chips.push({ key: 'club', prio: 1, phoneOnly: true, fixedW: phone ? 14 : 16, node: openClub ? <Tap onClick={openClub} title={String(clubV)}>{mk}</Tap> : mk })
                    }
                    // no opponent chip (Donovan, 2026-10-14: "dont even show the opp, it takes too much space" -- the matchup is on every page already)
                    // the call word: the caller's own status (callStatus), CALLED in the product's accent; a desktop table with a Status column of its own lets the column say it
                    const hasStatusCol = columns.some((x) => x._status || x.statusCol)
                    if (called) chips.push({ key: 'call', prio: 0, phoneOnly: hasStatusCol, text: 'CALLED', node: <CallStatusBadge status="called" accent={ac} variant="text" style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.06em' }} /> })
                    if (injEntry) chips.push({ key: 'inj', prio: 1, fixedW: 36, node: <InjuryChip entry={injEntry} C={C} font={NUM_FONT} size={9} style={{ marginLeft: 0 }} /> })
                    if (watched) chips.push({ key: 'star', prio: 4, fixedW: 10, node: <span style={{ color: ac }}>★</span> })
                    const fc = faceOf ? faceOf(r) : null
                    const faceEl = <PlayerFace {...(fc || { sport: 'none' })} name={nm} variant="row" size={phone ? PC_GEOM.phone.face : PC_GEOM.desk.face} ring={withAlpha(ac, 0.55)} theme={C} />
                    return (
                      <td key={c.key} title={textTitle} className={cls(c, 'name pcell')}
                        style={{ ...pin, ...(edge ? { boxShadow: `inset 3px 0 0 ${edge}` } : {}), ...(bgTint || {}) }}>
                        <PlayerNameCell name={nm} face={faceEl} chips={chips} phone={phone} numFont={NUM_FONT}
                          mark={light ? <span title={`Highlight: ${light.name || 'match'}`} style={cellMark(light.color)}>{light.mark || SPOT_MARK}</span> : null}
                          onOpen={go || (onRowClick ? () => onRowClick(rawRow) : null)} />
                      </td>
                    )
                  }
                  const nameEl = typeof content === 'string' && !c.plain   // plain: a label that is not a person's name (a date, a split) keeps its whole text on a phone
                    ? <><span className="full">{content}</span><span className="short">{surname(content)}</span></>
                    : content
                  return (
                    <td key={c.key} title={long ? full : textTitle} className={cls(c, `name${long ? ' long' : ''}`)}
                      style={{ ...pin, ...(edge ? { boxShadow: `inset 3px 0 0 ${edge}` } : {}), ...(bgTint || {}), maxWidth: c.w }}>
                      {light && <span title={`Highlight: ${light.name || 'match'}`} style={cellMark(light.color)}>{light.mark || SPOT_MARK}</span>}
                      {faceOf && (() => { const f = faceOf(r); return f ? <PlayerFace {...f} variant="table" size={18} className="dense-face" style={{ margin: '-6px 5px -6px 0' }} /> : null })()}
                      {go ? <Tap onClick={go}>{nameEl}</Tap> : nameEl}
                      {injEntry && <span className="inj-in"><InjuryChip entry={injEntry} C={C} font={NUM_FONT} size={8.5} /></span>}
                      {sub.length > 0 && (
                        <div className={`sub${columns.some((x) => x.subOnly) ? ' sub-d' : ''}`}>{sub.map((x, i) => <span key={i} className={x?.props?.['data-cls'] || undefined}>{x}</span>)}</div>
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
                    style={{ ...pin, textAlign: isNumericText(c) ? 'right' : 'left', maxWidth: role ? undefined : c.w, ...(role ? { overflow: 'visible' } : {}), ...(layers(tint, tBg) || {}) }}>
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
                barEl = <span className="bar" aria-hidden="true" style={c.barW ? { width: c.barW } : undefined}><i style={{ width: `${Math.round(f * 100)}%`, background: c.bar === 'primary' ? ac : C.text3 }} /></span>
                ink = C.text; weight = 700
              }
              return (
                <td key={c.key} className={cls(c, 'num')}
                  title={`${c.label}: ${titleNum}${zero ? ` · against ${zero}` : ''}`}
                  style={{ ...(layers(tint, bg) || {}), color: ink, fontWeight: weight, minWidth: c.w ? Math.min(c.w, 64) : 36 }}>
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
          {vis.map((c) => {
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
    <div className={`dtv2${tight ? ' dtv2-tight' : ''}${pcell ? ' dtv2-pc' : ''}${pcell && compactPhoneRow ? ' dtv2-pc52' : ''}${wideName ? ' dtv2-nw' : ''}`}>
      <style>{v2Css(C, ac, NUM_FONT)}</style>
      <ExplainBanner label={explain?.label} text={explain?.text} onClose={() => setExplain(null)}
        scoreTerms={scoreTerms} caveat={caveat} accent={accent || ac} art={explain?.art} answers={explain?.answers} />
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, overflow: 'hidden' }}>
        {/* THE SHEET HEAD, only when it says something the table doesn't: a
            title, or a sort you chose (with its reset). At the opening sort the
            header's own ▴ says it, and a head would push the first row down
            (plan: first-row y no lower than classic). */}
        {(title || !isInitial || adding) && (
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 12px', minHeight: 28, flexWrap: 'wrap' }}>
          {title && <span style={{ font: '800 16px/1.1 system-ui, -apple-system, sans-serif', color: C.text }}>{title}</span>}
          <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>{sorted.length} row{sorted.length === 1 ? '' : 's'}</span>
          <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10, color: C.text3, display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            {sort.length ? <>sorted · <b style={{ color: C.text2 }}>{sortWords}</b></> : 'unsorted'}
            {sort.length > 0 && !adding && (
              <button type="button" onClick={() => setAdding(true)} title={TIER_HELP} aria-label={`Add a tier. ${TIER_HELP}`} style={headBtn}>{'\uff0b'} tier</button>
            )}
            {!isInitial && (
              <button type="button" onClick={() => { setAdding(false); setSort(initialStack()) }} title="Back to the opening order" style={headBtn}>reset</button>
            )}
          </span>
        </div>
        {adding && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 6px', fontFamily: NUM_FONT, fontSize: 10, lineHeight: 1.4, color: C.text2, flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 200px', minWidth: 0 }}><b style={{ color: ac }}>Tap a column header to add tier {sort.length + 1}.</b> {TIER_HELP}</span>
            <button type="button" onClick={() => setAdding(false)} style={headBtn}>cancel</button>
          </div>
        )}
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
      {gateOf && gateOf.hidden > 0 && <HiddenCalledLine n={gateOf.hidden} C={C} NUM_FONT={NUM_FONT} style={{ marginTop: 2 }} />}
      {!bare && <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* THE COLOUR KEY (10-18, Donovan: someone said they don't understand the colours): one line of
              swatches instead of a sentence, and ONE Columns tap that explains every column at once (the
              per-header info dot is gone on touch screens: it sat on the spot you tap to sort or add a tier). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginTop: 6, fontSize: 11, lineHeight: 1.3, color: C.text3 }}>
            {heatMode !== 'none' && <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: withAlpha(ac, 0.34), display: 'inline-block' }} />top 20%</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: C.bg, border: `1px solid ${C.border}`, display: 'inline-block' }} />bottom 20%</span>
              <span>▲▼ vs the middle</span>
            </>}
            <button type="button" className="tap-box" onClick={() => setCapOpen((v) => !v)} aria-expanded={capOpen}
              style={{ background: 'none', border: 'none', padding: '14px 8px', margin: '-14px -8px', minHeight: 0, cursor: 'pointer', color: capOpen ? ac : C.text2, fontSize: 11, fontWeight: 700, textDecoration: 'underline dotted', textUnderlineOffset: 3, fontFamily: 'inherit' }}>{capOpen ? 'Columns ▴' : 'Columns ▸'}</button>
          </div>
          {capOpen && (
            <div style={{ marginTop: 8, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, lineHeight: 1.45, color: C.text2 }}>
              {caption ? <div style={{ marginBottom: 6 }}>{caption}</div> : null}
              {columns.filter((c) => !c._status && !isRank(c) && !c.action && String(c.label || '').trim()).map((c) => {
                const plain = c.explain || (dict ? explainFrom(dict, c.term, c.key, c.label) : explainFor(c.term, c.key, c.label)) || (c.answers ? ANSWERS[c.answers]?.what : null)
                if (!plain) return null
                return (
                  <div key={c.key} style={{ padding: '3px 0' }}>
                    <b style={{ color: C.text, fontFamily: NUM_FONT, fontSize: 11, letterSpacing: '.04em' }}>{c.label}</b>{' '}{typeof plain === 'string' ? plain : null}
                    {(c.art || c.answers) && <button type="button" onClick={() => setExplain({ key: c.key, label: c.label, text: plain, art: c.art || null, answers: c.answers || null })}
                      style={{ background: 'none', border: 'none', padding: '10px 6px', margin: '-10px -2px -10px 4px', minHeight: 0, cursor: 'pointer', color: ac, fontSize: 11, fontFamily: 'inherit' }}>more ›</button>}
                  </div>
                )
              })}
              <div style={{ marginTop: 6, color: C.text3 }}><b style={{ color: C.text2 }}>Tiers:</b> tap {'＋'} Tiers, then a header. {TIER_HELP} Blanks sort last.</div>
            </div>
          )}
          {truncated > 0 && (
            <ShowMoreButton open={false} restN={truncated} total={sorted.length} toggle={() => setExtra(sorted.length)} />
          )}
          {extra > 0 && (
            <ShowMoreButton open restN={0} toggle={() => setExtra(0)} />
          )}
        </div>
        <button type="button" className="tap-box" onClick={() => setAdding(!adding)} title={TIER_HELP} aria-pressed={adding}
          style={{ ...flatChip(adding, ac, C, NUM_FONT), marginTop: 6 }}>{'\uff0b'} Tiers</button>
        <button type="button" className="tap-box" onClick={exportCsv} title="Download this table — current sort, raw values — as a CSV cheat sheet"
          style={{ ...flatChip(false, ac, C, NUM_FONT), marginTop: 6 }}>⬇ CSV</button>
      </div>}
    </div>
  )
}
