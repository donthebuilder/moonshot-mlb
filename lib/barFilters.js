// 🎚 BAR FILTERS -- the game-type / splits chips over a player's bars (2026-10-21, Donovan: "where are the type of game filter
// or the splits filter. home away all that"). Sport-free: each sport hands its log rows plus accessors, and gets back chips
// in groups. Chips in one group are either/or; groups AND together. PropFinder has home/away and a rank band behind a
// FILTERS button; this adds what it doesn't: back-to-back vs rested, close game vs blowout (the margin he played in, which is
// the blowout-watch question asked of his own games), and his minutes. Every chip is a plain fact of the game, never a model
// number. Pure: no React, no network.

/** Days between two YYYY-MM-DD days (b after a). */
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)

/** "112-104" (either order) -> the margin, or null. */
export function marginOf(score) {
  const m = String(score || '').match(/(\d+)\D+(\d+)/)
  return m ? Math.abs(Number(m[1]) - Number(m[2])) : null
}

/**
 * Tag each game (oldest -> newest) with the facts the chips test: home, win, rest (days since HIS previous game in this log:
 * 0 = he played the day before), margin, min, rank, playoff. `get` names the sport's fields.
 */
export function tagGames(games, get) {
  return games.map((g, i) => {
    const day = get.day(g), prev = i > 0 ? get.day(games[i - 1]) : null
    return {
      g, home: get.home(g), win: get.win(g), min: get.min ? get.min(g) : null,
      rest: day && prev ? Math.max(0, daysBetween(prev, day) - 1) : null,
      margin: get.margin ? get.margin(g) : null, rank: get.rank ? get.rank(g) : null, playoff: get.playoff ? get.playoff(g) : false,
    }
  })
}

/**
 * The chips. opts: { close, blowout } margins, { minsAt } the minutes cut, { soft } the rank band (top / bottom N of 30),
 * { hasRank, hasPlayoff } to drop groups with nothing behind them.
 */
export function barChips({ close = 8, blowout = 15, minsAt = 30, soft = 10, hasRank = false, hasPlayoff = false, hasMin = true, extra = [] } = {}) {
  return [
    { group: 'ha', key: 'home', text: 'Home', test: (t) => t.home === true },
    { group: 'ha', key: 'away', text: 'Away', test: (t) => t.home === false },
    { group: 'res', key: 'w', text: 'W', test: (t) => t.win === true },
    { group: 'res', key: 'l', text: 'L', test: (t) => t.win === false },
    { group: 'rest', key: 'b2b', text: 'B2B', title: 'He played the day before', test: (t) => t.rest === 0 },
    { group: 'rest', key: 'rested', text: 'Rested', title: '2+ days off', test: (t) => t.rest != null && t.rest >= 2 },
    { group: 'mg', key: 'close', text: 'Close', title: `Final margin ${close} or less`, test: (t) => t.margin != null && t.margin <= close },
    { group: 'mg', key: 'blowout', text: 'Blowout', title: `Final margin ${blowout} or more`, test: (t) => t.margin != null && t.margin >= blowout },
    ...(hasMin ? [
      { group: 'min', key: 'big', text: `${minsAt}+ min`, test: (t) => t.min != null && t.min >= minsAt },
      { group: 'min', key: 'small', text: `<${minsAt} min`, test: (t) => t.min != null && t.min < minsAt },
    ] : []),
    ...(hasRank ? [
      { group: 'd', key: 'soft', text: 'Soft D', title: `Clubs in the top ${soft} of 30 at giving this up`, test: (t) => t.rank != null && t.rank <= soft },
      { group: 'd', key: 'tough', text: 'Tough D', title: `Clubs in the bottom ${soft} of 30 at giving this up`, test: (t) => t.rank != null && t.rank > 30 - soft },
    ] : []),
    ...(hasPlayoff ? [
      { group: 'type', key: 'po', text: 'Playoffs', test: (t) => t.playoff },
    ] : []),
    // a sport's own chips (BUCKETS: WITHOUT a teammate, 2026-10-24), same { group, key, text, test(tagged) } shape
    ...extra,
  ]
}

/** Keep the tagged games every picked chip passes. picked: { [group]: key }. */
export function applyChips(tagged, chips, picked) {
  const on = chips.filter((c) => picked?.[c.group] === c.key)
  return on.length ? tagged.filter((t) => on.every((c) => c.test(t))) : tagged
}

/** The one-line key under the chart: what the short chip words mean (tap-free: it is printed, not a hover). */
export const chipKey = ({ close = 8, blowout = 15, soft = 10, hasRank = false } = {}) =>
  `Close = won/lost by ${close} or less · Blowout = ${blowout}+ · Rested = 2+ days off${hasRank ? ` · Soft / Tough D = top / bottom ${soft} of 30` : ''}`
