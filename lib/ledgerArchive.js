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
// Night record version. v2 (2026-09-01) adds `all` — every homer in baseball
// that night, off hr_capture_report — so the season record has full coverage.
// A v1 night is re-fetched once by harvestRange; nothing it held is lost.
export const NIGHT_V = 2

// ── THE PEOPLE STORE ────────────────────────────────────────────────────────
// Donovan, 2026-08-24: "ability to search jersey number, life path, birthday,
// all those type matching."
//
// The graded file knows who homered; it does not know what number he wears or
// when he was born. Those live only in the league's people endpoint, which the
// live ledger already batches (components/HomerLedger.js) and Alignments
// already batches again (lib/alignments.js) — both at module scope, both gone
// the moment the tab closes.
//
// A jersey number and a birthday DO NOT CHANGE, so re-asking the league for
// them every session is pure waste. This one is on disk and versioned: fetch a
// hitter once, ever, and the archive can match on him for the rest of the
// season without a single further request. Bump the version to invalidate.
const PEOPLE_KEY = 'ms_ledger_people_v1'

export const digitRoot = (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0)

// The two birthday reductions, identical to the ledger's and Alignments' —
// re-derived here rather than imported so this module has no dependency on a
// component, but they must stay in step. day = the day of the month reduced
// (the 26th → 2+6 → 8); life path = every digit of the full date, reduced.
export const dayRootOf = (birthDate) => {
  const d = Number(String(birthDate || '').slice(8, 10))
  return d > 0 ? digitRoot(d) : null
}
export const lifePathOf = (birthDate) => {
  const digits = String(birthDate || '').replace(/[^0-9]/g, '')
  if (digits.length < 8) return null
  const sum = digits.split('').reduce((a, c) => a + Number(c), 0)
  return sum > 0 ? digitRoot(sum) : null
}

export function readPeopleStore() {
  const s = ls(); if (!s) return {}
  try { return JSON.parse(s.getItem(PEOPLE_KEY) || '{}') || {} } catch { return {} }
}

function writePeopleStore(map) {
  const s = ls(); if (!s) return
  try { s.setItem(PEOPLE_KEY, JSON.stringify(map)) } catch { /* full */ }
}

/**
 * Fill in jersey + birthday for any archived hitter we have never looked up.
 *
 * Sparse fieldset, batches of 100, and it stores a NEGATIVE record for anyone
 * the league answers about without a number on file — otherwise every open
 * would re-ask about the same handful of men forever. `''` is not `null` and
 * `Number('')` is 0, so the empty-string guard is what stops "no number on
 * file" quietly becoming "wears #0" — the same trap the ledger's own lookup
 * documents.
 */
export async function harvestPeople(pids = []) {
  const store = readPeopleStore()
  const need = [...new Set(pids.map(Number).filter((x) => Number.isFinite(x) && x > 0))]
    .filter((id) => !store[id])
  if (!need.length) return store
  for (let i = 0; i < need.length; i += 100) {
    const batch = need.slice(i, i + 100)
    const url = 'https://statsapi.mlb.com/api/v1/people?personIds=' + batch.join(',')
      + '&fields=people,id,fullName,primaryNumber,birthDate'
    try {
      // eslint-disable-next-line no-await-in-loop
      const j = await fetch(url).then((r) => (r.ok ? r.json() : null))
      ;(j?.people || []).forEach((person) => {
        const id = Number(person?.id)
        if (!id) return
        const raw = person?.primaryNumber
        const num = Number(raw)
        store[id] = {
          name: String(person?.fullName || ''),
          jersey: raw != null && raw !== '' && Number.isFinite(num) ? num : null,
          birthDate: String(person?.birthDate || ''),
        }
      })
      // Anyone the league did not answer about is marked as asked, so the
      // next open does not spend a request on him again.
      batch.forEach((id) => { if (!store[id]) store[id] = { name: '', jersey: null, birthDate: '' } })
    } catch { /* offline: the archive still works, the number boards just sit out */ }
  }
  writePeopleStore(store)
  return store
}

