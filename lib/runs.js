'use client'
import { dataUrl } from './dataSource'

// 🔥 RUNS — who is actually hot, for a bar you choose.
//
// 2026-08-15, Donovan sent a competitor's "Player board" and "Hottest active
// runs" and asked for them here. Both are the same object underneath: for a
// chosen bar, a hitter's last thirty games as a strip, the length of his
// ACTIVE run, and his rate over a few windows.
//
// THE PAYLOAD IS RAW LINES, NOT PRE-AGGREGATED RATES (bots/player_splits.py
// writes it on the fetch it was already making). That is the whole design:
// publishing "his 2+ TB run is 5" would freeze the bar at 2 and need a new
// field for every threshold anyone ever wants. Publishing the lines lets all
// of this be derived here, instantly, for any market at any number — which is
// what makes the market and line chips feel immediate instead of like a page
// load, and what lets a new market cost nothing on the bot side.
//
// Column order is fixed by the publisher and stated in the file itself:
//   [date, opp, H, TB, HRR, HR, isHome, "D"|"N"]

export const runsPaths = () => [dataUrl('current/runs_latest.json')]

export const D = 0, OPP = 1, H = 2, TB = 3, HRR = 4, HR = 5, HOME = 6, DN = 7

// The four bars a bettor actually plays, and the ONLY ones the odds pipeline
// prices. Donovan, 2026-08-15: "only 1+ and 2+ for hits or hrr ... home runs is
// one." The thresholds are chips, not hardcoded, because 1+ Hit and 2+ Hits are
// different questions and the board should answer both.
export const MARKETS = [
  { key: 'hit', col: H, label: 'Hits', lines: [1, 2] },
  { key: 'tb', col: TB, label: 'Total bases', lines: [2, 3] },
  { key: 'hrr', col: HRR, label: 'H+R+RBI', lines: [1, 2, 3] },
  { key: 'hr', col: HR, label: 'Home runs', lines: [1] },
]

export const marketOf = (k) => MARKETS.find((m) => m.key === k) || MARKETS[0]
export const barLabel = (mk, thr) => `${thr}+ ${mk.key === 'hr' ? 'HR' : mk.key === 'tb' ? 'TB' : mk.key === 'hrr' ? 'H+R+RBI' : 'Hit'}`

/**
 * Everything the board shows for one hitter, at one bar.
 *
 * `split` filters the games first — 'D' or 'N' for day/night, 'H'/'A' for
 * home/road — and the windows are computed on WHAT SURVIVES, which is the
 * point: "his last 10 night games" is a different question from "his last 10
 * games" and the board should be able to ask either.
 */
/**
 * `breaksAllowed` (2026-08-24, Patterns "Breaks Allowed: 0/1/2/3" filter) lets
 * the active run absorb up to N non-qualifying games without ending it — the
 * same idea the gold streaks board's own breaks-allowed control names, just
 * not previously wired into this board's own streak math. Default 0 keeps the
 * existing strict definition (any miss ends the run) so every current caller
 * is unaffected. Only the HOT direction tolerates breaks — a drought is
 * defined as misses, so "breaks allowed" has no meaning going cold and is
 * ignored there (first === false).
 */
