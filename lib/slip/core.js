// THE SLIP, PURE PARTS (2026-10-17, Donovan: "make sure the players go to the bet slip so they can see"). No React, no storage: plain functions the
// store (lib/slip/store.js), the panel (components/Slip.js) and scripts/check-slip.mjs all share.
//
// A LEG: { key, sport, id, name, team, market, line, side, game, price, source, at }
//   key     `${rowKey}|${market}`, the key PropCards always used (so a slip saved before this file still reads)
//   price   a REAL book price (American) or null. Never invented: a leg with no price shows without one.
//   source  'card' | 'player' | 'called' | 'seed' | 'mlb' (where the add came from)
// A slip saved by the old PropCards has legs { key, name, market, price, game, at }: every new field is optional, so it survives as-is.

/** The localStorage keys the slip has always used, per sport (`${precisionKey}_slip_v1`). One table, so the legacy shape survives. */
export const SLIP_KEYS = Object.freeze({
  mlb: 'moonshot_precision_v1_slip_v1',
  nfl: 'tuddy_precision_v1_slip_v1',
  nhl: 'lamp_precision_v1_slip_v1',
  nba: 'buckets_precision_v1_slip_v1',
})
// ONE SHARED SLIP (2026-10-25, Donovan: "shared one because we may need to make edits"): every sport's legs live under this one key, so a
// parlay can cross sports. The four keys above are only READ, once, to carry a slip saved before this change into the shared one.
export const SLIP_KEY_ALL = 'dash_slip_v2'
export const SLIP_SPORTS = Object.freeze(Object.keys(SLIP_KEYS))
export const SLIP_DAY_MS = 864e5
/** Most legs 'Add tonight's called picks' adds: a member's six, a free viewer's two (the example). */
export const CALLED_CAP = Object.freeze({ member: 6, example: 2 })

const num = (v) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) && x !== 0 ? x : null }

/** One stored leg -> a clean leg, or null when it is not one. The price stays null unless it is a real number. */
export function cleanLeg(l) {
  if (!l || typeof l !== 'object' || typeof l.key !== 'string' || !l.key) return null
  return { ...l, price: num(l.price), at: Number.isFinite(Number(l.at)) ? Number(l.at) : 0 }
}

/** What localStorage holds -> the legs under a day old. Never throws. */
export function readLegs(raw, now = Date.now()) {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.map(cleanLeg).filter((l) => l && now - l.at < SLIP_DAY_MS) : []
  } catch { return [] }
}

// A leg is the same leg when key AND sport match: two sports can reuse a key shape. A leg with no sport (saved by the old PropCards) matches any.
const same = (l, key, sport) => l.key === key && (!sport || !l.sport || l.sport === sport)

/** Add one leg (a leg already on the slip is not added twice). */
export function withLeg(legs, leg, now = Date.now()) {
  const c = cleanLeg({ at: now, ...leg })
  if (!c || legs.some((l) => same(l, c.key, c.sport))) return legs
  return [...legs, c]
}
/** Add several, in order. */
export const withLegs = (legs, add, now = Date.now()) => add.reduce((cur, l) => withLeg(cur, l, now), legs)
export const withoutLeg = (legs, key, sport = null) => legs.filter((l) => !same(l, key, sport))
/** Tap again to take it off. */
export const toggledLeg = (legs, leg, now = Date.now()) => (legs.some((l) => same(l, leg.key, leg.sport)) ? withoutLeg(legs, leg.key, leg.sport) : withLeg(legs, leg, now))

/** This sport's legs out of the shared slip. */
export const legsOfSport = (legs, sport) => legs.filter((l) => l.sport === sport)
/** The legs grouped in sport order: [[sport, legs]], sports with none left out. */
export const bySport = (legs) => SLIP_SPORTS.map((s) => [s, legsOfSport(legs, s)]).filter(([, ls]) => ls.length)

/**
 * A slip saved before the shared one -> the shared legs. `raws` = { mlb: string|null, ... } straight from the four legacy keys. Each leg is
 * stamped with the sport its key came from (an old leg has none), stale ones drop (readLegs), and a leg on two lists is kept once.
 */
export function mergeLegacy(raws, now = Date.now()) {
  return SLIP_SPORTS.reduce((cur, s) => withLegs(cur, readLegs(raws?.[s], now).map((l) => ({ ...l, sport: l.sport || s })), now), [])
}

/** Replace the price on one leg with the user's own (their book's number). Never invents one: a bad number leaves the leg as it was. */
export function withPrice(legs, key, sport, price) {
  const p = num(price)
  if (p == null || Math.abs(p) < 100) return legs
  return legs.map((l) => (same(l, key, sport) ? { ...l, price: p, priceEdited: true } : l))
}

function decimal(am) { const v = Number(am); return v > 0 ? 1 + v / 100 : 1 + 100 / -v }
/**
 * The combined price, only when EVERY leg has a real price: { allPriced, priced, total, decimal }. decimal is null otherwise (no guessing a
 * price for a leg that has none).
 */
export function combined(legs) {
  const priced = legs.filter((l) => num(l.price) != null).length
  const allPriced = legs.length > 0 && priced === legs.length
  return { allPriced, priced, total: legs.length, decimal: allPriced ? legs.reduce((t, l) => t * decimal(l.price), 1) : null }
}

/**
 * 'ADD TONIGHT'S CALLED PICKS'. `cands` are tonight's not-started CALLED picks that have a priced market, in the board's own order:
 * [{ key, free, leg }], `free` = one of the boards' free four (components/MemberGate.js). A member gets the first CALLED_CAP.member;
 * everyone else (a free viewer OR unknown membership) gets only the free ones, at most CALLED_CAP.example, so a pick hidden from a
 * non-member is never reachable here. { mode, legs, total } (total = how many called, priced picks tonight, a count for the Join line).
 */
export function calledLegs(cands, memberState) {
  const member = memberState === 'member'
  const pool = member ? cands : cands.filter((c) => c.free)
  const cap = member ? CALLED_CAP.member : CALLED_CAP.example
  return { mode: member ? 'member' : 'example', legs: pool.slice(0, cap).map((c) => ({ ...c.leg, source: 'called' })), total: cands.length }
}
