// THE CARD AND THE TWO-MAN: THE PURE HALF (2026-10-10, Donovan's decisions).
//
// A CARD is what one slate (a night; a football game window) is called as:
//   3 STRAIGHTS  the top three CALLED players by score, flat 1 unit each
//   1 TWO-MAN    the two highest-scored CALLED players from DIFFERENT games, flat 0.5 unit
// both frozen at the lock and never edited after it. Graded from the real box score:
//   a straight   hit / miss; a player who did not play voids it
//   a two-man    BOTH-OR-NOTHING: both legs hit = hit; any leg void (did not play, postponed) = void, never a loss; else miss
// DONOVAN'S TWO-MAN is a separate lane (lane 'donovan'): two players he enters by hand BEFORE the lock, with a one-to-three line note.
// It has its own rows, its own record, and is never counted in the bot's.
//
// THE SELECTION RULE IS FIXED AND PUBLISHED (CARD_RULE_TEXT): nothing here depends on who runs it or when beyond the clock
// handed in. Candidates are the sport's CALLED players (the labels come from lib/callStatus / lib/nhl/goalModel scoreNight,
// never re-derived here) whose game has not started. Ranked by score, ties by the model's rate, then the earlier start, then the
// player id, so the order never depends on the order the feed listed them in.
//
// Pure: no fetch, no clock but `now`. The reads are lib/card/sources.js, the writes lib/card/store.js, the posts lib/card/post.js.
// Tests: scripts/check-two-man.mjs (TEST data only).
import { wilson } from '../interval.js'

export const CARD_VERSION = 'card-v1'
export const CARD_RULE = { straight: 'straight-top3-called-v1', two_man: 'two-man-top2-different-games-v1', donovan: 'donovan-hand-picked-v1' }
export const STRAIGHTS = 3
export const STAKE = { straight: 1, two_man: 0.5 }
/** Minutes before a card's first game that it locks (and that Donovan's entry closes). */
export const CARD_LOCK_LEAD_MIN = 60
/** Units are quoted only from this many priced graded calls (the site's existing rule: lib/odds/roi MIN_N). */
export const MIN_PRICED = 100
/** The sports the Card runs in. NBA (BUCKETS) is hidden and not built. */
export const CARD_SPORTS = ['nhl', 'nfl', 'mlb']

/** What each sport's straight is, in words (a table keyed by sport, not a ternary). */
export const CARD_WORDS = {
  nhl: { market: 'anytime goal', short: 'goal', window: 'night', brand: 'LAMP' },
  nfl: { market: 'anytime touchdown', short: 'TD', window: 'game window', brand: 'TUDDY' },
  mlb: { market: 'home run', short: 'HR', window: 'night', brand: 'MOONSHOT' },
}

export const CARD_RULE_TEXT = {
  straight: 'The three highest-scored CALLED players whose game has not started and who are not listed out, one unit each.',
  two_man: 'The highest-scored CALLED player, plus the highest-scored CALLED player from a different game; half a unit.',
  ties: 'A tie goes to the higher model rate, then the earlier start, then the player id.',
  grade: 'Graded from the box score. Both legs must land; a player who did not play voids the two-man.',
}

const fin = (v) => (typeof v === 'number' && Number.isFinite(v))
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const r1 = (v) => Math.round(v * 10) / 10

// ── SELECTION ─────────────────────────────────────────────────────────────────
/**
 * The fixed order: score high to low; ties by the model rate (high first, a missing rate last), then the earlier start,
 * then the player id. A candidate is { player_id, name, team, opp, game_id, game_date, start_ms, score, rate?, ... }.
 */
export function cmpCandidate(a, b) {
  const ra = fin(a.rate) ? a.rate : -Infinity
  const rb = fin(b.rate) ? b.rate : -Infinity
  return (b.score - a.score) || (rb - ra) || (a.start_ms - b.start_ms) || String(a.player_id).localeCompare(String(b.player_id))
}

