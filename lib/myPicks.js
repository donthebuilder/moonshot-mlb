'use client'

// 🎫 MY PICKS — your card against the bot's, graded by the bot's own rules.
//
// 2026-08-14, Donovan: "i wanted the picks to be inter cahngeable or
// opuritnituty to put who you want in place and of hit picks and such and if
// possible have that graded at the end of the night, this feature is mainly
// for me to hep me figure what i think goes and thien to compare hit rate to
// the bot to update scoing."
//
// So: swap into the bot's per-game slots, lock at first pitch, grade overnight,
// and keep a running head-to-head. Four decisions worth writing down, because
// each one is what makes the resulting number mean anything.
//
// 1. THE GRADING RULE IS pickCleared(), NOT A NEW ONE. Your pick fills a slot
//    and is judged by that slot's bar — HR needs a homer, HIT needs a hit,
//    HRR needs 2+ of H/R/RBI, CONTACT needs 2 total bases. If this file ever
//    disagreed with pickCleared, your hit rate and the bot's would be measured
//    on different rulers and the comparison would be worthless.
//
// 2. THE BOT'S PICK IS SNAPSHOTTED AT SWAP TIME. The published slate re-picks
//    through the day (lineups land, players scratch). If we looked up "who the
//    bot picked" at GRADING time, a slot you contested at 2pm could be graded
//    against a completely different name by 7pm, and the head-to-head would be
//    measuring the bot against itself. The name you were disagreeing with is
//    the name you get scored against.
//
// 3. VOID IS NOT A MISS — on either side. A pick whose player never batted
//    returns null from pickCleared and is dropped from both numerators and
//    both denominators. Same rule the bot's own tracker and the watch ledger
//    already use. A slot only counts as contested when BOTH sides are
//    judgeable; grading your hit against his void would be free credit.
//
// 4. LOCK AT FIRST PITCH. Once a game starts its slots freeze. This is the
//    only thing standing between "a record" and "a story" — an editable past
//    is not evidence, and the whole point of this feature is evidence.
//
// STORAGE is device-local, exactly like lib/watchLedger.js: there is no server
// here, the site is read-only by design. Said plainly wherever it renders, and
// there is an export button so the record can move or be backed up.
//
// ── THE SCOREBOARD LAYER (2026-08-15) ────────────────────────────────────────
//
// Donovan: "my picks needs to be like a fun game area but serious business as
// well because it is still…". The first version was an honest ledger and read
// like one: four grey tiles and a paragraph. What it never gave you was the
// thing that makes you come back — a standing, a streak, a call you're proud
// of, and a sense of what's riding tonight before the games start.
//
// Everything added below (byRole, calls, streaks, coinTail) is a RE-SLICING of
// the same contested-slot arithmetic decisions 1–4 already fixed. None of it
// is a second, softer definition of a win:
//
//   · a slot that is not CONTESTED cannot appear in byRole or in calls, for
//     the identical reason it can't appear in w/l/t — one side wasn't
//     judgeable, so there was no contest to score.
//   · voids and untracked slots stay out of every numerator AND every
//     denominator here too.
//   · a "call" records the bot name SNAPSHOTTED at swap time (decision 2), so
//     the highlight reel names who you actually disagreed with.
//   · streaks are a description of nights already played. There is no claim,
//     anywhere in this file or the tab, that a run predicts the next night.
//     Say it in the UI in those words if it ever needs saying.
//
// A binary slot has no margin — you cleared the bar or you didn't — so "best
// call" is ranked by the only magnitude a slot carries: how sure you said you
// were at the time. That's stated on screen rather than left to be inferred.

import { pickCleared } from './liveSlate'
import { gradedByPid } from './graded'

const KEY = 'my_picks_v1'
const CAP = 120           // nights of ledger kept; a row is ~120 bytes
const SLATE_CAP = 45      // nights of raw picks kept; the ledger outlives them
// Decided contested slots kept per night for the highlight reel. A row costs
// ~70 bytes a call, so twelve is under a kilobyte on the busiest night and the
// whole 120-night ledger still measures in tens of KB. Pushes are not stored:
// they are already in the t column and there is no "best push".
const CALL_CAP = 12

export const ROLES = ['HR', 'HIT', 'HRR', 'CONTACT']

