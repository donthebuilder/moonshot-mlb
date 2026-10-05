// THE PARITY CHECK (BATCH-ONE-SITE step 2, 2026-10-05). lib/parity.js says what each
// sport's pages carry; this holds the code to it. It FAILS (exit 1) when:
//   · a sport's value is missing or isn't 'yes' / 'n/a: <reason>';
//   · a 'yes' isn't backed by the code (the Ledger section isn't drawn, the tab isn't
//     registered, the component isn't mounted, the file doesn't say it);
//   · the code has a feature the list still calls n/a (stale -- update the list).
// Runs in scripts/gate.sh. Prints the grid.
//   node scripts/check-parity.mjs
await import('./_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const { PARITY, SPORT_NAMES, isYes, naReason } = await import('../lib/parity.js')
const R = await import('../lib/routes.js')

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8') } catch { return null } }
const SPORTS = Object.keys(SPORT_NAMES)
const TABS = { mlb: R.MLB_TABS, nfl: R.NFL_TABS, nhl: R.NHL_TABS, nba: R.NBA_TABS }
const hasTab = (sport, t) => { const v = TABS[sport]; return v instanceof Set ? v.has(t) : Array.isArray(v) ? v.includes(t) : Boolean(v?.[t]) }

// a Ledger section is drawn when the sport's adapter returns it (MOONSHOT: HomerLedger's LedgerBody object)
const LEDGER_SRC = { mlb: ['components/HomerLedger.js', 'lib/sports/mlb/ledger.js'], nfl: ['lib/sports/nfl/ledger.js'], nhl: ['lib/sports/nhl/ledger.js'], nba: ['lib/sports/nba/ledger.js'] }
function ledgerHas(sport, key) {
  const src = LEDGER_SRC[sport].map(read).join('\n')
  if (key === 'first') return /\n\s+first: \{/.test(src)
  return new RegExp(`\\n\\s+(?:/\\*[\\s\\S]*?\\*/\\s*)*${key}: \\(`).test(src)
}
function backed(check, sport) {
  if (check.ledger) return ledgerHas(sport, check.ledger)
  if (check.tab) return check.tab[sport] ? hasTab(sport, check.tab[sport]) : false
  if (check.file) { const [f, imp] = check.file[sport] || []; return Boolean(f && read(f) != null && read(imp)?.includes(path.basename(f, '.js'))) }
  if (check.grep) { const [f, text] = check.grep[sport] || []; return Boolean(f && read(f)?.includes(text)) }
  return false
}

let fails = 0
const fail = (msg) => { fails++; console.log(`FAIL ${msg}`) }
const rows = []
for (const row of PARITY) {
  const cells = []
  for (const s of SPORTS) {
    const v = row.sports?.[s]
    const have = backed(row.check, s)
    if (!isYes(v) && !naReason(v)) fail(`${row.label} · ${SPORT_NAMES[s]}: '${v ?? '(missing)'}' -- must be 'yes' or 'n/a: <reason>'`)
    else if (isYes(v) && !have) fail(`${row.label} · ${SPORT_NAMES[s]}: marked yes, but the code doesn't have it`)
    else if (!isYes(v) && have) fail(`${row.label} · ${SPORT_NAMES[s]}: the code has it now -- lib/parity.js still says n/a`)
    cells.push(isYes(v) ? '  ✓  ' : ' n/a ')
  }
  rows.push(`${row.label.slice(0, 44).padEnd(44)} ${cells.join(' ')}`)
}
console.log(`${''.padEnd(44)} ${SPORTS.map((s) => SPORT_NAMES[s].slice(0, 5).padStart(5)).join(' ')}`)
for (const r of rows) console.log(r)
console.log(fails ? `\nparity: ${fails} problem(s)` : `\nparity: every sport accounted for (${PARITY.length} features x ${SPORTS.length} sports)`)
process.exit(fails ? 1 : 0)