/** The field: candidates with a real score, a real start and an id, whose game has NOT started, one per player (his best line kept), ranked. */
export function fieldOf(cands, now) {
  const seen = new Map()
  for (const c of cands || []) {
    if (!c || c.player_id == null || c.player_id === '' || c.game_id == null || !fin(c.score) || !fin(c.start_ms) || !fin(now) || !(c.start_ms > now)) continue
    const k = String(c.player_id)
    const prev = seen.get(k)
    if (!prev || cmpCandidate(c, prev) < 0) seen.set(k, { ...c, player_id: k, game_id: String(c.game_id) })
  }
  return [...seen.values()].sort(cmpCandidate)
}

/** The top three straights (fewer when the field is smaller; never padded). */
export const pickStraights = (cands, now, n = STRAIGHTS) => fieldOf(cands, now).slice(0, n)

/** The bot's Two-Man: the best candidate, then the best one from a DIFFERENT game. null when there is no second game. */
export function pickTwoMan(cands, now) {
  const f = fieldOf(cands, now)
  if (!f.length) return null
  const a = f[0]
  const b = f.find((c) => c.game_id !== a.game_id)
  return b ? [a, b] : null
}

/** What a leg stores of a candidate (the lock freezes exactly this). */
export const legOf = (c) => ({
  player_id: String(c.player_id), name: c.name || null, team: c.team || null, opp: c.opp || null, pos: c.pos || null,
  game_id: String(c.game_id), game_date: c.game_date, start_at: new Date(c.start_ms).toISOString(),
  score: fin(c.score) ? c.score : null, rate: fin(c.rate) ? Math.round(c.rate * 1000) / 1000 : null, role: c.role || null, why: c.why || null,
})

const startOf = (legs) => new Date(Math.min(...legs.map((l) => Date.parse(l.start_at)))).toISOString()

/**
 * THE LOCK. The rows to store for one card at `now`. Only players whose game has not started are in the field, so nothing is
 * ever written at or after a start. `lockAtMs` = the scheduled lock moment (CARD_LOCK_LEAD_MIN before the card's first game).
 * Returns [] when nothing can be called.
 */
export function lockRows({ sport, slate_key, card_date, cands, now, lockAtMs, version = CARD_VERSION, pairNote = null }) {
  const base = { sport, card_date, slate_key, lane: 'bot', model_version: version, locks_at: new Date(lockAtMs).toISOString() }
  const rows = pickStraights(cands, now).map((c, i) => {
    const legs = [legOf(c)]
    return { ...base, product: 'straight', slot: i + 1, rule: CARD_RULE.straight, stake: STAKE.straight, legs, leg_count: 1, note: null, start_at: startOf(legs) }
  })
  const two = pickTwoMan(cands, now)
  if (two) {
    const legs = two.map(legOf)
    const pn = typeof pairNote === 'function' ? pairNote(two[0], two[1]) : null
    if (pn) legs[0].pair_note = pn          // MLB: the measured pair rule the two meet (lib/pairEvidence), frozen with the call
    rows.push({ ...base, product: 'two_man', slot: 1, rule: CARD_RULE.two_man, stake: STAKE.two_man, legs, leg_count: 2, note: null, start_at: startOf(legs) })
  }
  return rows
}

/** True when a row may still be written at `now` (a row whose first game has started is refused). */
export const mayLockRow = (row, now) => fin(now) && Date.parse(row?.start_at) > now

/** May the card be locked now? From CARD_LOCK_LEAD_MIN before its first start, until that start. */
export function lockWindowOpen(firstStartMs, now, leadMin = CARD_LOCK_LEAD_MIN) {
  return fin(firstStartMs) && fin(now) && now >= firstStartMs - leadMin * 60e3
}
export const lockAtOf = (firstStartMs, leadMin = CARD_LOCK_LEAD_MIN) => firstStartMs - leadMin * 60e3

