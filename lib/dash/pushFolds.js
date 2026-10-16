// PHONE PUSH FOLDS (2026-10-16). Donovan approved folding many push kinds into few so nobody mutes on day one.
// PURE: no I/O. Everything here is behind PUSH_FOLDS_ON (default OFF); with it off none of these functions is called and the sender behaves exactly as before.
//
//   1. GAME OFF   every gameoff variant (delay with/without a lineup, postponed, puck drop late, kickoff moved, weather delay in game, delayed) is ONE push titled
//                 "Game update" whose body says what changed. The push carries a stable `tag` per game, so a second change to the same game REPLACES the first on the phone
//                 (public/sw.js: same tag = replace + renotify) instead of stacking. Each change keeps its own claim key, so every real change is still sent once.
//   2. PREGAME    boardup + lineupin + puckdrop become ONE "Tonight's plays are in" per person per push-day; lastcall becomes ONE reminder per person per push-day,
//                 only when a pick in it is still un-acted. Never more than these two.
//   3. DAILY CAP  per PERSON (all their devices) per push-day (6 am ET): NON-LIVE pushes stop at PUSH_DAILY_CAP (default 6, 0 = unlimited). Live CALLED events and
//                 everything that grades always pass. Over-cap pushes are dropped (logged `dropped`, never queued) and counted in the tick's totals.
//   4. SCRATCHES  a scratch / dropout push is dropped ONLY when the producer stamped it `called: false` (today MLB board men). Unstamped events (NHL, NFL, NBA ...) pass as before.
//                 (The page-open toast-scr in components/MiniWire.js is client code and is NOT changed by this switch.)
import { folds as foldCopy } from '../copy/notifications'

export const foldsOn = (env = (typeof process !== 'undefined' ? process.env : {})) => /^(on|1|true)$/i.test(String(env?.PUSH_FOLDS_ON || ''))

export const DEFAULT_FOLD_CAP = 6
/** PUSH_DAILY_CAP under the folds: unset/invalid = 6, 0 = unlimited. */
export function foldCap(env = (typeof process !== 'undefined' ? process.env : {})) {
  const raw = env?.PUSH_DAILY_CAP
  if (raw == null || String(raw).trim() === '') return DEFAULT_FOLD_CAP
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FOLD_CAP
}

/** Categories that are LIVE CALLED events (a homer, a touchdown, a goal, a 30 -- and the "any called man" twins) or that GRADE: never counted, never dropped by the cap. */
export const CAP_EXEMPT_CATEGORIES = new Set([
  'homer', 'slam', 'nfltd', 'nhlgoal', 'nba30', 'nhlcalled', 'nflcalled', 'nbacalled',
  'callsgraded', 'recap', 'finalline', 'barcleared', 'weekly', 'nflfinal', 'nhlfinal',
])
export const countsAgainstCap = (e) => Boolean(e) && e.sport !== 'fantasy' && !CAP_EXEMPT_CATEGORIES.has(String(e.category || ''))

// ── global stage: runs once per sweep on every produced event, before the claim ──
const OFF_KEY = /^([a-z]+):([^:]+):([^:]+):off:/
const stripLead = (t) => String(t || '').replace(/^[^A-Za-z0-9]+/, '').trim()
const SCRATCH = new Set(['scratched', 'dropout'])

/** Returns { events, dropped }. gameoff -> one "Game update" per game (stable tag); scratched / dropout -> only when `called === true`. */
export function foldGlobal(events) {
  const out = []
  const offByGame = new Map()
  let dropped = 0
  for (const e of events) {
    const cat = String(e?.category || '')
    if (SCRATCH.has(cat) && e.called === false) { dropped += 1; continue }
    if (cat === 'gameoff') {
      const m = OFF_KEY.exec(String(e.key || ''))
      if (m) {
        const gk = `${m[1]}:${m[2]}:${m[3]}`
        const body = String(e.body || '')
        const note = foldCopy.gameUpdate({ head: stripLead(e.title), facts: body ? body.split(' · ') : [] })
        const next = { ...e, ...note, tag: `gameoff:${gk}` }
        if (offByGame.has(gk)) { out[offByGame.get(gk)] = next; dropped += 1; continue }   // two changes in one sweep: the later one wins
        offByGame.set(gk, out.length)
        out.push(next)
        continue
      }
    }
    out.push(e)
  }
  return { events: out, dropped }
}

// ── per-person stage: after wants() (so every per-kind switch is respected), before the cap ──
const PLAYS = new Set(['boardup', 'lineupin', 'puckdrop'])

/**
 * @param mine   this person's events that passed wants()
 * @param today  { keys: Set<string> } the event_keys already sent to this person since 6 am ET
 * @param opts   { day, actedIds?: () => Set<string> }  actedIds = picks the person has already acted on (default none: nothing in the push layer records it)
 * @returns { send, folded }  folded = [{ event, detail, quiet? }]  (quiet = covered by the folded push that was sent: no log row of its own)
 */
export function foldPregame(mine, today = {}, opts = {}) {
  const keys = today.keys instanceof Set ? today.keys : new Set()
  const day = opts.day || 'day'
  const playsKey = `fold:${day}:plays`
  const remindKey = `fold:${day}:reminder`
  const acted = typeof opts.actedIds === 'function' ? opts.actedIds() : new Set()
  const send = []
  const folded = []   // [{ event, detail }]: swallowed by a fold, logged `dropped`, counted as folded (not as capped)
  const family = []
  let reminder = null
  for (const e of mine) {
    const cat = String(e.category || '')
    if (PLAYS.has(cat)) { family.push(e); continue }
    if (cat === 'lastcall') {
      const ids = (e.playerIds || []).map(String)
      const open = ids.filter((id) => !acted.has(id))
      if (keys.has(remindKey) || reminder || (ids.length && !open.length)) { folded.push({ event: e, detail: 'folded: one reminder a day' }); continue }
      reminder = { ...e, key: remindKey }
      send.push(reminder)
      continue
    }
    send.push(e)
  }
  if (family.length) {
    if (keys.has(playsKey)) {
      for (const e of family) folded.push({ event: e, detail: 'folded: plays already sent today' })
    } else {
      const board = family.find((e) => e.category === 'boardup')
      const src = board || family[0]
      const note = foldCopy.playsIn({ detail: board ? String(board.body || '') : '' })
      const ids = new Set()
      for (const x of family) for (const id of x.playerIds || []) ids.add(String(id))
      send.push({
        sport: src.sport, url: src.url, category: 'boardup', priority: 1, key: playsKey, ...note,
        ...(ids.size ? { playerIds: [...ids] } : {}),
      })
      for (const e of family) folded.push({ event: e, detail: 'folded into plays', quiet: true })
    }
  }
  return { send, folded }
}

// ── the cap ──
/** @param countToday non-live pushes already sent to this person since 6 am ET. cap 0 = unlimited. */
export function applyFoldCap(events, countToday = 0, cap = foldCap()) {
  if (!cap) return { send: [...events], held: [] }
  let n = Number(countToday) || 0
  const send = []
  const held = []
  for (const e of events) {
    if (!countsAgainstCap(e)) { send.push(e); continue }
    if (n >= cap) { held.push(e); continue }
    n += 1
    send.push(e)
  }
  return { send, held }
}

/** Count the log rows ({ category, sport }) that count against the cap. */
export const tallyCapLog = (rows) => (rows || []).filter((r) => countsAgainstCap({ category: r.category, sport: r.sport })).length

