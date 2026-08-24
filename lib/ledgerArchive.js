// ══ THE LEDGER ARCHIVE ══════════════════════════════════════════════════════
//
// Donovan, 2026-08-24: "what if [we take the] homer ledger and make it its own
// page in Alignments — do that, and make it damn near its own research tool."
//
// The ledger has always been able to show ONE night. Everything interesting he
// has ever asked it — "all the J names are going, who's a J", "Luis Robert,
// Luis Torrens", "same jersey numbers, Pete and Pete" — is a question about
// MORE THAN ONE NIGHT. A panel that can only ever render today cannot answer
// any of them, and flipping a night picker back and forth is not research, it
// is manual labour with no arithmetic at the end.
//
// So this module is the corpus. It keeps one small record per night in this
// browser and can BACKFILL from the branch's own graded files, which means the
// tool has something to say the first time it is opened rather than in two
// weeks. Everything it stores is derived from `graded_results_YYYY-MM-DD.json`
// — the same payload the Results tab grades from — so the archive and the
// receipts can never disagree about who went deep.
//
// ── THREE RULES IT WILL NOT BREAK ───────────────────────────────────────────
//
// 1. COVERAGE IS THE GRADED FILE'S COVERAGE, and that file carries the ~90
//    candidates the bot tracks, not all 300-odd hitters who played. So every
//    count here is "among the names the sheet was watching". The page says so.
//    A homer board that implies it saw every homer in baseball is lying.
//
// 2. NOTHING IS SCORED. This is pattern spotting, disclosed as such — the same
//    standing rule as the ledger's own numerology strip and for the same
//    reason (see the 2026-06-27 audit note in components/HomerLedger.js: a
//    jersey/date signal was already tried in the bot and pulled). Counts and
//    denominators, never a rate presented as a probability.
//
// 3. NO SEASON-NUMBER ARITHMETIC. The graded row's `season_hr` is the figure
//    the SLATE was built with, and whether it already includes that night's
//    homers depends on when the sheet was rebuilt. The ledger learned this the
//    hard way in the 2026-08-09 rewrite — it used to add the two and
//    double-counted. So "which number was it" stays with the live ledger,
//    which asks the league; the archive counts things it can see.

import { gradedResultsUrl } from './dataSource'
import { dedupeGraded } from './graded'
import { nameParts, pairEcho } from './namePatterns'

const KEY = 'ms_ledger_night_'
const nightKeyFor = (date) => `${KEY}${date}`

// A slice this thin is a look, not a finding — the same bar My Picks uses
// before it will read a split out loud.
export const MIN_TELL = 5

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const ls = () => (typeof window === 'undefined' ? null : window.localStorage)

export function readLedgerNight(date) {
  const s = ls(); if (!s || !date) return null
  try { const raw = s.getItem(nightKeyFor(date)); return raw ? JSON.parse(raw) : null } catch { return null }
}

export function writeLedgerNight(date, entry) {
  const s = ls(); if (!s || !date) return
  try { s.setItem(nightKeyFor(date), JSON.stringify({ ...entry, date, savedAt: Date.now() })) } catch { /* full */ }
}

/** Every night this browser holds, newest first. */
export function listLedgerNights() {
  const s = ls(); if (!s) return []
  const out = []
  try {
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i) || ''
      const m = k.match(/^ms_ledger_night_(\d{4}-\d{2}-\d{2})$/)
      if (m) out.push(m[1])
    }
  } catch { /* private mode */ }
  return out.sort().reverse()
}

export function clearLedgerArchive() {
  const s = ls(); if (!s) return 0
  const nights = listLedgerNights()
  nights.forEach((d) => { try { s.removeItem(nightKeyFor(d)) } catch { /* ignore */ } })
  return nights.length
}

export function exportLedgerArchive() {
  const nights = listLedgerNights().map(readLedgerNight).filter(Boolean)
  return JSON.stringify({ kind: 'moonshot-ledger-archive', v: 1, nights }, null, 2)
}

/**
 * One night, off the branch's graded file.
 *
 * dedupeGraded FIRST, always: the file publishes one row per pick CATEGORY, so
 * a hitter the bot designated twice carries two rows with the SAME actual_hr.
 * Counting the rows instead of the players is precisely the bug lib/graded.js
 * exists to stop, and it has already inflated this ledger's night total once.
 */
