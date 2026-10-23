// ⚾ THE FIRSTS, CALLED (moonshot-first-v1, 2026-10-22, Donovan: "a real first everything model" + "this all needs to be a part
// of the model"). Who gets the game's first hit and who hits its first homer, from the two lineups in order.
//
// HOW: the game is played out a few thousand times, plate appearance by plate appearance, top of the 1st on. Each batter's
// chance per plate appearance of a homer, a hit and of reaching without a hit is his season rate pulled toward the league
// (a hitter with 40 plate appearances is mostly league average; one with 600 is mostly himself). The first hit and the first
// homer of each pretend game are counted; a batter's RANK in his game is the order of those counts. Only the rank is shown
// (a rank, not a chance -- check-no-printed-probability).
//
// WHY THIS SIMPLE (walk-forward backtest on 2,171 regular-season games of 2026, Apr 15 on; scripts/backtest-mlb-firsts.mjs,
// claude/FIRSTS-MLB-BACKTEST-2026-10-22.txt):
//   first hit   the top-ranked man got it 20.1% of games, a top-3 man 48.6% (a random starter: 5.6%; "always the road
//               leadoff man": 20.6% -- batting first is most of it)
//   first HR    the top-ranked man hit it in 9.3% of ALL games, a top-3 man 24.4% (random: 4.9%; "the best HR rate in the
//               game": 8.2%)
//   Adding the opposing starter, the park or his split against that arm did NOT beat this on the same games (8.2-9.1%), so
//   they're out until a measured version beats it. Seeded: the same lineups always give the same ranks.

export const VERSION = 'moonshot-first-v1'
export const LG = { h: 0.225, hr: 0.031, ob: 0.095 }   // 2026 league per plate appearance: hits, homers, walks + HBP
export const K = { h: 120, hr: 250, ob: 120 }         // how many league plate appearances each rate is pulled toward

const shrink = (x, n, lg, k) => (x + k * lg) / ((n || 0) + k)

/** Per-plate-appearance rates from counts: { pa, h, hr, ob } -> { h, hr, ob }. */
export function ratesOf({ pa = 0, h = 0, hr = 0, ob = 0 } = {}) {
  return { h: shrink(h, pa, LG.h, K.h), hr: shrink(hr, pa, LG.hr, K.hr), ob: shrink(ob, pa, LG.ob, K.ob) }
}

/** A slate row's season counts (the bot's season_* fields). Missing fields count as no plate appearances (league rates). */
export function countsFromSlateRow(p) {
  const pa = Number(p?.season_pa) || 0, ab = Number(p?.season_ab) || 0
  const h = Math.round((Number(p?.season_avg) || 0) * ab)
  const onBase = Math.round((Number(p?.season_obp) || 0) * pa)   // OBP's denominator is close enough to PA here
  return { pa, h, hr: Number(p?.season_hr) || 0, ob: Math.max(0, onBase - h) }
}

function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 }

/**
 * away / home: nine batters in batting order, each { id, h, hr, ob } (ratesOf). Returns Map id -> { hitRank, hrRank } (1 = the
 * game's top call), every batter ranked. `sims` pretend games, `seed` fixed so a page and a lock agree.
 */
export function firstCalls(away, home, { sims = 4000, seed = 20261022 } = {}) {
  const out = new Map()
  if (away?.length !== 9 || home?.length !== 9) return out
  const rnd = rng(seed)
  const fh = new Map(), fhr = new Map()
  const bump = (m, id) => m.set(id, (m.get(id) || 0) + 1)
  for (let n = 0; n < sims; n++) {
    const next = [0, 0]
    let gotH = false, gotHR = false
    for (let inn = 0; inn < 9 && !(gotH && gotHR); inn++) {
      for (const side of [0, 1]) {
        const lu = side ? home : away
        let outs = 0
        while (outs < 3) {
          const b = lu[next[side] % 9]; next[side]++
          const r = rnd()
          if (r < b.hr) { if (!gotH) { gotH = true; bump(fh, b.id) } if (!gotHR) { gotHR = true; bump(fhr, b.id) } } else if (r < b.h) { if (!gotH) { gotH = true; bump(fh, b.id) } } else if (r >= b.h + b.ob) outs++
        }
      }
    }
  }
  const all = [...away, ...home]
  // ties keep batting order (the man who comes up first wins a tie), so the ranks never shuffle between renders
  const order = (m) => all.map((b, i) => [b.id, m.get(b.id) || 0, i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(([id]) => id)
  order(fh).forEach((id, i) => out.set(id, { hitRank: i + 1 }))
  order(fhr).forEach((id, i) => out.set(id, { ...out.get(id), hrRank: i + 1 }))
  return out
}

/**
 * Tonight's slate rows -> Map player_id -> { hitRank, hrRank, projected } for every game with nine batters a side in the
 * order (the bot's lineup_spot; `projected` when the lineup isn't confirmed yet). `homeOf`: Map game_pk -> the home club's
 * code (MLB's schedule; the slate rows don't say who bats first). A game whose home club isn't known is left out, never
 * guessed: batting first is most of the first-hit call.
 */
export function slateFirstCalls(rows, { homeOf, teamOf = (p) => p?.team } = {}) {
  const byGame = new Map()
  for (const p of rows || []) {
    const gk = p?.game_pk
    if (gk == null || !(Number(p?.lineup_spot) >= 1 && Number(p?.lineup_spot) <= 9)) continue
    if (!byGame.has(gk)) byGame.set(gk, [])
    byGame.get(gk).push(p)
  }
  const out = new Map()
  for (const [gk, list] of byGame) {
    const home = homeOf?.get(String(gk))
    const teams = [...new Set(list.map(teamOf))]
    if (!home || teams.length !== 2 || !teams.includes(home)) continue
    const lineup = (t) => {
      const spots = new Map()
      for (const p of list) if (teamOf(p) === t && !spots.has(Number(p.lineup_spot))) spots.set(Number(p.lineup_spot), p)
      return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => spots.get(s)).filter(Boolean)
    }
    const toRates = (p) => ({ id: String(p.player_id ?? p.id), ...ratesOf(countsFromSlateRow(p)) })
    const away = lineup(teams.find((t) => t !== home)).map(toRates), homeLu = lineup(home).map(toRates)
    const calls = firstCalls(away, homeLu, { seed: Number(gk) || 1 })
    const projected = !list.every((p) => p.lineup_confirmed)
    for (const [id, c] of calls) out.set(id, { ...c, projected })
  }
  return out
}
