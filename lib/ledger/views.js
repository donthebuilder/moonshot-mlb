// THE LEDGER, ONE PER SPORT, FOUR SUB-TABS (2026-10-07, Donovan 10-06: "the ledger is a CORE PRODUCT
// FEATURE ... one coherent DASH ledger concept"). Each sport had two or three ledger-ish pages under
// More > Results with near-identical names (Ledger, Called Ledger / TD Ledger / Lamp Ledger, The
// record, Score bands, a Ledger lab inside Parlays). They are one thing seen four ways, so they are
// ONE tab -- #tab=ledger -- with the same four sub-tabs, in the same order and words, on every sport:
//
//   TONIGHT  the night in names and numbers (the old Ledger page; NFL says THIS WEEK)
//   CALLED   every event, sorted CALLED / ON THE BOARD / NOT ON THE BOARD (Called / TD / Lamp Ledger)
//   RECORD   the graded model record, with its calibration table (The record; MLB: + Score bands)
//   ARCHIVE  past nights and the whole season (MLB: the Ledger lab; the others: the Called table's season view)
//
// The sub-tab rides the address as `lv=` (Tonight writes nothing, so every existing #tab=ledger link
// is still Tonight): #sport=nhl&tab=ledger&lv=called. Choosing one PUSHES an entry, so Back steps back
// through them (lib/urlState.js writeHash). Every OLD tab key is an alias that lands on the right
// sub-tab (LEDGER_ALIAS_VIEW below; lib/routes.js folds the keys into each sport's alias table).
//
// PURE where it can be (the maps), and the few browser calls guard on `window`.
import { hashParams, writeHash } from '../urlState'

export const LEDGER_TAB = 'ledger'
/** The four sub-tabs, in their one order. */
export const LEDGER_VIEWS = ['tonight', 'called', 'record', 'archive']
/** `bands` is Score bands, a second pill INSIDE Record (MLB); it lights the Record sub-tab. */
export const LEDGER_ADDRESSES = [...LEDGER_VIEWS, 'bands']

// The words are the same everywhere, except the first: football's unit is the week.
export const LEDGER_WORDS = {
  tonight: { mlb: 'Tonight', nfl: 'This week', nhl: 'Tonight', nba: 'Tonight' },
  called: 'Called', record: 'Record', archive: 'Archive',
}
export const ledgerWord = (sport, view) => {
  const w = LEDGER_WORDS[view]
  return typeof w === 'string' ? w : (w?.[sport] || w?.mlb || '')
}

// One plain line under the pills saying what the open sub-tab is, in the sport's own noun.
// (Tables keyed by sport, never a ternary: lib/routes.js is the one place sports are listed.)
const BLURBS = {
  mlb: { tonight: 'The night in names and numbers: the calls, round numbers, echoes, first scorers.', unit: 'home run', night: 'night' },
  nfl: { tonight: 'The week in names and numbers: the calls, round numbers, echoes, first touchdowns.', unit: 'touchdown', night: 'week' },
  nhl: { tonight: 'The night in names and numbers: the calls, round numbers, echoes, first goals.', unit: 'goal', night: 'night' },
  nba: { tonight: 'The night in names and numbers: every player who cleared a bar, live.', unit: 'player', night: 'night' },
}
export const ledgerBlurb = (sport, view) => {
  const b = BLURBS[sport] || BLURBS.mlb
  return {
    tonight: b.tonight,
    called: `Every ${b.unit} this season, sorted: CALLED, ON THE BOARD, or NOT ON THE BOARD.`,
    record: 'Every graded call, wins and losses alike, and what each score has actually been worth.',
    archive: `Past ${b.night}s and the whole season, one ${b.night} at a time.`,
  }[view] || ''
}