export async function harvestNight(date) {
  if (!date) return null
  let payload = null
  try {
    const r = await fetch(gradedResultsUrl(date), { cache: 'no-store' })
    if (!r.ok) return null
    payload = await r.json()
  } catch { return null }
  if (!payload) return null

  const rows = dedupeGraded(payload)
    .filter((r) => num(r.actual_hr) > 0)
    .map((r) => ({
      pid: r.player_id != null ? String(r.player_id) : null,
      name: String(r.name || '').trim(),
      team: String(r.team || '').trim(),
      opp: String(r.opponent || '').trim(),
      spot: num(r.lineup_spot) || null,
      hr: num(r.actual_hr),
    }))
    .filter((r) => r.name)

  // A published file with nobody in it is a REAL answer (a washed-out night, a
  // file written before any game finished) and is stored as such — otherwise
  // every open re-fetches the same empty day forever.
  const entry = {
    source: 'graded',
    tracked: dedupeGraded(payload).length,
    total: rows.reduce((a, r) => a + r.hr, 0),
    rows,
  }
  writeLedgerNight(date, entry)
  return { ...entry, date }
}

/** Calendar walk backwards from `endDate`, inclusive. */
export function recentDates(endDate, days) {
  const out = []
  const base = new Date(`${endDate}T12:00:00Z`)
  if (Number.isNaN(base.getTime())) return out
  for (let i = 0; i < days; i += 1) {
    const d = new Date(base.getTime())
    d.setUTCDate(d.getUTCDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/**
 * Fill in every night in the window this browser does not already hold.
 * Sequential on purpose — fourteen parallel fetches at raw.githubusercontent
 * is a burst for no gain, and the progress callback wants an order to report.
 */
export async function harvestRange(endDate, days, { onProgress, force = false } = {}) {
  const dates = recentDates(endDate, days)
  let added = 0
  for (let i = 0; i < dates.length; i += 1) {
    const d = dates[i]
    if (!force && readLedgerNight(d)) { onProgress?.({ i: i + 1, of: dates.length, date: d, skipped: true }); continue }
    // eslint-disable-next-line no-await-in-loop
    const got = await harvestNight(d)
    if (got) added += 1
    onProgress?.({ i: i + 1, of: dates.length, date: d, ok: Boolean(got) })
  }
  return { added, checked: dates.length }
}

// ══ THE DIGEST ══════════════════════════════════════════════════════════════
//
// Everything the page reads is computed here, once, from the stored nights —
// so the boards, the night table and the search can never be counting three
// different things.

const initialBoard = (per, pick) => {
  const by = new Map()
  per.forEach(({ date, people }) => {
    people.forEach((p) => {
      const k = pick(p)
      if (!k) return
      const rec = by.get(k) || (by.set(k, { k, n: 0, nights: new Set(), perNight: new Map() }), by.get(k))
      rec.n += 1
      rec.nights.add(date)
      rec.perNight.set(date, (rec.perNight.get(date) || 0) + 1)
    })
  })
  return [...by.values()]
    .map((r) => {
      let best = null
      r.perNight.forEach((v, d) => { if (!best || v > best.n) best = { date: d, n: v } })
      return { k: r.k.toUpperCase(), n: r.n, nights: r.nights.size, best }
    })
    .sort((a, b) => b.n - a.n || a.k.localeCompare(b.k))
}

export function digestLedger(entries = []) {
  const nights = entries.filter(Boolean).slice().sort((a, b) => (a.date < b.date ? 1 : -1))
  if (!nights.length) return null

  // One parsed-name record per homer, per night. Parsed ONCE — nameParts does
  // the string work and caches its bucket keys, and the echo pass below reads
  // every pair on every night.
  const per = nights.map((nt) => ({
    date: nt.date,
    total: nt.total || 0,
    people: (nt.rows || []).map((r) => {
      const parts = nameParts(r.name)
      return parts ? { ...r, parts } : null
    }).filter(Boolean),
  }))

  const homers = per.reduce((a, x) => a + x.total, 0)
  const bats = per.reduce((a, x) => a + x.people.length, 0)

  // ── WHO KEEPS COMING BACK ────────────────────────────────────────────────
  const byMan = new Map()
  per.forEach(({ date, people }) => {
    people.forEach((p) => {
      const k = p.pid || p.name.toLowerCase()
      const rec = byMan.get(k) || (byMan.set(k, { key: k, pid: p.pid, name: p.name, team: p.team, hr: 0, dates: [] }), byMan.get(k))
      rec.hr += p.hr
      if (!rec.dates.includes(date)) rec.dates.push(date)
      rec.team = p.team || rec.team
    })
  })
  const repeats = [...byMan.values()]
    .sort((a, b) => b.dates.length - a.dates.length || b.hr - a.hr || a.name.localeCompare(b.name))

  // ── THE MATCHING GAME, COUNTED ───────────────────────────────────────────
  // His own framing: "same first name — if one goes the other might go. Bryce
  // and Brice. Luis Robert, Luis Torrens. Names that rhyme. Almost a matching
  // game." Every unordered pair inside a night, run through the same pairEcho
  // the live ledger uses — one definition of an echo for both surfaces.
  //
  // CADENCE IS OFF. Syllable counting from spelling is a heuristic that is
  // wrong often enough that lib/namePatterns.js refuses to let it carry a
  // claim alone; across a corpus it would be the loudest family and the least
  // trustworthy one. Spelling-visible echoes only.
  const echoes = []
  let pairs = 0
  per.forEach(({ date, people }) => {
    pairs += (people.length * (people.length - 1)) / 2
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const kind = pairEcho(people[i].parts, people[j].parts, { cadenceOk: false })
        if (kind) echoes.push({ date, kind, a: people[i].name, b: people[j].name, aTeam: people[i].team, bTeam: people[j].team })
      }
    }
  })
  const echoKinds = [...echoes.reduce((m, e) => {
    const r = m.get(e.kind) || (m.set(e.kind, { kind: e.kind, n: 0, nights: new Set(), examples: [] }), m.get(e.kind))
    r.n += 1; r.nights.add(e.date)
    if (r.examples.length < 4) r.examples.push(e)
    return m
  }, new Map()).values()]
    .map((r) => ({ ...r, nights: r.nights.size }))
    .sort((a, b) => b.n - a.n)

  // ── THE ORDER ────────────────────────────────────────────────────────────
  const spots = Array.from({ length: 9 }, (_, i) => ({ spot: i + 1, n: 0 }))
  let spotless = 0
  per.forEach(({ people }) => people.forEach((p) => {
    if (p.spot >= 1 && p.spot <= 9) spots[p.spot - 1].n += p.hr
    else spotless += p.hr
  }))

  // ── TEAMS ────────────────────────────────────────────────────────────────
  const teams = [...per.reduce((m, { date, people }) => {
    people.forEach((p) => {
      if (!p.team) return
      const r = m.get(p.team) || (m.set(p.team, { k: p.team, n: 0, nights: new Set() }), m.get(p.team))
      r.n += p.hr; r.nights.add(date)
    })
    return m
  }, new Map()).values()].map((r) => ({ ...r, nights: r.nights.size })).sort((a, b) => b.n - a.n)

  const firsts = initialBoard(per, (p) => p.parts.firstInitial)
  const lasts = initialBoard(per, (p) => p.parts.lastInitial)

  // ── THE NIGHT TABLE ──────────────────────────────────────────────────────
  // A night's "letter" is only worth naming when it actually ran the night:
  // two of eleven is not a J night and printing it as one is how a pattern
  // page turns into a horoscope.
  const nightRows = per.map(({ date, total, people }) => {
    const counts = new Map()
    people.forEach((p) => counts.set(p.parts.firstInitial, (counts.get(p.parts.firstInitial) || 0) + 1))
    let lead = null
    counts.forEach((v, k) => { if (!lead || v > lead.n) lead = { k: k.toUpperCase(), n: v } })
    const share = people.length ? (lead ? lead.n / people.length : 0) : 0
    return {
      date,
      total,
      men: people.length,
      lead,
      letterNight: Boolean(lead && lead.n >= 3 && share >= 0.3),
      echoes: echoes.filter((e) => e.date === date).length,
      names: people.map((p) => p.name),
    }
  })

  return {
    nights: per.length,
    from: per[per.length - 1].date,
    to: per[0].date,
    homers,
    bats,
    // THE DENOMINATOR THE ECHO BOARD IS SCORED AGAINST. Five echoes means
    // nothing without the number of pairs that could have been one, and this
    // page is not allowed to print the numerator alone — that is the exact
    // move that turns a pattern board into a horoscope.
    pairs,
    firsts,
    lasts,
    repeats,
    echoes,
    echoKinds,
    spots,
    spotless,
    teams,
    nightRows,
    thin: per.length < 4,
  }
}

/** Every night a given man went deep, for the archive search. */
export function findInArchive(digest, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!digest || q.length < 2) return []
  return digest.repeats.filter((r) => r.name.toLowerCase().includes(q) || r.team.toLowerCase() === q)
}
