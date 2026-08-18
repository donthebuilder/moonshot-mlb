'use client'
import { useEffect, useState } from 'react'
import { n, clean, nameOf, teamOf, mlbId } from './player'
import { nameParts } from './namePatterns'

// ═══════════════════════════════════════════════════════════════════════════
// 🔮 THE ALIGNMENT ENGINE — every number a hitter carries, reduced one way
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan, 2026-08-17, after the ledger's watchlist landed 2/31 on a real
// night: "prediction should come based on the things — gematria, life paths,
// connections, numerology, batting order, fielding positions, all type the
// name connections. fifty numbers, nine lineup spots, jersey numbers and
// birthdays will line up by arithmetic alone. especially in combos, i think
// that's where it should fully live and breathe."
//
// So this is the whole machine in one place. Every axis reduces by the SAME
// rule the ledger already uses — digitRoot, add the digits until one is left
// (17 → 8) — so a match across different kinds of number means what it looks
// like it means:
//
//   NEXT      the root of his next homer (season_hr + 1)
//   JERSEY    the root of his shirt number
//   DAY       the root of his birth day-of-month     (league call)
//   PATH      his life path — every digit of the full birthdate, reduced
//   SPOT      his batting-order slot tonight (1–9, already a root)
//   POS       his fielding position number, scorekeeper's 1–9 (league call)
//   NAME      first/last name families, from lib/namePatterns
//
// THE DISCLOSURE TRAVELS WITH THE DATA, not just the UI: ~200 hitters over
// nine roots means every club has ~20 members by arithmetic alone. What makes
// a night interesting is CONCENTRATION — a root holding meaningfully more
// than its share — and a hitter whose OWN axes agree with each other (jersey,
// birthday and next homer all on one root). Both are counted against the
// arithmetic baseline and said out loud. Nothing here feeds a score, ever;
// the one graded object is the ledger's own watchlist.

export const digitRoot = (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0)

// ═══════════════════════════════════════════════════════════════════════════
// 📅 THE ARCHIVE — today's numbers, and yesterday's, without re-asking
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan, 2026-08-18: "the home run ledger should — alignments should — show
// daily number for today and yesterday['s] number that hit a lot or aligned
// the most the night before... the data can be stored in alignment for use,
// if need[ed] have the data for archive as well."
//
// HomerLedger.js already computes, live, off REAL graded homers: which digit
// root the night's numbers are landing on, which jersey/birthday/life-path
// root is running hot, and which hitters are "aligning" (two or more of
// those patterns on one man). That is the only place on the site with the
// actual answer — Alignments itself only ever sees the PREGAME slate, before
// a single ball has left the yard. So HomerLedger is the writer here (see its
// own archive effect) and Alignments is the reader: one summary object per
// date, small enough to keep forever, so "yesterday" is just localStorage
// read back rather than a second engine reimplemented in two places.
//
// SAME STICKY-BY-DATE PATTERN AS `ms_ledger_seen_${dateKey}` (see this file's
// sibling note in HomerLedger.js): write under today's key, stop touching it
// once the date rolls over, and it's frozen — "yesterday" for the next
// session that reads it. Per-browser, not a server archive — stated on the
// panel that reads it, not just here.
const ARCHIVE_PREFIX = 'ms_align_archive_'
export const archiveKeyFor = (dateKey) => `${ARCHIVE_PREFIX}${dateKey}`

export function writeAlignArchive(dateKey, summary) {
  if (typeof window === 'undefined' || !dateKey) return
  try {
    window.localStorage.setItem(archiveKeyFor(dateKey), JSON.stringify({ ...summary, dateKey, savedAt: Date.now() }))
  } catch { /* storage full or unavailable — the live view still works, it just won't be archived */ }
}

export function readAlignArchive(dateKey) {
  if (typeof window === 'undefined' || !dateKey) return null
  try {
    const raw = window.localStorage.getItem(archiveKeyFor(dateKey))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Calendar-day arithmetic on a 'YYYY-MM-DD' key. Anchored at UTC noon so a
// ±1 shift never lands on the wrong side of a DST transition — this is
// archive bookkeeping, not a slate boundary, so exact Eastern midnight
// precision doesn't matter the way it does in lib/data.js's easternDate.
export function shiftDateKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The calendar date itself, reduced — "next day" alignment for a watchlist
// name doesn't need tomorrow's roster (nobody has one yet); a hitter's OWN
// axes (jersey, birthday, life path — none of which change day to day) can
// still be checked against what TOMORROW's date reduces to.
export function dateDigitRoot(dateKey) {
  const digits = String(dateKey || '').replace(/[^0-9]/g, '')
  if (!digits) return null
  const sum = digits.split('').reduce((a, c) => a + Number(c), 0)
  return sum > 0 ? digitRoot(sum) : null
}

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

// ── THE LEAGUE HALF: birthdays + fielding positions, one batched call ──────
// The slate publishes jersey_number, season_hr and lineup_spot; birthDate and
// primaryPosition live only in the league's people endpoint. One sparse call
// per 100 ids, cached at module level for the session — the ledger's own
// batched fetch proved this exact shape.
const _people = new Map()   // pid -> { birthDate, posCode, posAbbr }
let _peoplePromise = null

async function fetchPeople(ids) {
  const need = ids.filter((id) => id && !_people.has(id))
  if (!need.length) return _people
  for (let i = 0; i < need.length; i += 100) {
    const batch = need.slice(i, i + 100)
    const url = 'https://statsapi.mlb.com/api/v1/people?personIds=' + batch.join(',')
      + '&fields=people,id,birthDate,primaryPosition,code,abbreviation'
    try {
      const j = await fetch(url).then((r) => (r.ok ? r.json() : null))
      ;(j?.people || []).forEach((person) => {
        _people.set(Number(person?.id), {
          birthDate: String(person?.birthDate || ''),
          posCode: Number(person?.primaryPosition?.code) || null,
          posAbbr: String(person?.primaryPosition?.abbreviation || ''),
        })
      })
    } catch { /* a missing batch degrades to slate-only axes, never throws */ }
  }
  return _people
}

export function usePeople(players = []) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    const ids = players.map((p) => mlbId(p)).filter(Boolean)
    if (!ids.length) return undefined
    if (!_peoplePromise) _peoplePromise = fetchPeople(ids)
    else _peoplePromise = _peoplePromise.then(() => fetchPeople(ids))
    _peoplePromise.then(() => { if (alive) setTick((t) => t + 1) })
    return () => { alive = false }
  }, [players])
  return { people: _people, loaded: tick > 0 || _people.size > 0 }
}

