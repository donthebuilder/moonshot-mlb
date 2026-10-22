// Every table column carries a `group` (CLAUDE.md: "Every table's columns carry a `group`, in order").
//   node scripts/check-table-groups.mjs            fails on a column literal with no group
//   node scripts/check-table-groups.mjs --list     print every offender
//
// A column literal is an object with both `key:` and `label:` inside a file that draws a DenseTable (or
// NflTable / LampTable / BucketsTable). Group may be written as `group:`, or a spread of another column
// (`...c`, `...whyCol`), which carries its own. Files where columns come from a lib builder are checked at the
// builder (lib/boardColumns.js etc. are scanned too).
//
// BASELINE: the MOONSHOT reference tables (Donovan: do not restyle) and a few older tables were written before the
// rule; their ungrouped columns are listed below by file with their count. The check fails when a file's count GOES UP,
// when a file not listed has any, and when a listed file now has fewer (lower the number: the ratchet only turns one way).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BASELINE = JSON.parse(readFileSync(new URL('./check-table-groups.baseline.json', import.meta.url), 'utf8'))
const SKIP_DIR = new Set(['node_modules', '.next', 'ARCHIVE', '.git', 'mobile-report'])
const files = []
const walk = (d) => { for (const n of readdirSync(d)) { if (SKIP_DIR.has(n)) continue; const p = join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else if (/\.js$/.test(n)) files.push(p) } }
for (const d of ['components', 'lib', 'app']) walk(d)

const TABLE = /<(DenseTable|NflTable|LampTable|BucketsTable|Table)\b|\bcolumns\s*[:=]|boardColumns|Columns\(/
const MENU_ARRAYS = new Set(['games', 'teams', 'filters', 'toggles', 'groups', 'items', 'chips', 'tabs', 'options'])
/** The name the nearest named, still-open array literal before `at` is assigned to (`games={[` / `items: [`), or null. Skips a `[` that opens
 *  a ternary or spread branch and keeps going outward. */
function enclosingArrayName(src, at) {
  let depth = 0, seen = 0
  for (let k = at - 1, lim = Math.max(0, at - 4000); k >= lim; k--) {
    const ch = src[k]
    if (ch === ']' || ch === ')' || ch === '}') depth++
    else if (ch === '(' || ch === '{') { if (depth) depth--; }
    else if (ch === '[') {
      if (depth) { depth--; continue }
      const m = /(\w+)\s*[:=]\s*\{?\s*$/.exec(src.slice(Math.max(0, k - 80), k))
      if (m) return m[1]
      if (++seen > 4) return null
    }
  }
  return null
}
/** top-level-ish object literals that hold both key: and label: */
function literals(src) {
  const out = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '{') continue
    let depth = 0, j = i, inStr = null
    for (; j < src.length; j++) {
      const ch = src[j]
      if (inStr) { if (ch === '\\') j++; else if (ch === inStr) inStr = null; continue }
      if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue }
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) break }
    }
    const body = src.slice(i, j + 1)
    // NOT A COLUMN (10-18): a group definition ({ key, label, order }) and an explain / chip object (it carries `text:`) were
    // counted as ungrouped columns
    const inner = body.slice(1, -1).replace(/`[^`]*`|'[^']*'|"[^"]*"/g, "''").replace(/\{[^{}]*\}/g, '{}')   // strings and nested objects out
    const props = (inner.match(/(?:^|,)\s*(\w+)\s*:/g) || []).map((m) => m.replace(/[,:\s]/g, ''))
    // ...and a tab / option list (const TABS = [ { key, label } ], VIEW_OPTIONS, PANELS): a menu, not a table
    const before = src.slice(Math.max(0, i - 1500), i)
    const inMenu = /\b\w*(?:TABS|OPTIONS|VIEWS|PANELS|options)\s*=\s*\{?\[[^\]]*$/.test(before)
    // NOT A COLUMN either (10-21, KNOWN-ISSUES #2): a FindBar / FiltersSheet filter (onChange, defaultValue), a ChartLegend item (mark), a zone
    // definition (test), an option inside a named menu array (games=, teams=, filters=, toggles=, groups=, items=, chips=), and a table's DATA row
    // (built into a `rows` const). The shared filters (#206) and the shot-map legends (#175) put dozens of these in table files.
    const menuArray = enclosingArrayName(src, i)
    const inColumns = /^(?:columns|cols|\w*Cols|\w*Columns)$/.test(menuArray || '')
    const dataRow = !menuArray && /(?:return|=>\s*\()\s*$/.test(before) && /(?:const|let)\s+(?:rows|\w*Rows)\s*=/.test(before.slice(-400))   // a row a `const rows = ...map(` callback returns
    const legend = props.includes('mark') && !['w', 'flag', 'action'].some((k) => props.includes(k))   // a flag column has mark AND w / flag
    const notColumn = props.includes('order') || props.includes('text') || props.includes('onClear') || inMenu   // onClear: an active-filter chip
      || (!inColumns && (['onChange', 'defaultValue', 'test'].some((k) => props.includes(k)) || legend || MENU_ARRAYS.has(menuArray) || dataRow))
    if (!notColumn && /^\{\s*(?:answers:[^,]+,\s*)?key:\s*['"`$\w]/.test(body) && /\blabel:/.test(body)) {
      const flat = body.replace(/\{[^{}]*\}/g, '{}')   // ignore nested objects when looking for the property
      out.push({ at: i, body, ungrouped: !/\bgroup\b/.test(body) && !/\.\.\.\w+/.test(flat.slice(1, 40)) })
      i = j   // do not descend into a column literal
    }
  }
  return out
}
const found = {}
for (const f of files) {
  if (f === 'lib/parity.js') continue   // the parity matrix: rows have key + label but are features, not table columns
  if (f === 'lib/awards.js') continue   // stat-line definitions; components/AwardRaces.js gives each its column and group: 'Line'
  const src = readFileSync(f, 'utf8')
  if (!TABLE.test(src)) continue
  const bad = literals(src).filter((l) => l.ungrouped)
  if (bad.length) found[f] = bad.map((l) => src.slice(0, l.at).split('\n').length)
}
let fail = 0
const list = process.argv.includes('--list')
for (const [f, lines] of Object.entries(found)) {
  const allowed = BASELINE[f]
  if (list) console.log(`${f}: ${lines.length} ungrouped (lines ${lines.join(',')})`)
  if (allowed == null) { console.log(`FAIL ${f}: ${lines.length} column(s) with no group (lines ${lines.slice(0, 8).join(',')})`); fail++ }
  else if (lines.length > allowed) { console.log(`FAIL ${f}: ${lines.length} ungrouped, baseline ${allowed}`); fail++ }
  else if (lines.length < allowed) { console.log(`FAIL ${f}: now ${lines.length} ungrouped, baseline says ${allowed}: lower it in scripts/check-table-groups.baseline.json`); fail++ }
}
for (const f of Object.keys(BASELINE)) if (!found[f]) { console.log(`FAIL ${f}: listed in the baseline but has no ungrouped column now: remove it`); fail++ }
const total = Object.values(found).reduce((n, l) => n + l.length, 0)
console.log(fail ? `table groups: ${fail} problem(s)` : `table groups: OK (${total} ungrouped columns, all in the baseline of ${Object.keys(BASELINE).length} files)`)
process.exit(fail ? 1 : 0)
