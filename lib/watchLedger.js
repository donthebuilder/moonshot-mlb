'use client'

// ⭐ WATCHLIST LEDGER — your own list, graded like the bot grades itself.
//
// 2026-08-09, Donovan: "add a tracker to the watchlist like results, something
// minimal but useful."
//
// The Watchlist already showed TONIGHT. What it couldn't answer is the only
// question that makes a watchlist worth keeping: does starring names actually
// work for you? That needs history, and there is no server here to keep it —
// the watchlist itself is device-local ("saved on this device only"), so its
// record is too. Stated plainly wherever it renders; a number whose scope you
// misunderstand is worse than no number.
//
// WHAT A NIGHT COSTS TO STORE: one row per date — the counts, not the names.
// Sixty nights is a few hundred bytes, so nothing here needs pruning logic
// beyond a hard cap.
//
// THE GRADING RULE IS THE SITE'S RULE, NOT A NEW ONE:
//   · a saved hitter counts only if he actually batted (actual_ab > 0)
//   · scratched and never-used names are VOID, not misses — same as the live
//     wire and the bot's own tracker
//   · one row per player before counting (the graded file publishes one row
//     per pick CATEGORY, so a two-category hitter appears twice)
// If those three rules ever disagree with the rest of the site, this file is
// the one that's wrong.
//
// ── WHAT THE NIGHT COUNTS COULDN'T ANSWER (2026-08-15) ───────────────────────
//
// Donovan: "the watch list page is awesome if you can add more do it." Three
// real gaps, all of them about the same thing — the ledger knew the TOTAL and
// nothing else:
//
//   1. IS THE LIST ACTUALLY BETTER THAN THE FIELD? "18.8% of your saves went
//      deep" is unreadable on its own. Compared with what every tracked hitter
//      did on those same nights, it becomes an answer. So each row now also
//      carries the field's counts for that night (fn/fhr/fhit) — the same
//      graded file, the same batted-only rule, just not filtered to your
//      stars. Both sides print k/n.
//   2. WHICH SAVED NAMES ARE CARRYING IT. The aggregate hides a list that is
//      one hitter and eleven passengers. Rows now carry a per-player entry
//      (`p`), so a name can show his own record across the nights you had this
//      page open.
//   3. NOTHING COULD LEAVE THE DEVICE. The record is device-local by
//      necessity and one cleared cache ended it. Export/import now exist, and
//      import MERGES by date like My Picks does, so a phone's nights don't
//      delete a laptop's.
//
// ALL THREE ARE ADDITIVE KEYS ON THE EXISTING ROW. Nothing already stored in
// `watch_ledger_v1` changes shape or meaning, and every reader below treats
// the new keys as optional — an older night simply contributes to the totals
// it always did and sits out of the ones it never knew. Where that makes two
// denominators differ, the UI prints both rather than pretending.
//
// A per-player entry is a BITMASK, not an object: `{ "592450": 5 }` is eleven
// bytes for "batted, and homered". Twenty-five saved names over sixty nights
// is ~15KB, which is the whole reason it can be stored at all.

const KEY = 'watch_ledger_v1'
const CAP = 60