/** Every axis for one hitter. Null axes are absent, never zero. */
export function axesOf(p, people) {
  const pid = mlbId(p)
  const person = pid ? people?.get(pid) : null
  const nextHr = n(p?.season_hr, 0) + 1
  const jersey = n(p?.jersey_number, 0)
  const spot = Number(p?.lineup_spot)
  const out = {
    pid,
    p,
    name: nameOf(p),
    team: teamOf(p),
    hrScore: n(p?.hr_score, 0),
    designated: !!clean(p?.game_pick_role, ''),
    nextHr,
    axes: {
      next: digitRoot(nextHr),
      jersey: jersey > 0 ? digitRoot(jersey) : null,
      day: person ? dayRootOf(person.birthDate) : null,
      path: person ? lifePathOf(person.birthDate) : null,
      spot: spot >= 1 && spot <= 9 ? spot : null,
      pos: person?.posCode && person.posCode >= 1 && person.posCode <= 9 ? person.posCode : null,
    },
    jersey: jersey > 0 ? jersey : null,
    birthDate: person?.birthDate || '',
    posAbbr: person?.posAbbr || '',
    parts: nameParts(nameOf(p)),
  }
  return out
}

export const AXIS_META = {
  next: { label: 'next HR', why: (a) => `his next homer is #${a.nextHr}` },
  jersey: { label: 'jersey', why: (a) => `jersey #${a.jersey}` },
  day: { label: 'birth day', why: (a) => `born on the ${String(a.birthDate).slice(8, 10)}` },
  path: { label: 'life path', why: (a) => `life path from ${a.birthDate}` },
  spot: { label: 'bats', why: (a) => `bats ${a.axes.spot}` },
  pos: { label: 'fields', why: (a) => `plays ${a.posAbbr} (position ${a.axes.pos})` },
}

/**
 * The whole slate, aligned.
 *
 * clubs   — per root 1–9: members per axis, total memberships, and the
 *           arithmetic EXPECTED share so concentration is a measured claim.
 * braids  — hitters whose own axes agree: 2+ of their numbers on one root.
 * names   — first/last families with 2+ members (3+ for first names, which
 *           are common enough that pairs are pure noise).
 */
export function slateAlignments(players = [], people) {
  const rows = (players || []).map((p) => axesOf(p, people)).filter((a) => a.pid)

  const clubs = new Map()   // root -> { root, members: [{a, axisKeys}], count }
  for (let r = 1; r <= 9; r += 1) clubs.set(r, { root: r, members: [], count: 0 })
  rows.forEach((a) => {
    const byRoot = new Map()
    Object.entries(a.axes).forEach(([k, v]) => {
      if (v == null) return
      if (!byRoot.has(v)) byRoot.set(v, [])
      byRoot.get(v).push(k)
    })
    byRoot.forEach((axisKeys, root) => {
      const c = clubs.get(root)
      if (!c) return
      c.members.push({ a, axisKeys })
      c.count += axisKeys.length
    })
  })
  const totalMemberships = [...clubs.values()].reduce((s, c) => s + c.count, 0)

  // Braids: a hitter whose own numbers agree with each other.
  const braids = rows
    .map((a) => {
      const tally = new Map()
      Object.entries(a.axes).forEach(([k, v]) => {
        if (v == null) return
        if (!tally.has(v)) tally.set(v, [])
        tally.get(v).push(k)
      })
      let best = null
      tally.forEach((keys, root) => {
        if (keys.length >= 2 && (!best || keys.length > best.keys.length)) best = { root, keys }
      })
      return best ? { a, root: best.root, keys: best.keys, strength: best.keys.length } : null
    })
    .filter(Boolean)
    .sort((x, y) => (y.strength - x.strength) || (y.a.hrScore - x.a.hrScore))

  // Name families across the slate. Surnames at 2+, first names at 3+ —
  // pairs of a common first name are arithmetic, not a pattern.
  const first = new Map(); const last = new Map()
  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])
  const seen = new Set()
  rows.forEach((a) => {
    if (!a.parts) return
    const key = `${a.parts.firstKey}|${a.parts.lastKey}`
    if (seen.has(key)) return   // doubleheader rows are one man
    seen.add(key)
    const push = (m, k) => { if (!k || SUFFIXES.has(k)) return; if (!m.has(k)) m.set(k, []); m.get(k).push(a) }
    push(first, a.parts.firstKey)
    push(last, a.parts.lastKey)
  })
  const names = []
  first.forEach((list, k) => { if (list.length >= 3) names.push({ kind: 'first', key: k, list }) })
  last.forEach((list, k) => { if (list.length >= 2) names.push({ kind: 'last', key: k, list }) })
  names.sort((x, y) => y.list.length - x.list.length)

  return { rows, clubs: [...clubs.values()], totalMemberships, braids, names }
}