// Written out rather than left implicit in pickCleared, so the UI can say what
// a slot is asking for. If these ever drift from pickCleared, pickCleared wins.
export const BAR = {
  HR: '1+ home run',
  TOP: '1+ home run',
  HIT: '1+ hit',
  HRR: '2+ of hits, runs, RBI',
  CONTACT: '2+ total bases',
}

const EMPTY = { slates: {}, ledger: {} }

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw || typeof raw !== 'object') return { ...EMPTY }
    return {
      slates: raw.slates && typeof raw.slates === 'object' ? raw.slates : {},
      ledger: raw.ledger && typeof raw.ledger === 'object' ? raw.ledger : {},
    }
  } catch { return { ...EMPTY } }
}

function write(store) {
  try {
    // Newest-first trim. Keys are YYYY-MM-DD, so lexical sort is chronological.
    const trim = (obj, cap) => {
      const keys = Object.keys(obj).sort().slice(-cap)
      const out = {}
      keys.forEach((k) => { out[k] = obj[k] })
      return out
    }
    localStorage.setItem(KEY, JSON.stringify({
      slates: trim(store.slates || {}, SLATE_CAP),
      ledger: trim(store.ledger || {}, CAP),
    }))
  } catch { /* private mode, quota — this is a nicety, never a blocker */ }
}

export const slotKey = (gamePk, role) => `${gamePk}|${role}`

// ── the lock ──────────────────────────────────────────────────────────────────

/**
 * A slot is frozen once its game has started.
 *
 * Reads the CURRENT published first pitch rather than the one stored at swap
 * time, so a postponement legitimately reopens the slot. That direction is
 * safe: you can't postpone a game to un-miss a pick.
 */
export function isLocked(gameTime, now = Date.now()) {
  const t = gameTime ? new Date(gameTime).getTime() : NaN
  if (!Number.isFinite(t)) return false   // no time published — don't freeze blind
  return now >= t
}

// ── the picks ─────────────────────────────────────────────────────────────────

/** Every override you've made on a date. `{ [slotKey]: entry }` */
export function getPicks(dateKey) {
  if (!dateKey) return {}
  return read().slates[dateKey] || {}
}

/**
 * Put your guy in a slot.
 *
 * `bot` is the bot's designated pick AT THIS MOMENT — see decision (2) above.
 * Passing your own pick as the same player clears the override instead of
 * recording an agreement: a slot you didn't actually contest shouldn't show up
 * in a head-to-head.
 */
// How sure are you? Same three words as the NFL card, because the whole point
// is comparing your own tiers against each other later: if your locks hit at
// the same rate as your leans, the conviction was decoration.
export const CONVICTION = [
  ['lean', 'Lean', 'A hunch. Worth logging, not worth much.'],
  ['strong', 'Strong', "You'd bet it."],
  ['lock', 'Lock', 'You think the bot is plainly wrong here.'],
]
export const CONVICTION_ORDER = CONVICTION.map(([k]) => k)

export function savePick(dateKey, gamePk, role, mine, bot, conviction = 'strong') {
  if (!dateKey || !gamePk || !role || !mine?.player_id) return getPicks(dateKey)
  if (bot?.player_id && Number(bot.player_id) === Number(mine.player_id)) {
    return clearPick(dateKey, gamePk, role)
  }
  const store = read()
  const day = store.slates[dateKey] || (store.slates[dateKey] = {})
  const key = slotKey(gamePk, role)
  const prev = day[key]
  day[key] = {
    game_pk: gamePk,
    role,
    pid: Number(mine.player_id),
    name: mine.player_name || mine.name || '',
    team: mine.team || '',
    bot_pid: bot?.player_id ? Number(bot.player_id) : null,
    bot_name: bot?.player_name || bot?.name || '',
    conviction: CONVICTION_ORDER.includes(conviction) ? conviction : 'strong',
    // Keep the original stamp when only the conviction changes — "when did I
    // make this call" should survive an upgrade to lock.
    at: prev && Number(prev.pid) === Number(mine.player_id) ? prev.at : Date.now(),
  }
  write(store)
  return store.slates[dateKey]
}

/** Change how sure you are without touching the pick itself. */
export function setConviction(dateKey, gamePk, role, conviction) {
  const store = read()
  const day = store.slates[dateKey]
  const e = day?.[slotKey(gamePk, role)]
  if (e && CONVICTION_ORDER.includes(conviction)) { e.conviction = conviction; write(store) }
  return store.slates[dateKey] || {}
}