export function readRun(rows, col, thr, split = 'all', breaksAllowed = 0) {
  const g = (rows || []).filter((r) => {
    if (split === 'D' || split === 'N') return r[DN] === split
    if (split === 'H') return r[HOME] === 1
    if (split === 'A') return r[HOME] === 0
    return true
  })
  if (!g.length) return null
  const hit = (r) => Number(r[col]) >= thr

  // The active run is consecutive games from the MOST RECENT, and it is
  // signed: a positive number is a hit streak, a negative one is a drought.
  // A board that only counts the good direction hides the other half of the
  // information and makes every hitter look like he's on something.
  const first = hit(g[0])
  let k = 0
  if (first && breaksAllowed > 0) {
    // Hot, with tolerance: walk back from the most recent game, counting every
    // game as part of the run and spending one "break" on each miss, until the
    // budget runs out. The run still has to open on a qualifying game — a
    // streak of tolerated misses with nothing made is not a streak.
    let spent = 0
    for (const r of g) {
      if (!hit(r)) {
        spent += 1
        if (spent > breaksAllowed) break
      }
      k += 1
    }
  } else {
    for (const r of g) { if (hit(r) === first) k += 1; else break }
  }
  const run = first ? k : -k

  const win = (n2) => {
    const seg = g.slice(0, n2)
    return seg.length ? { n: seg.length, ok: seg.filter(hit).length, pct: (100 * seg.filter(hit).length) / seg.length } : null
  }
  // ── HOW BIG IS THIS RUN *FOR HIM*? (2026-08-31) ───────────────────────
  //
  // "13 game run" is a number, not a statement. Thirteen is enormous for a
  // hitter whose best in the window is six and unremarkable for one who has
  // done fourteen twice — and the board could not tell those apart, so every
  // long run read the same. His own best in the same window is the cheapest
  // honest context there is: it comes off rows already in hand, needs no
  // request, and turns a length into a rank.
  //
  // Strict consecutive, no tolerance, both directions. The tolerance option
  // above is for reading the ACTIVE run generously; a personal best measured
  // with a different rule than the thing it is being compared to would be a
  // comparison of two different quantities.
  // Collected as SEGMENTS rather than a running max, because "his longest"
  // alone is a weak fact on a board sorted by run length: if you are on a
  // 13 in a 30-game window it is almost certainly your longest, so the badge
  // fires on every leader and tells you nothing. Caught in render — all six
  // leader cards wore it. What varies, and what is worth printing, is the
  // longest run OTHER than the one he is on: "13, past a previous best of 6"
  // is a statement; "13, his longest" is arithmetic.
  const hitSegs = []; const missSegs = []
  let curH = 0; let curM = 0
  for (const r of g) {
    if (hit(r)) { if (curM) { missSegs.push(curM); curM = 0 } curH += 1 }
    else { if (curH) { hitSegs.push(curH); curH = 0 } curM += 1 }
  }
  if (curH) hitSegs.push(curH)
  if (curM) missSegs.push(curM)
  const bestHit = hitSegs.length ? Math.max(...hitSegs) : 0
  const bestMiss = missSegs.length ? Math.max(...missSegs) : 0
  // g[0] is the most recent game, so the FIRST segment collected is the
  // active one. Drop it and the rest is his history.
  const priorHit = hitSegs.slice(first ? 1 : 0)
  const priorMiss = missSegs.slice(first ? 0 : 1)
  const prevBestHit = priorHit.length ? Math.max(...priorHit) : 0
  const prevBestMiss = priorMiss.length ? Math.max(...priorMiss) : 0

  return {
    run,
    n: g.length,
    bestHit,
    bestMiss,
    // The longest run of the same kind that ISN'T the one he is on.
    prevBestHit,
    prevBestMiss,
    // Whether the run he is on right now IS his best in this window — the
    // line the card wants to print. Ties count as "matching", not beating.
    atBest: run > 0 ? run >= bestHit : run < 0 ? -run >= bestMiss : false,
    l5: win(5), l10: win(10), l15: win(15), l30: win(30),
    // The strip, newest LAST so it reads left-to-right like a timeline —
    // the opposite of the array's own order, and worth being explicit about.
    strip: [...g].reverse().map((r) => ({
      on: hit(r), v: Number(r[col]) || 0, date: r[D], opp: r[OPP],
      home: r[HOME] === 1, dn: r[DN],
    })),
  }
}

/** Is this payload worth reading at all? */
export function runsLookReal(j) {
  return Boolean(j && Array.isArray(j.players) && j.players.length && Array.isArray(j.players[0]?.g))
}
