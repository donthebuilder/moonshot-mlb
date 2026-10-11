// THE INJURY READER: one fetch per sport per window, cached, never a guess. Server only.
//
// STABLE SHAPE (team pages, game pages and the pools all read this; do not rename):
//   readInjuries(sport) -> {
//     sport, ok, unavailable, reason, stale,
//     asOf,        ms epoch of OUR fetch
//     sourceAt,    ISO of ESPN's own timestamp (or null)
//     entries,     [{ sport, team, player_id, espnId, name, position, status, rawStatus, note, returnDate, updatedAt, source }]
//     skipped,     { [raw word we do not map]: count }
//   }
//   unavailable true => entries is [] and the page says "Injury report unavailable", NEVER "nobody is out".
//
// CACHE: Next's data cache (revalidate 20 min) + a per-instance memo of the parsed snapshot for the same window.
// NO cron: the pools prime it (primeInjuries) when they already run; pages read it through /api/injuries/[sport].
// A failed refresh serves the last good snapshot flagged stale; past MAX_AGE_MS it is unavailable.
import { normaliseEspn } from './normalise'
import { indexEntries, injuryVerdict } from './lookup'

export const SPORTS = ['nfl', 'nhl', 'mlb', 'nba']
const PATH = { nfl: 'football/nfl', nhl: 'hockey/nhl', mlb: 'baseball/mlb', nba: 'basketball/nba' }
export const INJURY_URL = (sport) => `https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/injuries`
export const TTL_S = 1200                       // 20 minutes
export const STALE_MS = 3 * 3600 * 1000         // older than this: served, flagged stale
export const MAX_AGE_MS = 6 * 3600 * 1000       // older than this: not used at all
const UA = 'DASHNetwork/1.0'                    // ESPN answers 403 to a UA that carries a URL

const _memo = new Map()                          // sport -> { at, snap, index }
const unavailable = (sport, reason) => ({ sport, ok: false, unavailable: true, reason, stale: false, asOf: null, sourceAt: null, entries: [], skipped: {} })

export function snapshotFrom(sport, json, now = Date.now()) {
  const n = normaliseEspn(sport, json)
  if (!n.teams) return unavailable(sport, 'the feed listed no clubs')
  const srcMs = Date.parse(n.sourceAt || '')
  return { sport, ok: true, unavailable: false, reason: null, stale: Number.isFinite(srcMs) && now - srcMs > STALE_MS, asOf: now, sourceAt: n.sourceAt, entries: n.entries, skipped: n.skipped }
}

/** @param opts.fetchImpl  test seam */
export async function readInjuries(sport, { now = Date.now(), fetchImpl = fetch, force = false } = {}) {
  if (!PATH[sport]) return unavailable(sport, 'unknown sport')
  const hit = _memo.get(sport)
  if (!force && hit && now - hit.at < TTL_S * 1000) return hit.snap
  try {
    const res = await fetchImpl(INJURY_URL(sport), { headers: { Accept: 'application/json', 'User-Agent': UA }, next: { revalidate: TTL_S } })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const snap = snapshotFrom(sport, await res.json(), now)
    if (snap.unavailable) throw new Error(snap.reason)
    _memo.set(sport, { at: now, snap, index: indexEntries(sport, snap.entries) })
    return snap
  } catch (e) {
    console.error(`[injuries] ${sport} read failed: ${e?.message || e}`)
    if (hit && now - hit.snap.asOf <= MAX_AGE_MS) return { ...hit.snap, stale: now - hit.snap.asOf > STALE_MS || hit.snap.stale }
    return unavailable(sport, 'injury report unavailable')
  }
}

/** Warm the memo for the pools (Card, Slate, write-ups ...) before their synchronous naming checks run. Never throws. */
export async function primeInjuries(sports = SPORTS, opts = {}) {
  await Promise.all(sports.map((s) => readInjuries(s, opts).catch(() => null)))
}

/** Synchronous view for namingChecks: the index of the last good snapshot, or null when none / too old (gating then adds nothing). */
export function peekIndex(sport, now = Date.now()) {
  const hit = _memo.get(sport)
  if (!hit || now - hit.snap.asOf > MAX_AGE_MS) return null
  return hit.index
}

/** The gating verdict for one man from the primed snapshot: null | { entry, status, blocked, word }. */
export function verdictFor(sport, who, now = Date.now()) {
  return injuryVerdict(peekIndex(sport, now), who)
}

/** TEST SEAMS (fixtures only). */
export function __setSnapshotForTest(sport, snap, at = Date.now()) {
  if (!snap) { _memo.delete(sport); return }
  _memo.set(sport, { at, snap: { ...snap, asOf: snap.asOf ?? at }, index: indexEntries(sport, snap.entries) })
}