export function clearPick(dateKey, gamePk, role) {
  const store = read()
  const day = store.slates[dateKey]
  if (day) { delete day[slotKey(gamePk, role)]; write(store) }
  return store.slates[dateKey] || {}
}

// ── grading ───────────────────────────────────────────────────────────────────

// The graded file speaks actual_*; pickCleared speaks the live box line. One
// adapter, so there is still only one grading rule.
export function lineFromGraded(row) {
  if (!row) return null
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
  return {
    ab: n(row.actual_ab), h: n(row.actual_hits), hr: n(row.actual_hr),
    tb: n(row.actual_tb), r: n(row.actual_runs), rbi: n(row.actual_rbi),
  }
}

/**
 * Grade a slate.
 *
 * @param slots  [{ game_pk, role, bot, mine }] — the whole card, one entry per
 *               game per category. `mine` is null on slots you left alone.
 * @param results the published graded payload for THIS SAME DATE
 *
 * Returns per-slot verdicts plus the two summaries that answer different
 * questions:
 *
 *   h2h   — only slots you contested, only where both sides are judgeable.
 *           This is the number that could inform scoring: on the calls you
 *           actually disagreed with, who was right?
 *   card  — the whole slate, your card (bot's picks with your swaps applied)
 *           against the bot's untouched card. Softer, because it's mostly the
 *           bot's own picks on both sides, but it's the honest "how did my
 *           night go" figure.
 */
export function gradeSlate(slots, results) {
  const byPid = gradedByPid(results)

  // THREE OUTCOMES, NOT TWO. "no row in the graded file" and "batted zero
  // times" are different facts and must not collapse into one:
  //
  //   true / false   graded — cleared the bar, or didn't
  //   null           VOID — he was tracked and never batted
  //   undefined      UNTRACKED — the file has no line for him at all
  //
  // The published file carries ~90 tracked candidates a slate, not just the
  // designated picks, so most swaps land on someone with a line. Not all: pick
  // a deep-bench name and there is nothing to grade him against, ever. Showing
  // that as VOID would quietly imply he was watched and didn't play.
  const verdict = (pid, role) => {
    if (!pid) return undefined
    const row = byPid.get(Number(pid))
    if (!row) return undefined
    return pickCleared(role, lineFromGraded(row))
  }
  const judged = (v) => typeof v === 'boolean'

  const rows = (slots || []).map((s) => {
    const botOut = verdict(s.bot?.player_id, s.role)
    const mineOut = s.mine ? verdict(s.mine.pid, s.role) : undefined
    const contested = Boolean(s.mine) && judged(mineOut) && judged(botOut)
    return { ...s, botOut, mineOut, contested }
  })

  const h2h = { n: 0, mineWon: 0, botWon: 0, w: 0, l: 0, t: 0, byConv: {}, byRole: {}, calls: [] }
  rows.filter((r) => r.contested).forEach((r) => {
    h2h.n += 1
    // Per-tier tally — the whole reason conviction exists. If your locks and
    // your leans hit at the same rate, the tier was decoration, and only a
    // count kept from day one can ever say so.
    const cv = r.mine?.conviction || 'strong'
    const b = h2h.byConv[cv] || (h2h.byConv[cv] = { n: 0, w: 0, l: 0 })
    b.n += 1
    const won = Boolean(r.mineOut) && !r.botOut
    const lost = !r.mineOut && Boolean(r.botOut)
    if (won) b.w += 1
    else if (lost) b.l += 1
    // Per-CATEGORY tally — "which markets do I actually beat it in, and which
    // should I stop overriding". Same contested set, sliced by the slot's own
    // bar, so each category's number carries its own denominator and no
    // category can borrow another's volume.
    const rb = h2h.byRole[r.role] || (h2h.byRole[r.role] = { n: 0, w: 0, l: 0, mw: 0, bw: 0 })
    rb.n += 1
    if (r.mineOut) rb.mw += 1
    if (r.botOut) rb.bw += 1
    if (won) rb.w += 1
    else if (lost) rb.l += 1
    // The highlight reel. Decided slots only — a push has no story. `b` is the
    // bot name SNAPSHOTTED at swap time (decision 2), never tonight's slate
    // lookup, so the reel names the pick you actually argued with.
    if (won || lost) {
      h2h.calls.push({
        r: r.role,
        m: r.mine?.name || '',
        b: r.mine?.bot_name || '',
        c: cv,
        o: won ? 1 : 0,
      })
    }
    if (r.mineOut) h2h.mineWon += 1
    if (r.botOut) h2h.botWon += 1
    if (won) h2h.w += 1
    else if (lost) h2h.l += 1
    else h2h.t += 1
  })

  // Your card = the bot's slate with your swaps applied. Each side counts only
  // its own judgeable slots, so one void doesn't punish both.
  const card = { mineN: 0, mineWon: 0, botN: 0, botWon: 0 }
  rows.forEach((r) => {
    const mineOut = r.mine ? r.mineOut : r.botOut   // untouched slot = the bot's
    if (judged(mineOut)) { card.mineN += 1; if (mineOut) card.mineWon += 1 }
    if (judged(r.botOut)) { card.botN += 1; if (r.botOut) card.botWon += 1 }
  })

  return { rows, h2h, card, overrides: rows.filter((r) => r.mine).length }
}