// ── THE NFL's WINDOWS ─────────────────────────────────────────────────────────
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/**
 * One card window per game DAY of the football week (the game's own Eastern date): Thursday night, Sunday, Monday night ...
 * `games` = the week file's games ({ game_id, kickoff }); `etDay(ms)` = the Eastern date of a kickoff (lib/data easternDate).
 * @returns [{ card_date, first_start_ms, last_start_ms, label }] oldest first
 */
export function nflWindowsOf(games, etDay) {
  const byDay = new Map()
  for (const g of games || []) {
    const t = Date.parse(String(g?.kickoff || ''))
    if (!g?.game_id || !Number.isFinite(t)) continue
    const d = etDay(t)
    const cur = byDay.get(d) || { first: Infinity, last: -Infinity }
    byDay.set(d, { first: Math.min(cur.first, t), last: Math.max(cur.last, t) })
  }
  return [...byDay.entries()].sort().map(([d, t]) => ({ card_date: d, first_start_ms: t.first, last_start_ms: t.last, label: `${WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d}` }))
}

// ── DONOVAN'S LANE ────────────────────────────────────────────────────────────
export const NOTE_MAX_LINES = 3
export const NOTE_MAX_CHARS = 420
/** Words and shapes his note may not carry: it can go to X, and X never sees links, hashtags, "lock", "guaranteed" or "winners". */
const NOTE_BANNED = [
  [/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|app|gg)\b/i, 'a link'],
  [/[#@][A-Za-z_]/, 'a hashtag or an @mention'],
  [/\block(?:ed|s|ing)?\b/i, 'the word "lock"'],
  [/guarantee/i, 'the word "guaranteed"'],
  [/\bwinners?\b/i, 'the word "winner"'],
  [/\bfree money\b|\bcan'?t lose\b|\bsure thing\b/i, 'a sure-thing phrase'],
]

/** A note, cleaned: one to three non-empty lines, trimmed. { ok, note } or { ok:false, error }. */
export function cleanNote(raw) {
  const lines = String(raw == null ? '' : raw).split(/\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (!lines.length) return { ok: false, error: 'Add a note of one to three lines.' }
  if (lines.length > NOTE_MAX_LINES) return { ok: false, error: `The note is ${lines.length} lines; three at most.` }
  const note = lines.join('\n')
  if ([...note].length > NOTE_MAX_CHARS) return { ok: false, error: `The note is too long (${[...note].length} characters; ${NOTE_MAX_CHARS} at most).` }
  for (const [re, what] of NOTE_BANNED) if (re.test(note)) return { ok: false, error: `The note carries ${what}; it can be posted, so it cannot.` }
  return { ok: true, note }
}

/**
 * Donovan's entry, checked and shaped. `field` = the card's candidates (the board/slate picker's real players, with their ids),
 * `playerIds` = the two he chose. Refused when: not two different real players, a game has started, the lock has passed, or the
 * note is not one to three clean lines. On success the row is ready to store (lane 'donovan').
 * @returns {{ ok: true, row } | { ok: false, error }}
 */
export function donovanRow({ sport, slate_key, card_date, field, playerIds, note, now, lockAtMs, version = CARD_VERSION }) {
  const ids = (playerIds || []).map((v) => String(v == null ? '' : v).trim())
  if (ids.length !== 2 || ids.some((v) => !v)) return { ok: false, error: 'Pick two players.' }
  if (ids[0] === ids[1]) return { ok: false, error: 'Pick two different players.' }
  if (!fin(now) || !fin(lockAtMs)) return { ok: false, error: 'No lock time for this card.' }
  const byId = new Map((field || []).map((c) => [String(c.player_id), c]))
  const legsIn = ids.map((id) => byId.get(id))
  if (legsIn.some((c) => !c)) return { ok: false, error: 'Both players must come from tonight\'s board.' }
  if (legsIn.some((c) => !(c.start_ms > now))) return { ok: false, error: 'A game has started; the entry is closed.' }
  if (now >= lockAtMs) return { ok: false, error: 'The lock has passed; the entry is closed.' }
  const n = cleanNote(note)
  if (!n.ok) return n
  const legs = legsIn.map(legOf)
  return {
    ok: true,
    row: {
      sport, card_date, slate_key, lane: 'donovan', model_version: version, locks_at: new Date(lockAtMs).toISOString(),
      product: 'two_man', slot: 1, rule: CARD_RULE.donovan, stake: STAKE.two_man, legs, leg_count: 2, note: n.note, start_at: startOf(legs),
    },
  }
}

// ── GRADING ───────────────────────────────────────────────────────────────────
/** One leg's word from what the box score said: { played, landed }. */
export const legWord = (s) => (s == null ? null : s.played === false ? 'void' : s.landed ? 'hit' : 'miss')

/**
 * The row's result from its legs' words ('hit' / 'miss' / 'void' / null = not final yet).
 *   straight   its one leg
 *   two-man    BOTH-OR-NOTHING: any leg void = void (never a loss); both hit = hit; else miss; nothing until BOTH legs are known
 */
export function productResult(product, legWords) {
  const w = legWords || []
  if (product === 'straight') return w[0] === 'hit' || w[0] === 'miss' || w[0] === 'void' ? w[0] : null
  if (w.length < 2 || w.some((x) => x !== 'hit' && x !== 'miss' && x !== 'void')) return null
  if (w.includes('void')) return 'void'
  return w.every((x) => x === 'hit') ? 'hit' : 'miss'
}

/** The fields a row takes once, when graded: { result, leg_results } or null. */
export function gradeCardRow(row, words) {
  const result = productResult(row?.product, words)
  return result ? { result, leg_results: words.map((w, i) => ({ player_id: row.legs?.[i]?.player_id ?? null, result: w })) } : null
}

/** A graded row may be written once: true when it has no result yet. */
export const isOpen = (row) => row && row.result == null

// ── THE RECORD ────────────────────────────────────────────────────────────────
/** Profit on a 1-unit stake that wins at American odds `a` (the same arithmetic as lib/odds/priceAtLock winProfit). */
const winProfit = (a) => (a > 0 ? a / 100 : 100 / -a)
/** The decimal payout multiple (stake included) of an American price. */
export const decimalOf = (a) => 1 + winProfit(a)
/** A decimal multiple back to American odds, whole number. */
export const americanOfDecimal = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)))