/** Every hitter in the archive who still has no jersey/birthday on file. */
export function pidsMissingPeople(entries = []) {
  const store = readPeopleStore()
  const out = new Set()
  entries.forEach((e) => (e?.rows || []).forEach((r) => {
    if (r.pid && !store[r.pid]) out.add(Number(r.pid))
  }))
  return [...out]
}

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

  const graded = dedupeGraded(payload)
  const rows = graded
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

  // ── EVERY HOMER IN BASEBALL, NOT JUST THE SHEET'S (2026-09-01) ──────────
  // Donovan, on the ledger: "I want a multi-day / season record." The v1
  // night above keeps only the sheet's own homerers, which is right for the
  // name-pattern boards (rule 1: coverage is the graded file's coverage) and
  // wrong for a season record, which has to be able to say "31 homers were
  // hit last night and the sheet had 30 of them". The grader's own
  // hr_capture_report already carries the full list — distance, exit velo,
  // and hr_score on the ones the sheet caught — so the record costs no extra
  // request. The graded row is joined back on for the badge the bot had on
  // him (game_pick_role), the lineup spot, and season_hr AS THE SLATE KNEW
  // IT, which is printed with that caveat and never added to (rule 3).
  const byPid = new Map()
  graded.forEach((r) => { if (r.player_id != null) byPid.set(String(r.player_id), r) })
  const cap = payload.hr_capture_report || {}
  const allEntries = Array.isArray(cap.all_homer_entries) ? cap.all_homer_entries : []
  const caughtScore = new Map()
  ;(Array.isArray(cap.caught_homer_entries) ? cap.caught_homer_entries : [])
    .forEach((e) => { if (e?.player_id != null) caughtScore.set(String(e.player_id), e) })
  const all = allEntries
    .map((e) => {
      const pid = e?.player_id != null ? String(e.player_id) : null
      const g = pid ? byPid.get(pid) : null
      const c = pid ? caughtScore.get(pid) : null
      const role = String(g?.game_pick_role || '').trim()
      return {
        pid,
        name: String(e?.name || g?.name || '').trim(),
        team: String(e?.team || g?.team || '').trim(),
        hr: num(e?.hr) || 1,
        ft: num(e?.longest_ft) || null,
        ev: num(e?.max_ev_mph) || null,
        la: e?.launch_angle != null ? num(e.launch_angle) : null,
        gamePk: e?.game_pk ?? g?.game_pk ?? null,
        onSheet: Boolean(g || c),
        role: role || null,
        badged: /\b(TOP|HR)\b/.test(role),
        hrScore: c?.hr_score != null ? num(c.hr_score) : (g?.hr_score != null ? num(g.hr_score) : null),
        spot: g ? (num(g.lineup_spot) || null) : null,
        seasonHrSlate: g?.season_hr != null ? num(g.season_hr) : null,
      }
    })
    .filter((r) => r.name)

  // A published file with nobody in it is a REAL answer (a washed-out night, a
  // file written before any game finished) and is stored as such — otherwise
  // every open re-fetches the same empty day forever.
  const entry = {
    v: NIGHT_V,
    source: 'graded',
    tracked: graded.length,
    total: rows.reduce((a, r) => a + r.hr, 0),
    rows,
    all,
    allTotal: all.reduce((a, r) => a + r.hr, 0),
    caught: num(cap.caught_hrs_on_sheet) || null,
    capturePct: cap.hr_capture_pct != null ? num(cap.hr_capture_pct) : null,
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
    const held = readLedgerNight(d)
    // A night is only "held" at the current record version; older ones get
    // one re-read so the season record is never missing its `all` list. The
    // two newest nights are ALWAYS re-read: the graded file for a slate keeps
    // growing until its last game goes final, and it says "Final" on every
    // write, so the date is the only honest signal that it may still move.
    const settled = i >= 2
    if (!force && held && Number(held.v) >= NIGHT_V && settled) { onProgress?.({ i: i + 1, of: dates.length, date: d, skipped: true }); continue }
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

export function digestLedger(entries = [], peopleStore = null) {
  const nights = entries.filter(Boolean).slice().sort((a, b) => (a.date < b.date ? 1 : -1))
  if (!nights.length) return null
  const store = peopleStore || readPeopleStore()

  // One parsed-name record per homer, per night. Parsed ONCE — nameParts does
  // the string work and caches its bucket keys, and the echo pass below reads
  // every pair on every night.
  //
  // THE NUMBER AXES RIDE ALONG (2026-08-24). Jersey, birthday, day number and
  // life path come off the people store, and every one of them is NULL when
  // the league has nothing on file rather than 0 — a hitter with no number is
  // not a hitter wearing #0, and a board that cannot tell those apart would
  // put a phantom crowd on root 9.
  const per = nights.map((nt) => ({
    date: nt.date,
    total: nt.total || 0,
    people: (nt.rows || []).map((r) => {
      const parts = nameParts(r.name)
      if (!parts) return null
      const who = store[r.pid] || null
      const jersey = who && Number.isFinite(who.jersey) ? who.jersey : null
      const birthDate = who?.birthDate || ''
      return {
        ...r,
        parts,
        jersey,
        jerseyRoot: jersey > 0 ? digitRoot(jersey) : null,
        birthDate,
        birthDay: birthDate ? birthDate.slice(5) : '',   // MM-DD
        dayRoot: dayRootOf(birthDate),
        lifePath: lifePathOf(birthDate),
      }
    }).filter(Boolean),
  }))

  const homers = per.reduce((a, x) => a + x.total, 0)
  const bats = per.reduce((a, x) => a + x.people.length, 0)

  // ── WHO KEEPS COMING BACK ────────────────────────────────────────────────
  const byMan = new Map()
  per.forEach(({ date, people }) => {
    people.forEach((p) => {
      const k = p.pid || p.name.toLowerCase()
      const rec = byMan.get(k) || (byMan.set(k, {
        key: k, pid: p.pid, name: p.name, team: p.team, hr: 0, dates: [],
        jersey: null, jerseyRoot: null, birthDate: '', birthDay: '', dayRoot: null, lifePath: null,
      }), byMan.get(k))
      rec.hr += p.hr
      if (!rec.dates.includes(date)) rec.dates.push(date)
      rec.team = p.team || rec.team
      if (rec.jersey == null) { rec.jersey = p.jersey; rec.jerseyRoot = p.jerseyRoot }
      if (!rec.birthDate && p.birthDate) {
        rec.birthDate = p.birthDate; rec.birthDay = p.birthDay
        rec.dayRoot = p.dayRoot; rec.lifePath = p.lifePath
      }
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
  // Family order is deliberate: rarest coincidence first, so the board reads
  // top-down from "that is genuinely striking" to "that is one in nine".
  const numberTwins = [
    { key: 'birthDay',   label: 'the same birthday',    of: '365' },
    { key: 'jersey',     label: 'the same shirt number', of: '~70' },
    { key: 'lifePath',   label: 'the same life path',   of: '9' },
    { key: 'dayRoot',    label: 'the same day number',  of: '9' },
    { key: 'jerseyRoot', label: 'shirt numbers on the same root', of: '9' },
  ]
  const echoes = []
  const twins = []
  let pairs = 0
  per.forEach(({ date, people }) => {
    pairs += (people.length * (people.length - 1)) / 2
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const A = people[i]; const B = people[j]
        const kind = pairEcho(A.parts, B.parts, { cadenceOk: false })
        if (kind) echoes.push({ date, kind, a: A.name, b: B.name, aTeam: A.team, bTeam: B.team })
        // ── THE NUMBER TWINS (2026-08-24) ──────────────────────────────────
        // "same jersey numbers, Pete and Pete" — the name half was already
        // counted; this is the rest of what he described. Each family is its
        // own row so a shared BIRTHDAY (365 ways to differ) is never presented
        // as the same kind of coincidence as a shared DAY NUMBER (9 ways), and
        // the reduced roots are named as reductions so nobody reads "life path
        // 7" as a rarer event than it is.
        numberTwins.forEach(({ key, label, of }) => {
          const va = A[key]; const vb = B[key]
          if (va == null || va === '' || va !== vb) return
          twins.push({ date, family: label, value: va, of, a: A.name, b: B.name })
        })
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

  const twinKinds = [...twins.reduce((m, t) => {
    const r = m.get(t.family) || (m.set(t.family, { kind: t.family, of: t.of, n: 0, nights: new Set(), examples: [] }), m.get(t.family))
    r.n += 1; r.nights.add(t.date)
    if (r.examples.length < 4) r.examples.push(t)
    return m
  }, new Map()).values()]
    .map((r) => ({ ...r, nights: r.nights.size }))
    .sort((a, b) => numberTwins.findIndex((f) => f.label === a.kind) - numberTwins.findIndex((f) => f.label === b.kind))

  const firsts = initialBoard(per, (p) => p.parts.firstInitial)
  const lasts = initialBoard(per, (p) => p.parts.lastInitial)

  // ── THE NUMBER BOARDS ────────────────────────────────────────────────────
  // One shape for all three, and each carries the DENOMINATOR THAT MATTERS —
  // not the night's homer count, but how many of those homers have the axis on
  // file at all. A life-path board that quietly divides by 166 when only 140
  // birthdays are known is off by a fifth and looks authoritative doing it.
  const rootBoard = (pick) => {
    const by = new Map()
    let known = 0
    per.forEach(({ date, people }) => people.forEach((p) => {
      const v = pick(p)
      if (v == null) return
      known += 1
      const r = by.get(v) || (by.set(v, { k: v, n: 0, nights: new Set(), who: [] }), by.get(v))
      r.n += 1; r.nights.add(date)
      if (r.who.length < 6 && !r.who.includes(p.name)) r.who.push(p.name)
    }))
    return {
      known,
      rows: [...by.values()].map((r) => ({ ...r, nights: r.nights.size })).sort((a, b) => b.n - a.n || a.k - b.k),
    }
  }
  const lifePaths = rootBoard((p) => p.lifePath)
  const dayRoots = rootBoard((p) => p.dayRoot)
  const jerseyRoots = rootBoard((p) => p.jerseyRoot)

  // Exact shirt numbers that came up more than once — the literal "same jersey
  // numbers" board, unreduced, where a match is a real coincidence rather than
  // one of nine buckets.
  const jerseyNumbers = [...per.reduce((m, { people }) => {
    people.forEach((p) => {
      if (p.jersey == null) return
      const r = m.get(p.jersey) || (m.set(p.jersey, { k: p.jersey, n: 0, who: new Set() }), m.get(p.jersey))
      r.n += 1; r.who.add(p.name)
    })
    return m
  }, new Map()).values()]
    .map((r) => ({ ...r, who: [...r.who] }))
    .filter((r) => r.who.length > 1)
    .sort((a, b) => b.who.length - a.who.length || b.n - a.n)

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
    lifePaths,
    dayRoots,
    jerseyRoots,
    jerseyNumbers,
    // How much of the archive has a jersey/birthday on file at all. The page
    // prints this rather than implying full coverage: the number boards are
    // only as complete as the league lookup that fed them.
    numbered: lifePaths.known,
    repeats,
    echoes,
    echoKinds,
    twins,
    twinKinds,
    spots,
    spotless,
    teams,
    nightRows,
    thin: per.length < 4,
  }
}

// ══ SEARCH ══════════════════════════════════════════════════════════════════
//
// Donovan: "ability to search jersey number, life path, birthday, all those
// type matching."
//
// ONE BOX THAT UNDERSTANDS WHAT YOU TYPED, rather than six boxes or a dropdown
// nobody opens. `#22` is a shirt, `lp 7` is a life path, `jan 2` is a birthday,
// `mar` is a birth month, `NYM` is a club, anything else is a name. An axis
// chip in the UI can also pin the reading when a bare number is ambiguous —
// "7" alone could be a shirt, a life path or a day number, and guessing which
// silently would be worse than asking.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function parseArchiveQuery(raw, forced = null) {
  const q = String(raw || '').trim().toLowerCase()
  if (!q) return null
  const digitsOnly = /^\d{1,3}$/.test(q)

  // A pinned chip wins over every guess below, and gets the SAME plain-English
  // label the auto reader produces — "lifePath 7" is a variable name leaking
  // onto the page, not a sentence.
  const FORCED_LABEL = {
    jersey: (v) => `#${v}`,
    jerseyRoot: (v) => `shirt root ${v}`,
    lifePath: (v) => `life path ${v}`,
    dayRoot: (v) => `day number ${v}`,
  }
  if (forced && digitsOnly) {
    return { axis: forced, value: Number(q), label: (FORCED_LABEL[forced] || ((v) => `${forced} ${v}`))(q) }
  }

  // #22 — always a shirt, never a reduction.
  let m = q.match(/^#\s*(\d{1,3})$/)
  if (m) return { axis: 'jersey', value: Number(m[1]), label: `#${m[1]}` }

  m = q.match(/^(?:lp|life\s*path)\s*(\d)$/)
  if (m) return { axis: 'lifePath', value: Number(m[1]), label: `life path ${m[1]}` }

  m = q.match(/^(?:day|day\s*(?:root|number)|born\s*on)\s*(\d)$/)
  if (m) return { axis: 'dayRoot', value: Number(m[1]), label: `day number ${m[1]}` }

  m = q.match(/^(?:jr|jersey\s*root|shirt\s*root)\s*(\d)$/)
  if (m) return { axis: 'jerseyRoot', value: Number(m[1]), label: `shirt root ${m[1]}` }

  // A birthday, three ways: 'jan 2', '01-02', '1/2'.
  m = q.match(/^([a-z]{3,})\.?\s*(\d{1,2})$/)
  if (m && MONTHS.indexOf(m[1].slice(0, 3)) >= 0) {
    const mm = String(MONTHS.indexOf(m[1].slice(0, 3)) + 1).padStart(2, '0')
    const dd = String(Number(m[2])).padStart(2, '0')
    return { axis: 'birthDay', value: `${mm}-${dd}`, label: `born ${m[1].slice(0, 3)} ${Number(m[2])}` }
  }
  m = q.match(/^(\d{1,2})[-/](\d{1,2})$/)
  if (m) {
    const mm = String(Number(m[1])).padStart(2, '0')
    const dd = String(Number(m[2])).padStart(2, '0')
    return { axis: 'birthDay', value: `${mm}-${dd}`, label: `born ${mm}-${dd}` }
  }
  // A bare month name: everyone born in it.
  if (q.length >= 3 && MONTHS.indexOf(q.slice(0, 3)) >= 0 && /^[a-z]+$/.test(q)) {
    return { axis: 'birthMonth', value: String(MONTHS.indexOf(q.slice(0, 3)) + 1).padStart(2, '0'), label: `born in ${q.slice(0, 3)}` }
  }

  // A bare number with no chip pinned: read it as a shirt, and SAY SO in the
  // label so the reading is visible and correctable rather than silent.
  if (digitsOnly) return { axis: 'jersey', value: Number(q), label: `#${q} (shirt — chips above change this)` }

  // Two or three letters is a club code — said out loud, so a name that
  // happens to be three letters long does not silently become a team search.
  if (/^[a-z]{2,3}$/.test(q)) return { axis: 'team', value: q.toUpperCase(), label: `team ${q.toUpperCase()}` }
  return { axis: 'name', value: q, label: q }
}

/** Everyone in the archive matching a parsed query. */
export function findInArchive(digest, parsed) {
  if (!digest || !parsed) return []
  const { axis, value } = parsed
  const men = digest.repeats
  switch (axis) {
    case 'name': return men.filter((r) => r.name.toLowerCase().includes(String(value)))
    case 'team': return men.filter((r) => (r.team || '').toUpperCase() === value)
    case 'jersey': return men.filter((r) => r.jersey === value)
    case 'jerseyRoot': return men.filter((r) => r.jerseyRoot === value)
    case 'lifePath': return men.filter((r) => r.lifePath === value)
    case 'dayRoot': return men.filter((r) => r.dayRoot === value)
    case 'birthDay': return men.filter((r) => r.birthDay === value)
    case 'birthMonth': return men.filter((r) => (r.birthDay || '').slice(0, 2) === value)
    default: return []
  }
}


// ══ THE SEASON RECORD (2026-09-01) ═══════════════════════════════════════════
//
// Donovan: "I want a multi-day / season record" — both shapes, "to be fair or
// safe": the NIGHTS, one line each, tap one for its hitters; and the HITTERS,
// one line each across every night held. Everything here is a count off the
// v2 night records; a night stored before v2 is skipped here (not counted
// short) until harvestRange re-reads it.
//
// What a hitter's line does NOT do: add season_hr to anything. His slate-time
// season total is shown as "was on N" — the number the sheet had for him the
// night he went deep — and the league's live total stays with the one-night
// ledger, which asks the league (rule 3, and the 2026-08-09 lesson).
export function seasonRecord(entries = []) {
  const nights = entries
    .filter((e) => e && Number(e.v) >= NIGHT_V && Array.isArray(e.all))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  if (!nights.length) return null

  const nightRows = nights.map((e) => {
    const homers = e.all.slice().sort((a, b) => b.hr - a.hr || (b.ft || 0) - (a.ft || 0))
    const total = homers.reduce((a, r) => a + r.hr, 0)
    const onSheet = homers.filter((r) => r.onSheet).reduce((a, r) => a + r.hr, 0)
    const badgedMen = homers.filter((r) => r.badged)
    const multi = homers.filter((r) => r.hr >= 2)
    let longest = null
    homers.forEach((r) => { if (r.ft && (!longest || r.ft > longest.ft)) longest = r })
    return {
      date: e.date, total, onSheet, men: homers.length, homers,
      badged: badgedMen.length, multi: multi.length, longest,
      capturePct: e.capturePct ?? (total ? Math.round(1000 * onSheet / total) / 10 : null),
    }
  })

  const byHitter = new Map()
  nights.forEach((e) => {
    e.all.forEach((r) => {
      const k = r.pid || `${r.name}|${r.team}`
      const h = byHitter.get(k) || (byHitter.set(k, {
        k, pid: r.pid, name: r.name, team: r.team, hr: 0, nights: 0, badgedNights: 0,
        sheetNights: 0, longest: null, ev: null, scores: [], last: null, first: null, multi: 0,
        wasOn: null,
      }), byHitter.get(k))
      h.hr += r.hr
      h.nights += 1
      if (r.hr >= 2) h.multi += 1
      if (r.badged) h.badgedNights += 1
      if (r.onSheet) h.sheetNights += 1
      if (r.ft && (!h.longest || r.ft > h.longest.ft)) h.longest = { ft: r.ft, date: e.date }
      if (r.ev && (!h.ev || r.ev > h.ev)) h.ev = r.ev
      if (r.hrScore != null) h.scores.push(r.hrScore)
      if (!h.last || e.date > h.last) { h.last = e.date; if (r.seasonHrSlate != null) h.wasOn = r.seasonHrSlate }
      if (!h.first || e.date < h.first) h.first = e.date
      if (r.team && e.date === h.last) h.team = r.team
    })
  })
  const hitters = [...byHitter.values()]
    .map((h) => ({
      ...h,
      avgScore: h.scores.length ? Math.round(h.scores.reduce((a, b) => a + b, 0) / h.scores.length) : null,
    }))
    .sort((a, b) => b.hr - a.hr || b.nights - a.nights || (b.last > a.last ? 1 : -1) || a.name.localeCompare(b.name))

  const total = nightRows.reduce((a, n) => a + n.total, 0)
  const onSheet = nightRows.reduce((a, n) => a + n.onSheet, 0)
  const badged = nightRows.reduce((a, n) => a + n.badged, 0)
  let longest = null
  nightRows.forEach((n) => { if (n.longest && (!longest || n.longest.ft > longest.ft)) longest = { ...n.longest, date: n.date } })
  return {
    nights: nightRows, hitters, count: nights.length,
    from: nights[nights.length - 1].date, to: nights[0].date,
    total, onSheet, badged, longest,
    capturePct: total ? Math.round(1000 * onSheet / total) / 10 : null,
    perNight: Math.round(10 * total / nights.length) / 10,
  }
}