/**
 * Write one night into the ledger. Idempotent by date — called on every render
 * of a live night, it overwrites that date's row and settles on final numbers
 * as the file grades. Nights with nothing judgeable are not recorded: a 0/0 row
 * would dilute the rate with a day that never asked a question.
 */
export function recordNight(dateKey, graded) {
  if (!dateKey || !graded) return null
  const { h2h, card, overrides } = graded
  if (!card.mineN && !card.botN) return null
  const row = {
    ov: overrides,
    conv: h2h.byConv,
    n: h2h.n, mw: h2h.mineWon, bw: h2h.botWon,
    w: h2h.w, l: h2h.l, t: h2h.t,
    cmn: card.mineN, cmw: card.mineWon, cbn: card.botN, cbw: card.botWon,
    // ADDED 2026-08-15, and added as NEW KEYS on the same row rather than as a
    // new shape: `my_picks_v1` rows already on the device keep working
    // untouched, they simply have no category split and no reel. Readers must
    // treat both as optional — ledgerTotals does, and prints how many of your
    // contested slots actually have a category on file so the older nights
    // aren't silently counted as belonging to some category.
    rl: h2h.byRole || {},
    cl: (h2h.calls || []).slice(0, CALL_CAP),
  }
  const store = read()
  store.ledger[dateKey] = row
  write(store)
  return row
}

/** Every recorded night, oldest first. */
export function readLedger() {
  const l = read().ledger
  return Object.keys(l).sort().map((date) => ({ date, ...l[date] }))
}

/**
 * One night's verdict on the head-to-head: +1 you cleared more contested slots
 * than the bot, -1 it cleared more, 0 neither.
 *
 * A night where you contested NOTHING is 0 — not a push you survived. It
 * breaks a streak rather than extending it, because a night you didn't play
 * isn't a night you won. One definition, used by the strip and the streak
 * counter both; the strip used to carry its own inline copy.
 */
export function nightVerdict(row) {
  if (!row || !Number(row.n)) return 0
  const mw = Number(row.mw) || 0
  const bw = Number(row.bw) || 0
  return mw > bw ? 1 : bw > mw ? -1 : 0
}

/**
 * Current and longest runs of nights, from the ledger.
 *
 * DESCRIPTIVE ONLY. This says what happened, in order. It is not evidence that
 * the next night goes the same way and the tab must never word it as if it
 * were — the sample here is nights, and there are dozens of them at best.
 */
export function streaks(rows) {
  let run = 0, last = 0, bestWin = 0, bestLoss = 0
  rows.forEach((r) => {
    const v = nightVerdict(r)
    run = v !== 0 && v === last ? run + 1 : (v === 0 ? 0 : 1)
    last = v
    if (v > 0 && run > bestWin) bestWin = run
    if (v < 0 && run > bestLoss) bestLoss = run
  })
  return { dir: last, len: last === 0 ? 0 : run, bestWin, bestLoss }
}

/**
 * P(a coin picking blind goes w-for-(w+l) or better) — the exact binomial
 * upper tail at p = 0.5.
 *
 * WHY IT'S ALLOWED HERE, when a 0-100 "score" isn't: this is not a rating and
 * not a probability that you're right tomorrow. It's a statement about the
 * null — how often pure guessing produces a record at least this lopsided —
 * computed from the SAME decided contested slots as w and l, with the
 * denominator printed next to it every time it renders. It is only shown once
 * there are enough decided slots for the answer not to be trivial.
 *
 * Exact, no approximation: the terms are walked with the ratio
 * C(n,k+1)/C(n,k) = (n-k)/(k+1), which keeps every intermediate in range for
 * any n reachable here. Beyond 1000 decided slots it returns null rather than
 * quietly underflowing to a suspiciously clean zero.
 */