/**
 * The price of a row from its legs' stored prices (leg prices: [{ median, best }|null, ...]): a straight is its leg's price; a
 * two-man is the PRODUCT of its two legs' prices (the two stored anytime prices multiplied), and only when BOTH are on file.
 * @returns {{ median, best } | null}  American odds of the combined bet
 */
export function rowPrice(row, legPrices) {
  const p = legPrices || []
  if (p.length !== (row?.legs?.length || 0) || p.some((x) => !x || !fin(Number(x.median)) || !fin(Number(x.best)))) return null
  if (row.product === 'straight') return { median: Number(p[0].median), best: Number(p[0].best) }
  const dm = p.reduce((a, x) => a * decimalOf(Number(x.median)), 1)
  const db = p.reduce((a, x) => a * decimalOf(Number(x.best)), 1)
  return { median: americanOfDecimal(dm), best: americanOfDecimal(db), decimal: { median: dm, best: db } }
}

/** The count the model expects of ONE row if its legs were independent: the product of each leg's stored rate. null when a rate is missing. */
export function rowExpected(row) {
  const rates = (row?.legs || []).map((l) => num(l?.rate))
  return rates.length && rates.every((r) => r != null && r >= 0 && r <= 1) ? rates.reduce((a, b) => a * b, 1) : null
}

/**
 * ONE RECORD from rows (one product of one lane). `priceOf(row)` -> { median, best } | null (lib/card/store.js joins the stored lock
 * prices). Voids are no result. Units are quoted only at MIN_PRICED priced graded calls, at each row's flat stake; fewer says so.
 * @returns {{ n, graded, hits, misses, voids, pending, pct, ci, expected, expectedN, priced, units, unitsWhy }}
 */