// Per-player night flags. BATTED is what makes a night a START — a saved name
// with no BATTED bit was scratched or never used, which is a VOID and must not
// land in anybody's denominator.
export const BATTED = 1
export const GOT_HIT = 2
export const WENT_DEEP = 4
// ── FOUR MORE BARS (2026-08-31) ─────────────────────────────────────────────
//
// Donovan: "i also think thw watch list wherer its tracks went deep got a hit.
// i think it should trakc a few more like xbh or hrr dont you think ? maybe
// like total hits."
//
// Yes — and the right four are not a matter of taste, because the site already
// has a canonical answer. lib/liveSlate.js's pickCleared() defines the exact
// bars the bot is GRADED on:
//
//     HR / TOP   hr  >= 1
//     HIT        h   >= 1
//     HRR        h + r + rbi >= 2
//     CONTACT    tb  >= 2
//
// The watchlist tracked the first two and nothing else, which meant your saved
// list and the bot's picks were being measured on different yardsticks and
// could not be compared. Tracking all four fixes that by construction. XBH and
// MULTI_HIT come along because they are the two questions the raw counts
// already answer and nobody was asking: a double is not a home run and is not
// nothing, and one hit and three hits are not the same night.
//
// Bits, not fields: a per-player night is still one small integer. Seven bits
// fits in the same eleven bytes the three did.
export const GOT_XBH = 8      // a double, a triple or a homer
export const MULTI_HIT = 16   // two or more hits
export const HRR_2 = 32       // h + r + rbi >= 2, the bot's HRR bar
export const TB_2 = 64        // two or more total bases, the bot's CONTACT bar

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}