export function coinTail(w, l) {
  const wins = Math.max(0, Math.round(Number(w) || 0))
  const n = wins + Math.max(0, Math.round(Number(l) || 0))
  if (!n || n > 1000) return null
  let term = 0.5 ** n          // C(n,0) · 2^-n
  let sum = wins === 0 ? term : 0
  for (let k = 0; k < n; k++) {
    term = (term * (n - k)) / (k + 1)
    if (k + 1 >= wins) sum += term
  }
  return Math.min(1, sum)
}

/** Totals across the last `days` recorded nights (all of them by default). */
export function ledgerTotals(days = null) {
  const rows = readLedger()
  const use = days ? rows.slice(-days) : rows
  const sum = (k) => use.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const pct = (a, b) => (b ? (100 * a) / b : null)
  const n = sum('n')
  // Conviction across every night — {lean:{n,w,l},…}. Sparse by design; a
  // tier you've never used simply isn't there.
  const conv = {}
  use.forEach((r) => Object.entries(r.conv || {}).forEach(([k, v]) => {
    const b = conv[k] || (conv[k] = { n: 0, w: 0, l: 0 })
    b.n += Number(v.n) || 0; b.w += Number(v.w) || 0; b.l += Number(v.l) || 0
  }))
  // Per-category standing, same sparse-by-design treatment. `roleN` is carried
  // separately and deliberately: nights recorded before the category split
  // existed have no `rl`, so the categories can add up to less than `n`, and
  // the tab says so rather than letting the two numbers quietly disagree.
  const role = {}
  use.forEach((r) => Object.entries(r.rl || {}).forEach(([k, v]) => {
    const b = role[k] || (role[k] = { n: 0, w: 0, l: 0, mw: 0, bw: 0 })
    b.n += Number(v.n) || 0; b.w += Number(v.w) || 0; b.l += Number(v.l) || 0
    b.mw += Number(v.mw) || 0; b.bw += Number(v.bw) || 0
  }))
  const roleN = Object.values(role).reduce((a, v) => a + v.n, 0)
  // The reel, newest last, each call carrying the night it happened on.
  const calls = []
  use.forEach((r) => (r.cl || []).forEach((c) => calls.push({ date: r.date, ...c })))
  return {
    conv,
    role,
    roleN,
    calls,
    streak: streaks(use),
    decided: sum('w') + sum('l'),
    nights: use.length,
    overrides: sum('ov'),
    n,
    mineWon: sum('mw'), botWon: sum('bw'),
    w: sum('w'), l: sum('l'), t: sum('t'),
    minePct: pct(sum('mw'), n), botPct: pct(sum('bw'), n),
    cardMinePct: pct(sum('cmw'), sum('cmn')), cardBotPct: pct(sum('cbw'), sum('cbn')),
    cardMineN: sum('cmn'), cardBotN: sum('cbn'),
    cardMineWon: sum('cmw'), cardBotWon: sum('cbw'),
    rows: use,
  }
}

// ── portability ───────────────────────────────────────────────────────────────

export function exportStore() {
  return JSON.stringify({ v: 1, exported: new Date().toISOString(), ...read() }, null, 2)
}

/**
 * Merge an exported file in. MERGE, not replace — importing a phone's backup
 * onto a laptop should not delete the laptop's nights. Same-date collisions
 * take the incoming row, since you only export when you mean to move a record.
 */
export function importStore(text) {
  let incoming
  try { incoming = JSON.parse(text) } catch { return { ok: false, error: 'Not valid JSON.' } }
  if (!incoming || typeof incoming !== 'object' || (!incoming.slates && !incoming.ledger)) {
    return { ok: false, error: "That file doesn't look like a My Picks export." }
  }
  const store = read()
  const before = Object.keys(store.ledger).length
  Object.assign(store.slates, incoming.slates || {})
  Object.assign(store.ledger, incoming.ledger || {})
  write(store)
  const after = Object.keys(read().ledger).length
  return { ok: true, added: after - before, nights: after }
}

export function clearAll() {
  try { localStorage.removeItem(KEY) } catch {}
}