export function recordOf(rows, { priceOf = () => null, minPriced = MIN_PRICED } = {}) {
  const out = { n: 0, graded: 0, hits: 0, misses: 0, voids: 0, pending: 0, pct: null, ci: null, expected: null, expectedN: 0, priced: 0, units: null, unitsWhy: null }
  let exp = 0
  const priced = []
  for (const r of rows || []) {
    out.n += 1
    if (r.result == null) { out.pending += 1; continue }
    if (r.result === 'void') { out.voids += 1; continue }
    if (r.result !== 'hit' && r.result !== 'miss') continue
    out.graded += 1
    if (r.result === 'hit') out.hits += 1; else out.misses += 1
    const e = rowExpected(r)
    if (e != null) { exp += e; out.expectedN += 1 }
    const p = priceOf(r)
    if (p) priced.push({ r, p })
  }
  if (out.graded) { out.pct = r1((100 * out.hits) / out.graded); out.ci = wilson(out.hits, out.graded) }
  if (out.expectedN) out.expected = r1(exp)
  out.priced = priced.length
  if (priced.length >= minPriced) {
    const ret = (key) => priced.reduce((a, { r, p }) => {
      const stake = num(r.stake) ?? STAKE[r.product] ?? 1
      if (r.result !== 'hit') return a - stake
      const dec = key === 'best' ? (p.decimal?.best ?? decimalOf(p.best)) : (p.decimal?.median ?? decimalOf(p.median))
      return a + stake * (dec - 1)
    }, 0)
    out.units = { median: Math.round(ret('median') * 10) / 10, best: Math.round(ret('best') * 10) / 10 }
  } else {
    out.unitsWhy = `not enough priced calls yet (${priced.length} of ${minPriced})`
  }
  return out
}

/** The three records a sport shows: the bot's straights, the bot's two-man, Donovan's two-man. Lanes are never mixed. */
export function recordsOf(rows, opts) {
  const by = (lane, product) => (rows || []).filter((r) => r.lane === lane && r.product === product)
  return { straight: recordOf(by('bot', 'straight'), opts), two_man: recordOf(by('bot', 'two_man'), opts), donovan: recordOf(by('donovan', 'two_man'), opts) }
}

// ── WORDS (the same sentence on the site, the ledger and the posts) ───────────
const ci = (x) => (x?.ci ? `${x.ci[0].toFixed(0)}–${x.ci[1].toFixed(0)}%` : null)
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`
const fmtAmerican = (a) => (a == null ? null : a > 0 ? `+${a}` : `${a}`)
export { fmtAmerican }

/**
 * A record as short plain sentences: K of N, how many the legs' stored rates expected if they were independent, the 95% range, and
 * units only when there are enough priced calls. Counts only; no chance is printed.
 */
export function recordWords(rec, { product = 'straight', who = '' } = {}) {
  if (!rec || (!rec.graded && !rec.voids && !rec.pending)) return []
  const nm = product === 'two_man' ? 'two-mans' : 'straights'
  const head = rec.graded
    ? `${who}${rec.hits} of ${rec.graded} ${nm} ${product === 'two_man' ? 'landed both legs' : 'hit'}${rec.pct != null ? ` (${rec.pct}%${ci(rec) ? `, 95% range ${ci(rec)}` : ''})` : ''}.`
    : `${who}No ${nm} graded yet${rec.pending ? ` (${rec.pending} waiting on a final)` : ''}.`
  const out = [head]
  if (rec.graded && rec.expected != null) out.push(`If the legs were independent we would expect ${rec.expected.toFixed(1)} (${rec.expectedN} of ${rec.graded} with a stored rate).`)
  if (rec.voids) out.push(`${rec.voids} voided (a player did not play).`)
  if (rec.units) out.push(`Flat stakes on ${rec.priced} priced calls: ${signed(rec.units.median)} units at the median price, ${signed(rec.units.best)} at the best.`)
  else if (rec.graded) out.push(`Units: ${rec.unitsWhy || 'not enough priced calls yet'}.`)
  return out
}