const write = (obj) => {
  try {
    // Keep the newest CAP dates. Sorted lexically, which is chronological for
    // YYYY-MM-DD.
    const keys = Object.keys(obj).sort()
    const trimmed = {}
    keys.slice(-CAP).forEach((k) => { trimmed[k] = obj[k] })
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch { /* private mode, quota — the ledger is a nicety, never a blocker */ }
}

/**
 * Record (or update) one night.
 *
 * Idempotent by date: called on every render of a live night, it just
 * overwrites that date's row with the current counts, so the ledger tracks
 * grading as it happens and settles on the final numbers. It does NOT append.
 *
 * @param dateKey  the slate date being graded, YYYY-MM-DD
 * @param lines    [{ pid?, ab, hr, hits }] — already deduped, one per saved
 *                 hitter. `pid` is optional and only powers the per-player
 *                 record; a line without one still counts in the totals.
 * @param field    optional { n, hr, hit } for EVERY tracked hitter who batted
 *                 that night — the comparison the saved-list rate needs to
 *                 mean anything. Same grading rule, no star filter.
 * @returns the row written, or null if there was nothing to record
 */
export function recordNight(dateKey, lines, field = null) {
  if (!dateKey || !Array.isArray(lines)) return null
  // Only hitters who actually batted. A night where none of them did is not a
  // night — recording a 0/0 row would dilute the rate with a day that never
  // asked a question.
  const played = lines.filter((l) => Number(l?.ab) > 0)
  if (!played.length) return null
  // Per-player flags, keyed by MLB id. Saved names who never batted ARE stored
  // here, with no BATTED bit: "he was on the list and didn't play" is a fact
  // about the list worth keeping, and it keeps the per-player void count
  // honest instead of leaving those nights unexplained.
  // The four new bars, computed once here so the row and the per-player mask
  // cannot disagree. Every one of them is a COUNT off the graded line, never a
  // model output — same rule the two original bars follow.
  const xbhOf = (l) => Number(l?.doubles || 0) + Number(l?.triples || 0) + Number(l?.hr || 0)
  const comboOf = (l) => Number(l?.hits || 0) + Number(l?.runs || 0) + Number(l?.rbi || 0)
  // Whether this night was recorded by a build that KNOWS about the new bars.
  // A line carrying none of the new keys is an old caller, and its night must
  // not be written as four zeroes — see the `rich` guard in ledgerTotals.
  const knowsExtras = lines.some((l) => l && (
    l.doubles !== undefined || l.triples !== undefined
    || l.tb !== undefined || l.runs !== undefined || l.rbi !== undefined))

  const p = {}
  lines.forEach((l) => {
    const pid = Number(l?.pid)
    if (!Number.isFinite(pid) || !pid) return
    const batted = Number(l.ab) > 0
    p[pid] = (batted ? BATTED : 0)
      | (batted && Number(l.hits) > 0 ? GOT_HIT : 0)
      | (batted && Number(l.hr) > 0 ? WENT_DEEP : 0)
      | (batted && knowsExtras && xbhOf(l) > 0 ? GOT_XBH : 0)
      | (batted && knowsExtras && Number(l.hits) >= 2 ? MULTI_HIT : 0)
      | (batted && knowsExtras && comboOf(l) >= 2 ? HRR_2 : 0)
      | (batted && knowsExtras && Number(l.tb || 0) >= 2 ? TB_2 : 0)
  })
  const row = {
    n: played.length,
    hr: played.filter((l) => Number(l.hr) > 0).length,
    hit: played.filter((l) => Number(l.hits) > 0).length,
    // How many were saved but never batted — shown so the void legs are
    // visible rather than silently dropped.
    void: lines.length - played.length,
    p,
  }
  // Additive keys, written only when the caller supplied the fields they are
  // built from. `xbh` doubles as the marker that this night can answer the new
  // questions at all — an older row has no `xbh` key and is left out of those
  // denominators rather than counted as a miss.
  if (knowsExtras) {
    row.xbh = played.filter((l) => xbhOf(l) > 0).length
    row.mh = played.filter((l) => Number(l.hits || 0) >= 2).length
    row.hrr = played.filter((l) => comboOf(l) >= 2).length
    row.tb2 = played.filter((l) => Number(l.tb || 0) >= 2).length
    // Raw totals, for "how many hits did my list get" — a count, not a rate.
    row.th = played.reduce((a, l) => a + (Number(l.hits) || 0), 0)
    row.ttb = played.reduce((a, l) => a + (Number(l.tb) || 0), 0)
    row.thr = played.reduce((a, l) => a + (Number(l.hr) || 0), 0)
  }
  // The field's night, when the caller could work it out. Guarded rather than
  // assumed: a night recorded without it must not turn into a zero baseline,
  // which would read as "the field homered 0 times" instead of "unknown".
  const fn = Number(field?.n)
  if (Number.isFinite(fn) && fn > 0) {
    row.fn = fn
    row.fhr = Number(field.hr) || 0
    row.fhit = Number(field.hit) || 0
  }
  const all = read()
  all[dateKey] = row
  write(all)
  return row
}

/** Every recorded night, oldest first. */
export function readLedger() {
  const all = read()
  return Object.keys(all).sort().map((date) => ({ date, ...all[date] }))
}

/** Totals across the last `days` recorded nights (all of them by default). */
export function ledgerTotals(days = null) {
  const rows = readLedger()
  const use = days ? rows.slice(-days) : rows
  const sum = (k) => use.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const n = sum('n')

  // ── the field, on the same nights ──────────────────────────────────────
  // Only the nights that actually carry a baseline. `field.nights` rides along
  // so the UI can say "on the N nights we could compare" instead of implying
  // the comparison covers the whole ledger.
  const fieldRows = use.filter((r) => Number(r.fn) > 0)
  const fsum = (k) => fieldRows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const fn = fsum('fn')
  // Your own counts restricted to exactly those nights — comparing your
  // all-time rate against a baseline drawn from a subset would be two
  // different questions printed as one.
  const myN = fieldRows.reduce((a, r) => a + (Number(r.n) || 0), 0)
  const myHr = fieldRows.reduce((a, r) => a + (Number(r.hr) || 0), 0)
  const myHit = fieldRows.reduce((a, r) => a + (Number(r.hit) || 0), 0)

  // ── per saved hitter ───────────────────────────────────────────────────
  // Keyed by MLB id, because names change spelling and ids don't. Nights
  // recorded before the per-player key existed simply aren't in here, so
  // `playerNights` is returned to say how many nights these records cover.
  // ── the four newer bars, on the nights that measured them ──────────────
  //
  // The same guard the field baseline uses, for the same reason. Nights
  // recorded before 2026-08-31 have no `xbh` key, and folding them in as zeroes
  // would print "your list got an extra-base hit in 0 of 240 starts" about a
  // stretch nobody was counting. They sit out of these denominators instead,
  // and the UI says how many nights the newer numbers actually cover.
  const richRows = use.filter((r) => Number.isFinite(Number(r.xbh)))
  const rich = new Set(richRows.map((r) => r.date))
  const rsum = (k) => richRows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const rn = richRows.reduce((a, r) => a + (Number(r.n) || 0), 0)

  const byPid = {}
  let playerNights = 0
  use.forEach((r) => {
    const p = r.p
    if (!p || typeof p !== 'object' || !Object.keys(p).length) return
    playerNights += 1
    Object.entries(p).forEach(([pid, maskRaw]) => {
      const mask = Number(maskRaw) || 0
      const b = byPid[pid] || (byPid[pid] = {
        nights: 0, starts: 0, hit: 0, hr: 0, void: 0,
        // Own denominator: only the starts recorded on a night that knew about
        // these bars. See `rich` below — the same reason, one level down.
        richStarts: 0, xbh: 0, mh: 0, hrr: 0, tb2: 0,
      })
      b.nights += 1
      if (mask & BATTED) {
        b.starts += 1
        if (mask & GOT_HIT) b.hit += 1
        if (mask & WENT_DEEP) b.hr += 1
        if (rich.has(r.date)) {
          b.richStarts += 1
          if (mask & GOT_XBH) b.xbh += 1
          if (mask & MULTI_HIT) b.mh += 1
          if (mask & HRR_2) b.hrr += 1
          if (mask & TB_2) b.tb2 += 1
        }
      } else b.void += 1
    })
  })

  return {
    nights: use.length,
    n,
    hr: sum('hr'),
    hit: sum('hit'),
    void: sum('void'),
    hrPct: n ? (100 * sum('hr')) / n : null,
    hitPct: n ? (100 * sum('hit')) / n : null,
    // The comparison set. Every one of these is a raw count; the UI does the
    // dividing so it can print the denominator in the same breath.
    field: fn ? {
      nights: fieldRows.length,
      n: fn, hr: fsum('fhr'), hit: fsum('fhit'),
      myN, myHr, myHit,
    } : null,
    // Null rather than zeroes when no recorded night carries them — "not
    // measured yet" and "measured, never happened" are different answers and
    // this object must not blur them.
    extras: rn ? {
      nights: richRows.length,
      n: rn,
      xbh: rsum('xbh'),
      mh: rsum('mh'),
      hrr: rsum('hrr'),
      tb2: rsum('tb2'),
      // Raw counts, printed as counts. A total is not a rate and has no
      // denominator to be honest about.
      totalHits: rsum('th'),
      totalTb: rsum('ttb'),
      totalHr: rsum('thr'),
    } : null,
    byPid,
    playerNights,
    rows: use,
  }
}

// ── portability ───────────────────────────────────────────────────────────────
// The record is device-local because the site has nowhere else to put it. That
// is a reason for an export, not an excuse for losing it to a cleared cache.

export function exportLedger() {
  return JSON.stringify({ v: 1, kind: 'watch-ledger', exported: new Date().toISOString(), nights: read() }, null, 2)
}

/**
 * Merge an exported file in. MERGE, not replace, exactly like My Picks:
 * restoring a phone's backup onto a laptop must not delete the laptop's
 * nights. A same-date collision takes the incoming row, since you only export
 * when you mean to move a record.
 */
export function importLedger(text) {
  let incoming
  try { incoming = JSON.parse(text) } catch { return { ok: false, error: 'Not valid JSON.' } }
  const nights = incoming?.nights && typeof incoming.nights === 'object' ? incoming.nights : null
  if (!nights) return { ok: false, error: "That file doesn't look like a watchlist record export." }
  const all = read()
  const before = Object.keys(all).length
  Object.entries(nights).forEach(([date, row]) => {
    if (row && typeof row === 'object') all[date] = row
  })
  write(all)
  const after = Object.keys(read()).length
  return { ok: true, added: after - before, nights: after }
}

export function clearLedger() {
  try { localStorage.removeItem(KEY) } catch {}
}