// OLD KEY -> SUB-TAB. Word-based, so one map serves every sport (the keys a sport never had just
// never arrive). `results` / `accountability` / `record` are all "The record".
export const LEDGER_ALIAS_VIEW = {
  calledledger: 'called', tuddyledger: 'called', lampledger: 'called',
  results: 'record', accountability: 'record', record: 'record', reportcard: 'record', report: 'record',
  bands: 'bands',
  ledgerlab: 'archive', archive: 'archive', ledgerarchive: 'archive',
  // the bar's and the drawer's own words
  theledger: 'tonight', weekinnumbers: 'tonight',
}
/** The alias table every sport folds in: each old key -> the one `ledger` tab. */
export const LEDGER_ALIASES = Object.fromEntries(Object.keys(LEDGER_ALIAS_VIEW).map((k) => [k, LEDGER_TAB]))
/** The sub-tab an old key lands on, or null when it is not a ledger key. */
export const ledgerViewOfKey = (key) => LEDGER_ALIAS_VIEW[String(key || '').trim().toLowerCase()] || null

/** A raw `lv=` -> one of the five addresses; anything else is Tonight. */
export const cleanView = (raw) => (LEDGER_ADDRESSES.includes(String(raw || '').toLowerCase()) ? String(raw).toLowerCase() : 'tonight')
/** Which of the four sub-tabs an address lights (bands lights Record). */
export const tabOfView = (view) => (view === 'bands' ? 'record' : LEDGER_VIEWS.includes(view) ? view : 'tonight')

/** The in-app address of a sport's Ledger sub-tab. Tonight carries no lv=. */
export const ledgerHash = (sport, view = 'tonight') => `#sport=${sport}&tab=${LEDGER_TAB}${view && view !== 'tonight' ? `&lv=${view}` : ''}`
export const ledgerAppHref = (sport, view = 'tonight') => `/app${ledgerHash(sport, view)}`

// ── ARRIVING ON AN OLD KEY ─────────────────────────────────────────────────
// A typed or shared #tab=calledledger is rewritten to #tab=ledger&lv=called BEFORE a shell reads it,
// so every shell's own resolve/write-back sees the canonical address and nothing else needs to know
// the alias existed. Replaces the entry (it is the same page, not a new one). Returns the view or null.
export function canonLedgerHash(sport) {
  if (typeof window === 'undefined') return null
  try {
    const h = hashParams()
    if ((h.get('sport') || 'mlb') !== sport) return null   // no sport= is MOONSHOT, as everywhere
    const v = ledgerViewOfKey(h.get('tab'))
    if (!v || LEDGER_TAB === String(h.get('tab')).toLowerCase()) return null
    h.set('tab', LEDGER_TAB)
    if (!h.get('lv') && v !== 'tonight') h.set('lv', v)
    writeHash(h, { state: null })
    return v
  } catch { return null }
}

// ── NAVIGATING IN-APP WITH AN OLD KEY (setTab('calledledger')) ─────────────
// There is no address to rewrite yet, so the wanted sub-tab waits here until the Ledger shell
// (mounting now, or already open and listening) takes it.
let pending = null
export function queueLedgerView(view) {
  pending = view && view !== 'tonight' ? view : null
  if (typeof window !== 'undefined') { try { window.dispatchEvent(new Event('ledgerview')) } catch { /* no events */ } }
}
export const peekLedgerView = () => pending
export const takeLedgerView = () => { const v = pending; pending = null; return v }
/** setTab()'s hook: an old key about to be opened queues its sub-tab. Returns true when it was one. */
export function queueForKey(key) {
  const v = ledgerViewOfKey(key)
  if (!v || String(key).toLowerCase() === LEDGER_TAB) return false
  queueLedgerView(v)
  return true
}

/** The sub-tab the address names right now. */
export const readLedgerView = () => { try { return cleanView(hashParams().get('lv')) } catch { return 'tonight' } }
/** Write the sub-tab into the address: Tonight deletes lv=. `push` adds a history entry. */
export function writeLedgerView(view, { push = true } = {}) {
  if (typeof window === 'undefined') return false
  try {
    const h = hashParams()
    if (view && view !== 'tonight') h.set('lv', view); else h.delete('lv')
    return writeHash(h, { push, state: null })
  } catch { return false }
}
/** The address writer for the tab switch: lv= belongs to the ledger tab only. */
export const carryLedgerView = (h, live, tab) => { if (tab === LEDGER_TAB && live?.get?.('lv')) h.set('lv', live.get('lv')) }
